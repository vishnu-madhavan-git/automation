const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT_DIR, "data", "logs");
const STATE_DIR = path.join(ROOT_DIR, "data", "state");
const ORCH_LOG = path.join(LOG_DIR, "orchestrator.log");
const AGENTS_FILE = path.join(STATE_DIR, "agents.json");

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

const runningAgents = {};
const agentStates = {};
const restartTimers = {};
let shuttingDown = false;

function logOrchestrator(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync(ORCH_LOG, `${line}\n`);
  console.log(line);
}

function writeAgentStates() {
  const stateList = Object.values(agentStates);
  fs.writeFileSync(AGENTS_FILE, `${JSON.stringify(stateList, null, 2)}\n`, "utf8");
}

function updateAgentState(name, patch) {
  const current = agentStates[name] || { name };
  agentStates[name] = { ...current, ...patch };
  writeAgentStates();
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

function maybeExitWhenStopped() {
  if (Object.keys(runningAgents).length > 0) {
    return;
  }

  const pendingRestarts = Object.values(restartTimers).filter(Boolean).length;
  if (pendingRestarts > 0) {
    return;
  }

  if (shuttingDown) {
    logOrchestrator("All agents stopped. Exiting orchestrator.");
    process.exit(0);
  }
}

function startAgent(agentConfig) {
  const logFile = path.join(LOG_DIR, `${agentConfig.name}.log`);

  updateAgentState(agentConfig.name, {
    status: "starting",
    pid: null,
    startedAt: new Date().toISOString(),
    lastHeartbeat: null,
    stoppedAt: null,
    exitCode: null,
    exitSignal: null,
  });

  function launch() {
    if (shuttingDown) {
      return;
    }

    const logStream = fs.createWriteStream(logFile, { flags: "a" });
    const child = spawn(agentConfig.command, agentConfig.args, {
      cwd: ROOT_DIR,
      windowsHide: true,
    });

    runningAgents[agentConfig.name] = child;
    updateAgentState(agentConfig.name, {
      status: "running",
      pid: child.pid,
      startedAt: new Date().toISOString(),
      lastHeartbeat: null,
      stoppedAt: null,
      exitCode: null,
      exitSignal: null,
    });

    logOrchestrator(
      `Starting agent: ${agentConfig.name} -> ${agentConfig.command} ${agentConfig.args.join(" ")}`,
    );

    child.stdout.on("data", (data) => {
      const message = data.toString();
      logStream.write(message);
      process.stdout.write(`[${agentConfig.name}] ${message}`);
      updateAgentState(agentConfig.name, {
        lastHeartbeat: new Date().toISOString(),
      });
    });

    child.stderr.on("data", (data) => {
      const message = data.toString();
      logStream.write(`ERROR: ${message}`);
      process.stderr.write(`[${agentConfig.name}] ${message}`);
    });

    child.on("error", (error) => {
      logOrchestrator(`${agentConfig.name} spawn error: ${error.message}`);
    });

    child.on("exit", (code, signal) => {
      delete runningAgents[agentConfig.name];
      logStream.end();

      updateAgentState(agentConfig.name, {
        status: shuttingDown ? "stopped" : "crashed",
        pid: null,
        stoppedAt: new Date().toISOString(),
        exitCode: code,
        exitSignal: signal,
      });

      logOrchestrator(`${agentConfig.name} exited with code ${code} signal ${signal ?? "none"}`);

      if (shuttingDown) {
        maybeExitWhenStopped();
        return;
      }

      logOrchestrator(`Restarting ${agentConfig.name} in 3 seconds...`);
      restartTimers[agentConfig.name] = setTimeout(() => {
        delete restartTimers[agentConfig.name];
        launch();
      }, 3000);
    });
  }

  launch();
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logOrchestrator(`Received ${signal}. Shutting down agents...`);

  for (const [name, timer] of Object.entries(restartTimers)) {
    if (timer) {
      clearTimeout(timer);
      delete restartTimers[name];
    }
  }

  const names = Object.keys(agentStates);
  for (const name of names) {
    updateAgentState(name, { status: "stopping" });
  }

  const children = Object.entries(runningAgents);
  if (children.length === 0) {
    maybeExitWhenStopped();
    return;
  }

  for (const [name, child] of children) {
    if (child && !child.killed) {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (runningAgents[name] && !runningAgents[name].killed) {
          logOrchestrator(`Force-killing ${name} after timeout`);
          runningAgents[name].kill("SIGKILL");
        }
      }, 5000);
    }
  }
}

const forwardedArgs = process.argv.slice(2);
const agentConfigs = [
  {
    name: "hello",
    command: resolvePythonCommand(),
    args: [path.join("agents", "hello.py"), ...forwardedArgs],
  },
];

for (const agentConfig of agentConfigs) {
  startAgent(agentConfig);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));