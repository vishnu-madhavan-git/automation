/**
 * Leads Bridge - connects villa scraper output to Google Sheets CRM
 * Reads data/state/villa_leads.json and syncs new leads to Sheets
 */
const fs = require("fs");
const path = require("path");
const sheets = require("./sheets");

const ROOT_DIR = path.resolve(__dirname, "..");
const LEADS_FILE = path.join(ROOT_DIR, "data", "state", "villa_leads.json");
const SYNCED_FILE = path.join(ROOT_DIR, "data", "state", "synced_leads.json");

function loadLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8")); }
  catch { return []; }
}

function loadSynced() {
  if (!fs.existsSync(SYNCED_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SYNCED_FILE, "utf8")); }
  catch { return []; }
}

function saveSynced(leads) {
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(leads, null, 2));
}

async function syncLeadsToSheets() {
  const sheetsService = new (require("./sheets"))();
  const initialized = await sheetsService.init();
  if (!initialized) {
    console.log("[leads-bridge] Sheets not initialized, skipping sync");
    return { synced: 0, error: "Sheets not configured" };
  }

  const allLeads = loadLeads();
  const syncedPhones = new Set(loadSynced().map(l => l.phone));
  const unsynced = allLeads.filter(l => !syncedPhones.has(l.phone));

  console.log(`[leads-bridge] ${unsynced.length} new leads to sync`);

  let synced = 0;
  for (const lead of unsynced) {
    try {
      await sheetsService.addLead({
        name: lead.name,
        phone: lead.phone,
        notes: `Area: ${lead.area} | Price: ${lead.price} | Source: ${lead.source} | ${lead.url}`
      });
      synced++;
    } catch (err) {
      console.error(`[leads-bridge] Failed to sync ${lead.phone}:`, err.message);
    }
  }

  // Mark all as synced
  const newSynced = [...loadSynced(), ...unsynced];
  saveSynced(newSynced);

  return { synced, total: allLeads.length };
}

module.exports = { syncLeadsToSheets };
