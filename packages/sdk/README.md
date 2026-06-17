# opg-sdk

TypeScript SDK for OPG backend services.

```ts
import { createOpgClient } from "opg-sdk";

const opg = createOpgClient({
  baseUrl: process.env.OPG_BASE_URL!,
  app: process.env.OPG_APP_SLUG!,
  apiKey: process.env.OPG_API_KEY!,
});

const models = await opg.ai.models();
```

## Configuration

- `OPG_BASE_URL`: Gateway base URL, for example `https://api.example.com`
- `OPG_APP_SLUG`: App slug owned by the current tenant
- `OPG_API_KEY`: App API key created in the OPG developer console

## Codex

Use `opg-dev-cli` to generate local config and install the Codex MCP bridge.

## Database Workspace

Database operations are routed through the OPG backend. The SDK never exposes
`DATABASE_URL`, and SQL is limited to the app-owned namespace returned by:

```ts
const db = await opg.database.manifest();
console.log(db.namespace);

await opg.database.execute({
  sql: `CREATE TABLE ${db.namespace}customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL)`,
  dryRun: true,
});
```
