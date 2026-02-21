require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const http = require("http");
const https = require("https");
const { geminiChat } = require("./gemini-bridge");
const { callCognitionAgent } = require("./cognition-bridge");
const { mcPost } = require("./manychat-bridge");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_ID = parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID, 10);
const API_URL = process.env.CORE_API_URL || "http://localhost:4000";
const API_KEY = process.env.API_KEY || "";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const AI_MODEL = process.env.AI_MODEL || "llama3.2:3b";
let activeEngine = process.env.DEFAULT_AI_ENGINE || "ollama";

if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN not set"); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });
console.log(`[telegram] JARVIS online — model: ${AI_MODEL}`);

// ── helpers ──────────────────────────────────────────────────────────────────

function allowed(msg) { return msg.chat.id === ALLOWED_ID; }
function deny(id) { bot.sendMessage(id, "⛔ Not authorised."); }

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const opts = new URL(`${API_URL}${path}`);
    const req = http.get({ hostname: opts.hostname, port: opts.port, path: opts.pathname, headers: { "X-API-Key": API_KEY } }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    });
    req.on("error", reject);
  });
}

function apiPost(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = new URL(`${API_URL}${path}`);
    const req = http.request({
      hostname: opts.hostname, port: opts.port, path: opts.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-API-Key": API_KEY }
    }, (res) => {
      let resp = "";
      res.on("data", c => resp += c);
      res.on("end", () => { try { resolve(JSON.parse(resp)); } catch { resolve(resp); } });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Ollama streaming chat
function ollamaChat(prompt, model = AI_MODEL) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, stream: false });
    const opts = new URL(`${OLLAMA_URL}/api/generate`);
    console.log(`[ollama] Requesting ${model}...`);
    const req = http.request({
      hostname: opts.hostname, port: opts.port || 11434,
      path: "/api/generate", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          console.log(`[ollama] Response received. Keys: ${Object.keys(json).join(", ")}`);
          if (json.error) {
            console.error(`[ollama] Server error: ${json.error}`);
            resolve(`Ollama Error: ${json.error}`);
          } else {
            resolve(json.response || json.message?.content || "No response field in JSON");
          }
        }
        catch {
          console.error(`[ollama] Parse error. Raw data: ${data.slice(0, 500)}`);
          resolve(data || "Empty response from Ollama");
        }
      });
    });
    req.on("error", (e) => {
      console.error(`[ollama] Connection error: ${e.message}`);
      reject(e);
    });
    req.setTimeout(60000, () => {
      console.error("[ollama] Timeout reached.");
      req.destroy();
      reject(new Error("Ollama timeout"));
    });
    req.write(body);
    req.end();
  });
}

function fmt(bytes) { return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)}GB` : `${(bytes / 1e6).toFixed(0)}MB`; }
function fmtUp(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h ${m}m`; }
function trunc(s, n = 3900) { return s.length > n ? s.slice(0, n) + "…" : s; }

// ── /start + /help ────────────────────────────────────────────────────────────

const HELP = `
🦞 *JARVIS — OpenClaw Commands*

🤖 *AI*
  /ask \\<question\\> — ask your local AI anything
  /engine <ollama|gemini> — switch AI brain
  /model — show current AI model

🖥️ *System*
  /sys — live CPU, RAM, disk, uptime
  /status — API health check
  /run \\<cmd\\> — run a PowerShell command

📡 *Agents & CRM*
  /agents — agent status
  /lead <name> <phone> — add CRM lead
  /logs — last 20 log lines
  /mc <path> — raw ManyChat API call
  /help — this menu
`.trim();

bot.onText(/\/start/, msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  bot.sendMessage(msg.chat.id, `👋 *JARVIS is online.*\n\n${HELP}`, { parse_mode: "Markdown" });
});

bot.onText(/\/help/, msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  bot.sendMessage(msg.chat.id, HELP, { parse_mode: "Markdown" });
});

// ── /model ────────────────────────────────────────────────────────────────────

bot.onText(/\/model/, msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  const info = activeEngine === "ollama" ? `local (\`${AI_MODEL}\`)` : "cloud (`gemini-1.5-flash`)";
  bot.sendMessage(msg.chat.id, `🧠 *Active Engine*: ${activeEngine.toUpperCase()}\nModel: ${info}`, { parse_mode: "Markdown" });
});

// ── /engine ───────────────────────────────────────────────────────────────────

bot.onText(/\/engine (ollama|gemini)/, (msg, match) => {
  if (!allowed(msg)) return deny(msg.chat.id);
  activeEngine = match[1].toLowerCase();
  bot.sendMessage(msg.chat.id, `⚙️ AI Engine switched to: *${activeEngine.toUpperCase()}*`, { parse_mode: "Markdown" });
});

// ── /sys ─────────────────────────────────────────────────────────────────────

bot.onText(/\/sys/, async msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  try {
    const s = await apiGet("/api/system");
    const ramPct = Math.round(s.usedMem / s.totalMem * 100);
    const disk = s.disks?.filter(d => d.total > 0)[0];
    const dPct = disk ? Math.round(disk.used / disk.total * 100) : null;
    const text = [
      `🖥️ *${s.hostname}* (${s.platform})`,
      ``,
      `⚡ CPU:  ${s.cpuPct != null ? s.cpuPct + "%" : "—"}  (${s.cpuCount} cores)`,
      `🧠 RAM:  ${fmt(s.usedMem)} / ${fmt(s.totalMem)} (${ramPct}%)`,
      disk ? `💽 Disk: ${fmt(disk.used)} / ${fmt(disk.total)} (${dPct}%)` : "",
      `⏱️ Up:   ${fmtUp(s.uptime)}`,
    ].filter(Boolean).join("\n");
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ System stats unavailable: ${e.message}`);
  }
});

// ── /run ──────────────────────────────────────────────────────────────────────

bot.onText(/\/run (.+)/, async (msg, match) => {
  if (!allowed(msg)) return deny(msg.chat.id);
  const cmd = match[1].trim();
  bot.sendMessage(msg.chat.id, `▶ Running: \`${cmd}\``, { parse_mode: "Markdown" });
  try {
    const r = await apiPost("/api/exec", { command: cmd });
    const out = [r.stdout, r.stderr].filter(Boolean).join("\n").trim() || "(no output)";
    bot.sendMessage(msg.chat.id, trunc("```\n" + out + "\n```"), { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
  }
});

// ── /ask ──────────────────────────────────────────────────────────────────────

bot.onText(/\/ask (.+)/, async (msg, match) => {
  if (!allowed(msg)) return deny(msg.chat.id);
  const question = match[1].trim();
  const label = activeEngine === "ollama" ? `local \`${AI_MODEL}\`` : "cloud `GEMINI`";
  const thinking = await bot.sendMessage(msg.chat.id, `🧠 Thinking with ${label}…`, { parse_mode: "Markdown" });
  try {
    let answer;
    if (activeEngine === "gemini") {
      const result = await callCognitionAgent(question);
      answer = `*PLAN*: ${result.plan}\n\n*ANSWER*: ${result.answer}`;
    } else {
      answer = await ollamaChat(question);
    }
    await bot.deleteMessage(msg.chat.id, thinking.message_id).catch(() => { });
    bot.sendMessage(msg.chat.id, trunc(answer), { parse_mode: "Markdown" }).catch(() =>
      bot.sendMessage(msg.chat.id, trunc(answer))
    );
  } catch (e) {
    const help = activeEngine === "ollama" ? "\n\nIs Ollama running? Try: `ollama serve`" : "\n\nCheck your GEMINI_API_KEY.";
    bot.editMessageText(`❌ ${activeEngine.toUpperCase()} error: ${e.message}${help}`,
      { chat_id: msg.chat.id, message_id: thinking.message_id, parse_mode: "Markdown" });
  }
});

// ── /status ───────────────────────────────────────────────────────────────────

bot.onText(/\/status/, async msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  try {
    const data = await apiGet("/health");
    const icon = data.status === "ok" ? "✅" : "⚠️";
    bot.sendMessage(msg.chat.id, `${icon} *Core API*: ${data.status}\n🕐 ${data.time}`, { parse_mode: "Markdown" });
  } catch {
    bot.sendMessage(msg.chat.id, "❌ Core API unreachable — is the server running?");
  }
});

// ── /agents ───────────────────────────────────────────────────────────────────

bot.onText(/\/agents/, async msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  try {
    const agents = await apiGet("/agents");
    if (!agents.length) return bot.sendMessage(msg.chat.id, "No agents registered yet.");
    const lines = agents.map(a => {
      const icon = a.status === "running" ? "🟢" : a.status === "crashed" ? "🔴" : "🟡";
      return `${icon} *${a.name}* — ${a.status}${a.pid ? ` (pid ${a.pid})` : ""}`;
    });
    bot.sendMessage(msg.chat.id, lines.join("\n"), { parse_mode: "Markdown" });
  } catch {
    bot.sendMessage(msg.chat.id, "❌ Could not reach Core API.");
  }
});

// ── /lead ─────────────────────────────────────────────────────────────────────

bot.onText(/\/lead (.+) (.+)/, async (msg, match) => {
  if (!allowed(msg)) return deny(msg.chat.id);
  const name = match[1].trim();
  const phone = match[2].trim();

  bot.sendMessage(msg.chat.id, `📝 Capturing lead: *${name}*…`, { parse_mode: "Markdown" });
  try {
    const r = await apiPost("/api/crm/leads", { name, phone });
    if (r.success) {
      bot.sendMessage(msg.chat.id, `✅ *Lead Captured!*\nSynced to Google Sheets & Firebase.\n\n👤 ${name}\n📞 ${phone}`, { parse_mode: "Markdown" });
    } else {
      bot.sendMessage(msg.chat.id, `⚠️ Failed to capture: ${r.error || "Unknown error"}`);
    }
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ API Error: ${e.message}`);
  }
});

// ── /logs ─────────────────────────────────────────────────────────────────────

bot.onText(/\/logs/, async msg => {
  if (!allowed(msg)) return deny(msg.chat.id);
  try {
    const data = await apiGet("/logs");
    const lines = (data.lines || []).slice(-20);
    if (!lines.length) return bot.sendMessage(msg.chat.id, "No log lines yet.");
    bot.sendMessage(msg.chat.id, trunc("```\n" + lines.join("\n") + "\n```"), { parse_mode: "Markdown" });
  } catch {
    bot.sendMessage(msg.chat.id, "❌ Could not fetch logs.");
  }
});

// ── free text — send to AI if not a command ───────────────────────────────

bot.on("message", async msg => {
  if (!allowed(msg)) return;
  const text = msg.text || "";
  const known = ["/start", "/help", "/status", "/agents", "/logs", "/sys", "/run", "/ask", "/model", "/think"];

  if (text.startsWith("/")) {
    if (!known.some(cmd => text.startsWith(cmd))) {
      bot.sendMessage(msg.chat.id, "Unknown command. Try /help");
    }
    return;
  }

  // Custom /think command logic (if not handled by onText)
  if (text.startsWith("/think ")) {
    const query = text.replace("/think ", "").trim();
    const thinking = await bot.sendMessage(msg.chat.id, `🧪 _Thinking agentically..._`, { parse_mode: "Markdown" });
    try {
      const result = await callCognitionAgent(query);
      await bot.deleteMessage(msg.chat.id, thinking.message_id).catch(() => { });
      bot.sendMessage(msg.chat.id, `🧩 *REASONING*: ${result.plan}\n\n💡 *RESULT*: ${result.answer}`, { parse_mode: "Markdown" });
    } catch (e) {
      bot.editMessageText(`❌ Agent Error: ${e.message}`, { chat_id: msg.chat.id, message_id: thinking.message_id });
    }
    return;
  }

  // Plain text → treat as /ask
  if (text.trim().length > 0) {
    const label = activeEngine === "ollama" ? `_thinking…_` : `_thinking with cloud…_`;
    const thinking = await bot.sendMessage(msg.chat.id, `🧠 ${label}`, { parse_mode: "Markdown" });
    try {
      let answer;
      if (activeEngine === "gemini") {
        const result = await callCognitionAgent(text);
        answer = result.answer; // Use simple answer for free text
      } else {
        answer = await ollamaChat(text);
      }
      await bot.deleteMessage(msg.chat.id, thinking.message_id).catch(() => { });
      bot.sendMessage(msg.chat.id, trunc(answer), { parse_mode: "Markdown" }).catch(() =>
        bot.sendMessage(msg.chat.id, trunc(answer))
      );
    } catch (e) {
      bot.editMessageText(`❌ ${activeEngine.toUpperCase()}: ${e.message}`, { chat_id: msg.chat.id, message_id: thinking.message_id });
    }
  }
});

// ── /mc ───────────────────────────────────────────────────────────────────────

bot.onText(/\/mc (.+)/, async (msg, match) => {
  if (!allowed(msg)) return deny(msg.chat.id);
  const path = match[1].trim();
  bot.sendMessage(msg.chat.id, `📡 ManyChat: \`${path}\`…`, { parse_mode: "Markdown" });
  try {
    const r = await mcPost(path, {}); // simple GET-like POST with empty body
    bot.sendMessage(msg.chat.id, trunc("```\n" + JSON.stringify(r, null, 2) + "\n```"), { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ ManyChat Error: ${e.message}`);
  }
});

// ── error handling ────────────────────────────────────────────────────────────

bot.on("polling_error", err => console.error("[telegram] Polling error:", err.message));

process.on("SIGINT", () => { bot.stopPolling(); process.exit(0); });
process.on("SIGTERM", () => { bot.stopPolling(); process.exit(0); });
