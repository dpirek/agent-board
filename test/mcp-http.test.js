'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');
const { JsonStore } = require('../lib/store');
const { BoardService } = require('../lib/service');
const { PROTOCOL_VERSION } = require('../lib/mcp');
const { startMcpHttpServer } = require('../lib/mcp-http');

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-http-'));
  const service = new BoardService(new JsonStore(path.join(directory, 'data.json')));
  const started = await startMcpHttpServer(service, { port: 0, ...options });
  t.after(async () => {
    await new Promise((resolve) => started.server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return started.url;
}

function post(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test('Streamable HTTP initializes and handles tool calls', async (t) => {
  const url = await fixture(t);
  const initializedResponse = await post(url, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } }
  });
  assert.equal(initializedResponse.status, 200);
  assert.match(initializedResponse.headers.get('content-type'), /^application\/json/);
  const initialized = await initializedResponse.json();
  assert.equal(initialized.result.protocolVersion, PROTOCOL_VERSION);

  const listedResponse = await post(url, {
    jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}
  }, { 'MCP-Protocol-Version': PROTOCOL_VERSION });
  assert.equal(listedResponse.status, 200);
  const listed = await listedResponse.json();
  assert.ok(listed.result.tools.some((tool) => tool.name === 'create_record'));

  const createdResponse = await post(url, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'create_record', arguments: { entity: 'organizations', values: { name: 'Acme HTTP' } } }
  }, { 'MCP-Protocol-Version': PROTOCOL_VERSION });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.equal(created.result.structuredContent.name, 'Acme HTTP');
});

test('Streamable HTTP accepts notifications and declines standalone SSE', async (t) => {
  const url = await fixture(t);
  const notification = await post(url, {
    jsonrpc: '2.0', method: 'notifications/initialized'
  });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');

  const getResponse = await fetch(url, { headers: { Accept: 'text/event-stream' } });
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get('allow'), 'POST');
});

test('Streamable HTTP validates origin, authentication, and protocol headers', async (t) => {
  const url = await fixture(t, { token: 'secret' });
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };

  const unauthorized = await post(url, ping);
  assert.equal(unauthorized.status, 401);

  const forbidden = await post(url, ping, {
    Authorization: 'Bearer secret',
    Origin: 'https://attacker.example'
  });
  assert.equal(forbidden.status, 403);

  const unsupported = await post(url, ping, {
    Authorization: 'Bearer secret',
    'MCP-Protocol-Version': '2099-01-01'
  });
  assert.equal(unsupported.status, 400);

  const accepted = await post(url, ping, { Authorization: 'Bearer secret' });
  assert.equal(accepted.status, 200);
  assert.deepEqual((await accepted.json()).result, {});
});
