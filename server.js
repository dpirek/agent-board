'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { SqliteStore } = require('./lib/store');
const { BoardService } = require('./lib/service');
const { callTool, tools } = require('./lib/mcp');
const { authApi } = require('./api/auth');
const auth = require('./utils/auth');

const PUBLIC_ROOT = path.resolve(__dirname, 'public');
const DEFAULT_DATABASE = path.resolve(__dirname, 'db', 'agent-board.sqlite');
const TOOL_NAMES = new Set(tools.map((tool) => tool.name));
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8', '.gif': 'image/gif', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function readJson(request, maximumBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maximumBytes) {
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}

function parseToolResult(toolResult) {
  if (toolResult?.isError) {
    const message = toolResult.content?.find((item) => item.type === 'text')?.text || 'Tool call failed';
    throw Object.assign(new Error(message), { statusCode: 400 });
  }
  return toolResult?.structuredContent ?? null;
}

function scalar(store, sql, ...parameters) {
  return Number(store.database.prepare(sql).get(...parameters).value || 0);
}

function bootstrap(service, store, requestedOrganizationId) {
  const organizations = service.list('organizations', {}, 1000);
  const suggestedOrganization = store.database.prepare(`
    SELECT o.id, COUNT(DISTINCT i.id) AS issue_count, COUNT(DISTINCT b.id) AS board_count,
      COUNT(DISTINCT a.id) AS agent_count
    FROM organizations o
    LEFT JOIN projects p ON p.organization_id = o.id
    LEFT JOIN issues i ON i.project_id = p.id
    LEFT JOIN boards b ON b.project_id = p.id
    LEFT JOIN agents a ON a.organization_id = o.id
    GROUP BY o.id
    ORDER BY issue_count DESC, board_count DESC, agent_count DESC, o.created_at
    LIMIT 1
  `).get();
  const organization = organizations.find((item) => item.id === requestedOrganizationId) ||
    organizations.find((item) => item.id === suggestedOrganization?.id) || organizations[0] || null;
  if (!organization) {
    return {
      organizations, organization: null,
      projects: [], boards: [], users: [], teams: [], statuses: [], issue_types: [], priorities: [], agents: [],
      metrics: { projects: 0, openIssues: 0, completedIssues: 0, activeSprints: 0 },
      statusSummary: [], recentIssues: [], recentActivity: [], activeSprints: []
    };
  }

  const organizationId = organization.id;
  const projects = service.list('projects', { organization_id: organizationId }, 1000);
  const projectIds = new Set(projects.map((item) => item.id));
  const boards = service.list('boards', {}, 1000).filter((item) => !item.project_id || projectIds.has(item.project_id));
  const boardIds = new Set(boards.map((item) => item.id));
  const users = service.list('users', { organization_id: organizationId }, 1000);
  const teams = service.list('teams', { organization_id: organizationId }, 1000);
  const statuses = service.list('statuses', { organization_id: organizationId }, 1000);
  const issueTypes = service.list('issue_types', { organization_id: organizationId }, 1000);
  const priorities = service.list('priorities', { organization_id: organizationId }, 1000);
  const agents = service.list('agents', { organization_id: organizationId }, 1000);
  const activeSprints = service.list('sprints', { status: 'active' }, 1000).filter((item) => boardIds.has(item.board_id));

  const metrics = {
    projects: projects.filter((project) => !project.is_archived).length,
    openIssues: scalar(store, `
      SELECT COUNT(*) AS value FROM issues i
      JOIN projects p ON p.id = i.project_id JOIN statuses s ON s.id = i.status_id
      WHERE p.organization_id = ? AND s.category != 'done'
    `, organizationId),
    completedIssues: scalar(store, `
      SELECT COUNT(*) AS value FROM issues i
      JOIN projects p ON p.id = i.project_id JOIN statuses s ON s.id = i.status_id
      WHERE p.organization_id = ? AND s.category = 'done'
    `, organizationId),
    activeSprints: activeSprints.length
  };

  const statusSummary = store.database.prepare(`
    SELECT s.id, s.name, s.category, s.color, COUNT(i.id) AS count
    FROM statuses s
    LEFT JOIN issues i ON i.status_id = s.id LEFT JOIN projects p ON p.id = i.project_id
    WHERE s.organization_id = ? AND (p.organization_id = ? OR p.id IS NULL)
    GROUP BY s.id, s.name, s.category, s.color
    ORDER BY CASE s.category WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, s.name
  `).all(organizationId, organizationId).map((row) => ({ ...row, count: Number(row.count) }));

  const recentIssues = store.database.prepare(`
    SELECT i.id, i.issue_number, i.title, i.updated_at, i.due_date, i.assignee_id,
      p.id AS project_id, p.project_key, p.name AS project_name,
      s.name AS status_name, s.category AS status_category, s.color AS status_color,
      pr.name AS priority_name, it.name AS issue_type_name
    FROM issues i JOIN projects p ON p.id = i.project_id JOIN statuses s ON s.id = i.status_id
    JOIN issue_types it ON it.id = i.issue_type_id LEFT JOIN priorities pr ON pr.id = i.priority_id
    WHERE p.organization_id = ? ORDER BY i.updated_at DESC LIMIT 12
  `).all(organizationId).map((row) => ({ ...row, issue_key: `${row.project_key}-${row.issue_number}` }));

  const recentActivity = store.database.prepare(`
    SELECT e.id, e.event_type, e.field_name, e.created_at, e.actor_id, e.metadata,
      i.issue_number, i.title, p.project_key
    FROM issue_events e JOIN issues i ON i.id = e.issue_id JOIN projects p ON p.id = i.project_id
    WHERE p.organization_id = ? ORDER BY e.created_at DESC LIMIT 10
  `).all(organizationId).map((row) => {
    let metadata = row.metadata;
    try { metadata = JSON.parse(metadata); } catch { /* preserve legacy values */ }
    return { ...row, metadata, issue_key: `${row.project_key}-${row.issue_number}` };
  });

  return {
    organizations, organization, projects, boards, users, teams, statuses,
    issue_types: issueTypes, priorities, agents, metrics, statusSummary,
    recentIssues, recentActivity, activeSprints
  };
}

function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(PUBLIC_ROOT, relative);
  if (candidate !== PUBLIC_ROOT && !candidate.startsWith(`${PUBLIC_ROOT}${path.sep}`)) return null;
  return candidate;
}

function serveStatic(response, pathname) {
  let filePath = safeStaticPath(pathname);
  if (!filePath) return false;
  let stat;
  try { stat = fs.statSync(filePath); } catch { stat = null; }
  if (!stat?.isFile()) {
    if (path.extname(pathname)) return false;
    filePath = path.join(PUBLIC_ROOT, 'index.html');
  }
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

function createWebServer(options = {}) {
  const databaseFile = options.databaseFile || process.env.AGENT_BOARD_DB || DEFAULT_DATABASE;
  const store = options.store || new SqliteStore(databaseFile);
  const service = options.service || new BoardService(store);
  const server = http.createServer(async (request, response) => {
    const origin = `http://${request.headers.host || '127.0.0.1'}`;
    let requestUrl;
    try { requestUrl = new URL(request.url, origin); }
    catch { return sendJson(response, 400, { error: 'Invalid URL' }); }
    const pathname = requestUrl.pathname;
    try {
      if (pathname === '/api/health' && request.method === 'GET') {
        return sendJson(response, 200, { ok: true, database: path.basename(databaseFile) });
      }
      if (['/api/auth', '/api/login', '/api/register', '/api/logout'].includes(pathname)) {
        const body = request.method === 'POST' ? await readJson(request) : {};
        const result = await authApi({
          pathname,
          method: request.method,
          body,
          request,
          response,
          service,
          store
        });
        if (result) return sendJson(response, result.statusCode, result.body);
      }
      const authUser = auth.getUserFromRequest(store, request);
      if (pathname.startsWith('/api/') && !authUser) {
        return sendJson(response, 401, { error: 'Authentication required.' });
      }
      if (pathname === '/api/bootstrap' && request.method === 'GET') {
        return sendJson(response, 200, {
          ...bootstrap(service, store, requestUrl.searchParams.get('organization_id')),
          current_user: authUser
        });
      }
      if (pathname === '/api/tools' && request.method === 'GET') return sendJson(response, 200, { tools });
      const toolMatch = pathname.match(/^\/api\/tools\/([a-z_]+)$/);
      if (toolMatch && request.method === 'POST') {
        if (!TOOL_NAMES.has(toolMatch[1])) return sendJson(response, 404, { error: 'Unknown tool' });
        const value = parseToolResult(await callTool(service, toolMatch[1], await readJson(request)));
        return sendJson(response, 200, value);
      }
      if (pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'API route not found' });
      if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });
      if (!serveStatic(response, pathname)) return sendJson(response, 404, { error: 'File not found' });
    } catch (error) {
      if (!response.headersSent) sendJson(response, error.statusCode || 400, { error: error.message || 'Request failed' });
      else response.destroy(error);
    }
  });
  server.on('close', () => { if (!options.store) store.close(); });
  return { server, service, store };
}

if (require.main === module) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
  const { server } = createWebServer();
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`Agent Board web UI listening at http://${host}:${address.port}`);
  });
}

module.exports = { bootstrap, createWebServer, readJson, safeStaticPath };
