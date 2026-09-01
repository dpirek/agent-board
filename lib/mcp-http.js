'use strict';

const http = require('node:http');
const { SUPPORTED_PROTOCOL_VERSIONS, handleMessage } = require('./mcp');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DEFAULT_PATH = '/mcp';
const MAX_BODY_BYTES = 1024 * 1024;

function jsonRpcError(code, message, id = null) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function sendEmpty(response, statusCode, headers = {}) {
  response.writeHead(statusCode, { 'Content-Length': '0', ...headers });
  response.end();
}

function accepts(request, mediaType) {
  const accept = request.headers.accept || '';
  return accept.split(',').some((entry) => {
    const type = entry.trim().split(';', 1)[0].toLowerCase();
    return type === mediaType || type === '*/*';
  });
}

function isAllowedOrigin(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function isAuthorized(request, token) {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body exceeds 1 MiB'), { statusCode: 413, code: -32600 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Parse error'), { statusCode: 400, code: -32700 });
  }
}

function isJsonRpcResponse(message) {
  return message && message.jsonrpc === '2.0' && message.id !== undefined &&
    (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'));
}

function createMcpHttpServer(service, options = {}) {
  const endpoint = options.path || DEFAULT_PATH;
  const token = options.token || '';
  const allowedOrigins = new Set(options.allowedOrigins || []);

  if (!endpoint.startsWith('/')) throw new Error('HTTP endpoint path must start with /');

  return http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname !== endpoint) {
      sendEmpty(response, 404);
      return;
    }
    if (!isAllowedOrigin(request, allowedOrigins)) {
      sendJson(response, 403, jsonRpcError(-32000, 'Forbidden origin'));
      return;
    }
    if (!isAuthorized(request, token)) {
      sendJson(response, 401, jsonRpcError(-32001, 'Unauthorized'));
      return;
    }
    if (request.method === 'GET' || request.method === 'DELETE') {
      sendEmpty(response, 405, { Allow: 'POST' });
      return;
    }
    if (request.method !== 'POST') {
      sendEmpty(response, 405, { Allow: 'POST' });
      return;
    }
    if (!accepts(request, 'application/json') || !accepts(request, 'text/event-stream')) {
      sendJson(response, 406, jsonRpcError(-32600, 'Accept must include application/json and text/event-stream'));
      return;
    }
    if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, jsonRpcError(-32600, 'Content-Type must be application/json'));
      return;
    }
    const protocolVersion = request.headers['mcp-protocol-version'];
    if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
      sendJson(response, 400, jsonRpcError(-32600, `Unsupported MCP protocol version '${protocolVersion}'`));
      return;
    }

    let message;
    try {
      message = await readJson(request);
    } catch (error) {
      sendJson(response, error.statusCode || 400, jsonRpcError(error.code || -32600, error.message));
      return;
    }

    if (isJsonRpcResponse(message)) {
      sendEmpty(response, 202);
      return;
    }

    try {
      const result = await handleMessage(service, message);
      if (result === null) {
        sendEmpty(response, 202);
      } else {
        sendJson(response, 200, { jsonrpc: '2.0', id: message.id, result });
      }
    } catch (error) {
      sendJson(response, 200, jsonRpcError(error.code || -32603, error.message, message?.id ?? null));
    }
  });
}

async function startMcpHttpServer(service, options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const server = createMcpHttpServer(service, options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const displayHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return { server, url: `http://${displayHost}:${address.port}${options.path || DEFAULT_PATH}` };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PATH,
  DEFAULT_PORT,
  createMcpHttpServer,
  startMcpHttpServer
};
