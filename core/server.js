const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");
const { getBibleStatus, triggerScript, ALLOWED_SCRIPTS } = require("./bible-bridge");

const PORT = process.env.PORT || 4000;
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
  if (!fs.existsSync(AGENTS_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(AGENTS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function readLogPreview(lineCount = 20) {
  if (!fs.existsSync(HELLO_LOG)) {
    return [];
  }

  const lines = fs
    .readFileSync(HELLO_LOG, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  return lines.slice(-lineCount);
}

const app = express();
app.use(cors({ origin: "*" })); // allow UI on any port + future Vercel deploy
app.use(express.json());

app.use((req, _res, next) => {
  writeCoreLog(`${req.method} ${req.url}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/agents", (_req, res) => {
  res.json(readAgents());
});

app.get("/logs", (_req, res) => {
  res.json({ lines: readLogPreview(20) });
});

// --- BIBLE endpoints ---

/** GET /bible/status — read-only filesystem snapshot of C:\BIBLE. No scripts run. */
app.get("/bible/status", (_req, res) => {
  try {
    res.json(getBibleStatus());
  } catch (err) {
    writeCoreLog(`/bible/status error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** GET /bible/scripts — list allowlisted triggerable scripts. */
app.get("/bible/scripts", (_req, res) => {
  res.json({
    allowedScripts: Object.entries(ALLOWED_SCRIPTS).map(([name, cfg]) => ({
      name,
      script: cfg.script,
    })),
  });
});

/**
 * POST /trigger
 * Body: { "script": "<name>", "args": [] }
 * Runs an allowlisted C:\BIBLE PowerShell script.
 */
app.post("/trigger", async (req, res) => {
  const { script, args = [] } = req.body ?? {};
  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "Body must include 'script' (string)." });
  }
  writeCoreLog(`/trigger -> script=${script}`);
  try {
    const result = await triggerScript(script, args);
    writeCoreLog(`/trigger <- exitCode=${result.exitCode}`);
    res.json(result);
  } catch (err) {
    writeCoreLog(`/trigger error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// --- Start ---
app.listen(PORT, () => {
  writeCoreLog(`Core API listening on http://localhost:${PORT}`);
  console.log(`Core API  http://localhost:${PORT}`);
  console.log(`BIBLE:     GET /bible/status | GET /bible/scripts | POST /trigger`);
});