'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');

const cli = path.resolve(__dirname, '..', 'bin', 'agent-board.js');

test('CLI persists records to the selected SQLite database', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-cli-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const databaseFile = path.join(directory, 'board.sqlite');

  const created = JSON.parse(childProcess.execFileSync(process.execPath, [
    cli, '--db', databaseFile, 'create', 'organizations', '--name', 'Acme'
  ], { encoding: 'utf8' }));
  const listed = JSON.parse(childProcess.execFileSync(process.execPath, [
    cli, 'list', 'organizations', '--db', databaseFile
  ], { encoding: 'utf8' }));

  assert.equal(created.name, 'Acme');
  assert.deepEqual(listed, [created]);
});

test('CLI migrates the legacy default JSON store into SQLite once', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-migration-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dataDirectory = path.join(directory, '.agent-board');
  await fs.mkdir(dataDirectory);
  const organizationId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await fs.writeFile(path.join(dataDirectory, 'data.json'), JSON.stringify({
    organizations: [{ id: organizationId, name: 'Legacy Acme', created_at: '2026-01-01T00:00:00.000Z' }],
    users: [],
    projects: [{ id: projectId, organization_id: organizationId, key: 'OLD', name: 'Legacy project', created_at: '2026-01-01T00:00:00.000Z' }],
    issue_types: [],
    statuses: []
  }));

  const projects = JSON.parse(childProcess.execFileSync(process.execPath, [cli, 'list', 'projects'], {
    cwd: directory, encoding: 'utf8'
  }));
  assert.equal(projects[0].project_key, 'OLD');
  await fs.access(path.join(directory, 'db', 'agent-board.sqlite'));
  await fs.access(path.join(dataDirectory, 'data.json.migrated'));
  await assert.rejects(fs.access(path.join(dataDirectory, 'data.json')));
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
    cli, 'mcp', '--db', path.join(directory, 'board.sqlite')
  ], { input, encoding: 'utf8' });
  const messages = output.trim().split('\n').map(JSON.parse);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].result.protocolVersion, '2025-06-18');
  assert.ok(messages[1].result.tools.some((tool) => tool.name === 'list_records'));
});
