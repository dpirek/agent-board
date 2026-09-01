'use strict';

const auth = require('../utils/auth');

function apiError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw apiError('Password must be at least 8 characters.', 400);
  if (password.length > 128) throw apiError('Password must be no more than 128 characters.', 400);
}

function accountByEmail(store, email) {
  return store.database.prepare(`
    SELECT u.id, u.organization_id, u.name, u.avatar_url, u.is_active,
      a.email, a.password_hash, a.password_salt, a.role, o.name AS organization_name
    FROM _auth_accounts a
    JOIN users u ON u.id = a.user_id
    JOIN organizations o ON o.id = u.organization_id
    WHERE a.email = ?
  `).get(email);
}

function currentUserFromToken(store, token) {
  return auth.getUserFromRequest(store, { headers: { cookie: `${auth.AUTH_COOKIE_NAME}=${encodeURIComponent(token)}` } });
}

async function register({ body, request, response, service, store }) {
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const password = body.password;
  const workspaceName = String(body.workspace_name || '').trim();
  if (name.length < 2 || name.length > 100) throw apiError('Name must be between 2 and 100 characters.', 400);
  if (!validateEmail(email)) throw apiError('Enter a valid email address.', 400);
  validatePassword(password);
  if (accountByEmail(store, email)) throw apiError('An account with this email already exists.', 409);

  const passwordData = await auth.hashPassword(password);
  const accountCount = Number(store.database.prepare('SELECT COUNT(*) AS count FROM _auth_accounts').get().count);
  const result = store.transaction(() => {
    let organization = service.list('organizations', {}, 1)[0] || null;
    let user = store.database.prepare('SELECT * FROM users WHERE lower(email) = ? ORDER BY created_at LIMIT 1').get(email) || null;
    if (user) organization = service.get('organizations', user.organization_id);
    if (!organization) {
      if (workspaceName.length < 2 || workspaceName.length > 100) {
        throw apiError('Workspace name must be between 2 and 100 characters.', 400);
      }
      const workspace = service.setupWorkspace({
        organization_name: workspaceName,
        admin_name: name,
        admin_email: email
      }, { transaction: false });
      organization = workspace.organization;
      user = workspace.user;
    } else if (!user) {
      user = service.create('users', { organization_id: organization.id, email, name });
    }
    store.database.prepare(`
      INSERT INTO _auth_accounts (user_id, email, password_hash, password_salt, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, email, passwordData.hash, passwordData.salt, accountCount === 0 ? 'admin' : 'member');
    return { organization, userId: user.id };
  });

  const token = auth.createSession(store, request, response, result.userId);
  return { statusCode: 201, body: { user: currentUserFromToken(store, token), organization: result.organization } };
}

async function login({ body, request, response, store }) {
  const email = normalizeEmail(body.email || body.username);
  const password = body.password;
  const account = accountByEmail(store, email);
  const valid = account && account.is_active && typeof password === 'string'
    ? await auth.verifyPassword(password, account.password_salt, account.password_hash)
    : false;
  if (!valid) throw apiError('Invalid email or password.', 401);
  auth.createSession(store, request, response, account.id);
  return { statusCode: 200, body: { user: auth.publicUser(account) } };
}

async function authApi(context) {
  const { method, pathname, request, response, store } = context;
  if (method === 'GET' && pathname === '/api/auth') {
    const organizationCount = Number(store.database.prepare('SELECT COUNT(*) AS count FROM organizations').get().count);
    return {
      statusCode: 200,
      body: {
        user: auth.getUserFromRequest(store, request),
        registration: { workspace_required: organizationCount === 0 }
      }
    };
  }
  if (method === 'POST' && pathname === '/api/register') return register(context);
  if (method === 'POST' && pathname === '/api/login') return login(context);
  if (method === 'POST' && pathname === '/api/logout') {
    auth.logout(store, request, response);
    return { statusCode: 200, body: { ok: true } };
  }
  return null;
}

module.exports = { authApi, normalizeEmail, validateEmail };
