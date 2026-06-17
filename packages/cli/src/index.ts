#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOpgClient, type OpgClient } from 'opg-sdk';

type CliConfig = {
  baseUrl: string;
  app: string;
  apiKey?: string;
};

const args = process.argv.slice(2);
const command = args[0] || 'help';

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});

async function main() {
  if (command === 'init') {
    await initProject(parseFlags(args.slice(1)));
    return;
  }
  if (command === 'manifest') {
    console.log(JSON.stringify(await getClientFromFlags(args.slice(1)).sdk.manifest(), null, 2));
    return;
  }
  if (command === 'smoke') {
    console.log(JSON.stringify(await getClientFromFlags(args.slice(1)).sdk.smokeTest(), null, 2));
    return;
  }
  if (command === 'db' || command === 'database') {
    await runDatabaseCommand(args.slice(1));
    return;
  }
  if (command === 'codex' && args[1] === 'install') {
    await installCodex(parseFlags(args.slice(2)));
    return;
  }
  if (command === 'mcp') {
    await startMcpServer();
    return;
  }
  printHelp();
}

async function initProject(flags: Record<string, string>) {
  const config = readConfigFromFlags(flags);
  await mkdir('.opg', { recursive: true });
  await writeFile(
    '.opg/opg.config.json',
    `${JSON.stringify({ baseUrl: config.baseUrl, app: config.app, profile: flags.profile || 'default' }, null, 2)}\n`,
  );

  if (!existsSync('.env.local')) {
    await writeFile(
      '.env.local',
      [
        `OPG_BASE_URL=${config.baseUrl}`,
        `OPG_APP_SLUG=${config.app}`,
        `OPG_API_KEY=${config.apiKey || 'rbx_replace_me'}`,
        '',
      ].join('\n'),
    );
  }

  if (flags['skip-manifest'] !== 'true' && flags['skip-manifest'] !== '1') {
    const client = createOpgClient(config);
    try {
      const manifest = await client.sdk.manifest();
      await writeFile('.opg/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (error) {
      console.warn(`Warning: could not fetch SDK manifest yet (${formatError(error)}). Run "opg manifest" after the gateway is reachable.`);
    }
  }
  await writeFile('.opg/client-example.ts', buildClientExample(config.app));

  console.log(`OPG project profile written for app ${config.app}.`);
  console.log('Next: npm install opg-sdk');
}

async function installCodex(flags: Record<string, string>) {
  const config = readConfigFromFlags(flags);
  await mkdir('.opg', { recursive: true });
  const mcpConfig = {
    mcpServers: {
      opg: {
        command: 'npx',
        args: ['-y', 'opg-dev-cli', 'mcp'],
        env: {
          OPG_BASE_URL: config.baseUrl,
          OPG_APP_SLUG: config.app,
          OPG_API_KEY: '${OPG_API_KEY}',
        },
      },
    },
  };
  await writeFile('.opg/codex-mcp.json', `${JSON.stringify(mcpConfig, null, 2)}\n`);
  console.log('Codex MCP config written to .opg/codex-mcp.json.');
  console.log('Keep OPG_API_KEY in your shell or project secret store; do not commit real keys.');
}

async function runDatabaseCommand(commandArgs: string[]) {
  const subcommand = commandArgs[0] || 'manifest';
  const rest = commandArgs.slice(1);
  const flags = parseFlags(rest);
  const client = await getClientFromLocalConfigWithFlagOverrides(flags);

  if (subcommand === 'manifest') {
    printJson(await client.database.manifest());
    return;
  }
  if (subcommand === 'tables') {
    printJson(await client.database.tables());
    return;
  }
  if (subcommand === 'smoke') {
    const manifest = await client.database.manifest();
    const namespace = String((manifest as any)?.namespace || '');
    const table = `${namespace}opg_sdk_smoke_${Date.now()}`;
    const tables = await client.database.tables();
    const dryRun = await client.database.execute({
      sql: `CREATE TABLE ${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now())`,
      dryRun: true,
    });
    printJson({
      ok: true,
      manifest,
      tables,
      dry_run: dryRun,
      message: 'Database workspace is reachable. Dry-run DDL was validated and rolled back by the gateway.',
    });
    return;
  }
  if (subcommand === 'describe') {
    const table = flags.table || rest.find((item) => !item.startsWith('--')) || '';
    if (!table) {
      throw new Error('Missing table name. Use: opg db describe <table>');
    }
    printJson(await client.database.describe(table));
    return;
  }
  if (subcommand === 'query') {
    const sql = flags.sql || '';
    if (!sql) {
      throw new Error('Missing SQL. Use: opg db query --sql "SELECT * FROM app_demo__customers"');
    }
    printJson(await client.database.query({
      sql,
      params: flags.params ? JSON.parse(flags.params) : undefined,
      limit: flags.limit ? Number(flags.limit) : undefined,
    }));
    return;
  }
  if (subcommand === 'execute') {
    const sql = flags.sql || '';
    if (!sql) {
      throw new Error('Missing SQL. Use: opg db execute --sql "CREATE TABLE ..."');
    }
    printJson(await client.database.execute({
      sql,
      params: flags.params ? JSON.parse(flags.params) : undefined,
      dryRun: flags['dry-run'] === undefined ? undefined : parseBooleanFlag(flags['dry-run']),
      confirm: flags.confirm,
    }));
    return;
  }

  throw new Error(`Unknown database command: ${subcommand}`);
}

async function startMcpServer() {
  const client = await getClientFromConfig();
  const server = new McpServer({
    name: 'opg-mcp-server',
    version: '0.1.0',
  });
  const registerTool = (name: string, config: Record<string, unknown>, handler: (input: any) => Promise<any>) => {
    (server as any).registerTool(name, config, handler);
  };

  registerTool(
    'opg_manifest_get',
    {
      title: 'Get OPG SDK Manifest',
      description: 'Read the current app SDK manifest, routes, capabilities, install commands, and auth contract.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => toToolResult(await client.sdk.manifest()),
  );

  registerTool(
    'opg_sdk_smoke_test',
    {
      title: 'Run OPG SDK Smoke Test',
      description: 'Validate that the configured OPG app and API key can access the SDK contract. This does not spend model tokens.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => toToolResult(await client.sdk.smokeTest()),
  );

  registerTool(
    'opg_agents_list',
    {
      title: 'List OPG Agents',
      description: 'List published AI agents bound to the configured OPG app.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => toToolResult(await client.agents.list()),
  );

  registerTool(
    'opg_agents_run',
    {
      title: 'Run OPG Agent',
      description: 'Run a published OPG app agent by slug with JSON input.',
      inputSchema: {
        slug: z.string().min(1).describe('Published agent route slug.'),
        input: z.record(z.unknown()).default({}).describe('Agent input payload.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ slug, input }: any) => toToolResult(await client.agents.run(slug, input)),
  );

  registerTool(
    'opg_ai_models_list',
    {
      title: 'List OPG AI Models',
      description: 'List OpenAI-compatible models available through the configured OPG app.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => toToolResult(await client.ai.models()),
  );

  registerTool(
    'opg_ai_chat_completions',
    {
      title: 'Create OPG Chat Completion',
      description: 'Call the OPG OpenAI-compatible chat/completions route. This may spend model tokens and app points.',
      inputSchema: {
        model: z.string().min(1).describe('OPG model key or upstream-compatible model name.'),
        messages: z.array(z.record(z.unknown())).min(1).describe('OpenAI-compatible chat messages.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => toToolResult(await client.ai.chat(input)),
  );

  registerTool(
    'opg_video_submit',
    {
      title: 'Submit OPG Video Task',
      description: 'Submit an async video generation payload through OPG. This may spend provider credits and app points.',
      inputSchema: {
        payload: z.record(z.unknown()).describe('Video generation payload for /videos/generations/async.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ payload }: any) => toToolResult(await client.video.generateAsync(payload)),
  );

  registerTool(
    'opg_video_query',
    {
      title: 'Query OPG Video Task',
      description: 'Query an async video generation task by passing the provider or OPG task payload.',
      inputSchema: {
        payload: z.record(z.unknown()).describe('Task query payload for /videos/generations/tasks/query.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ payload }: any) => toToolResult(await client.video.queryTask(payload)),
  );

  registerTool(
    'opg_usage_recent',
    {
      title: 'List Recent OPG AI Usage',
      description: 'List recent AI usage logs for the configured user/app.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ limit, page }: any) => toToolResult(await client.usage.aiLogs({ limit, page })),
  );

  registerTool(
    'opg_database_manifest_get',
    {
      title: 'Get OPG Database Manifest',
      description: 'Read the app-scoped database namespace, safety contract, limits, and apply confirmation token.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toToolResult(await client.database.manifest()),
  );

  registerTool(
    'opg_database_tables_list',
    {
      title: 'List OPG Database Tables',
      description: 'List database tables owned by the configured OPG app namespace.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toToolResult(await client.database.tables()),
  );

  registerTool(
    'opg_database_table_describe',
    {
      title: 'Describe OPG Database Table',
      description: 'Describe columns and indexes for one app-owned database table.',
      inputSchema: {
        table: z.string().min(1).describe('App-owned table name, for example app_demo__customers.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ table }: any) => toToolResult(await client.database.describe(table)),
  );

  registerTool(
    'opg_database_query',
    {
      title: 'Query OPG Database',
      description: 'Run read-only SQL against app-owned database tables. SQL must only reference the app namespace returned by opg_database_manifest_get.',
      inputSchema: {
        sql: z.string().min(1).describe('SELECT or WITH SQL.'),
        params: z.array(z.unknown()).optional().describe('Positional SQL parameters for $1, $2, ... placeholders.'),
        limit: z.number().int().min(1).max(500).default(100).describe('Maximum rows returned.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input: any) => toToolResult(await client.database.query(input)),
  );

  registerTool(
    'opg_database_execute',
    {
      title: 'Execute OPG Database SQL',
      description: 'Dry-run or apply DDL/DML inside the app database namespace. Defaults to dry-run. To apply, pass dryRun=false and confirm=apply:<app-slug> from the database manifest.',
      inputSchema: {
        sql: z.string().min(1).describe('CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/COMMENT SQL limited to app-owned tables.'),
        params: z.array(z.unknown()).optional().describe('Positional SQL parameters for a single statement.'),
        dryRun: z.boolean().default(true).describe('Keep true to validate inside a rolled-back transaction.'),
        confirm: z.string().optional().describe('Required as apply:<app-slug> when dryRun is false.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (input: any) => toToolResult(await client.database.execute(input)),
  );

  registerTool(
    'opg_generate_client_code',
    {
      title: 'Generate OPG Client Code',
      description: 'Generate a concise TypeScript snippet for using opg-sdk in the current app.',
      inputSchema: {
        target: z.enum(['node', 'react', 'codex']).default('node'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ target }: any) => toToolResult(await client.sdk.examples(target)),
  );

  await server.connect(new StdioServerTransport());
}

function toToolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

async function getClientFromConfig() {
  const config = await readLocalConfig();
  return createOpgClient(config);
}

function getClientFromFlags(commandArgs: string[]) {
  return createOpgClient(readConfigFromFlags(parseFlags(commandArgs)));
}

async function getClientFromLocalConfigWithFlagOverrides(flags: Record<string, string>) {
  const local = await readOptionalLocalConfig();
  return createOpgClient({
    baseUrl: flags.baseUrl || flags['base-url'] || local.baseUrl,
    app: flags.app || local.app,
    apiKey: flags.apiKey || flags['api-key'] || local.apiKey,
  });
}

async function readLocalConfig(): Promise<CliConfig> {
  return readConfigFromFlags(await readOptionalLocalConfig());
}

async function readOptionalLocalConfig(): Promise<Record<string, string>> {
  let local: Partial<CliConfig> = {};
  try {
    local = JSON.parse(await readFile(path.resolve('.opg/opg.config.json'), 'utf8')) as Partial<CliConfig>;
  } catch {
    local = {};
  }
  const envFile = await readDotEnvLocal();
  return {
    baseUrl: process.env.OPG_BASE_URL || envFile.OPG_BASE_URL || local.baseUrl || '',
    app: process.env.OPG_APP_SLUG || envFile.OPG_APP_SLUG || local.app || '',
    apiKey: process.env.OPG_API_KEY || envFile.OPG_API_KEY || local.apiKey || '',
  };
}

async function readDotEnvLocal(): Promise<Record<string, string>> {
  try {
    const content = await readFile(path.resolve('.env.local'), 'utf8');
    const values: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

function readConfigFromFlags(flags: Record<string, string>): CliConfig {
  const baseUrl = flags.baseUrl || flags['base-url'] || process.env.OPG_BASE_URL || '';
  const app = flags.app || process.env.OPG_APP_SLUG || '';
  const apiKey = flags.apiKey || flags['api-key'] || process.env.OPG_API_KEY || '';
  if (!baseUrl) {
    throw new Error('Missing OPG base URL. Pass --base-url or set OPG_BASE_URL.');
  }
  if (!app) {
    throw new Error('Missing OPG app slug. Pass --app or set OPG_APP_SLUG.');
  }
  return { baseUrl, app, apiKey };
}

function parseFlags(commandArgs: string[]) {
  const flags: Record<string, string> = {};
  for (let index = 0; index < commandArgs.length; index += 1) {
    const current = commandArgs[index];
    if (!current.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = current.slice(2).split('=', 2);
    flags[rawKey] = inlineValue ?? commandArgs[index + 1] ?? '';
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return flags;
}

function parseBooleanFlag(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(normalized);
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function buildClientExample(app: string) {
  return `import { createOpgClient } from 'opg-sdk';

const opg = createOpgClient({
  baseUrl: process.env.OPG_BASE_URL!,
  app: process.env.OPG_APP_SLUG || '${app}',
  apiKey: process.env.OPG_API_KEY!,
});

const models = await opg.ai.models();
console.log(models);
`;
}

function printHelp() {
  console.log(`OPG CLI

Commands:
  opg init --base-url <url> --app <slug> [--api-key <key>]
  opg init --base-url <url> --app <slug> --skip-manifest true
  opg manifest --base-url <url> --app <slug>
  opg smoke --base-url <url> --app <slug> --api-key <key>
  opg db smoke --base-url <url> --app <slug> --api-key <key>
  opg db manifest --base-url <url> --app <slug> --api-key <key>
  opg db tables --base-url <url> --app <slug> --api-key <key>
  opg db describe <table> --base-url <url> --app <slug> --api-key <key>
  opg db query --sql "SELECT * FROM app_demo__customers" --base-url <url> --app <slug> --api-key <key>
  opg db execute --sql "CREATE TABLE ..." --dry-run true --base-url <url> --app <slug> --api-key <key>
  opg codex install --base-url <url> --app <slug> [--api-key <key>]
  opg mcp
`);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
