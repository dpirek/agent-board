const controlIcon = (name) => name === 'plus'
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  : name === 'stop'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14"/></svg>';

export function chatPage({ sessions = [], activeSession = null, running = false, draftImages = [], model = '', models = [] } = {}) {
  const messages = activeSession?.messages || [];
  const runs = activeSession?.runs || [];
  return `<section class="chat-page">
    <aside class="chat-history" aria-label="Conversation history">
      <button class="chat-new" type="button" data-chat-new><span>＋</span> New chat</button>
      <div class="chat-history-list">${sessions.map((session) => `<div class="chat-history-row${session.id === activeSession?.id ? ' active' : ''}"><button type="button" data-chat-session="${escapeHtml(session.id)}"><b>${escapeHtml(session.title)}</b><small>${formatRelative(session.updatedAt)}</small></button><button class="chat-delete" type="button" data-chat-delete="${escapeHtml(session.id)}" aria-label="Delete ${escapeHtml(session.title)}">×</button></div>`).join('') || '<p>No conversations yet.</p>'}</div>
      <details class="chat-model-picker" data-chat-model-picker><summary><span><small>MODEL</small><strong>${escapeHtml(model || 'Not configured')}</strong></span><b>⌃</b></summary><div>${models.map((item) => `<button type="button" data-chat-model="${escapeHtml(item)}" class="${item === model ? 'active' : ''}"><span>${escapeHtml(item)}</span>${item === model ? '<b>✓</b>' : ''}</button>`).join('') || `<button type="button" data-chat-model="${escapeHtml(model)}" class="active"><span>${escapeHtml(model || 'Not configured')}</span><b>✓</b></button>`}</div></details>
    </aside>
    <div class="chat-main">
      <div class="chat-scroll" data-chat-scroll><div class="chat-thread">${messages.length ? conversationHistory(messages, runs) : welcomeMessage()}${running ? runHistory({ status: 'running', stepSummary: [] }, true) : ''}<div class="chat-live" data-chat-live></div></div></div>
      <div class="chat-footer"><div class="chat-image-previews">${draftImages.map((image, index) => `<span>${escapeHtml(image.name)}<button type="button" data-remove-image="${index}" aria-label="Remove image">×</button></span>`).join('')}</div><form class="chat-composer" data-chat-form><input data-chat-images type="file" accept="image/*" multiple hidden><button class="chat-tool" type="button" data-chat-attach aria-label="Add image">${controlIcon('plus')}</button><textarea name="message" rows="1" placeholder="Ask Board Agent" aria-label="Message Board Agent" ${running ? 'disabled' : ''} required></textarea><button class="chat-send${running ? ' is-stop' : ''}" type="${running ? 'button' : 'submit'}" ${running ? 'data-chat-stop aria-label="Stop response"' : 'aria-label="Send message" disabled'}>${controlIcon(running ? 'stop' : 'send')}</button></form></div>
    </div>
  </section>`;
}

function conversationHistory(messages, runs) {
  const byMessage = new Map();
  for (const run of runs) {
    const key = String(run.userMessageId ?? 'unmatched');
    if (!byMessage.has(key)) byMessage.set(key, []);
    byMessage.get(key).push(run);
  }
  const output = [];
  for (const message of messages) {
    output.push(renderChatMessage(message));
    if (message.role === 'user') for (const run of byMessage.get(String(message.id)) || []) output.push(runHistory(run));
  }
  for (const run of byMessage.get('unmatched') || []) output.push(runHistory(run));
  return output.join('');
}

function runHistory(run, live = false) {
  const steps = run.stepSummary || [];
  const status = live ? 'running' : run.status;
  const tokens = Number(run.inputTokens || 0) + Number(run.outputTokens || 0);
  const title = live ? 'Board Agent is working…' : status === 'failed' ? 'Run completed with errors' : status === 'cancelled' ? 'Run stopped' : 'Run completed';
  return `<details class="chat-steps chat-run-history" ${live ? 'open data-live-run' : ''}><summary><span class="chat-run-copy"><small>${live ? 'Current step' : 'Step summary'}</small><strong>${title}</strong></span>${stepProgressGraphic(steps, status)}<span class="chat-run-count">${steps.length} step${steps.length === 1 ? '' : 's'}${tokens ? ` · ${tokens.toLocaleString()} tokens` : ''}</span><span class="chat-run-chevron">›</span></summary><ol>${steps.map(stepHistory).join('')}</ol></details>${status === 'failed' && run.error ? failureMessage(run.error) : ''}`;
}

function stepHistory(step) {
  const details = [...(step.details || [])];
  if (step.error && !details.some((detail) => detail.title === 'Error')) details.push({ title: 'Error', text: step.error });
  return `<li class="chat-step ${escapeHtml(step.status || 'completed')}" data-step-id="${escapeHtml(step.id)}"><details ${step.status === 'failed' ? 'open' : ''}><summary><span class="chat-step-marker"></span><span class="chat-step-copy"><strong>${escapeHtml(step.label || 'Step')}</strong>${step.usage ? `<small>${Number(step.usage.inputTokens || 0).toLocaleString()} input · ${Number(step.usage.outputTokens || 0).toLocaleString()} output</small>` : ''}</span><time>${formatDuration(step.durationMs)}</time><span class="chat-step-chevron">›</span></summary><div class="chat-step-details">${(details.length ? details : [{ title: 'Status', text: step.status }]).map((detail) => `<section><h4>${escapeHtml(detail.title)}</h4><pre>${escapeHtml(detail.text)}</pre></section>`).join('')}</div></details></li>`;
}

export function stepProgressGraphic(steps = [], runStatus = 'completed') {
  const visible = steps.slice(-6), positions = visible.map((_, index) => visible.length === 1 ? 48 : 8 + 80 * index / (visible.length - 1));
  const connectors = positions.slice(1).map((x, index) => `<line class="chat-progress-connector ${escapeHtml(visible[index + 1]?.status || 'idle')}" x1="${positions[index] + 5}" y1="14" x2="${x - 5}" y2="14"></line>`).join('');
  const nodes = visible.map((step, index) => { const x = positions[index], status = step.status || 'idle'; return `<g class="chat-progress-node ${escapeHtml(status)}"><circle class="chat-progress-dot" cx="${x}" cy="14" r="5"></circle>${status === 'running' ? `<circle class="chat-progress-pulse" cx="${x}" cy="14" r="6"></circle>` : ''}</g>`; }).join('');
  const runner = runStatus === 'running' && positions.length > 1 ? `<circle class="chat-progress-runner" cy="14" r="1.8"><animate attributeName="cx" values="${positions[0]};${positions.at(-1)}" dur="1.35s" repeatCount="indefinite"></animate></circle>` : '';
  return `<span class="chat-step-progress" data-step-progress><svg viewBox="0 0 96 28" aria-hidden="true">${positions.length ? connectors + nodes + runner : '<path class="chat-progress-track" d="M8 14H88"></path>'}</svg></span>`;
}

function welcomeMessage() {
  return '<article class="chat-message assistant"><div class="chat-response"><p>Board Agent is ready to help you inspect, plan, and operate your workspace.</p><ul><li>Review projects, boards, backlogs, and sprints.</li><li>Find, create, assign, and update issues.</li><li>Inspect agent activity and delivery status.</li></ul><div class="chat-code"><span>TRY IT</span><code>Show me the highest-priority issues that are still unassigned</code></div></div></article>';
}

export function renderChatMessage(message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  return `<article class="chat-message ${role}"><div class="chat-bubble">${renderMarkdown(message.content)}${(message.images || []).map((image) => `<small class="chat-attachment">▧ ${escapeHtml(image.name)}</small>`).join('')}</div></article>`;
}

function failureMessage(error) { return `<article class="chat-message assistant chat-failure"><div class="chat-bubble"><strong>Board Agent couldn’t complete this request.</strong><p>${escapeHtml(error)}</p></div></article>`; }

export function renderMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    const fence = lines[index].match(/^\s*```([^`]*)$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      const language = fence[1].trim().replace(/[^A-Za-z0-9_-]/g, '');
      const source = code.join('\n');
      output.push(language.toLowerCase() === 'svg' ? renderSvg(source) : `<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(source)}</code></pre>`);
      continue;
    }
    if (/^\s*<svg\b/i.test(lines[index])) {
      const svg = [lines[index++]];
      while (index < lines.length && !/<\/svg>\s*$/i.test(svg.at(-1))) svg.push(lines[index++]);
      const source = svg.join('\n');
      output.push(/<\/svg>\s*$/i.test(source) ? renderSvg(source) : `<p>${inlineMarkdown(source)}</p>`);
      continue;
    }
    if (isTableHeader(lines, index)) {
      const headings = splitTableRow(lines[index]);
      const alignments = splitTableRow(lines[index + 1]).map(tableAlignment);
      const rows = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) rows.push(splitTableRow(lines[index++]));
      const cell = (tag, content, cellIndex) => `<${tag}${alignments[cellIndex] ? ` class="align-${alignments[cellIndex]}"` : ''}>${inlineMarkdown(content || '')}</${tag}>`;
      output.push(`<div class="chat-table-wrap"><table><thead><tr>${headings.map((heading, cellIndex) => cell('th', heading, cellIndex)).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headings.map((_, cellIndex) => cell('td', row[cellIndex], cellIndex)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const heading = lines[index].match(/^(#{1,3})\s+(.+)$/);
    if (heading) { output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); index += 1; continue; }
    const list = lines[index].match(/^\s*(?:[-+*]|\d+\.)\s+(.+)$/);
    if (list) {
      const ordered = /^\s*\d+\./.test(lines[index]);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(`<li>${inlineMarkdown(item[3])}</li>`);
        index += 1;
      }
      output.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*>\s?/.test(lines[index])) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      output.push(`<blockquote>${quote.map(inlineMarkdown).join('<br>')}</blockquote>`);
      continue;
    }
    const paragraph = [lines[index++]];
    while (index < lines.length && lines[index].trim() && !startsMarkdownBlock(lines, index)) paragraph.push(lines[index++]);
    output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
  }
  return output.join('');
}

function startsMarkdownBlock(lines, index) {
  return /^\s*```/.test(lines[index]) || /^(#{1,3})\s+/.test(lines[index]) || /^\s*(?:[-+*]|\d+\.)\s+/.test(lines[index]) || /^\s*>\s?/.test(lines[index]) || /^\s*<svg\b/i.test(lines[index]) || isTableHeader(lines, index);
}
function isTableHeader(lines, index) { return isTableRow(lines[index]) && index + 1 < lines.length && splitTableRow(lines[index + 1]).length === splitTableRow(lines[index]).length && splitTableRow(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell.trim())); }
function isTableRow(line = '') { const trimmed = line.trim(); return trimmed.includes('|') && !/^\s*```/.test(trimmed); }
function splitTableRow(line = '') {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = []; let cell = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] === '\\' && trimmed[index + 1] === '|') { cell += '|'; index += 1; }
    else if (trimmed[index] === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += trimmed[index];
  }
  cells.push(cell.trim()); return cells;
}
function tableAlignment(marker) { const value = marker.trim(); return value.startsWith(':') && value.endsWith(':') ? 'center' : value.endsWith(':') ? 'right' : value.startsWith(':') ? 'left' : ''; }
function inlineMarkdown(value) { return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
function renderSvg(source) { const svg = String(source || '').trim(); if (!/^<svg\b[\s\S]*<\/svg>$/i.test(svg) || svg.length > 250000) return `<pre><code>${escapeHtml(svg)}</code></pre>`; const title = svg.match(/<title(?:\s[^>]*)?>([^<]{1,160})<\/title>/i)?.[1] || 'Generated SVG'; return `<figure class="chat-svg-preview"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="${escapeHtml(title)}"><figcaption>${escapeHtml(title)}</figcaption></figure>`; }
function formatDuration(value) { const ms = Math.max(0, Number(value) || 0); return ms < 1000 ? (ms ? `${Math.round(ms)}ms` : '') : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`; }
function formatRelative(value) { const date = new Date(String(value || '').replace(' ', 'T')); const elapsed = Date.now() - date.getTime(); return !Number.isFinite(elapsed) ? '' : elapsed < 60000 ? 'Now' : elapsed < 3600000 ? `${Math.floor(elapsed / 60000)}m` : elapsed < 86400000 ? `${Math.floor(elapsed / 3600000)}h` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
