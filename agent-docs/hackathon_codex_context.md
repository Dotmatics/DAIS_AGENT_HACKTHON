# DAIS 2026 Hackathon: Codex Context Document

*Feed this to Codex at the start of a hackathon session to establish shared context. Does not replace the DevHub starter prompt — use both.*

---

## What This Document Is

This is a context brief covering the hackathon's rules, constraints, tech stack, and key conventions. It is not an implementation guide — for implementation patterns, rely on your installed agent skills (`databricks aitools`) and the DevHub docs at https://developers.databricks.com. When this document conflicts with DevHub or agent skills, defer to those sources.

---

## 1. Event Constraints

**Hackathon:** Databricks Apps & Agents Hackathon for Good (DAIS 2026)

**Project Period:** Monday June 15, 2026 8:00 AM PT → Tuesday June 16, 2026 2:30 PM PT

**Judging:** Tuesday June 16, 2:30–6:00 PM PT. Winners announced ~6:00 PM.

**Platform:** Databricks Free Edition workspace provisioned for the event.

**What must be built:** A Databricks App built on Lakebase, using at least one additional Databricks tool. Must be created from scratch during the project period.

**Submission requirements (all three required by 2:30 PM Tuesday):**
- Live app URL accessible to judges (Databricks Apps deployment)
- GitHub repository URL (publicly accessible)
- Demo video (max 3 minutes)

Submitted via **Devpost**. Missing any one of these three elements fails stage one review and disqualifies the submission.

---

## 2. Judging Criteria (Equally Weighted)

**Business Applicability** — Solves a real business problem for a real industry.

**Data Relevance** — Meaningfully combines Databricks datasets and tools. Using more of the stack in purposeful ways scores better.

**Creativity** — Original idea; hasn't been done before.

**Thoroughness** — Easy for an end user to understand; provides genuinely useful, insightful information.

**Well-Architected** — Could scale at linear cost; could accommodate new features without rewriting core logic.

---

## 3. Required and Optional Tools

**Required:**
- Lakebase (the app must be built on it)
- Databricks Free Edition workspace

**Optional but recommended:**
- Agent Bricks (AI agent orchestration)
- Genie (NL-to-SQL)
- Vector Search (semantic search / RAG)
- MLflow (tracing / observability)
- Hackathon dataset from Databricks Marketplace (not mandatory — team may bring own data)

**Submission platform:** Devpost

---

## 4. The Tech Stack

### How the pieces connect

```
[Codex]                 writes the code
    ↓
[AppKit]                TypeScript SDK; scaffolds the project; plugin architecture
    ↓
[Databricks Apps]       serverless hosting; OBO auth; produces the live URL
    ↓
[Agent Bricks]          AI agent runtime; tools + memory + model routing + tracing
    ↓
[Lakebase]              managed serverless Postgres; operational data + agent memory
    ↑
[Unity Catalog sync]    mirrors Delta tables from Unity Catalog into Lakebase
    ↑
[Databricks Marketplace] → installs the hackathon dataset as a Unity Catalog catalog

[Genie]                 NL-to-SQL; embedded in app via AppKit Genie plugin
[Vector Search]         semantic search; used in RAG patterns over document corpora
[MLflow]                auto-traces every agent invocation; viewable in workspace UI
```

### Lakebase

Managed serverless Postgres. Genuine Postgres at the SQL level — any Postgres client, driver, or ORM works unchanged. Key characteristics:

- Serverless: no instance sizing, no VPC, no credential rotation
- Auth flows through Databricks identity (OBO tokens) — no username/password management
- Supports database branching (isolated copies for testing or agent sandboxing)
- Continuously syncs Delta tables from Unity Catalog via a sync job
- AppKit Lakebase plugin auto-generates TypeScript types from the schema

### Agent Bricks

Production agent platform. Provides: tool registration (in Unity Catalog), memory persistence (in Lakebase), multi-model routing (OpenAI, Anthropic, open-source via Model Serving), multi-agent orchestration, and automatic MLflow tracing.

Your app calls an Agent Bricks endpoint over HTTP. The agent handles the LLM loop; your code defines the tools (typed Python functions with docstrings) and the system prompt.

For implementation patterns, use agent skills — do not guess at Agent Bricks API syntax.

### Databricks Apps

Serverless app hosting inside the Databricks workspace. The app gets a URL; Databricks identity flows through to all downstream resources via OBO tokens. Deployment uses Databricks Asset Bundles (DABs):

```bash
databricks bundle deploy
databricks apps start <app-name>
```

The app URL is provided in CLI output and in the Apps section of the workspace UI after deployment.

Getting a skeleton app deployed to a live URL is the first milestone of the day, even before core features are built.

### AppKit

Open-source TypeScript SDK. Arrives via `databricks apps init` — you do not install it separately. Plugin architecture:

- **Lakebase plugin**: schema introspection, TypeScript type generation, connection pooling, OBO auth
- **Genie plugin**: wraps Genie Conversation API for NL-to-SQL embedding
- **Analytics plugin**: dashboard-style data visualization patterns
- **Files plugin**: document upload/storage/retrieval patterns

AppKit's APIs are designed to be LLM-discoverable. You can navigate and use them without additional explanation.

Default UI stack: **React** + **shadcn/ui** + **Tailwind CSS**. Databricks brand palette: `#FF3621` (red), `#0B2026` (dark), `#EEEDE9`, `#F9F7F4`.

Templates are intentionally minimal. Make the UI look polished before asking the user to test locally.

### Genie

Natural-language-to-SQL interface. Configured as a Genie Space pointing at Unity Catalog tables. Accuracy depends on the **Knowledge Store**: column/table metadata, synonyms, prompt-matched example queries, SQL logic snippets, and text instructions.

Knowledge Store content can be loaded programmatically via the Databricks REST API. Column metadata is applied via `ALTER TABLE ... ALTER COLUMN ... COMMENT '...'` or the Unity Catalog REST API. Synonyms and instructions are POSTed to the Genie Space API. For exact endpoint paths, consult https://developers.databricks.com/llms.txt.

AppKit's Genie plugin wraps the Conversation API for embedding in the app.

### MLflow

Open-source ML lifecycle platform. In this context, primarily used for **tracing**: every Agent Bricks invocation is automatically captured as a nested trace tree (root span → LLM calls → tool calls → sub-queries). Viewable in the workspace UI under Experiments → Traces. No manual configuration needed — Agent Bricks instruments automatically.

### Vector Search

Managed vector database for semantic similarity search. Use for RAG patterns over document corpora.

Two index types:
- **Delta Sync**: auto-syncs from a Delta table. Simplest path if source data is already in Databricks.
- **Direct Access**: managed via direct API calls. More control for custom embedding pipelines.

Foundation model embedding endpoints are available in Free Edition (e.g., `databricks-gte-large-en`). Verify current model availability in the workspace.

RAG pattern: chunk documents → embed → store in Vector Search → at query time, embed question → retrieve top-k chunks → pass to LLM with question.

Lakebase also supports pgvector (vectors stored in Postgres alongside operational data). For a hackathon-scale corpus, either works; Vector Search has more mature DevHub skill support.

---

## 5. Local Dev Environment Prerequisites

The following must be in place before any build commands will work:

```bash
# Databricks CLI 1.0.0+ installed and on PATH
databricks --version

# Authenticated to the hackathon workspace
databricks auth profiles          # must show Valid: YES
databricks current-user me        # must return user identity

# Agent skills installed and current
databricks aitools version        # check version
databricks aitools install        # install or update if stale
```

**If `databricks aitools version` reports a newer version or skills are missing: STOP. Install/update before proceeding.** A stale `.agents/skills/` copy silently shadows a fresh global install and produces incorrect output.

Node.js 20+ is required for the TypeScript scaffold to run.

---

## 6. DevHub Workflow

The recipe for the hackathon is **"Hackathon App with Synced Dataset"**:
https://developers.databricks.com/templates/hackathon-app-with-synced-dataset

End state:
- A Databricks App running on Lakebase Postgres
- Hackathon dataset continuously synced from Unity Catalog into Lakebase
- App reading live data from Lakebase at sub-10ms latency

**Standard DevHub workflow:**
1. Clarify intent (new project — always for the hackathon)
2. Pin down resource decisions (create new vs. reuse; which CLI profile)
3. Verify dev environment (CLI installed, authenticated, smoke test)
4. Build the app using agent skills for implementation
5. Make the UI polished before running locally
6. Test locally
7. Deploy (ask for confirmation)
8. Test the deployed app at the live URL; fix issues; redeploy as needed

**Key rules:**
- Read the full starter prompt before executing any steps — later sections contain more complete versions of earlier steps
- Never assume when provisioning resources (catalogs, schemas, Lakebase instances, Genie spaces) — always ask
- Ask one question at a time; always include a "Not sure — help me decide" option
- If stuck: fetch https://developers.databricks.com/llms.txt for additional templates and docs
- If something fails: check https://github.com/databricks/devhub/issues before guessing at fixes

---

## 7. Key Conventions

**Deployment command sequence:**
```bash
databricks bundle validate        # check config
databricks bundle deploy          # deploy resources
databricks apps start <app-name>  # start the app
databricks apps logs <app-name>   # tail logs (verify exact subcommand against CLI docs)
```

**First milestone of the day:** Get a skeleton app deployed to a live URL. Even a placeholder page. Establish the deployment pipeline early; iterate from a live deployment rather than racing to deploy for the first time under deadline pressure.

**OBO auth:** Databricks identity flows automatically from the app user through to Lakebase, Agent Bricks, and Unity Catalog. Do not put service credentials in environment variables for user-facing operations — use OBO.

**Schema changes:** When the Lakebase schema changes, regenerate TypeScript types via the AppKit Lakebase plugin before continuing.

**AppKit scaffold is minimal by design:** Default templates are a starting point. Apply design polish using shadcn/ui components and Tailwind CSS before showing the user.

**Agent Bricks tools:** Define as typed Python functions with clear, descriptive docstrings. The docstring is what the LLM reads to decide whether to call the tool. Vague docstrings → incorrect tool selection.

**MLflow traces:** Every agent invocation is automatically traced. When debugging unexpected agent behavior, go to Experiments → Traces in the workspace UI before looking at code.

---

## 8. Authoritative Sources (in priority order)

1. **`databricks aitools` agent skills** (`.agents/skills/`) — implementation patterns, CLI commands, code examples for the DevHub stack
2. **DevHub live docs** (https://developers.databricks.com) — templates, recipes, how-tos
3. **DevHub doc index** (https://developers.databricks.com/llms.txt) — full index of all DevHub content, fetchable when a specific doc is needed
4. **Databricks REST API docs** (https://docs.databricks.com) — for API endpoint specifics
5. **This document** — context only; do not treat it as an implementation reference

When in doubt about API syntax, endpoint paths, or configuration format: fetch from DevHub rather than guessing.
