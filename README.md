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