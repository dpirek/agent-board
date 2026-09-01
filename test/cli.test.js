'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');

const cli = path.resolve(__dirname, '..', 'bin', 'agent-board.js');

test('CLI persists records to the selected data file', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-cli-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, 'data.json');

  const created = JSON.parse(childProcess.execFileSync(process.execPath, [
    cli, '--data', dataFile, 'create', 'organizations', '--name', 'Acme'
  ], { encoding: 'utf8' }));
  const listed = JSON.parse(childProcess.execFileSync(process.execPath, [
    cli, 'list', 'organizations', '--data', dataFile
  ], { encoding: 'utf8' }));

  assert.equal(created.name, 'Acme');
  assert.deepEqual(listed, [created]);
});

test('stdio entrypoint emits only newline-delimited MCP messages', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-stdio-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
  ].map(JSON.stringify).join('\n') + '\n';

  const output = childProcess.execFileSync(process.execPath, [
    cli, 'mcp', '--data', path.join(directory, 'data.json')
  ], { input, encoding: 'utf8' });
  const messages = output.trim().split('\n').map(JSON.parse);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].result.protocolVersion, '2025-06-18');
  assert.ok(messages[1].result.tools.some((tool) => tool.name === 'list_records'));
});
