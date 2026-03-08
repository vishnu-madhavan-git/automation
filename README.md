# ai-automation-system

Minimal local automation system that runs fully on localhost.

## Structure

```
ai-automation-system/
  ui/              # Next.js dashboard
  core/            # Express API + orchestrator
  agents/          # Python agents
  data/
    logs/
    state/
```

## Runtime Targets

- Node: 22 LTS (project target)
- Python: system `python`

## Install

```bash
npm install
```

## Start

```bash
npm run dev
```

This starts:
- UI on `http://localhost:3000`
- Core API on `http://localhost:4000`
- Orchestrator (spawns `agents/hello.py`)

Run agent directly:

```bash
python agents/hello.py
```

## API

- `GET /health` -> `{ "status": "ok", "time": "<ISO UTC>" }`
- `GET /agents` -> current agent state list
- `GET /logs` -> latest hello agent log lines

## Root Scripts

- `npm run dev` - runs UI + Core + Orchestrator
- `npm run ui` - starts Next.js UI
- `npm run core` - starts Express API
- `npm run agent` - runs hello agent directly
## Dubai Villa Lead Scraper

Two scraper agents for collecting direct villa owner contacts in Dubai:

### Basic Scraper (no API key needed)
```bash
python agents/dubai_villa_scraper.py --source both --area "Palm Jumeirah" --max 30
```

### Apify Scraper (faster, more reliable)
Requires `APIFY_TOKEN` in `.env`
```bash
python agents/apify_dubai_scraper.py --area "Emirates Hills" --max 100
```

Leads are saved to `data/state/villa_leads.json` and can be synced to Google Sheets via `core/leads-bridge.js`.

### Sync to Sheets
```js
const { syncLeadsToSheets } = require('./core/leads-bridge');
await syncLeadsToSheets();
```
