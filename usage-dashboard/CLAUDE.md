# AI Assistant Instructions

## Project Overview

India Community Health Access dashboard (DAIS 2026 Hackathon). Reads intake session data from Lakebase Postgres (`intake_app.intake_bundles`) and NFHS-5 health indicators from a Unity Catalog SQL warehouse.

**Live app:** https://usage-dashboard-7474644358787296.aws.databricksapps.com

## Key Architecture

- **Analytics queries** (NFHS-5 warehouse data): SQL files in `config/queries/`, consumed via `useAnalyticsQuery` hook. Run `npm run typegen` after changing SQL files.
- **Intake/session data** (Lakebase): Express routes in `server/routes/lakebase/intake-routes.ts`, called from `client/src/lib/intakeApi.ts`.
- **State name normalization**: `client/src/lib/stateNormalization.ts` maps between NFHS-5 canonical names, datamaps legacy names, and GeoJSON property names.
- **GeoJSON**: India states bundled at `client/src/assets/india-states.json` — property key is `name`.

## Critical Gotchas

**Warehouse returns numeric columns as strings.** `ROUND(AVG(...))` comes back as a JS string even though AppKit-generated types say `number`. Always coerce: `Number(r[field]) || 0`. Never use `?? 0` — string `+` string `/ n = NaN`.

**`keyof RowType` for dynamic field access.** Use `type Row = typeof rows[number]` and type field accessors as `(field: keyof Row)` — not `string` — to get compile-time safety on column names.

**`isNaN()` guard in display components.** Warehouse can return `""` or `"NaN"` strings. `value === null` won't catch these. Coerce with `Number()` then check `isNaN()` before rendering.

**`<SelectItem value="">` crashes.** Radix Select rejects empty string. Use a sentinel like `'__all__'` and map to `''` when building query params.

## Deploy Sequence

```bash
npm run build
databricks workspace import-dir dist /Workspace/Users/<user>/.bundle/usage-dashboard/default/files --profile <PROFILE> --overwrite
databricks apps deploy usage-dashboard --source-code-path /Workspace/Users/<user>/.bundle/usage-dashboard/default/files --profile <PROFILE>
```

Do NOT use `databricks bundle deploy` alone — it uploads but doesn't restart the app.

## AppKit Docs

- Backend SDK: `./node_modules/@databricks/appkit/CLAUDE.md`
- UI/hooks: `./node_modules/@databricks/appkit-ui/CLAUDE.md`
