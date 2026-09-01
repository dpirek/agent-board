'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'agent_board_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function parseCookies(request) {
  const cookies = {};
  for (const pair of String(request.headers.cookie || '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) continue;
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  }
  return cookies;
}

function setCookie(response, key, value, options = {}) {
  const parts = [`${key}=${encodeURIComponent(value)}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  response.setHeader('Set-Cookie', parts.join('; '));
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
  let actual;
  try { actual = (await scrypt(password, salt, 64)).toString('hex'); } catch { return false; }
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    role: row.role
  };
}

function sessionToken(request) {
  return parseCookies(request)[AUTH_COOKIE_NAME] || '';
}

function revokeRequestSession(store, request) {
  const token = sessionToken(request);
  if (token) store.database.prepare('DELETE FROM _auth_sessions WHERE token_hash = ?').run(tokenHash(token));
}

function createSession(store, request, response, userId) {
  revokeRequestSession(store, request);
  store.database.prepare('DELETE FROM _auth_sessions WHERE expires_at <= ?').run(new Date().toISOString());
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  store.database.prepare(`
    INSERT INTO _auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, tokenHash(token), expiresAt);
  setCookie(response, AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  });
  return token;
}

function getUserFromRequest(store, request) {
  const token = sessionToken(request);
  if (!token) return null;
  const now = new Date().toISOString();
  const row = store.database.prepare(`
    SELECT u.id, u.organization_id, u.name, u.avatar_url, a.email, a.role, o.name AS organization_name
    FROM _auth_sessions s
    JOIN _auth_accounts a ON a.user_id = s.user_id
    JOIN users u ON u.id = a.user_id
    JOIN organizations o ON o.id = u.organization_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
  `).get(tokenHash(token), now);
  if (!row) store.database.prepare('DELETE FROM _auth_sessions WHERE token_hash = ?').run(tokenHash(token));
  return publicUser(row);
}

function logout(store, request, response) {
  revokeRequestSession(store, request);
  setCookie(response, AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  });
}

module.exports = {
  AUTH_COOKIE_NAME,
  createSession,
  getUserFromRequest,
  hashPassword,
  logout,
  publicUser,
  verifyPassword
};
