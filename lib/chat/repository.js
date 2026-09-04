'use strict';

const crypto = require('node:crypto');

const SESSION_COLUMNS = 'SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM _chat_sessions';

function parseJson(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function titleFromPrompt(prompt) {
  const title = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!title) return 'New chat';
  return title.length > 42 ? `${title.slice(0, 42)}…` : title;
}

function createChatRepository(db) {
  const ownedSession = db.prepare(`${SESSION_COLUMNS} WHERE id = ? AND user_id = ?`);
  const list = db.prepare(`${SESSION_COLUMNS} WHERE user_id = ? ORDER BY updated_at DESC, id DESC`);
  const messages = db.prepare(`SELECT id, role, content, images_json AS imagesJson, created_at AS createdAt FROM _chat_messages WHERE session_id = ? AND user_id = ? ORDER BY id`);
  const runs = db.prepare(`SELECT id, user_message_id AS userMessageId, assistant_message_id AS assistantMessageId, status, step_summary_json AS stepSummaryJson, input_tokens AS inputTokens, output_tokens AS outputTokens, error, created_at AS createdAt, completed_at AS completedAt FROM _chat_runs WHERE session_id = ? AND user_id = ? ORDER BY created_at, id`);
  const hydrate = (session, userId) => {
    if (!session) return null;
    const sessionRuns = runs.all(session.id, userId).map(({ stepSummaryJson, ...run }) => ({ ...run, stepSummary: parseJson(stepSummaryJson) }));
    return {
      ...session,
      messages: messages.all(session.id, userId).map(({ imagesJson, ...message }) => ({ ...message, images: parseJson(imagesJson) })),
      runs: sessionRuns,
      latestRun: sessionRuns.at(-1) || null
    };
  };
  return {
    getModel(userId) { return db.prepare('SELECT model FROM _chat_preferences WHERE user_id = ?').get(userId)?.model || null; },
    setModel(userId, model) {
      const value = String(model || '').trim();
      if (!value || value.length > 200) throw new Error('Select a valid model');
      db.prepare(`INSERT INTO _chat_preferences (user_id, model) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET model = excluded.model, updated_at = CURRENT_TIMESTAMP`).run(userId, value);
      return value;
    },
    list(userId) { return list.all(userId); },
    get(userId, sessionId) { return hydrate(ownedSession.get(sessionId, userId), userId); },
    create(userId) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO _chat_sessions (id, user_id) VALUES (?, ?)').run(id, userId);
      return hydrate(ownedSession.get(id, userId), userId);
    },
    remove(userId, sessionId) { return db.prepare('DELETE FROM _chat_sessions WHERE id = ? AND user_id = ?').run(sessionId, userId).changes > 0; },
    addMessage(userId, sessionId, role, content, images = []) {
      const session = ownedSession.get(sessionId, userId);
      if (!session) throw new Error('Conversation not found');
      const id = crypto.randomUUID();
      const metadata = images.map(({ name, type }) => ({ name, type }));
      db.prepare('INSERT INTO _chat_messages (id, session_id, user_id, role, content, images_json) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, userId, role, String(content), JSON.stringify(metadata));
      const title = role === 'user' && session.title === 'New chat' ? titleFromPrompt(content) : session.title;
      db.prepare('UPDATE _chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(title, sessionId, userId);
      return id;
    },
    createRun(userId, sessionId, userMessageId) {
      if (!ownedSession.get(sessionId, userId)) throw new Error('Conversation not found');
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO _chat_runs (id, session_id, user_id, user_message_id, status) VALUES (?, ?, ?, ?, 'running')").run(id, sessionId, userId, userMessageId);
      return id;
    },
    finishRun(userId, runId, { status, steps, usage = {}, error = null, assistantMessageId = null }) {
      db.prepare('UPDATE _chat_runs SET status = ?, step_summary_json = ?, input_tokens = ?, output_tokens = ?, error = ?, assistant_message_id = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(status, JSON.stringify(steps || []), Number(usage.input_tokens || 0), Number(usage.output_tokens || 0), error, assistantMessageId, runId, userId);
    }
  };
}

module.exports = { createChatRepository, titleFromPrompt };
