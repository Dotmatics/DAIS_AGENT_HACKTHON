# DAIS Agent Hackathon — Aaron SMS Health Agent

Databricks Apps & Agents for Good hackathon project: an SMS-style health intake agent for rural users with no internet access. Users describe symptoms via text; the agent collects location (postal code), age, and symptoms, then recommends nearby medical facilities from the Virtue Foundation dataset.

## Repository layout

```
DAIS_AGENT_HACKTHON/
├── aaron/              # Databricks App (AppKit) — mock SMS UI, agents, Lakebase
├── agent-docs/         # Hackathon prompts, context, and agent instructions
├── docs/
│   ├── aaron-app.md    # AppKit setup, build, and deploy guide
│   └── plans/          # Implementation plans
└── README.md           # This file
```

## Quick start

1. Configure Databricks CLI profile `hackathon-dais` pointing at the hackathon workspace.
2. Install and run the app:

```bash
cd aaron
npm install
npm run dev
```

See [docs/aaron-app.md](docs/aaron-app.md) for full setup, authentication, and deployment.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/plans/aaron_sms_health_agent_e3bf519b.plan.md](docs/plans/aaron_sms_health_agent_e3bf519b.plan.md) | Implementation plan |
| [agent-docs/hackathon_codex_context.md](agent-docs/hackathon_codex_context.md) | Hackathon context |
| [agent-docs/agent_prompt.md](agent-docs/agent_prompt.md) | Agent prompt |
| [agent-docs/app_with_lakebase_prompt.md](agent-docs/app_with_lakebase_prompt.md) | Lakebase app prompt |
| [docs/aaron-app.md](docs/aaron-app.md) | Aaron app development guide |

## Data

Unity Catalog: `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset`

- `facilities` — medical facilities (~10K rows)
- `india_post_pincode_directory` — pincode → lat/lon
- `nfhs_5_district_health_indicators` — district health indicators

## Workspace

- Host: `https://dbc-90be8f46-8e3a.cloud.databricks.com`
- CLI profile: `hackathon-dais`
