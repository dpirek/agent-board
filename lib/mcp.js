'use strict';

const readline = require('node:readline');
const { entityNames } = require('./schema');

const PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
  '2024-11-05'
]);
const entityProperty = { type: 'string', enum: entityNames, description: 'Table/entity name from db/schema.sql' };

const tools = [
  {
    name: 'get_schema',
    title: 'Get board schema',
    description: 'Return the entities, fields, relationships, and constraints from db/schema.sql.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_records',
    title: 'List records',
    description: 'List records from a schema entity, optionally filtered by exact field values.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: entityProperty,
        filters: { type: 'object', description: 'Exact field/value matches', additionalProperties: true },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      },
      required: ['entity'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'get_record',
    title: 'Get record',
    description: 'Get one record by entity and UUID.',
    inputSchema: {
      type: 'object',
      properties: { entity: entityProperty, id: { type: 'string', format: 'uuid' } },
      required: ['entity', 'id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'create_record',
    title: 'Create record',
    description: 'Create a record. UUID and created_at are generated when applicable.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: entityProperty,
        values: { type: 'object', description: 'Column values for the new record', additionalProperties: true }
      },
      required: ['entity', 'values'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'update_record',
    title: 'Update record',
    description: 'Update writable fields on a record by entity and UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: entityProperty,
        id: { type: 'string', format: 'uuid' },
        values: { type: 'object', description: 'Writable fields to replace', additionalProperties: true }
      },
      required: ['entity', 'id', 'values'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'delete_record',
    title: 'Delete record',
    description: 'Delete a record unless another record references it.',
    inputSchema: {
      type: 'object',
      properties: { entity: entityProperty, id: { type: 'string', format: 'uuid' } },
      required: ['entity', 'id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true }
  }
];

function result(value) {
  const structuredContent = Array.isArray(value) ? { records: value } : value;
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

async function callTool(service, name, args) {
  switch (name) {
    case 'get_schema': return result(service.describeSchema());
    case 'list_records': return result(await service.list(args.entity, args.filters || {}, args.limit || 100));
    case 'get_record': return result(await service.get(args.entity, args.id));
    case 'create_record': return result(await service.create(args.entity, args.values));
    case 'update_record': return result(await service.update(args.entity, args.id, args.values));
    case 'delete_record': return result({ deleted: await service.delete(args.entity, args.id) });
    default: throw Object.assign(new Error(`Unknown tool '${name}'`), { code: -32602 });
  }
}

async function handleMessage(service, message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    throw Object.assign(new Error('Invalid JSON-RPC request'), { code: -32600 });
  }
  if (message.id === undefined) return null;
  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(message.params?.protocolVersion)
          ? message.params.protocolVersion
          : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'agent-board', title: 'Agent Board', version: '1.0.0' },
        instructions: 'Manage the entities defined in db/schema.sql. Create referenced organizations before dependent records.'
      };
    case 'ping': return {};
    case 'tools/list': return { tools };
    case 'tools/call': {
      const params = message.params || {};
      if (typeof params.name !== 'string') throw Object.assign(new Error('Tool name is required'), { code: -32602 });
      try {
        return await callTool(service, params.name, params.arguments || {});
      } catch (error) {
        if (error.code) throw error;
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
    default: throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 });
  }
}

function startMcpServer(service, input = process.stdin, output = process.stdout) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  lines.on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    try {
      const response = await handleMessage(service, message);
      if (response !== null) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: response })}\n`);
    } catch (error) {
      if (message.id !== undefined) {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: error.code || -32603, message: error.message } })}\n`);
      }
    }
  });
  return lines;
}

module.exports = { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, tools, callTool, handleMessage, startMcpServer };
