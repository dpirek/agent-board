'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');
const { JsonStore } = require('../lib/store');
const { BoardService } = require('../lib/service');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new BoardService(new JsonStore(path.join(directory, 'data.json')));
}

test('creates, lists, updates, and deletes records', async (t) => {
  const service = await fixture(t);
  const organization = await service.create('organizations', { name: 'Acme' });
  assert.match(organization.id, /^[0-9a-f-]{36}$/);

  const project = await service.create('projects', {
    organization_id: organization.id,
    key: 'WEB',
    name: 'Website'
  });
  assert.deepEqual(await service.list('projects', { organization_id: organization.id }), [project]);

  const updated = await service.update('projects', project.id, { description: 'Public site' });
  assert.equal(updated.description, 'Public site');
  assert.deepEqual(await service.delete('projects', project.id), updated);
});

test('enforces foreign keys, unique constraints, and restricted deletes', async (t) => {
  const service = await fixture(t);
  await assert.rejects(
    service.create('projects', { organization_id: crypto.randomUUID(), key: 'WEB', name: 'Website' }),
    /references missing organizations/
  );

  const organization = await service.create('organizations', { name: 'Acme' });
  await service.create('projects', { organization_id: organization.id, key: 'WEB', name: 'Website' });
  await assert.rejects(
    service.create('projects', { organization_id: organization.id, key: 'WEB', name: 'Other' }),
    /must be unique/
  );
  await assert.rejects(service.delete('organizations', organization.id), /referenced by projects/);
});
