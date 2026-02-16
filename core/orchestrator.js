const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT_DIR, "data", "logs");
const STATE_DIR = path.join(ROOT_DIR, "data", "state");
const HELLO_LOG = path.join(LOG_DIR, "hello.log");
const ORCH_LOG = path.join(LOG_DIR, "orchestrator.log");
const AGENTS_FILE = path.join(STATE_DIR, "agents.json");

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

function logOrchestrator(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync(ORCH_LOG, `${line}\n`);
  console.log(line);
}

function setAgentState(state) {
  fs.writeFileSync(AGENTS_FILE, `${JSON.stringify([state], null, 2)}\n`, "utf8");
}

function appendAgentLog(chunk) {
  fs.appendFileSync(HELLO_LOG, chunk, "utf8");
}

function resolvePythonCommand() {
  if (process.env.PYTHON_CMD) {
    return process.env.PYTHON_CMD;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const defaultWinPython = path.join(
      localAppData,
      "Programs",
      "Python",
      "Python312",
      "python.exe",
    );

    if (fs.existsSync(defaultWinPython)) {
      return defaultWinPython;
    }
  }

  return "python";
}

const forwardedArgs = process.argv.slice(2);
const pythonCmd = resolvePythonCommand();
const agentScript = path.join("agents", "hello.py");

const state = {
  name: "hello",
  status: "starting",
  pid: null,
  startedAt: new Date().toISOString(),
  lastHeartbeat: null,
};

let shuttingDown = false;

logOrchestrator(`Starting agent: ${pythonCmd} ${agentScript} ${forwardedArgs.join(" ")}`);
const child = spawn(pythonCmd, [agentScript, ...forwardedArgs], {
  cwd: ROOT_DIR,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

state.pid = child.pid;
state.status = "running";
setAgentState(state);

child.stdout.on("data", (buffer) => {
  const chunk = buffer.toString();
  appendAgentLog(chunk);
  state.lastHeartbeat = new Date().toISOString();
  setAgentState(state);
  process.stdout.write(chunk);
});

child.stderr.on("data", (buffer) => {
  const chunk = buffer.toString();
  appendAgentLog(chunk);
  logOrchestrator(`Agent stderr: ${chunk.trim()}`);
});

child.on("exit", (code, signal) => {
  state.status = "stopped";
  state.stoppedAt = new Date().toISOString();
  state.exitCode = code;
  state.exitSignal = signal;
  setAgentState(state);

  logOrchestrator(`Agent exited (code=${code}, signal=${signal})`);

  if (shuttingDown) {
    process.exit(0);
  }

  process.exit(code ?? 1);
});

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  state.status = "stopping";
  setAgentState(state);
  logOrchestrator(`Received ${signal}. Shutting down agent...`);

  child.kill("SIGTERM");

  setTimeout(() => {
    if (!child.killed) {
      logOrchestrator("Force-killing agent after timeout");
      child.kill("SIGKILL");
    }
  }, 5000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));