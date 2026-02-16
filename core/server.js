const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

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
app.use(cors({ origin: "http://localhost:3000" }));
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

app.listen(PORT, () => {
  writeCoreLog(`Core API listening on http://localhost:${PORT}`);
  console.log(`Core API listening on http://localhost:${PORT}`);
});