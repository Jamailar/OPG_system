# opg-dev-cli

CLI and Codex MCP bridge for OPG backend services.

```bash
npm install -g opg-dev-cli
opg init --base-url https://api.example.com --app my-app
opg smoke
opg db smoke
opg db manifest
opg db query --sql "SELECT * FROM app_my_app__customers"
opg codex install
```

## Environment

The CLI reads `.env.local` and `.opg/opg.config.json`.

- `OPG_BASE_URL`: Gateway base URL
- `OPG_APP_SLUG`: App slug owned by the current tenant
- `OPG_API_KEY`: App API key created in the OPG developer console

`opg codex install` writes a Codex MCP config template that references `${OPG_API_KEY}` instead of writing the secret value.

## Codex Database Tools

The MCP server exposes app-scoped database tools:

- `opg_database_manifest_get`
- `opg_database_tables_list`
- `opg_database_table_describe`
- `opg_database_query`
- `opg_database_execute`

Database SQL is limited to app-owned tables such as `app_my_app__customers`.
`opg_database_execute` defaults to dry-run. Applying changes requires
`confirm=apply:<app-slug>`.

The same database operations are also available from the terminal:

```bash
opg db manifest
opg db smoke
opg db tables
opg db describe app_my_app__customers
opg db query --sql "SELECT * FROM app_my_app__customers"
opg db execute --sql "CREATE TABLE app_my_app__customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid())" --dry-run true
```
