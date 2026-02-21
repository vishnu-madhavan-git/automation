/**
 * bible-bridge.js
 * Bridge between the ai-automation-system API and the local C:\BIBLE PowerShell system.
 * Provides safe, allowlisted execution of BIBLE scripts via the REST API.
 */

"use strict";

const { spawn } = require("child_process");
const fs   = require("fs");
const path = require("path");

const BIBLE_ROOT = "C:\\BIBLE";

// Allowlist: only these scripts can be triggered via API
const ALLOWED_SCRIPTS = {
  "health":      { script: "GENESIS\\ATOMS\\system-info.ps1",       args: [] },
  "organize":    { script: "ACTS\\PETER\\organize.ps1",              args: [] },
  "screenshot":  { script: "GENESIS\\ATOMS\\screenshot.ps1",         args: ["-Reason", "APITrigger"] },
  "logs":        { script: "GENESIS\\ATOMS\\log.ps1",                args: ["-Message", "API check", "-Type", "INFO"] },
  "safety":      { script: "GENESIS\\ATOMS\\check-safety.ps1",       args: [] },
};

/**
 * Returns the status of the BIBLE system without running any scripts.
 * Pure filesystem check — always safe.
 */
function getBibleStatus() {
  const dirs = [
    "GENESIS\\ATOMS", "GOSPELS\\JOHN", "ACTS\\PETER",
    "LEVITICUS\\offerings", "YHWH\\throne",
    "HEAVEN", "HELL", "CHRONICLES", "HOLY-SPIRIT",
  ];

  const scripts = [
    "GOSPELS\\JOHN\\gospel.ps1",
    "GOSPELS\\JOHN\\jesus.ps1",
    "ACTS\\PETER\\organize.ps1",
    "GENESIS\\CREATOR.ps1",
    "GENESIS\\OPENCLAW.ps1",
    "HELL\\satan.ps1",
    "YHWH\\throne\\judge.ps1",
  ];

  const secretsPath = path.join(BIBLE_ROOT, "LEVITICUS\\offerings\\secrets.json");

  const dirStatus = Object.fromEntries(
    dirs.map((d) => [d, fs.existsSync(path.join(BIBLE_ROOT, d))])
  );

  const scriptStatus = Object.fromEntries(
    scripts.map((s) => [s, fs.existsSync(path.join(BIBLE_ROOT, s))])
  );

  const secretsExist = fs.existsSync(secretsPath);
  let secretsKeys = [];
  if (secretsExist) {
    try {
      const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
      secretsKeys = Object.keys(raw);
    } catch {
      secretsKeys = ["parse_error"];
    }
  }

  // Read last 10 lines of chronicle log if it exists
  const chronicleLog = path.join(BIBLE_ROOT, "CHRONICLES\\holy-spirit.log");
  let recentLog = [];
  if (fs.existsSync(chronicleLog)) {
    const lines = fs.readFileSync(chronicleLog, "utf8").split(/\r?\n/).filter(Boolean);
    recentLog = lines.slice(-10);
  }

  const allowedTriggers = Object.keys(ALLOWED_SCRIPTS);

  return {
    bibleRoot: BIBLE_ROOT,
    bibleRootExists: fs.existsSync(BIBLE_ROOT),
    directories: dirStatus,
    scripts: scriptStatus,
    secrets: {
      exists: secretsExist,
      keys: secretsKeys,      // key names only — no values
    },
    allowedTriggers,
    recentLog,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Executes an allowlisted BIBLE PowerShell script.
 * Returns a promise that resolves with { stdout, stderr, exitCode }.
 * Rejects if the script name is not in the allowlist.
 */
function triggerScript(scriptName, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const entry = ALLOWED_SCRIPTS[scriptName];
    if (!entry) {
      return reject(new Error(`Script '${scriptName}' is not in the allowlist. Allowed: ${Object.keys(ALLOWED_SCRIPTS).join(", ")}`));
    }

    const scriptPath = path.join(BIBLE_ROOT, entry.script);
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Script not found on disk: ${scriptPath}`));
    }

    const args  = ["-NoProfile", "-NonInteractive", "-File", scriptPath, ...entry.args, ...extraArgs];
    const child = spawn("powershell.exe", args, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => { stderr += b.toString(); });

    child.on("exit", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? -1 });
    });

    child.on("error", (err) => {
      reject(err);
    });

    // Safety timeout — kill after 30 s
    setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Script '${scriptName}' timed out after 30 seconds`));
    }, 30_000);
  });
}

module.exports = { getBibleStatus, triggerScript, ALLOWED_SCRIPTS };
