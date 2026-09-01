'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');
const { SqliteStore } = require('../lib/store');
const { BoardService } = require('../lib/service');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-'));
  const store = new SqliteStore(path.join(directory, 'board.sqlite'));
  t.after(async () => {
    store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return new BoardService(store);
}

test('creates, lists, updates, and deletes records', async (t) => {
  const service = await fixture(t);
  const organization = await service.create('organizations', { name: 'Acme' });
  assert.match(organization.id, /^[0-9a-f-]{36}$/);

  const project = await service.create('projects', {
    organization_id: organization.id,
    project_key: 'WEB',
    name: 'Website'
  });
  assert.deepEqual(await service.list('projects', { organization_id: organization.id }), [project]);

  const updated = await service.update('projects', project.id, { description: 'Public site' });
  assert.equal(updated.description, 'Public site');
  assert.deepEqual(await service.delete('projects', project.id), updated);
});

test('enforces foreign keys and unique constraints, and applies schema cascades', async (t) => {
  const service = await fixture(t);
  assert.throws(
    () => service.create('projects', { organization_id: crypto.randomUUID(), project_key: 'WEB', name: 'Website' }),
    /references missing organizations/
  );

  const organization = await service.create('organizations', { name: 'Acme' });
  await service.create('projects', { organization_id: organization.id, project_key: 'WEB', name: 'Website' });
  assert.throws(
    () => service.create('projects', { organization_id: organization.id, project_key: 'WEB', name: 'Other' }),
    /Unique constraint failed/
  );
  await service.delete('organizations', organization.id);
  assert.deepEqual(await service.list('projects'), []);
});

test('provides Jira-like project, issue, workflow, comment, and sprint operations', async (t) => {
  const service = await fixture(t);
  const workspace = await service.setupWorkspace({ organization_name: 'Acme', admin_email: 'admin@acme.test' });
  await service.setupWorkspace({ organization_id: workspace.organization.id, admin_email: 'admin@acme.test' });
  assert.equal((await service.list('statuses', { organization_id: workspace.organization.id })).length, 3);
  const { project, board } = await service.createProject({
    organization_id: workspace.organization.id, project_key: 'WEB', name: 'Website', board_type: 'scrum'
  });
  const issue = await service.createIssue({ project: project.id, title: 'Ship homepage', labels: ['release'] });
  assert.equal(issue.issue_key, 'WEB-1');
  assert.equal(issue.status_name, 'To Do');

  const transitioned = await service.transitionIssue('WEB-1', { status: 'In Progress', actor_id: workspace.user.id });
  assert.equal(transitioned.status_name, 'In Progress');
  await service.addComment('WEB-1', { author_id: workspace.user.id, body: 'Started.' });

  const sprint = await service.createSprint({ board_id: board.id, name: 'Sprint 1' });
  await service.addIssuesToSprint(sprint.id, ['WEB-1']);
  assert.equal((await service.updateSprintStatus(sprint.id, 'start')).status, 'active');
  assert.equal((await service.searchIssues({ project: 'WEB', sprint_id: sprint.id, label: 'release' })).length, 1);
  assert.equal((await service.getIssue('WEB-1')).comments[0].body, 'Started.');
  assert.equal((await service.getBoard(board.id)).columns.length, 3);
});

test('introspects every table from db/schema.sql', async (t) => {
  const service = await fixture(t);
  const entities = service.describeSchema().entities;
  assert.equal(Object.keys(entities).length, 35);
  assert.equal(entities.issues.fields.project_id.references, 'projects');
  assert.equal(entities.agent_runs.fields.input.type, 'json');
});
