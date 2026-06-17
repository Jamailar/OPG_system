#!/usr/bin/env node
import { createOpgClient } from 'opg-sdk';

const flags = parseFlags(process.argv.slice(2));
const baseUrl = flags.baseUrl || flags['base-url'] || process.env.OPG_BASE_URL || '';
const app = flags.app || process.env.OPG_APP_SLUG || '';
const apiKey = flags.apiKey || flags['api-key'] || process.env.OPG_API_KEY || '';

if (!baseUrl || !app || !apiKey) {
  console.error([
    'Missing OPG database SDK smoke-test config.',
    'Set OPG_BASE_URL, OPG_APP_SLUG, and OPG_API_KEY, or pass --base-url --app --api-key.',
    'Example:',
    '  OPG_BASE_URL=https://api.example.com OPG_APP_SLUG=demo OPG_API_KEY=rbx_xxx npm run sdk:db:smoke',
  ].join('\n'));
  process.exit(2);
}

const client = createOpgClient({ baseUrl, app, apiKey });
const startedAt = Date.now();

try {
  const manifest = await client.database.manifest();
  const namespace = String(manifest.namespace || '');
  if (!namespace) {
    throw new Error('Database manifest did not return namespace');
  }

  const tables = await client.database.tables();
  const smokeTable = `${namespace}opg_sdk_verify_${Date.now()}`;
  const dryRun = await client.database.execute({
    sql: `CREATE TABLE ${smokeTable} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now())`,
    dryRun: true,
  });

  console.log(JSON.stringify({
    ok: true,
    app,
    namespace,
    table_count: Array.isArray(tables.items) ? tables.items.length : null,
    dry_run_applied: dryRun.applied === true,
    dry_run_ok: dryRun.ok === true && dryRun.dry_run === true,
    execution_ms: Date.now() - startedAt,
    next: {
      cli: 'opg db smoke',
      query_example: `opg db query --sql "SELECT * FROM ${namespace}customers"`,
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    app,
    error: formatError(error),
    execution_ms: Date.now() - startedAt,
  }, null, 2));
  process.exit(1);
}

function parseFlags(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith('--')) {
      continue;
    }
    const [key, inlineValue] = current.slice(2).split('=', 2);
    result[key] = inlineValue ?? args[index + 1] ?? '';
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return result;
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
