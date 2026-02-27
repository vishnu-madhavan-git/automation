"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Gem,
  Bot,
  Terminal,
  Settings2,
  Users,
  ClipboardList,
  Globe,
  Compass,
  Cpu,
  RefreshCw,
  Activity,
  HardDrive,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Layout
} from "lucide-react";

const logo = { src: "/logo.png" };

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
  { id: "dashboard", icon: <LayoutDashboard size={18} color="var(--accent)" />, label: "Dashboard", colorClass: "" },
  { id: "browser", icon: <Compass size={18} color="var(--accent)" />, label: "AI Browser", colorClass: "cyan" },
  { id: "bible", icon: <BookOpen size={18} color="var(--gold)" />, label: "BIBLE System", colorClass: "gold" },
  { id: "crm", icon: <Gem size={18} color="var(--magenta)" />, label: "IX Ruby CRM", colorClass: "magenta" },
  { id: "jarvis", icon: <Bot size={18} color="var(--accent)" />, label: "JARVIS AI", colorClass: "" },
  { id: "terminal", icon: <Terminal size={18} color="var(--green)" />, label: "Terminal", colorClass: "green" },
  { id: "processes", icon: <Settings2 size={18} color="var(--gold)" />, label: "Processes", colorClass: "gold" },
  { id: "agents", icon: <Users size={18} color="var(--magenta)" />, label: "Agents", colorClass: "magenta" },
  { id: "logs", icon: <ClipboardList size={18} color="var(--accent)" />, label: "Logs", colorClass: "" },
  { id: "network", icon: <Globe size={18} color="var(--green)" />, label: "Network", colorClass: "green" },
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

  // BIBLE state
  const [bible, setBible] = useState<BibleStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerResult>(null);
  const [triggerError, setTriggerError] = useState("");

  // JARVIS AI
  const [jarvisMsg, setJarvisMsg] = useState("");
  const [jarvisChat, setJarvisChat] = useState<{ role: 'user' | 'jarvis', text: string, plan?: string }[]>([]);
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

  // AI Browser simulation
  const [browserLogs, setBrowserLogs] = useState<{ type: string, text: string }[]>([
    { type: "STRATEGY", text: "Detecting form fields on current page..." },
    { type: "ACTION", text: "Extracted 12 leads from LinkedIn Sales Navigator." },
    { type: "VERIFICATION", text: "Cross-referencing with local CRM database." },
  ]);

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
      ]);
      const [h, s, a, l, p, n, cr, bb] = responses;

      if (h.status === "fulfilled") setHealth(h.value);
      if (s.status === "fulfilled") setSysInfo(s.value);
      if (a.status === "fulfilled") setAgents(Array.isArray(a.value) ? a.value : []);
      if (l.status === "fulfilled") setLogs(l.value?.lines ?? []);
      if (p.status === "fulfilled") setProcesses(Array.isArray(p.value) ? p.value : []);
      if (n.status === "fulfilled") setNetwork(Array.isArray(n.value) ? n.value : []);
      if (cr.status === "fulfilled") setLeads(cr.value?.data ?? []);
      if (bb.status === "fulfilled") setBible(bb.value);

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
    const win = window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any };
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
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
    rec.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
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
      // request agentic reasoning (planning + answer)
      const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ question: q, agentic: true }) });
      setJarvisChat(prev => [...prev, { role: 'jarvis', text: r.answer, plan: r.plan }]);
      if (r.answer) speak(r.answer);
    } catch {
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
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    if (tab !== "browser") return;
    const interval = setInterval(() => {
      const simLogs = [
        { type: "STRATEGY", text: "Analyzing page structure for data patterns..." },
        { type: "ACTION", text: "Automatically scrolling to load more content..." },
        { type: "VERIFICATION", text: "Validation of data integrity for item #" + Math.floor(Math.random() * 100) },
        { type: "ACTION", text: "Syncing batch data to cloud storage..." },
        { type: "STRATEGY", text: "Optimizing navigation path for efficiency..." }
      ];
      const randomLog = simLogs[Math.floor(Math.random() * simLogs.length)];
      setBrowserLogs(prev => [...prev.slice(-9), randomLog]);
    }, 4000);
    return () => clearInterval(interval);
  }, [tab]);

  const killProcess = async (pid: number, name: string) => {
    if (!confirm(`Are you sure you want to kill ${name} (PID: ${pid})?`)) return;
    setSpinning(true);
    try {
      await api(`/api/processes/${pid}`, { method: "DELETE" });
      fetchAll(true);
    } catch {
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
          <div className="sidebar-logo-icon">
            <Compass size={24} color="#fff" />
          </div>
          <div>
            <div className="sidebar-logo-text" style={{ letterSpacing: 1 }}>OpenClaw</div>
            <div className="sidebar-logo-sub">PC Control Panel</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Control</div>
          {NAV.map(n => (
            <button key={n.id} className={`nav-item${tab === n.id ? " active " + n.colorClass : ""}`} onClick={() => goTab(n.id)}>
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
                  <div className="stat-icon" style={{ color: 'var(--accent)' }}><Cpu size={20} /></div>
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
                  <div className="stat-icon" style={{ color: 'var(--magenta)' }}><HardDrive size={20} /></div>
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
                  <div className="stat-icon" style={{ color: 'var(--gold)' }}><RefreshCw size={20} /></div>
                  <div className="stat-label">Uptime</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>{sysInfo ? fmtUptime(sysInfo.uptime) : "—"}</div>
                  <div className="stat-sub">System running</div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon" style={{ color: 'var(--green)' }}><Bot size={20} /></div>
                  <div className="stat-label">Agents</div>
                  <div className="stat-value">{agents.length}</div>
                  <div className="stat-sub">
                    {crashedCount > 0
                      ? <span style={{ color: "var(--red)" }}>⚠ {crashedCount} crashed</span>
                      : <span style={{ color: "var(--green)" }}>All healthy</span>}
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon" style={{ color: 'var(--accent)' }}><Settings2 size={20} /></div>
                  <div className="stat-label">Processes</div>
                  <div className="stat-value">{processes.length}</div>
                  <div className="stat-sub">Top by CPU</div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon" style={{ color: 'var(--magenta)' }}><Activity size={20} /></div>
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
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}>
                        {m.plan && (
                          <div style={{
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(0,255,255,0.1)',
                            borderRadius: '8px',
                            padding: '10px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: '#0ff',
                            opacity: 0.8
                          }}>
                            <div style={{ marginBottom: 4, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step-by-step Reasoning</div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{m.plan}</div>
                          </div>
                        )}
                        <div className={m.role === 'user' ? 'chat-msg-user' : 'chat-msg-jarvis'}>
                          <div className={m.role === 'user' ? 'chat-msg-user-bubble' : 'chat-msg-jarvis-bubble'}>
                            {m.text}
                          </div>
                        </div>
                      </div>
                    ))}
                    {spinning && <div className="jarvis-thinking">JARVIS is thinking...</div>}
                  </div>

                  <div className="jarvis-input-row">
                    <button
                      onClick={startListening}
                      className={`mic-button ${listening ? 'active pulsing' : ''}`}
                    >
                      {listening ? '⏺' : '🎤'}
                    </button>
                    <input
                      id="jarvis-input"
                      className="terminal-input"
                      value={jarvisMsg}
                      onChange={e => setJarvisMsg(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && askJarvis(jarvisMsg)}
                      placeholder={listening ? "Listening..." : "Type or speak to JARVIS..."}
                      title="JARVIS Chat Input"
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
                      } catch {
                        setError("Failed to add lead");
                      } finally {
                        setSpinning(false);
                      }
                    }}>
                      <div className="form-group">
                        <label htmlFor="lead-name" className="form-label">Name</label>
                        <input id="lead-name" name="name" className="search-input" required placeholder="Full Name" title="Enter lead name" />
                      </div>
                      <div className="form-group">
                        <label htmlFor="lead-phone" className="form-label">Phone</label>
                        <input id="lead-phone" name="phone" className="search-input" required placeholder="+1 234..." title="Enter lead phone number" />
                      </div>
                      <button type="submit" className="terminal-run-btn" style={{ width: "100%", height: 40 }}>
                        🚀 Capture Lead
                      </button>
                    </form>
                  </div>

                  <div className="md:col-span-2">
                    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <div className="crm-table-container">
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
                                  <td className="crm-name-cell">{l.name}</td>
                                  <td>{l.phone}</td>
                                  <td>
                                    <span className="crm-status-badge">
                                      {l.status}
                                    </span>
                                  </td>
                                  <td className="crm-date-cell">
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

                <div className="card crm-footer-card">
                  <div style={{ fontSize: 24 }}>🛡️</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>Cloud Sync Active</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Every lead captured here is instantly mirrored to Google Sheets and Firebase.</div>
                  </div>
                </div>
              </>
            )
          }

          {/* ── AI BROWSER ────────────────────────────────────────────── */}
          {
            tab === "browser" && (
              <div className="browser-container">
                <div className="browser-header">
                  <div className="flex gap-2">
                    <button className="browser-nav-btn" title="Go Back"><ChevronLeft size={16} /></button>
                    <button className="browser-nav-btn" title="Go Forward"><ChevronRight size={16} /></button>
                    <button className="browser-nav-btn" title="Reload Page"><RotateCw size={14} /></button>
                  </div>
                  <div className="browser-address flex items-center gap-2">
                    <ShieldCheck size={14} color="var(--green)" />
                    <span>https://openclaw.ai/automation-dashboard</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="action-btn browser-action-btn-small"><Search size={14} /> AI Search</button>
                    <button className="action-btn green browser-action-btn-small"><Zap size={14} /> Auto-Fill</button>
                  </div>
                </div>

                <div className="browser-main">
                  <div className="browser-viewport">
                    <div className="browser-mock-content">
                      <Layout size={64} className="mb-4 text-accent mx-auto" />
                      <div className="text-xl font-bold mb-2">Automation Layer Active</div>
                      <div className="text-sm">Browsing in High-Speed AI Proxy Mode</div>
                    </div>
                  </div>

                  <div className="automation-console">
                    <div className="console-header">
                      <span>Live Reasoning</span>
                      <span className="flex items-center gap-1">
                        <span className="pulsing console-dot"></span>
                        ACTIVE
                      </span>
                    </div>
                    <div className="console-body">
                      {browserLogs.map((log, i) => (
                        <div key={i} className="thought-bubble">
                          <div className={`text-[10px] mb-1 ${log.type === 'ACTION' ? 'text-green' : log.type === 'VERIFICATION' ? 'text-gold' : 'text-accent'}`}>{log.type}</div>
                          <div>{log.text}</div>
                        </div>
                      ))}
                      <div className="waiting-text">Waiting for next command...</div>
                    </div>
                    <div className="automation-actions">
                      <button className="action-btn"><Search size={14} /> Scrape Leads</button>
                      <button className="action-btn"><RefreshCw size={14} /> Sync CRM</button>
                      <button className="action-btn"><ExternalLink size={14} /> Export CSV</button>
                      <button className="action-btn green"><Zap size={14} /> Deploy Bot</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

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
