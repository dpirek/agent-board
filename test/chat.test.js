'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { BoardChatAgent } = require('../lib/chat/agent');
const { chatConfig } = require('../lib/chat/config');
const { createChatRepository } = require('../lib/chat/repository');
const { SqliteStore } = require('../lib/store');
const { BoardService } = require('../lib/service');

function eventStream(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

test('chat sessions and preferences remain isolated by board user', () => {
  const store = new SqliteStore(':memory:');
  const service = new BoardService(store);
  const first = service.setupWorkspace({ organization_name: 'Acme', admin_email: 'one@example.com', admin_name: 'One' });
  const second = service.create('users', { organization_id: first.organization.id, email: 'two@example.com', name: 'Two' });
  const chats = createChatRepository(store.database);
  const session = chats.create(first.user.id);
  const messageId = chats.addMessage(first.user.id, session.id, 'user', 'Show unassigned issues');
  const runId = chats.createRun(first.user.id, session.id, messageId);
  chats.finishRun(first.user.id, runId, { status: 'completed', steps: [{ label: 'board.search_issues' }], usage: { input_tokens: 3, output_tokens: 2 } });
  chats.setModel(first.user.id, 'provider/model-a');
  assert.equal(chats.list(second.id).length, 0);
  assert.equal(chats.get(second.id, session.id), null);
  assert.equal(chats.getModel(first.user.id), 'provider/model-a');
  assert.equal(chats.get(first.user.id, session.id).latestRun.inputTokens, 3);
  assert.throws(() => chats.addMessage(second.id, session.id, 'user', 'No access'), /not found/);
  store.close();
});

test('board chat agent invokes the connected MCP registry and streams its answer', async () => {
  const requests = [], calls = [], events = [];
  const agent = new BoardChatAgent({
    config: { model: 'default', apiKey: 'key', baseUrl: 'https://example.test/v1', systemPrompt: 'Board prompt', maxToolTurns: 3 },
    mcp: { handle: async (message) => {
      if (message.method === 'tools/list') return { tools: [{ name: 'search_issues', description: 'Search', inputSchema: { type: 'object' } }] };
      calls.push(message.params); return { content: [{ type: 'text', text: '[]' }] };
    } },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) return eventStream([{ type: 'response.completed', response: { output: [{ type: 'function_call', name: 'search_issues', arguments: '{"text":"urgent"}', call_id: 'call-1' }], usage: { input_tokens: 2, output_tokens: 1 } } }]);
      return eventStream([{ type: 'response.output_text.delta', delta: 'No urgent issues.' }, { type: 'response.completed', response: { output_text: 'No urgent issues.', output: [], usage: { input_tokens: 3, output_tokens: 4 } } }]);
    }
  });
  const result = await agent.run({ messages: [{ role: 'user', content: 'Find urgent issues' }], emit: (event) => events.push(event) });
  assert.equal(result.text, 'No urgent issues.');
  assert.deepEqual(calls, [{ name: 'search_issues', arguments: { text: 'urgent' } }]);
  assert.equal(requests[0].instructions, 'Board prompt');
  assert.equal(result.steps.find((step) => step.id === 'call-1').label, 'board.search_issues');
  assert.ok(events.some((event) => event.type === 'delta'));
});

test('default system prompt is tailored to board operations and verified MCP mutations', () => {
  const config = chatConfig({});
  assert.match(config.systemPrompt, /Board Agent/);
  assert.match(config.systemPrompt, /projects, boards, backlogs, sprints, issues/);
  assert.match(config.systemPrompt, /never claim an operation succeeded unless its tool result confirms it/i);
});

test('persisted final responses survive markdown rendering', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../public/app/components/chat-page.js'), 'utf8');
  const chat = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const response = '### Active projects\n\n| Key | Name |\n|---|---|\n| KREST | **Krest** |\n\n> Ready for planning.';
  const html = chat.chatPage({
    sessions: [{ id: 'session-1', title: 'Projects' }],
    activeSession: {
      id: 'session-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'List projects' },
        { id: 'assistant-1', role: 'assistant', content: response }
      ],
      runs: [{ id: 'run-1', userMessageId: 'user-1', status: 'completed', stepSummary: [] }]
    }
  });
  assert.match(html, /<h3>Active projects<\/h3>/);
  assert.match(html, /<table>/);
  assert.match(html, /<strong>Krest<\/strong>/);
  assert.match(html, /Ready for planning/);
});
