'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWebServer } = require('../server');

test('registers users, persists sessions, logs in, and protects application APIs', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-auth-'));
  const { server, store } = createWebServer({ databaseFile: path.join(directory, 'board.sqlite') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function json(pathname, options = {}) {
    const response = await fetch(`${origin}${pathname}`, options);
    return { response, body: await response.json() };
  }

  const initial = await json('/api/auth');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.user, null);
  assert.equal(initial.body.registration.workspace_required, true);

  const anonymousBootstrap = await json('/api/bootstrap');
  assert.equal(anonymousBootstrap.response.status, 401);
  assert.equal(anonymousBootstrap.body.error, 'Authentication required.');

  const weak = await json('/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alex Rivera', email: 'alex@example.com', password: 'short', workspace_name: 'Product' })
  });
  assert.equal(weak.response.status, 400);

  const registration = await json('/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alex Rivera', email: 'Alex@Example.com', password: 'correct-horse', workspace_name: 'Product' })
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.user.email, 'alex@example.com');
  assert.equal(registration.body.user.role, 'admin');
  assert.equal(registration.body.organization.name, 'Product');
  const cookie = registration.response.headers.get('set-cookie').split(';')[0];
  assert.match(registration.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(registration.response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM _auth_accounts').get().count, 1);
  assert.notEqual(store.database.prepare('SELECT password_hash FROM _auth_accounts').get().password_hash, 'correct-horse');

  const authenticated = await json('/api/auth', { headers: { cookie } });
  assert.equal(authenticated.body.user.name, 'Alex Rivera');
  const bootstrap = await json('/api/bootstrap', { headers: { cookie } });
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.body.current_user.id, registration.body.user.id);

  const duplicate = await json('/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alex Rivera', email: 'alex@example.com', password: 'another-password' })
  });
  assert.equal(duplicate.response.status, 409);

  const logout = await json('/api/logout', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await json('/api/auth', { headers: { cookie } })).body.user, null);

  const invalidLogin = await json('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alex@example.com', password: 'wrong-password' })
  });
  assert.equal(invalidLogin.response.status, 401);
  assert.equal(invalidLogin.body.error, 'Invalid email or password.');

  const login = await json('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alex@example.com', password: 'correct-horse' })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.id, registration.body.user.id);
  assert.ok(login.response.headers.get('set-cookie'));
});
