"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Config ───────────────────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (KEY) h["X-API-Key"] = KEY;
  return h;
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { headers: headers(), ...opts });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────
type Health = { status: string; time: string };
type Agent = { name: string; status: string; pid?: number; lastHeartbeat?: string; startedAt?: string };
type SystemInfo = {
  hostname: string; platform: string; cpuModel: string; cpuCount: number; cpuPct: number | null;
  totalMem: number; freeMem: number; usedMem: number; uptime: number;
  disks: { name: string; used: number; free: number; total: number }[]; time: string
};
type Process = { Name: string; Id: number; CPU: number; RAM: number };
type NetIface = { name: string; addresses: { address: string; family: string; internal: boolean }[] };
type LogEntry = { cmd: string; out: string; err: string; ts: string };
type Lead = { name: string; phone: string; status: string; date: string; notes?: string };

type GitHubRepo = {
  id: number; name: string; fullName: string; description: string; url: string;
  language: string | null; stars: number; forks: number; openIssues: number;
  isPrivate: boolean; isFork: boolean; isArchived: boolean;
  defaultBranch: string; pushedAt: string; updatedAt: string; topics: string[];
};
type GitHubAccount = {
  login: string; name: string; avatarUrl: string;
  publicRepos: number; privateRepos: number; repos: GitHubRepo[];
  error?: string;
};
type GitHubData = { accounts: GitHubAccount[]; totalRepos: number; fetchedAt: string; configured: boolean } | null;

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(bytes: number) {
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", icon: "🖥️", label: "Dashboard" },
  { id: "bible", icon: "📖", label: "BIBLE System" },
  { id: "crm", icon: "💎", label: "IX Ruby CRM" },
  { id: "jarvis", icon: "🌌", label: "JARVIS AI" },
  { id: "github", icon: "🐙", label: "GitHub" },
  { id: "terminal", icon: "💻", label: "Terminal" },
  { id: "processes", icon: "⚙️", label: "Processes" },
  { id: "agents", icon: "🤖", label: "Agents" },
  { id: "logs", icon: "📋", label: "Logs" },
  { id: "network", icon: "🌐", label: "Network" },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState("");

  const [health, setHealth] = useState<Health | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [network, setNetwork] = useState<NetIface[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [githubData, setGithubData] = useState<GitHubData>(null);
  const [githubSearch, setGithubSearch] = useState("");

  // BIBLE state
  const [bible, setBible] = useState<BibleStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerResult>(null);
  const [triggerError, setTriggerError] = useState("");

  // JARVIS AI
  const [jarvisMsg, setJarvisMsg] = useState("");
  const [jarvisChat, setJarvisChat] = useState<{ role: 'user' | 'jarvis', text: string }[]>([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const jarvisScrollRef = useRef<HTMLDivElement>(null);

  // Terminal
  const [termCmd, setTermCmd] = useState("");
  const [termHist, setTermHist] = useState<LogEntry[]>([]);
  const [termRunning, setTermRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const termRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Process search
  const [procSearch, setProcSearch] = useState("");

  // ── Fetch all data ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setSpinning(true);
    try {
      const responses = await Promise.allSettled([
        api("/health"),
        api("/api/system"),
        api("/agents"),
        api("/logs"),
        api("/api/processes"),
        api("/api/network"),
        api("/api/crm/sync"),
        api("/bible/status"),
        api("/api/github/repos"),
      ]);
      const [h, s, a, l, p, n, cr, bb, gh] = responses; // health, system, agents, logs, processes, network, crm, bible, github

      if (h.status === "fulfilled") setHealth(h.value);
      if (s.status === "fulfilled") setSysInfo(s.value);
      if (a.status === "fulfilled") setAgents(Array.isArray(a.value) ? a.value : []);
      if (l.status === "fulfilled") setLogs(l.value?.lines ?? []);
      if (p.status === "fulfilled") setProcesses(Array.isArray(p.value) ? p.value : []);
      if (n.status === "fulfilled") setNetwork(Array.isArray(n.value) ? n.value : []);
      if (cr.status === "fulfilled") setLeads(cr.value?.data ?? []);
      if (bb.status === "fulfilled") setBible(bb.value);
      if (gh.status === "fulfilled") setGithubData(gh.value);

      if (h.status === "rejected") setError("Cannot reach core API — is the server running?");
      else setError("");
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(() => fetchAll(true), 6000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // ── Scroll terminal to bottom ─────────────────────────────────────────────
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termHist]);

  // ── Run PowerShell command ────────────────────────────────────────────────
  const runCmd = async () => {
    const cmd = termCmd.trim();
    if (!cmd || termRunning) return;
    setTermRunning(true);
    setCmdHistory(h => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);
    setTermCmd("");
    try {
      const r = await api("/api/exec", { method: "POST", body: JSON.stringify({ command: cmd }) });
      setTermHist(h => [...h, { cmd, out: r.stdout || "", err: r.stderr || "", ts: new Date().toLocaleTimeString() }]);
    } catch (e: unknown) {
      setTermHist(h => [...h, { cmd, out: "", err: String(e), ts: new Date().toLocaleTimeString() }]);
    } finally {
      setTermRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const onTermKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { runCmd(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(idx);
      setTermCmd(cmdHistory[idx] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setTermCmd(idx < 0 ? "" : cmdHistory[idx]);
    }
  };

  // ── JARVIS Voice ─────────────────────────────────────────────────────────
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const uttarance = new SpeechSynthesisUtterance(text);
    // Find a premium-sounding voice if possible
    const voices = window.speechSynthesis.getVoices();
    uttarance.voice = voices.find(v => v.name.includes("Google") || v.name.includes("Premium")) || voices[0];
    uttarance.rate = 1.0;
    uttarance.pitch = 0.9; // Slightly lower for JARVIS feel
    uttarance.onstart = () => setSpeaking(true);
    uttarance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(uttarance);
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setJarvisMsg(transcript);
      askJarvis(transcript);
    };
    rec.start();
  };

  const askJarvis = async (q: string) => {
    if (!q.trim()) return;
    setJarvisChat(prev => [...prev, { role: 'user', text: q }]);
    setJarvisMsg("");
    setSpinning(true);
    try {
      const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ question: q }) });
      setJarvisChat(prev => [...prev, { role: 'jarvis', text: r.answer }]);
      speak(r.answer);
    } catch (e) {
      setError("JARVIS connection failed");
    } finally {
      setSpinning(false);
    }
  };

  useEffect(() => {
    if (jarvisScrollRef.current) jarvisScrollRef.current.scrollTop = jarvisScrollRef.current.scrollHeight;
  }, [jarvisChat]);

  // ── BIBLE Trigger ─────────────────────────────────────────────────────────
  const runTrigger = async (scriptName: string) => {
    setTriggering(true);
    setTriggerResult(null);
    setTriggerError("");
    try {
      const r = await api("/trigger", { method: "POST", body: JSON.stringify({ script: scriptName }) });
      setTriggerResult(r);
    } catch (e: any) {
      setTriggerError(e.message);
    } finally {
      setTriggering(false);
    }
  };

  const killProcess = async (pid: number, name: string) => {
    if (!confirm(`Are you sure you want to kill ${name} (PID: ${pid})?`)) return;
    setSpinning(true);
    try {
      await api(`/api/processes/${pid}`, { method: "DELETE" });
      fetchAll(true);
    } catch (e) {
      setError(`Failed to kill process: ${name}`);
    } finally {
      setSpinning(false);
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const systemStatus = loading ? "loading" : health?.status === "ok" ? "online" : "offline";
  const statusLabel = loading ? "Connecting…" : health?.status === "ok" ? "Online" : "Offline";

  // ── Sidebar nav click ─────────────────────────────────────────────────────
  const goTab = (id: string) => { setTab(id); setSideOpen(false); };

  // ── Sections ──────────────────────────────────────────────────────────────
  const crashedCount = agents.filter(a => a.status === "crashed").length;

  return (
    <div className="layout">
      {/* Overlay for mobile sidebar */}
      {sideOpen && (
        <div
          onClick={() => setSideOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sideOpen ? " open" : ""}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🦞</div>
          <div>
            <div className="sidebar-logo-text">OpenClaw</div>
            <div className="sidebar-logo-sub">PC Control Panel</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Control</div>
          {NAV.map(n => (
            <button key={n.id} className={`nav-item${tab === n.id ? " active" : ""}`} onClick={() => goTab(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.id === "agents" && crashedCount > 0 && (
                <span className="nav-badge">{crashedCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ marginBottom: 4 }}>
            <span className={`status-badge ${systemStatus}`} style={{ fontSize: 11, padding: "3px 10px" }}>
              <span className="pulse-dot" />
              {statusLabel}
            </span>
          </div>
          {sysInfo && <div style={{ marginTop: 6 }}>🖥️ {sysInfo.hostname}</div>}
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        {/* Topbar */}
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSideOpen(v => !v)}>☰</button>
          <div style={{ flex: 1 }}>
            <div className="topbar-title">
              {NAV.find(n => n.id === tab)?.icon} {NAV.find(n => n.id === tab)?.label ?? "Dashboard"}
            </div>
            {sysInfo && <div className="topbar-sub">{sysInfo.hostname} · {sysInfo.platform}</div>}
          </div>
          <span className={`status-badge ${systemStatus}`}>
            <span className="pulse-dot" />
            {statusLabel}
          </span>
          <button className="refresh-btn" onClick={() => fetchAll()}>
            <span className={spinning ? "spin" : ""}>↻</span>
          </button>
        </header>

        {/* Content */}
        <main className="content">
          {error && <div className="error-banner">⚠️ {error}</div>}

          {/* ── DASHBOARD ─────────────────────────────────────────────── */}
          {tab === "dashboard" && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-icon">⚡</div>
                  <div className="stat-label">CPU Usage</div>
                  <div className="stat-value">
                    {sysInfo?.cpuPct != null ? `${sysInfo.cpuPct}%` : "—"}
                  </div>
                  <div className="stat-sub">{sysInfo?.cpuModel?.slice(0, 28) ?? "—"}</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${sysInfo?.cpuPct ?? 0}%` }} />
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">🧠</div>
                  <div className="stat-label">RAM Used</div>
                  <div className="stat-value">
                    {sysInfo ? fmt(sysInfo.usedMem) : "—"}
                  </div>
                  <div className="stat-sub">of {sysInfo ? fmt(sysInfo.totalMem) : "—"}</div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill${sysInfo && sysInfo.usedMem / sysInfo.totalMem > 0.85 ? " danger" : sysInfo && sysInfo.usedMem / sysInfo.totalMem > 0.65 ? " warn" : ""}`}
                      style={{ width: sysInfo ? `${(sysInfo.usedMem / sysInfo.totalMem * 100).toFixed(0)}%` : "0%" }}
                    />
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">⏱️</div>
                  <div className="stat-label">Uptime</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{sysInfo ? fmtUptime(sysInfo.uptime) : "—"}</div>
                  <div className="stat-sub">System running</div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">🤖</div>
                  <div className="stat-label">Agents</div>
                  <div className="stat-value">{agents.length}</div>
                  <div className="stat-sub">
                    {crashedCount > 0
                      ? <span style={{ color: "var(--red)" }}>⚠ {crashedCount} crashed</span>
                      : <span style={{ color: "var(--green)" }}>All healthy</span>}
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">💾</div>
                  <div className="stat-label">Processes</div>
                  <div className="stat-value">{processes.length}</div>
                  <div className="stat-sub">Top by CPU</div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">🖥️</div>
                  <div className="stat-label">CPU Cores</div>
                  <div className="stat-value">{sysInfo?.cpuCount ?? "—"}</div>
                  <div className="stat-sub">{sysInfo?.platform ?? "—"}</div>
                </div>
              </div>

              {/* Disks */}
              {sysInfo?.disks && sysInfo.disks.length > 0 && (
                <>
                  <div className="section-header"><div className="section-title">💽 Disk Usage</div></div>
                  <div className="disk-grid">
                    {sysInfo.disks.filter(d => d.total > 0).map(d => {
                      const pct = d.total > 0 ? Math.round(d.used / d.total * 100) : 0;
                      return (
                        <div key={d.name} className="card">
                          <div className="card-title">Drive {d.name}:</div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 16 }}>{pct}%</span>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{fmt(d.used)} / {fmt(d.total)}</span>
                          </div>
                          <div className="progress-bar" style={{ height: 6 }}>
                            <div className={`progress-fill${pct > 85 ? " danger" : pct > 65 ? " warn" : ""}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>Free: {fmt(d.free)}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── BIBLE SYSTEM ────────────────────────────────────────────── */}
          {tab === "bible" && (
            <div className="space-y-6">
              <div className="section-header">
                <div className="section-title">📖 BIBLE Infrastructure Status</div>
                <button className="btn btn-ghost" onClick={() => fetchAll()}>↻ Refresh</button>
              </div>

              {!bible ? (
                <div className="card"><div className="empty">Loading BIBLE status...</div></div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="card">
                      <div className="card-title">Core Components</div>
                      <div className="flex flex-wrap gap-3 mt-3">
                        <div className={`status-badge ${bible.bibleRootExists ? 'online' : 'offline'}`}>
                          {bible.bibleRootExists ? '✅' : '❌'} C:\BIBLE
                        </div>
                        <div className={`status-badge ${bible.secrets.exists ? 'online' : 'offline'}`}>
                          {bible.secrets.exists ? '✅' : '❌'} secrets.json
                        </div>
                      </div>
                      {bible.secrets.exists && (
                        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>
                          Keys: {bible.secrets.keys.join(", ")}
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <div className="card-title">Statistics</div>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Scripts</div>
                          <div style={{ fontSize: 20, fontWeight: 800 }}>
                            {Object.values(bible.scripts).filter(Boolean).length} / {Object.keys(bible.scripts).length}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Directories</div>
                          <div style={{ fontSize: 20, fontWeight: 800 }}>
                            {Object.values(bible.directories).filter(Boolean).length} / {Object.keys(bible.directories).length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">🚀 Remote Triggers</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                      Authorized scripts available for execution via API.
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {bible.allowedTriggers.map(name => (
                        <button
                          key={name}
                          disabled={triggering}
                          onClick={() => runTrigger(name)}
                          className="terminal-run-btn"
                          style={{ height: 36, padding: "0 15px", fontSize: 12 }}
                        >
                          {triggering ? "..." : `▶ ${name}`}
                        </button>
                      ))}
                    </div>

                    {triggerError && (
                      <div className="error-banner" style={{ marginTop: 15 }}>⚠️ {triggerError}</div>
                    )}

                    {triggerResult && (
                      <div className="terminal" style={{ marginTop: 15, padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                          Exit Code: {triggerResult.exitCode}
                        </div>
                        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {triggerResult.stdout}
                          {triggerResult.stderr && <div style={{ color: "var(--red)", marginTop: 8 }}>{triggerResult.stderr}</div>}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card">
                      <div className="card-title">Folder Map</div>
                      <div className="space-y-2 mt-3">
                        {Object.entries(bible.directories).map(([dir, exists]) => (
                          <div key={dir} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: "var(--text-muted)" }}>{dir}</span>
                            <span style={{ color: exists ? "var(--green)" : "var(--red)" }}>{exists ? "EXISTS" : "MISSING"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-title">Holy Spirit Log</div>
                      <div className="terminal" style={{ marginTop: 12, padding: 10, maxHeight: 200, overflowY: "auto" }}>
                        {bible.recentLog.length > 0 ? (
                          bible.recentLog.map((line, i) => <div key={i} style={{ fontSize: 11 }}>{line}</div>)
                        ) : (
                          <div className="empty">No recent logs</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TERMINAL ──────────────────────────────────────────────── */}
          {
            tab === "terminal" && (
              <>
                <div className="section-header">
                  <div className="section-title">💻 PowerShell Terminal</div>
                  <button className="btn btn-ghost" onClick={() => setTermHist([])}>Clear</button>
                </div>
                <div className="terminal">
                  <div className="terminal-topbar">
                    <div className="terminal-dot" style={{ background: "#ff5f57" }} />
                    <div className="terminal-dot" style={{ background: "#ffbd2e" }} />
                    <div className="terminal-dot" style={{ background: "#28c840" }} />
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>PowerShell — OpenClaw</span>
                  </div>
                  <div className="terminal-output" ref={termRef}>
                    {termHist.length === 0 && (
                      <span className="terminal-line-sys">
                        {"OpenClaw PowerShell Terminal\nType a command and press Enter or Run\n\n"}
                      </span>
                    )}
                    {termHist.map((entry, i) => (
                      <div key={i} style={{ marginBottom: 12 }}>
                        <div className="terminal-line-cmd">PS&gt; {entry.cmd} <span style={{ fontSize: 10, opacity: 0.5 }}>{entry.ts}</span></div>
                        {entry.out && <div style={{ whiteSpace: "pre-wrap" }}>{entry.out}</div>}
                        {entry.err && <div className="terminal-line-err" style={{ whiteSpace: "pre-wrap" }}>{entry.err}</div>}
                      </div>
                    ))}
                    {termRunning && <div className="terminal-line-sys">⌛ Running…</div>}
                  </div>
                  <div className="terminal-input-row">
                    <span className="terminal-prompt">PS&gt;</span>
                    <input
                      ref={inputRef}
                      className="terminal-input"
                      value={termCmd}
                      onChange={e => setTermCmd(e.target.value)}
                      onKeyDown={onTermKey}
                      placeholder="Enter PowerShell command…"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button className="terminal-run-btn" onClick={runCmd} disabled={termRunning || !termCmd.trim()}>
                      {termRunning ? "…" : "▶ Run"}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 11 }}>
                  ↑↓ arrow keys for history · Enter to run · Some destructive commands are blocked for safety
                </div>
              </>
            )
          }

          {/* ── PROCESSES ─────────────────────────────────────────────── */}
          {
            tab === "processes" && (
              <>
                <div className="section-header">
                  <div className="section-title">⚙️ Running Processes</div>
                  <button className="btn btn-ghost" onClick={() => fetchAll()}>↻ Refresh</button>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <input
                    className="search-input"
                    value={procSearch}
                    onChange={e => setProcSearch(e.target.value)}
                    placeholder="Search processes…"
                  />
                </div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th><th>PID</th><th>CPU (s)</th><th>RAM</th><th>Kill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processes
                          .filter(p => p.Name?.toLowerCase().includes(procSearch.toLowerCase()))
                          .map(p => (
                            <tr key={p.Id}>
                              <td style={{ color: "var(--accent)" }}>{p.Name}</td>
                              <td>{p.Id}</td>
                              <td>{p.CPU ?? "—"}</td>
                              <td>{p.RAM ? fmt(p.RAM) : "—"}</td>
                              <td>
                                <button className="btn btn-danger" style={{ padding: "3px 10px", fontSize: 11 }}
                                  onClick={() => killProcess(p.Id, p.Name)}>
                                  ✕ Kill
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {processes.length === 0 && <div className="empty">No processes loaded</div>}
                  </div>
                </div>
              </>
            )
          }

          {/* ── AGENTS ────────────────────────────────────────────────── */}
          {
            tab === "agents" && (
              <>
                <div className="section-header">
                  <div className="section-title">🤖 Agent Manager</div>
                  <button className="btn btn-ghost" onClick={() => fetchAll()}>↻ Refresh</button>
                </div>
                {agents.length === 0 ? (
                  <div className="card"><div className="empty">No agents registered yet</div></div>
                ) : (
                  <div className="agent-grid">
                    {agents.map(a => (
                      <div key={a.name} className="agent-card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div className="agent-name">{a.name}</div>
                          <span className={`agent-status ${a.status}`}>
                            <span className="status-dot-wrap">
                              {a.status === "running" && <span className="status-dot-ring" />}
                              <span className="status-dot" />
                            </span>
                            {a.status}
                          </span>
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.8 }}>
                          {a.pid && <div>PID: <span style={{ color: "var(--text-primary)" }}>{a.pid}</span></div>}
                          {a.startedAt && <div>Started: <span style={{ color: "var(--text-primary)" }}>{new Date(a.startedAt).toLocaleString()}</span></div>}
                          {a.lastHeartbeat && <div>Heartbeat: <span style={{ color: "var(--green)" }}>{new Date(a.lastHeartbeat).toLocaleTimeString()}</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          }

          {/* ── LOGS ──────────────────────────────────────────────────── */}
          {
            tab === "logs" && (
              <>
                <div className="section-header">
                  <div className="section-title">📋 Live Logs</div>
                  <button className="btn btn-ghost" onClick={() => fetchAll()}>↻ Refresh</button>
                </div>
                <div className="terminal">
                  <div className="terminal-topbar">
                    <div className="terminal-dot" style={{ background: "#ff5f57" }} />
                    <div className="terminal-dot" style={{ background: "#ffbd2e" }} />
                    <div className="terminal-dot" style={{ background: "#28c840" }} />
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>hello-agent log — auto-refresh 6s</span>
                  </div>
                  <div className="terminal-output" style={{ maxHeight: 500 }}>
                    {logs.length === 0
                      ? <span className="terminal-line-sys">No log lines yet…</span>
                      : logs.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              </>
            )
          }

          {/* ── JARVIS ───────────────────────────────────────────────── */}
          {
            tab === "jarvis" && (
              <div style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
                <div className="section-header">
                  <div className="section-title">🌌 JARVIS Intelligence</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {speaking && <button className="btn btn-danger" onClick={() => window.speechSynthesis.cancel()}>⏹ Stop Voice</button>}
                    <button className="btn btn-ghost" onClick={() => setJarvisChat([])}>Clear History</button>
                  </div>
                </div>

                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                  <div
                    ref={jarvisScrollRef}
                    style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(0,0,0,0.2)' }}
                  >
                    {jarvisChat.length === 0 && (
                      <div style={{ textAlign: 'center', marginTop: 100, opacity: 0.5 }}>
                        <div style={{ fontSize: 48, marginBottom: 20 }}>🌌</div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>I am online and listening.</div>
                        <div style={{ fontSize: 14 }}>Ask me about leads, system status, or the 9Ruby ecosystem.</div>
                      </div>
                    )}
                    {jarvisChat.map((m, i) => (
                      <div key={i} style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        background: m.role === 'user' ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                        padding: '12px 18px',
                        borderRadius: m.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                        fontSize: 14,
                        lineHeight: 1.5,
                        border: m.role === 'jarvis' ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        color: m.role === 'user' ? '#000' : '#fff'
                      }}>
                        {m.text}
                      </div>
                    ))}
                    {spinning && <div style={{ opacity: 0.5, fontSize: 12 }}>JARVIS is thinking...</div>}
                  </div>

                  <div className="terminal-input-row" style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                      onClick={startListening}
                      style={{
                        width: 40, height: 40, borderRadius: '50%', background: listening ? 'var(--red)' : 'rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: 'none', cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                      className={listening ? 'pulsing' : ''}
                    >
                      {listening ? '⏺' : '🎤'}
                    </button>
                    <input
                      className="terminal-input"
                      value={jarvisMsg}
                      onChange={e => setJarvisMsg(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && askJarvis(jarvisMsg)}
                      placeholder={listening ? "Listening..." : "Type or speak to JARVIS..."}
                    />
                    <button className="terminal-run-btn" onClick={() => askJarvis(jarvisMsg)} disabled={spinning || !jarvisMsg.trim()}>
                      {spinning ? "..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          {/* ── CRM ──────────────────────────────────────────────────── */}
          {
            tab === "crm" && (
              <>
                <div className="section-header">
                  <div className="section-title">💎 IX Ruby CRM Management</div>
                  <button className="btn btn-ghost" onClick={() => fetchAll()}>↻ Sync Cloud</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="card md:col-span-1">
                    <div className="card-title">Add New Lead</div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const name = fd.get("name") as string;
                      const phone = fd.get("phone") as string;
                      if (!name || !phone) return;
                      setSpinning(true);
                      try {
                        await api("/api/crm/leads", {
                          method: "POST",
                          body: JSON.stringify({ name, phone, notes: "Added via Dashboard" })
                        });
                        fetchAll(true);
                        (e.target as HTMLFormElement).reset();
                      } catch (err) {
                        setError("Failed to add lead");
                      } finally {
                        setSpinning(false);
                      }
                    }}>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--text-muted)" }}>Name</label>
                        <input name="name" className="search-input" required />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--text-muted)" }}>Phone</label>
                        <input name="phone" className="search-input" required />
                      </div>
                      <button type="submit" className="terminal-run-btn" style={{ width: "100%", height: 40 }}>
                        🚀 Capture Lead
                      </button>
                    </form>
                  </div>

                  <div className="md:col-span-2">
                    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <div style={{ overflowX: "auto" }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Phone</th>
                              <th>Status</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leads.length > 0 ? (
                              leads.map((l, i) => (
                                <tr key={i}>
                                  <td style={{ color: "var(--accent)", fontWeight: 700 }}>{l.name}</td>
                                  <td>{l.phone}</td>
                                  <td>
                                    <span style={{
                                      padding: "2px 8px",
                                      background: "rgba(34,197,94,0.1)",
                                      color: "rgb(34,197,94)",
                                      borderRadius: 8,
                                      fontSize: 10,
                                      fontWeight: 700
                                    }}>
                                      {l.status}
                                    </span>
                                  </td>
                                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                    {l.date ? new Date(l.date).toLocaleDateString() : '—'}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr><td colSpan={4} className="empty">No leads captured yet</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ background: "rgba(255,0,51,0.02)", border: "1px dashed rgba(255,0,51,0.2)" }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ fontSize: 24 }}>🛡️</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>Cloud Sync Active</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>Every lead captured here is instantly mirrored to Google Sheets and Firebase.</div>
                    </div>
                  </div>
                </div>
              </>
            )
          }

          {/* ── GITHUB ────────────────────────────────────────────────── */}
          {tab === "github" && (
            <>
              <div className="section-header">
                <div className="section-title">🐙 GitHub Repositories</div>
                <button className="btn btn-ghost" onClick={() => fetchAll()}>↻ Refresh</button>
              </div>

              {!githubData ? (
                <div className="card"><div className="empty">Loading GitHub data…</div></div>
              ) : !githubData.configured ? (
                <div className="card">
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 32 }}>🔑</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>No GitHub Tokens Configured</div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        Add your GitHub Personal Access Tokens to <code style={{ background: "var(--bg-card)", padding: "1px 6px", borderRadius: 4, fontFamily: "JetBrains Mono, monospace" }}>.env</code> to bring all your repos into one place.
                      </div>
                      <pre style={{
                        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
                        padding: "12px 16px", marginTop: 14, fontFamily: "JetBrains Mono, monospace",
                        fontSize: 12, color: "var(--accent)", overflowX: "auto"
                      }}>{`# .env — add one token per account, comma-separated\nGITHUB_TOKENS=ghp_token_account1,ghp_token_account2`}</pre>
                      <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                        Generate tokens at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>github.com/settings/tokens</a>. The <code style={{ fontFamily: "JetBrains Mono, monospace" }}>repo</code> scope is sufficient for reading repositories.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="stat-grid" style={{ marginBottom: 20 }}>
                    <div className="stat-card">
                      <div className="stat-icon">👤</div>
                      <div className="stat-label">Accounts</div>
                      <div className="stat-value">{githubData.accounts.filter(a => !a.error).length}</div>
                      <div className="stat-sub">connected</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">📦</div>
                      <div className="stat-label">Total Repos</div>
                      <div className="stat-value">{githubData.totalRepos}</div>
                      <div className="stat-sub">across all accounts</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">⭐</div>
                      <div className="stat-label">Total Stars</div>
                      <div className="stat-value">
                        {githubData.accounts.flatMap(a => a.repos ?? []).reduce((s, r) => s + r.stars, 0)}
                      </div>
                      <div className="stat-sub">all repos</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">🔒</div>
                      <div className="stat-label">Private Repos</div>
                      <div className="stat-value">
                        {githubData.accounts.flatMap(a => a.repos ?? []).filter(r => r.isPrivate).length}
                      </div>
                      <div className="stat-sub">of {githubData.totalRepos} total</div>
                    </div>
                  </div>

                  {/* Search */}
                  <div style={{ marginBottom: 16 }}>
                    <input
                      type="text"
                      placeholder="🔍  Search repos by name, language or topic…"
                      value={githubSearch}
                      onChange={e => setGithubSearch(e.target.value)}
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: 8,
                        background: "var(--bg-card)", border: "1px solid var(--border)",
                        color: "var(--text-primary)", fontSize: 13, outline: "none"
                      }}
                    />
                  </div>

                  {/* Per-account sections */}
                  {githubData.accounts.map((account, ai) => {
                    if (account.error) {
                      return (
                        <div key={ai} className="card" style={{ marginBottom: 16, borderColor: "var(--red-dim)" }}>
                          <div style={{ color: "var(--red)" }}>⚠️ Account #{ai + 1} failed: {account.error}</div>
                        </div>
                      );
                    }
                    const q = githubSearch.toLowerCase();
                    const filtered = (account.repos || []).filter(r =>
                      !q ||
                      r.name.toLowerCase().includes(q) ||
                      (r.description || "").toLowerCase().includes(q) ||
                      (r.language || "").toLowerCase().includes(q) ||
                      r.topics.some(t => t.toLowerCase().includes(q))
                    );
                    return (
                      <div key={ai} style={{ marginBottom: 24 }}>
                        <div className="section-header" style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {account.avatarUrl && (
                              <img src={account.avatarUrl} alt={account.login} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)" }} />
                            )}
                            <div>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>@{account.login}</span>
                              {account.name !== account.login && (
                                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{account.name}</span>
                              )}
                            </div>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                              background: "var(--accent-dim)", border: "1px solid var(--border-bright)", color: "var(--accent)"
                            }}>{filtered.length} repo{filtered.length !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: 10 }}>
                          {filtered.length === 0 ? (
                            <div className="card"><div className="empty">No repos match your search.</div></div>
                          ) : filtered.map(repo => (
                            <div key={repo.id} className="card" style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                    <a href={repo.url} target="_blank" rel="noopener noreferrer"
                                      style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", textDecoration: "none" }}>
                                      {repo.name}
                                    </a>
                                    {repo.isPrivate && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "var(--yellow-dim)", border: "1px solid rgba(255,211,42,0.3)", color: "var(--yellow)" }}>private</span>
                                    )}
                                    {repo.isFork && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>fork</span>
                                    )}
                                    {repo.isArchived && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "var(--red-dim)", border: "1px solid rgba(255,71,87,0.3)", color: "var(--red)" }}>archived</span>
                                    )}
                                  </div>
                                  {repo.description && (
                                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {repo.description}
                                    </div>
                                  )}
                                  {repo.topics.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                                      {repo.topics.slice(0, 6).map(t => (
                                        <span key={t} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8" }}>{t}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                                  {repo.language && (
                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                                      {repo.language}
                                    </span>
                                  )}
                                  <span title="Stars">⭐ {repo.stars}</span>
                                  <span title="Forks">🍴 {repo.forks}</span>
                                  {repo.openIssues > 0 && <span title="Open Issues" style={{ color: "var(--yellow)" }}>🔴 {repo.openIssues}</span>}
                                  <span title="Last push" style={{ fontSize: 11 }}>{repo.pushedAt ? new Date(repo.pushedAt).toLocaleDateString() : "—"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* ── NETWORK ───────────────────────────────────────────────── */}
          {
            tab === "network" && (
              <>
                <div className="section-header">
                  <div className="section-title">🌐 Network Interfaces</div>
                </div>
                <div style={{ display: "grid", gap: 14 }}>
                  {network.filter(iface => iface.addresses.some(a => !a.internal)).map(iface => (
                    <div key={iface.name} className="card">
                      <div className="card-title">
                        <span className="iface-tag">{iface.name}</span>
                      </div>
                      {iface.addresses.map((a, i) => (
                        <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span style={{
                            background: a.family === "IPv4" ? "var(--accent-dim)" : "rgba(99,102,241,0.15)",
                            border: `1px solid ${a.family === "IPv4" ? "var(--border-bright)" : "rgba(99,102,241,0.3)"}`,
                            color: a.family === "IPv4" ? "var(--accent)" : "#818cf8",
                            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99
                          }}>{a.family}</span>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--text-primary)", flex: 1 }}>{a.address}</span>
                          {a.internal && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>internal</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                  {network.length === 0 && <div className="card"><div className="empty">No interfaces loaded</div></div>}
                </div>
              </>
            )
          }
        </main >
      </div >
    </div >
  );
}
