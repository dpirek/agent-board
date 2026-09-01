'use strict';

const path = require('node:path');
const { JsonStore } = require('./store');
const { BoardService } = require('./service');
const { startMcpServer } = require('./mcp');

const HELP = `agent-board - dependency-free board CLI and MCP server

Usage:
  agent-board [--data <file>] schema
  agent-board [--data <file>] list <entity> [--limit <n>] [--field <value> ...]
  agent-board [--data <file>] get <entity> <uuid>
  agent-board [--data <file>] create <entity> --field <value> ...
  agent-board [--data <file>] update <entity> <uuid> --field <value> ...
  agent-board [--data <file>] delete <entity> <uuid>
  agent-board [--data <file>] mcp

Entities: organizations, users, projects, issue_types, statuses

Values accept strings, null, true, false, or JSON prefixed with json:.
The data file defaults to .agent-board/data.json and can also be set with
AGENT_BOARD_DATA. MCP mode speaks newline-delimited JSON-RPC over stdio.`;

function parseValue(value) {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('json:')) return JSON.parse(value.slice(5));
  return value;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2).replaceAll('-', '_');
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Option '${token}' requires a value`);
    options[name] = parseValue(value);
    index += 1;
  }
  return { positional, options };
}

function printJson(value, output) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runCli(argv, io = {}) {
  const output = io.stdout || process.stdout;
  const input = io.stdin || process.stdin;
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    output.write(`${HELP}\n`);
    return;
  }
  const { positional, options } = parseArgs(argv);
  const dataFile = options.data || process.env.AGENT_BOARD_DATA || path.join(process.cwd(), '.agent-board', 'data.json');
  delete options.data;
  const service = new BoardService(new JsonStore(dataFile));
  const [command, entity, id] = positional;

  switch (command) {
    case 'mcp':
      if (positional.length !== 1 || Object.keys(options).length) throw new Error('mcp accepts only the global --data option');
      startMcpServer(service, input, output);
      break;
    case 'schema':
      printJson(service.describeSchema(), output);
      break;
    case 'list': {
      if (!entity) throw new Error('list requires an entity');
      const limit = options.limit || 100;
      delete options.limit;
      printJson(await service.list(entity, options, limit), output);
      break;
    }
    case 'get':
      if (!entity || !id) throw new Error('get requires an entity and UUID');
      printJson(await service.get(entity, id), output);
      break;
    case 'create':
      if (!entity) throw new Error('create requires an entity');
      printJson(await service.create(entity, options), output);
      break;
    case 'update':
      if (!entity || !id) throw new Error('update requires an entity and UUID');
      printJson(await service.update(entity, id, options), output);
      break;
    case 'delete':
      if (!entity || !id) throw new Error('delete requires an entity and UUID');
      printJson({ deleted: await service.delete(entity, id) }, output);
      break;
    default:
      throw new Error(`Unknown command '${command}'. Run agent-board --help for usage.`);
  }
}

module.exports = { HELP, parseArgs, parseValue, runCli };
