require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

const sheets = require("./sheets");
const firebase = require("./firebase");
const memory = require("./memory");

const ROOT_DIR = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT_DIR, "data", "logs");
const STATE_DIR = path.join(ROOT_DIR, "data", "state");
const CORE_LOG = path.join(LOG_DIR, "core.log");
const AGENTS_FILE = path.join(STATE_DIR, "agents.json");
const HELLO_LOG = path.join(LOG_DIR, "hello.log");

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

function writeCoreLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(CORE_LOG, line);
}

function readAgents() {
  if (!fs.existsSync(AGENTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(AGENTS_FILE, "utf8")); }
  catch { return []; }
}

function readLogPreview(lineCount = 50) {
  if (!fs.existsSync(HELLO_LOG)) return [];
  return fs.readFileSync(HELLO_LOG, "utf8")
    .split(/\r?\n/).filter(Boolean).slice(-lineCount);
}

// ── PowerShell helper ────────────────────────────────────────────────────────
function runPowerShell(command, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn("powershell", [
      "-NoProfile", "-NonInteractive", "-Command", command,
    ], { windowsHide: true });

    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr: stderr + "\n[timeout]", exitCode: -1 });
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: -1 });
    });
  });
}

// ── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (!API_KEY) return next(); // no key configured → open
  const key = req.headers["x-api-key"] || req.query.apikey;
  if (key === API_KEY) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins (tunnel)
}));
app.use(express.json());
app.use((req, _res, next) => {
  writeCoreLog(`${req.method} ${req.url}`);
  next();
});

// ── Public endpoints (no auth) ───────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ── Protected endpoints ──────────────────────────────────────────────────────
app.get("/agents", auth, (_req, res) => res.json(readAgents()));

app.get("/logs", auth, (_req, res) => {
  res.json({ lines: readLogPreview(50) });
});

// System stats
app.get("/api/system", auth, async (_req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();
    const hostname = os.hostname();
    const platform = os.platform();
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model ?? "Unknown";
    const cpuCount = cpus.length;

    // CPU usage via PowerShell
    let cpuPct = null;
    try {
      const r = await runPowerShell(
        "(Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
        5000
      );
      cpuPct = parseFloat(r.stdout.trim()) || null;
    } catch { /* ignore */ }

    // Disk usage via PowerShell
    let disks = [];
    try {
      const r = await runPowerShell(
        "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json",
        5000
      );
      const parsed = JSON.parse(r.stdout.trim());
      disks = (Array.isArray(parsed) ? parsed : [parsed]).map((d) => ({
        name: d.Name,
        used: d.Used,
        free: d.Free,
        total: (d.Used || 0) + (d.Free || 0),
      }));
    } catch { /* ignore */ }

    res.json({
      hostname, platform, cpuModel, cpuCount, cpuPct,
      totalMem, freeMem, usedMem: totalMem - freeMem,
      uptime, disks,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PowerShell executor
app.post("/api/exec", auth, async (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "command required" });
  }
  // Block a few dangerous patterns
  const blocked = /^(rm\s|remove-item|format-|del\s)/i;
  if (blocked.test(command.trim())) {
    return res.status(403).json({ error: "Command blocked for safety." });
  }
  writeCoreLog(`EXEC: ${command}`);
  const result = await runPowerShell(command, 20000);
  res.json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
});

// Process list
app.get("/api/processes", auth, async (_req, res) => {
  try {
    const r = await runPowerShell(
      "Get-Process | Sort-Object CPU -Descending | Select-Object -First 30 | Select-Object Name,Id,@{N='CPU';E={[math]::Round($_.CPU,1)}},@{N='RAM';E={$_.WorkingSet}} | ConvertTo-Json",
      8000
    );
    const list = JSON.parse(r.stdout.trim());
    res.json(Array.isArray(list) ? list : [list]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kill process
app.post("/api/processes/:id/kill", auth, async (req, res) => {
  const pid = parseInt(req.params.id, 10);
  if (!pid) return res.status(400).json({ error: "Invalid PID" });
  const r = await runPowerShell(`Stop-Process -Id ${pid} -Force`, 5000);
  res.json({ ok: r.exitCode === 0, stderr: r.stderr });
});

// Network info
app.get("/api/network", auth, (_req, res) => {
  const ifaces = os.networkInterfaces();
  const result = Object.entries(ifaces).map(([name, addrs]) => ({
    name,
    addresses: (addrs || []).map((a) => ({
      address: a.address,
      family: a.family,
      internal: a.internal,
    })),
  }));
  res.json(result);
});

// ── CRM & Workspace ──────────────────────────────────────────────────────────

// Capture Lead
app.post("/api/crm/leads", auth, async (req, res) => {
  const { name, phone, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });

  try {
    const lead = { name, phone, notes };
    // Track in Sheets
    await sheets.addLead(lead).catch(e => console.error("Sheet Sync Fail:", e.message));
    // Persistent Cloud Backup
    await firebase.saveLead(lead).catch(e => console.error("Firebase Sync Fail:", e.message));
    // Local AI Memory Update
    const currentLeads = await sheets.getLeads().catch(() => []);
    memory.syncLeads(currentLeads).catch(e => console.error("Memory Sync Fail:", e.message));

    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Trigger
app.get("/api/crm/sync", auth, async (_req, res) => {
  try {
    const data = await sheets.getLeads();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Intelligence Ask (RAG)
app.post("/api/ask", auth, async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "question required" });

  try {
    const results = await memory.search(question);
    const context = results.map(r => r.text).join("\n");

    // Call Ollama for the final summary with context
    const ollama = require('./telegram').ollamaChat; // reuse the helper
    const prompt = `You are JARVIS, an advanced business assistant. 
Context from memory:\n${context}\n\nUser Question: ${question}\n\nAnswer concisely based on context. High quality only.`;

    const answer = await ollama(prompt);
    res.json({ answer, context: results.map(r => r.text) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  writeCoreLog(`Core API listening on http://localhost:${PORT}`);
  console.log(`Core API listening on http://localhost:${PORT}`);

  // Async Init
  sheets.init();
  firebase.init();

  // Initial Memory Sync
  try {
    const lds = await sheets.getLeads().catch(() => []);
    if (lds && lds.length) {
      const memory = require("./memory");
      await memory.syncLeads(lds);
    }
  } catch (err) {
    console.warn("[memory] Initial sync failed:", err.message);
  }
});