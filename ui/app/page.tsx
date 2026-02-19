"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- Types ----------
type Health = { status: string; time: string };

type Agent = {
  name: string;
  status: string;
  pid?: number;
  lastHeartbeat?: string | null;
};

type BibleStatus = {
  bibleRootExists: boolean;
  directories: Record<string, boolean>;
  scripts: Record<string, boolean>;
  secrets: { exists: boolean; keys: string[] };
  allowedTriggers: string[];
  recentLog: string[];
  checkedAt: string;
};

type TriggerResult = { stdout: string; stderr: string; exitCode: number } | null;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// ---------- Helpers ----------
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {ok ? "OK" : "MISSING"} {label}
    </span>
  );
}

// ---------- Main ----------
export default function Home() {
  const [health,      setHealth]      = useState<Health | null>(null);
  const [agents,      setAgents]      = useState<Agent[]>([]);
  const [logs,        setLogs]        = useState<string[]>([]);
  const [bible,       setBible]       = useState<BibleStatus | null>(null);
  const [error,       setError]       = useState("");
  const [triggering,  setTriggering]  = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerResult>(null);
  const [triggerError,  setTriggerError]  = useState("");

  const systemStatus = useMemo(
    () => (!health ? "Unknown" : health.status === "ok" ? "Online" : "Degraded"),
    [health],
  );

  // Poll all endpoints every 5 s
  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [healthRes, agentsRes, logsRes, bibleRes] = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/agents`),
          fetch(`${API_BASE}/logs`),
          fetch(`${API_BASE}/bible/status`),
        ]);

        if (!healthRes.ok) throw new Error("Core API not reachable");

        const healthJson: Health                      = await healthRes.json();
        const agentsJson: Agent[]                     = await agentsRes.json();
        const logsJson:   { lines?: string[] }        = await logsRes.json();
        const bibleJson:  BibleStatus                 = await bibleRes.json();

        if (!active) return;
        setHealth(healthJson);
        setAgents(Array.isArray(agentsJson) ? agentsJson : []);
        setLogs(Array.isArray(logsJson.lines) ? logsJson.lines : []);
        setBible(bibleJson);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  // Trigger a BIBLE script
  const runTrigger = async (scriptName: string) => {
    setTriggering(true);
    setTriggerResult(null);
    setTriggerError("");
    try {
      const res = await fetch(`${API_BASE}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Trigger failed");
      setTriggerResult(json as TriggerResult);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTriggering(false);
    }
  };

  // Bible summary counters
  const bibleScriptCount  = bible ? Object.values(bible.scripts).filter(Boolean).length : 0;
  const bibleDirCount     = bible ? Object.values(bible.directories).filter(Boolean).length : 0;
  const bibleScriptTotal  = bible ? Object.keys(bible.scripts).length : 0;
  const bibleDirTotal     = bible ? Object.keys(bible.directories).length : 0;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Automation System</h1>
            <p className="mt-1 text-sm text-slate-400">
              BIBLE + ai-automation-system &mdash; online &amp; offline
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              systemStatus === "Online"
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            {systemStatus}
          </span>
        </header>

        {error && (
          <div className="rounded-md border border-red-500 bg-red-950 px-4 py-3 text-red-300">
            {error} &mdash; make sure <code>npm run core</code> is running.
          </div>
        )}

        {/* Row 1: API health + Agent status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="font-semibold text-slate-300">Core API</h2>
            <p className="mt-2 text-sm">
              Status: <span className="font-mono text-green-400">{health?.status ?? "n/a"}</span>
            </p>
            <p className="text-xs text-slate-500">Last check: {health?.time ?? "n/a"}</p>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="font-semibold text-slate-300">Agents</h2>
            {agents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No agent state yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {agents.map((a) => (
                  <li key={a.name} className="text-sm">
                    <span className="font-mono text-slate-200">{a.name}</span>{" "}
                    <span className="text-slate-400">{a.status}</span>
                    {a.pid && <span className="ml-2 text-xs text-slate-500">PID {a.pid}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* BIBLE System Status */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h2 className="font-semibold text-slate-300">
            BIBLE System{" "}
            {bible && (
              <span className="ml-2 text-xs text-slate-500">
                checked {new Date(bible.checkedAt).toLocaleTimeString()}
              </span>
            )}
          </h2>

          {!bible ? (
            <p className="mt-2 text-sm text-slate-500">Loading BIBLE status&hellip;</p>
          ) : (
            <div className="mt-3 space-y-4">
              {/* Summary row */}
              <div className="flex flex-wrap gap-3 text-sm">
                <StatusBadge ok={bible.bibleRootExists} label="C:\BIBLE" />
                <StatusBadge ok={bible.secrets.exists}  label="secrets.json" />
                <span className="text-slate-400">
                  Dirs: {bibleDirCount}/{bibleDirTotal}
                </span>
                <span className="text-slate-400">
                  Scripts: {bibleScriptCount}/{bibleScriptTotal}
                </span>
              </div>

              {/* Secrets keys */}
              {bible.secrets.exists && (
                <p className="text-xs text-slate-500">
                  Secrets keys present: {bible.secrets.keys.join(", ")}
                </p>
              )}

              {/* Directories */}
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                  Directories ({bibleDirCount}/{bibleDirTotal})
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(bible.directories).map(([d, ok]) => (
                    <StatusBadge key={d} ok={ok} label={d} />
                  ))}
                </div>
              </details>

              {/* Scripts */}
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                  Scripts ({bibleScriptCount}/{bibleScriptTotal})
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(bible.scripts).map(([s, ok]) => (
                    <StatusBadge key={s} ok={ok} label={s} />
                  ))}
                </div>
              </details>

              {/* Recent HOLY-SPIRIT log */}
              {bible.recentLog.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                    HOLY-SPIRIT log ({bible.recentLog.length} lines)
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-950 p-2 text-slate-300">
                    {bible.recentLog.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          )}
        </section>

        {/* Trigger Panel */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h2 className="font-semibold text-slate-300">BIBLE Trigger</h2>
          <p className="mt-1 text-xs text-slate-500">
            Run an allowlisted C:\BIBLE script via the API.
          </p>

          {bible && (
            <div className="mt-3 flex flex-wrap gap-2">
              {bible.allowedTriggers.map((name) => (
                <button
                  key={name}
                  disabled={triggering}
                  type="button"
                  onClick={() => runTrigger(name)}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {triggering && (
            <p className="mt-3 text-sm text-slate-400">Running&hellip;</p>
          )}

          {triggerError && (
            <div className="mt-3 rounded border border-red-700 bg-red-950 p-2 text-xs text-red-300">
              {triggerError}
            </div>
          )}

          {triggerResult && (
            <div className="mt-3">
              <p className="text-xs text-slate-400">
                Exit code: {triggerResult.exitCode}
              </p>
              {triggerResult.stdout && (
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-300">
                  {triggerResult.stdout}
                </pre>
              )}
              {triggerResult.stderr && (
                <pre className="mt-1 max-h-20 overflow-auto rounded bg-red-950 p-2 text-xs text-red-300">
                  {triggerResult.stderr}
                </pre>
              )}
            </div>
          )}
        </section>

        {/* Agent Logs */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h2 className="font-semibold text-slate-300">Agent Logs</h2>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">
            {logs.length > 0 ? logs.join("\n") : "No logs yet."}
          </pre>
        </section>

      </div>
    </main>
  );
}
