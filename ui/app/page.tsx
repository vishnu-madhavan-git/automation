"use client";

import { useEffect, useMemo, useState } from "react";

type Health = {
  status: string;
  time: string;
};

type Agent = {
  name: string;
  status: string;
  pid?: number;
  lastHeartbeat?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  const systemStatus = useMemo(() => {
    if (!health) {
      return "Unknown";
    }

    return health.status === "ok" ? "Online" : "Degraded";
  }, [health]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [healthRes, agentsRes, logsRes] = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/agents`),
          fetch(`${API_BASE}/logs`),
        ]);

        if (!healthRes.ok || !agentsRes.ok || !logsRes.ok) {
          throw new Error("Core service is not reachable");
        }

        const healthJson: Health = await healthRes.json();
        const agentsJson: Agent[] = await agentsRes.json();
        const logsJson: { lines?: string[] } = await logsRes.json();

        if (!active) {
          return;
        }

        setHealth(healthJson);
        setAgents(Array.isArray(agentsJson) ? agentsJson : []);
        setLogs(Array.isArray(logsJson.lines) ? logsJson.lines : []);
        setError("");
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    load();
    const timer = setInterval(load, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">AI Automation System</h1>
          <p className="text-sm text-slate-600">Local dashboard on localhost</p>
        </header>

        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">System Status</h2>
          <p className="mt-2">Status: {systemStatus}</p>
          <p className="text-sm text-slate-600">Last health check: {health?.time ?? "n/a"}</p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Agent Status</h2>
          {agents.length === 0 ? (
            <p className="mt-2 text-slate-600">No agent state available yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {agents.map((agent) => (
                <li key={agent.name} className="rounded border border-slate-200 p-2">
                  <div>Name: {agent.name}</div>
                  <div>Status: {agent.status}</div>
                  <div>PID: {agent.pid ?? "n/a"}</div>
                  <div>Last heartbeat: {agent.lastHeartbeat ?? "n/a"}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Logs Preview</h2>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            {logs.length > 0 ? logs.join("\n") : "No logs yet."}
          </pre>
        </section>
      </div>
    </main>
  );
}