'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWebServer } = require('../server');

test('web UI serves SPA routes and exposes every MCP operation over JSON', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-web-'));
  const databaseFile = path.join(directory, 'board.sqlite');
  const { server } = createWebServer({ databaseFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function get(pathname) {
    const response = await fetch(`${origin}${pathname}`);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('json') ? await response.json() : await response.text();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }

  async function tool(name, args = {}) {
    const response = await fetch(`${origin}/api/tools/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args)
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }

  assert.match(await get('/'), /Agent Board/);
  assert.match(await get('/projects/WEB/board'), /Agent Board/);
  assert.equal((await get('/api/health')).ok, true);
  const availableTools = await get('/api/tools');
  assert.equal(availableTools.tools.length, 19);

  const workspace = await tool('setup_workspace', {
    organization_name: 'Web Test', admin_name: 'Admin', admin_email: 'admin@web.test'
  });
  const created = await tool('create_project', {
    organization_id: workspace.organization.id,
    project_key: 'WEB',
    name: 'Website',
    board_type: 'scrum'
  });
  const issue = await tool('create_issue', {
    project: created.project.id,
    title: 'Ship the web UI',
    labels: ['frontend']
  });
  assert.equal(issue.issue_key, 'WEB-1');
  assert.equal((await tool('get_issue', { issue: issue.id })).title, 'Ship the web UI');
  assert.equal((await tool('search_issues', { project: created.project.id, text: 'web' })).records.length, 1);

  await tool('update_issue', { issue: issue.id, values: { story_points: 5 } });
  await tool('transition_issue', { issue: issue.id, status: 'In Progress' });
  await tool('add_comment', { issue: issue.id, body: 'Started.', author_id: workspace.user.id });
  const sprint = await tool('create_sprint', { board_id: created.board.id, name: 'Sprint 1' });
  await tool('add_issues_to_sprint', { sprint_id: sprint.id, issues: [issue.id] });
  await tool('start_sprint', { sprint_id: sprint.id });
  assert.equal((await tool('get_board', { board_id: created.board.id })).issues.length, 1);
  await tool('close_sprint', { sprint_id: sprint.id });

  const schema = await tool('get_schema');
  assert.equal(Object.keys(schema.entities).length, 35);
  const label = await tool('create_record', {
    entity: 'labels', values: { organization_id: workspace.organization.id, name: 'web-test' }
  });
  assert.equal((await tool('get_record', { entity: 'labels', id: label.id })).name, 'web-test');
  await tool('update_record', { entity: 'labels', id: label.id, values: { color: '#0c66e4' } });
  assert.equal((await tool('list_records', { entity: 'labels', filters: { color: '#0c66e4' } })).records.length, 1);
  assert.equal((await tool('delete_record', { entity: 'labels', id: label.id })).deleted.id, label.id);

  const bootstrap = await get(`/api/bootstrap?organization_id=${workspace.organization.id}`);
  assert.equal(bootstrap.organization.name, 'Web Test');
  assert.equal(bootstrap.metrics.openIssues, 1);
  assert.equal(bootstrap.projects.length, 1);
});
