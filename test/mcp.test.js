'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');
const { JsonStore } = require('../lib/store');
const { BoardService } = require('../lib/service');
const { PROTOCOL_VERSION, handleMessage } = require('../lib/mcp');

test('handles MCP initialization and tool calls', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-mcp-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = new BoardService(new JsonStore(path.join(directory, 'data.json')));

  const initialized = await handleMessage(service, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } }
  });
  assert.equal(initialized.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(initialized.capabilities, { tools: { listChanged: false } });

  const listed = await handleMessage(service, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.ok(listed.tools.some((tool) => tool.name === 'create_record'));

  const created = await handleMessage(service, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'create_record', arguments: { entity: 'organizations', values: { name: 'Acme' } } }
  });
  assert.equal(created.structuredContent.name, 'Acme');
  assert.equal(created.isError, undefined);
});

test('returns domain failures as MCP tool errors', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-mcp-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = new BoardService(new JsonStore(path.join(directory, 'data.json')));
  const response = await handleMessage(service, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'get_record', arguments: { entity: 'organizations', id: crypto.randomUUID() } }
  });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /was not found/);
});
