import './components/auth/login.js';

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');

const state = {
  bootstrap: null,
  schema: null,
  tools: [],
  organizationId: localStorage.getItem('agent-board.organization') || '',
  route: { name: 'dashboard' },
  board: null,
  backlog: [],
  selectedIssue: null,
  dataEntity: 'organizations',
  dataRecords: [],
  currentUser: null,
  busy: false,
  theme: localStorage.getItem('agent-board.theme') || 'light'
};

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/>',
  project: '<path d="M4 5.5h16v13H4z"/><path d="M8 5.5V4h8v1.5M8 10h8M8 14h5"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="8" rx="1"/>',
  backlog: '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="3" cy="6" r=".5"/><circle cx="3" cy="12" r=".5"/><circle cx="3" cy="18" r=".5"/>',
  robot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4m-4 9h.01M16 13h.01M8 17h8"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  moon: '<path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/>',
  comment: '<path d="M4 5h16v12H9l-5 4V5Z"/>',
  sprint: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  edit: '<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20ZM13.5 7l3.5 3.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9"/>'
};

function icon(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.project}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function compactJson(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function colorFromText(text) {
  const colors = ['#0c66e4', '#6554c0', '#00875a', '#bf63f3', '#e56910', '#0065ff', '#5e6c84'];
  let hash = 0;
  for (const character of String(text || '')) hash = ((hash << 5) - hash) + character.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

function avatar(user, size = 'md') {
  const name = user?.name || user?.email || 'Unassigned';
  return `<span class="avatar avatar--${size}${user ? '' : ' avatar--empty'}" style="--avatar-color:${user ? colorFromText(name) : '#dfe1e6'}" title="${escapeHtml(name)}">${user ? escapeHtml(initials(name)) : '–'}</span>`;
}

function findUser(id) { return state.bootstrap?.users.find((user) => user.id === id) || null; }
function findProject(reference) { return state.bootstrap?.projects.find((project) => project.id === reference || project.project_key === reference) || null; }
function findBoard(projectId) { return state.bootstrap?.boards.find((board) => board.project_id === projectId) || null; }

function issueIcon(type) {
  const map = { Epic: ['⚡', 'epic'], Story: ['◆', 'story'], Task: ['✓', 'task'], Bug: ['●', 'bug'], Subtask: ['↳', 'subtask'] };
  const [symbol, className] = map[type] || ['✓', 'task'];
  return `<span class="issue-type issue-type--${className}" title="${escapeHtml(type)}">${symbol}</span>`;
}

function priorityIcon(priority) {
  const classes = { Highest: 'highest', High: 'high', Medium: 'medium', Low: 'low', Lowest: 'lowest' };
  return `<span class="priority priority--${classes[priority] || 'none'}" title="${escapeHtml(priority || 'No priority')}">${priority === 'Highest' || priority === 'High' ? '↑' : priority === 'Low' || priority === 'Lowest' ? '↓' : '＝'}</span>`;
}

function statusPill(name, category) {
  return `<span class="status status--${escapeHtml(category || 'todo')}">${escapeHtml(name || 'Unknown')}</span>`;
}

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat(undefined, options.dateOnly ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }).format(date);
}

function relativeTime(value) {
  if (!value) return 'just now';
  const delta = new Date(value).getTime() - Date.now();
  const units = [[86400000, 'day'], [3600000, 'hour'], [60000, 'minute']];
  for (const [milliseconds, unit] of units) {
    if (Math.abs(delta) >= milliseconds) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(delta / milliseconds), unit);
  }
  return 'just now';
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (response.status === 401 && url !== '/api/auth') {
    state.currentUser = null;
    history.replaceState({}, '', '/login');
    renderAuth();
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function tool(name, args = {}) {
  return request(`/api/tools/${name}`, { method: 'POST', body: JSON.stringify(args) });
}

function toast(message, kind = 'success') {
  const element = document.createElement('div');
  element.className = `toast toast--${kind}`;
  element.innerHTML = `${icon(kind === 'success' ? 'check' : 'alert', 17)}<span>${escapeHtml(message)}</span>`;
  toastRoot.appendChild(element);
  setTimeout(() => element.classList.add('toast--visible'), 20);
  setTimeout(() => {
    element.classList.remove('toast--visible');
    setTimeout(() => element.remove(), 220);
  }, 3600);
}

function setBusy(value) {
  state.busy = value;
  document.body.classList.toggle('is-busy', value);
}

async function perform(operation, successMessage, refresh = true) {
  setBusy(true);
  try {
    const result = await operation();
    if (successMessage) toast(successMessage);
    if (refresh) await refreshBootstrap();
    return result;
  } catch (error) {
    toast(error.message, 'error');
    throw error;
  } finally {
    setBusy(false);
  }
}

function modal({ title, eyebrow = '', body, footer = '', size = '', onOpen }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal ${size ? `modal--${size}` : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-modal-panel>
        <header class="modal__header">
          <div>${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}<h2>${escapeHtml(title)}</h2></div>
          <button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('close')}</button>
        </header>
        <div class="modal__body">${body}</div>
        ${footer ? `<footer class="modal__footer">${footer}</footer>` : ''}
      </section>
    </div>`;
  document.body.classList.add('modal-open');
  modalRoot.querySelector('input:not([type=hidden]), textarea, select, button')?.focus();
  onOpen?.(modalRoot);
}

function closeModal() {
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  state.selectedIssue = null;
}

function formValue(form, name) {
  const field = form.elements.namedItem(name);
  return field?.value?.trim?.() ?? field?.value;
}

function navItem(route, label, iconName, match = route) {
  const active = state.route.name === match;
  return `<a href="${route}" class="side-nav__item${active ? ' is-active' : ''}" data-route>${icon(iconName)}<span>${label}</span></a>`;
}

function shell() {
  const bootstrap = state.bootstrap;
  const organization = bootstrap.organization;
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'dark' ? '#2c333a' : '#f1f2f4');
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <button class="icon-button topbar__menu" type="button" data-toggle-sidebar aria-label="Toggle navigation">${icon('menu')}</button>
        <a class="brand" href="/" data-route><span class="brand-mark" aria-hidden="true"><img src="/favicon.svg" alt=""></span><span>Agent Board</span></a>
        <button class="global-search" type="button" data-open-search>${icon('search', 16)}<span>Search issues</span><kbd>/</kbd></button>
        <div class="topbar__actions">
          <button class="button button--primary button--compact" type="button" data-create-issue>${icon('plus', 16)}<span>Create</span></button>
          <button class="icon-button icon-button--topbar" type="button" data-theme-toggle aria-label="Toggle theme">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
          ${avatar(state.currentUser || bootstrap.users.find((user) => user.is_active) || null, 'sm')}
          <button class="icon-button icon-button--topbar" type="button" data-logout aria-label="Log out" title="Log out">${icon('logout')}</button>
        </div>
      </header>
      <aside class="sidebar">
        <div class="workspace-switcher">
          <span class="workspace-icon">${escapeHtml(initials(organization?.name || 'AB'))}</span>
          <label><span>Workspace</span><select data-organization-switch aria-label="Workspace">
            ${bootstrap.organizations.map((item) => `<option value="${item.id}" ${item.id === organization?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
          </select></label>
        </div>
        <nav class="side-nav" aria-label="Primary">
          ${navItem('/', 'Your work', 'home', 'dashboard')}
          ${navItem('/projects', 'Projects', 'project', 'projects')}
          ${navItem('/agents', 'Agent activity', 'robot', 'agents')}
          ${navItem('/data', 'Data explorer', 'database', 'data')}
        </nav>
        <div class="sidebar__section">
          <div class="sidebar__label"><span>Recent projects</span><button type="button" data-create-project aria-label="Create project">${icon('plus', 15)}</button></div>
          <div class="project-shortcuts">
            ${bootstrap.projects.filter((project) => !project.is_archived).slice(0, 5).map((project) => `
              <a href="/projects/${encodeURIComponent(project.project_key)}/board" data-route>
                <span class="project-avatar" style="--project-color:${colorFromText(project.project_key)}">${escapeHtml(project.project_key.slice(0, 2))}</span>
                <span>${escapeHtml(project.name)}</span>
              </a>`).join('') || '<span class="muted small">No projects yet</span>'}
          </div>
        </div>
        <button class="sidebar__setup" type="button" data-setup-workspace>${icon('plus', 16)} Create workspace</button>
      </aside>
      <main class="main" id="main-content"></main>
      <div class="sidebar-scrim" data-toggle-sidebar></div>
    </div>`;
}

function pageHeader({ eyebrow, title, description = '', actions = '', tabs = '' }) {
  return `<header class="page-header">
    ${eyebrow ? `<div class="breadcrumbs">${eyebrow}</div>` : ''}
    <div class="page-header__row"><div><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div><div class="page-actions">${actions}</div></div>
    ${tabs ? `<nav class="tabs">${tabs}</nav>` : ''}
  </header>`;
}

function loadingPage(message = 'Loading…') {
  document.querySelector('#main-content').innerHTML = `<div class="page-loading"><span class="spinner"></span><p>${escapeHtml(message)}</p></div>`;
}

function emptyState(title, copy, action = '') {
  return `<div class="empty-state"><span class="empty-state__icon">${icon('project', 26)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p>${action}</div>`;
}

function renderDashboard() {
  const { metrics, recentIssues, statusSummary, recentActivity, projects, activeSprints } = state.bootstrap;
  state.route = { name: 'dashboard' };
  shell();
  const maximum = Math.max(1, ...statusSummary.map((item) => item.count));
  document.querySelector('#main-content').innerHTML = `
    <div class="page page--dashboard">
      ${pageHeader({
        eyebrow: 'Your work', title: `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}`,
        description: `Here’s what’s happening across ${state.bootstrap.organization.name}.`,
        actions: '<button class="button" type="button" data-open-search>Search issues</button><button class="button button--primary" type="button" data-create-issue>Create issue</button>'
      })}
      <section class="metric-grid" aria-label="Workspace summary">
        <article class="metric-card"><span class="metric-card__icon metric-card__icon--blue">${icon('project')}</span><div><span>Active projects</span><strong>${metrics.projects}</strong><small>Across this workspace</small></div></article>
        <article class="metric-card"><span class="metric-card__icon metric-card__icon--purple">${icon('backlog')}</span><div><span>Open issues</span><strong>${metrics.openIssues}</strong><small>Waiting for completion</small></div></article>
        <article class="metric-card"><span class="metric-card__icon metric-card__icon--green">${icon('check')}</span><div><span>Completed</span><strong>${metrics.completedIssues}</strong><small>All-time resolved</small></div></article>
        <article class="metric-card"><span class="metric-card__icon metric-card__icon--orange">${icon('sprint')}</span><div><span>Active sprints</span><strong>${metrics.activeSprints}</strong><small>${activeSprints[0] ? escapeHtml(activeSprints[0].name) : 'No sprint running'}</small></div></article>
      </section>
      <div class="dashboard-grid">
        <section class="panel panel--issues">
          <div class="panel__header"><div><h2>Recently updated</h2><p>Issues that moved most recently</p></div><button class="link-button" data-open-search>View all</button></div>
          <div class="issue-list">
            ${recentIssues.map((issue) => `<button class="issue-row" type="button" data-issue="${issue.id}">
              ${issueIcon(issue.issue_type_name)}
              <span class="issue-row__key">${escapeHtml(issue.issue_key)}</span>
              <span class="issue-row__title">${escapeHtml(issue.title)}</span>
              ${statusPill(issue.status_name, issue.status_category)}
              ${priorityIcon(issue.priority_name)}
              ${avatar(findUser(issue.assignee_id), 'xs')}
              <time>${relativeTime(issue.updated_at)}</time>
            </button>`).join('') || emptyState('No issues yet', 'Create your first issue to start planning.')}
          </div>
        </section>
        <section class="panel">
          <div class="panel__header"><div><h2>Work by status</h2><p>Current issue distribution</p></div></div>
          <div class="status-chart">
            ${statusSummary.map((item) => `<div class="status-chart__row"><span>${statusPill(item.name, item.category)}</span><div><i style="width:${Math.max(5, item.count / maximum * 100)}%;--bar-color:${item.color || '#0c66e4'}"></i></div><strong>${item.count}</strong></div>`).join('')}
          </div>
        </section>
        <section class="panel">
          <div class="panel__header"><div><h2>Projects</h2><p>Jump back into your work</p></div><a href="/projects" data-route class="link-button">All projects</a></div>
          <div class="project-mini-grid">
            ${projects.filter((project) => !project.is_archived).slice(0, 4).map((project) => {
              const board = findBoard(project.id);
              return `<a class="project-mini" href="${board ? `/projects/${project.project_key}/board` : '/projects'}" data-route>
                <span class="project-avatar project-avatar--lg" style="--project-color:${colorFromText(project.project_key)}">${escapeHtml(project.project_key.slice(0, 2))}</span>
                <span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.project_key)} · ${board ? escapeHtml(board.board_type) : 'No board'}</small></span>${icon('chevron', 16)}
              </a>`;
            }).join('') || emptyState('No projects', 'Create a project to get started.')}
          </div>
        </section>
        <section class="panel">
          <div class="panel__header"><div><h2>Activity</h2><p>Latest changes across projects</p></div></div>
          <div class="activity-list">
            ${recentActivity.map((event) => {
              const actor = findUser(event.actor_id);
              const labels = { issue_created: 'created', status_changed: 'changed status on', field_updated: 'updated', comment_added: 'commented on', assignee_changed: 'reassigned' };
              return `<button type="button" data-issue-key="${escapeHtml(event.issue_key)}" class="activity-item">${avatar(actor, 'xs')}<span><strong>${escapeHtml(actor?.name || 'Automation')}</strong> ${escapeHtml(labels[event.event_type] || event.event_type.replaceAll('_', ' '))} <b>${escapeHtml(event.issue_key)}</b><small>${relativeTime(event.created_at)}</small></span></button>`;
            }).join('') || '<p class="muted">No recent activity.</p>'}
          </div>
        </section>
      </div>
    </div>`;
}

function renderProjects() {
  state.route = { name: 'projects' };
  shell();
  const projects = state.bootstrap.projects;
  document.querySelector('#main-content').innerHTML = `<div class="page">
    ${pageHeader({ eyebrow: 'Projects', title: 'Projects', description: 'Plan, track, and deliver work across your teams.', actions: '<button class="button button--primary" type="button" data-create-project>Create project</button>' })}
    <div class="project-grid">
      ${projects.map((project) => {
        const board = findBoard(project.id);
        const lead = findUser(project.lead_user_id);
        return `<article class="project-card${project.is_archived ? ' is-archived' : ''}">
          <div class="project-card__top"><span class="project-avatar project-avatar--xl" style="--project-color:${colorFromText(project.project_key)}">${escapeHtml(project.project_key.slice(0, 2))}</span><button class="icon-button" type="button" aria-label="Project actions">${icon('more')}</button></div>
          <div><span class="eyebrow">${escapeHtml(project.project_key)}${project.is_archived ? ' · Archived' : ''}</span><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.description || 'No project description yet.')}</p></div>
          <div class="project-card__meta"><span>${avatar(lead, 'xs')} ${escapeHtml(lead?.name || 'No lead')}</span><span>${board ? `${escapeHtml(board.board_type)} board` : 'No board'}</span></div>
          <div class="project-card__actions">${board ? `<a class="button" href="/projects/${encodeURIComponent(project.project_key)}/board" data-route>Open board</a><a class="button button--subtle" href="/projects/${encodeURIComponent(project.project_key)}/backlog" data-route>Backlog</a>` : '<span class="muted">Board not configured</span>'}</div>
        </article>`;
      }).join('') || emptyState('No projects yet', 'Create a project with its own workflow and board.', '<button class="button button--primary" data-create-project>Create project</button>')}
    </div>
  </div>`;
}

function projectTabs(project, active) {
  return `<a href="/projects/${project.project_key}/board" data-route class="${active === 'board' ? 'is-active' : ''}">${icon('board', 16)} Board</a><a href="/projects/${project.project_key}/backlog" data-route class="${active === 'backlog' ? 'is-active' : ''}">${icon('backlog', 16)} Backlog & sprints</a>`;
}

async function renderBoard(projectKey) {
  const project = findProject(projectKey);
  state.route = { name: 'board', projectKey };
  shell();
  if (!project) return renderNotFound('Project not found');
  const boardInfo = findBoard(project.id);
  if (!boardInfo) return renderNotFound('This project has no board');
  loadingPage('Loading board…');
  try {
    state.board = await tool('get_board', { board_id: boardInfo.id });
    const board = state.board;
    const issuesByStatus = new Map();
    board.issues.forEach((issue) => {
      const bucket = issuesByStatus.get(issue.status_id) || [];
      bucket.push(issue);
      issuesByStatus.set(issue.status_id, bucket);
    });
    const activeSprint = board.sprints.find((sprint) => sprint.status === 'active');
    const sprintIssueIds = activeSprint ? new Set((await tool('list_records', { entity: 'sprint_issues', filters: { sprint_id: activeSprint.id }, limit: 1000 })).records.map((item) => item.issue_id)) : null;
    document.querySelector('#main-content').innerHTML = `<div class="page page--board">
      ${pageHeader({
        eyebrow: `${escapeHtml(project.name)} / ${escapeHtml(board.board.name)}`, title: activeSprint?.name || board.board.name,
        description: activeSprint?.goal || `${board.board.board_type === 'scrum' ? 'Scrum' : 'Kanban'} board for ${project.name}`,
        actions: '<button class="button" type="button" data-board-refresh>Refresh</button><button class="button button--primary" type="button" data-create-issue>Create issue</button>',
        tabs: projectTabs(project, 'board')
      })}
      <div class="board-toolbar">
        <div class="avatar-stack">${state.bootstrap.users.filter((user) => user.is_active).slice(0, 4).map((user) => avatar(user, 'xs')).join('')}</div>
        <label class="inline-search">${icon('search', 16)}<input type="search" placeholder="Filter board" data-board-filter></label>
        <span class="board-toolbar__spacer"></span><span class="muted small">${board.issues.length} issues</span>
      </div>
      <div class="board" data-board>
        ${board.columns.map((column) => {
          const statusIds = new Set(column.statuses.map((status) => status.id));
          const cards = board.issues.filter((issue) => statusIds.has(issue.status_id) && (!sprintIssueIds || sprintIssueIds.has(issue.id)));
          return `<section class="board-column" data-column data-status="${column.statuses[0]?.name || ''}">
            <header><h2>${escapeHtml(column.name)} <span>${cards.length}</span></h2>${column.wip_limit ? `<small>WIP ${cards.length}/${column.wip_limit}</small>` : ''}</header>
            <div class="board-column__cards" data-dropzone>
              ${cards.map((issue) => boardCard(issue)).join('')}
              <button class="quick-create" type="button" data-create-issue data-status="${escapeHtml(column.statuses[0]?.name || '')}">${icon('plus', 15)} Create issue</button>
            </div>
          </section>`;
        }).join('')}
      </div>
    </div>`;
    bindBoardInteractions();
  } catch (error) {
    renderError(error);
  }
}

function boardCard(issue) {
  const user = findUser(issue.assignee_id);
  const labels = issue.labels || [];
  return `<article class="board-card" draggable="true" data-card data-issue="${issue.id}" data-title="${escapeHtml(issue.title.toLowerCase())}">
    ${labels.length ? `<div class="label-strip">${labels.slice(0, 3).map((label) => `<i style="--label-color:${label.color || '#0c66e4'}" title="${escapeHtml(label.name)}"></i>`).join('')}</div>` : ''}
    <button type="button" data-issue="${issue.id}" class="board-card__title">${escapeHtml(issue.title)}</button>
    <div class="board-card__meta"><span>${issueIcon(issue.issue_type_name)}<b>${escapeHtml(issue.issue_key)}</b></span><span>${priorityIcon(issue.priority_name)}${issue.story_points != null ? `<em>${issue.story_points}</em>` : ''}${avatar(user, 'xs')}</span></div>
  </article>`;
}

function bindBoardInteractions() {
  let draggedId = null;
  document.querySelectorAll('[data-card]').forEach((card) => {
    card.addEventListener('dragstart', () => { draggedId = card.dataset.issue; card.classList.add('is-dragging'); });
    card.addEventListener('dragend', () => { card.classList.remove('is-dragging'); document.querySelectorAll('.is-dragover').forEach((item) => item.classList.remove('is-dragover')); });
  });
  document.querySelectorAll('[data-dropzone]').forEach((zone) => {
    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
    zone.addEventListener('drop', async (event) => {
      event.preventDefault();
      const status = zone.closest('[data-status]').dataset.status;
      if (!draggedId || !status) return;
      try {
        await perform(() => tool('transition_issue', { issue: draggedId, status }), `Moved issue to ${status}`, false);
        await renderBoard(state.route.projectKey);
      } catch { /* toast already shown */ }
    });
  });
}

async function renderBacklog(projectKey, filters = {}) {
  const project = findProject(projectKey);
  state.route = { name: 'backlog', projectKey };
  shell();
  if (!project) return renderNotFound('Project not found');
  const boardInfo = findBoard(project.id);
  if (!boardInfo) return renderNotFound('This project has no board');
  loadingPage('Loading backlog…');
  try {
    const [issueResult, board] = await Promise.all([
      tool('search_issues', { project: project.id, ...filters, limit: 1000 }),
      tool('get_board', { board_id: boardInfo.id })
    ]);
    const issues = issueResult.records;
    state.backlog = issues;
    state.board = board;
    const sprintMappings = (await tool('list_records', { entity: 'sprint_issues', filters: {}, limit: 1000 })).records;
    const mappingBySprint = new Map();
    sprintMappings.forEach((mapping) => {
      const items = mappingBySprint.get(mapping.sprint_id) || new Set();
      items.add(mapping.issue_id);
      mappingBySprint.set(mapping.sprint_id, items);
    });
    const assignedIds = new Set(sprintMappings.filter((mapping) => board.sprints.some((sprint) => sprint.id === mapping.sprint_id)).map((mapping) => mapping.issue_id));
    document.querySelector('#main-content').innerHTML = `<div class="page">
      ${pageHeader({
        eyebrow: `${escapeHtml(project.name)} / Planning`, title: 'Backlog & sprints', description: 'Prioritize work and plan upcoming iterations.',
        actions: '<button class="button" type="button" data-create-sprint>Create sprint</button><button class="button button--primary" type="button" data-create-issue>Create issue</button>',
        tabs: projectTabs(project, 'backlog')
      })}
      <form class="filter-bar" data-backlog-filters>
        <label class="inline-search">${icon('search', 16)}<input type="search" name="text" value="${escapeHtml(filters.text || '')}" placeholder="Search backlog"></label>
        <select name="status"><option value="">All statuses</option>${state.bootstrap.statuses.map((status) => `<option ${filters.status === status.name ? 'selected' : ''}>${escapeHtml(status.name)}</option>`).join('')}</select>
        <select name="priority"><option value="">All priorities</option>${state.bootstrap.priorities.map((priority) => `<option ${filters.priority === priority.name ? 'selected' : ''}>${escapeHtml(priority.name)}</option>`).join('')}</select>
        <select name="issue_type"><option value="">All types</option>${state.bootstrap.issue_types.map((type) => `<option ${filters.issue_type === type.name ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}</select>
        <button class="button button--compact" type="submit">${icon('filter', 15)} Filter</button>
      </form>
      <div class="sprint-list">
        ${board.sprints.sort((a, b) => ({ active: 0, future: 1, closed: 2 })[a.status] - ({ active: 0, future: 1, closed: 2 })[b.status]).map((sprint) => sprintSection(sprint, issues.filter((issue) => mappingBySprint.get(sprint.id)?.has(issue.id)))).join('')}
        ${sprintSection({ id: '', name: 'Backlog', goal: 'Issues not currently assigned to a sprint', status: 'backlog' }, issues.filter((issue) => !assignedIds.has(issue.id)))}
      </div>
    </div>`;
  } catch (error) { renderError(error); }
}

function sprintSection(sprint, issues) {
  return `<section class="sprint-panel ${sprint.status === 'closed' ? 'is-collapsed' : ''}" data-sprint-panel>
    <header><button type="button" data-toggle-sprint>${icon('chevron', 16)}</button><div><h2>${escapeHtml(sprint.name)} <span>${issues.length} issues</span></h2><p>${escapeHtml(sprint.goal || '')}</p></div><span class="sprint-state sprint-state--${sprint.status}">${escapeHtml(sprint.status)}</span><div class="sprint-actions">
      ${sprint.status === 'future' ? `<button class="button button--compact" type="button" data-start-sprint="${sprint.id}">Start sprint</button>` : ''}
      ${sprint.status === 'active' ? `<button class="button button--compact" type="button" data-close-sprint="${sprint.id}">Complete sprint</button>` : ''}
    </div></header>
    <div class="sprint-panel__body">
      <div class="backlog-table__header"><span>Type</span><span>Key</span><span>Summary</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Points</span><span></span></div>
      ${issues.map((issue) => `<div class="backlog-row">
        <span>${issueIcon(issue.issue_type_name)}</span><button type="button" data-issue="${issue.id}" class="issue-key">${escapeHtml(issue.issue_key)}</button><button type="button" data-issue="${issue.id}" class="backlog-row__title">${escapeHtml(issue.title)}</button>
        <span>${statusPill(issue.status_name, issue.status_category)}</span><span>${priorityIcon(issue.priority_name)}</span><span>${avatar(findUser(issue.assignee_id), 'xs')}</span><span>${issue.story_points ?? '—'}</span>
        <button class="icon-button" type="button" data-add-to-sprint="${issue.id}" aria-label="Add to sprint">${icon('more')}</button>
      </div>`).join('') || '<div class="backlog-empty">No issues in this section.</div>'}
    </div>
  </section>`;
}

async function renderAgents() {
  state.route = { name: 'agents' };
  shell();
  loadingPage('Loading agent activity…');
  try {
    const [runsResult, artifactsResult] = await Promise.all([
      tool('list_records', { entity: 'agent_runs', filters: {}, limit: 1000 }),
      tool('list_records', { entity: 'agent_artifacts', filters: {}, limit: 1000 })
    ]);
    const agentIds = new Set(state.bootstrap.agents.map((agent) => agent.id));
    const runs = runsResult.records.filter((run) => agentIds.has(run.agent_id)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const artifacts = artifactsResult.records.filter((artifact) => runs.some((run) => run.id === artifact.agent_run_id));
    const counts = Object.fromEntries(['queued', 'running', 'completed', 'failed', 'cancelled'].map((status) => [status, runs.filter((run) => run.status === status).length]));
    document.querySelector('#main-content').innerHTML = `<div class="page">
      ${pageHeader({ eyebrow: 'Automation', title: 'Agent activity', description: 'Monitor autonomous work, tool use, and generated artifacts.', actions: '<a class="button" href="/data?entity=agents" data-route>Manage agents</a>' })}
      <div class="agent-summary">
        ${['running', 'queued', 'completed', 'failed'].map((status) => `<div><span class="run-dot run-dot--${status}"></span><strong>${counts[status]}</strong><small>${status}</small></div>`).join('')}
      </div>
      <div class="agents-layout">
        <section class="panel"><div class="panel__header"><div><h2>Agents</h2><p>Configured for this workspace</p></div></div>
          <div class="agent-list">${state.bootstrap.agents.map((agent) => `<article class="agent-card"><span class="agent-icon">${icon('robot', 20)}</span><div><h3>${escapeHtml(agent.name)}</h3><p>${escapeHtml(agent.description || 'No description')}</p><small>${escapeHtml(agent.model || 'No model')} · ${agent.is_active ? 'Active' : 'Paused'}</small></div><span class="lozenge ${agent.is_active ? 'lozenge--success' : ''}">${agent.is_active ? 'Enabled' : 'Disabled'}</span></article>`).join('') || emptyState('No agents', 'Create one from the data explorer.')}</div>
        </section>
        <section class="panel"><div class="panel__header"><div><h2>Artifacts</h2><p>Outputs created by agent runs</p></div><span class="count-badge">${artifacts.length}</span></div>
          <div class="artifact-list">${artifacts.map((artifact) => `<article><span>${icon('project', 17)}</span><div><strong>${escapeHtml(artifact.name)}</strong><small>${escapeHtml(artifact.artifact_type)} · ${relativeTime(artifact.created_at)}</small></div></article>`).join('') || '<p class="muted">No artifacts generated.</p>'}</div>
        </section>
      </div>
      <section class="panel run-panel"><div class="panel__header"><div><h2>Recent runs</h2><p>Execution history across all configured agents</p></div></div>
        <div class="data-table"><div class="data-table__head agent-run-grid"><span>Status</span><span>Agent</span><span>Issue</span><span>Started</span><span>Duration</span><span>Result</span></div>
        ${runs.map((run) => {
          const agent = state.bootstrap.agents.find((item) => item.id === run.agent_id);
          const issue = state.bootstrap.recentIssues.find((item) => item.id === run.issue_id);
          const duration = run.started_at && run.completed_at ? `${Math.max(1, Math.round((new Date(run.completed_at) - new Date(run.started_at)) / 1000))}s` : '—';
          return `<button class="data-table__row agent-run-grid" type="button" data-run="${run.id}"><span><i class="run-dot run-dot--${run.status}"></i>${escapeHtml(run.status)}</span><strong>${escapeHtml(agent?.name || 'Unknown agent')}</strong><span>${escapeHtml(issue?.issue_key || '—')}</span><span>${formatDate(run.started_at)}</span><span>${duration}</span><span>${run.error ? escapeHtml(run.error.message || run.error.reason || 'Failed') : run.output ? 'Output ready' : '—'}</span></button>`;
        }).join('')}</div>
      </section>
    </div>`;
  } catch (error) { renderError(error); }
}

async function ensureSchema() {
  if (!state.schema) state.schema = await tool('get_schema');
  return state.schema;
}

async function renderData(entity = state.dataEntity) {
  state.route = { name: 'data' };
  state.dataEntity = entity;
  shell();
  loadingPage('Loading data explorer…');
  try {
    const schema = await ensureSchema();
    const entities = schema.entities;
    if (!entities[entity]) entity = Object.keys(entities)[0];
    state.dataEntity = entity;
    const result = await tool('list_records', { entity, filters: {}, limit: 250 });
    state.dataRecords = result.records;
    const fields = Object.keys(entities[entity].fields);
    const displayFields = fields.slice(0, 7);
    document.querySelector('#main-content').innerHTML = `<div class="page page--data">
      ${pageHeader({ eyebrow: 'Advanced', title: 'Data explorer', description: 'Inspect and manage every entity exposed by the MCP schema.', actions: '<button class="button button--primary" type="button" data-create-record>Create record</button>' })}
      <div class="data-explorer">
        <aside class="entity-nav"><label>${icon('search', 15)}<input type="search" placeholder="Filter entities" data-entity-filter></label><div data-entity-list>${Object.keys(entities).map((name) => `<button type="button" class="${name === entity ? 'is-active' : ''}" data-entity="${name}"><span>${escapeHtml(name.replaceAll('_', ' '))}</span><small>${Object.keys(entities[name].fields).length}</small></button>`).join('')}</div></aside>
        <section class="entity-content">
          <div class="entity-content__header"><div><h2>${escapeHtml(entity.replaceAll('_', ' '))}</h2><p>${state.dataRecords.length} records · ${fields.length} fields</p></div><button class="button button--compact" type="button" data-data-refresh>Refresh</button></div>
          <div class="schema-strip">${fields.slice(0, 10).map((field) => `<span><b>${escapeHtml(field)}</b><small>${escapeHtml(entities[entity].fields[field].type)}</small></span>`).join('')}</div>
          <div class="raw-table-wrap"><table class="raw-table"><thead><tr>${displayFields.map((field) => `<th>${escapeHtml(field)}</th>`).join('')}<th></th></tr></thead><tbody>
            ${state.dataRecords.map((record, index) => `<tr>${displayFields.map((field) => `<td title="${escapeHtml(compactJson(record[field]))}">${escapeHtml(compactJson(record[field]))}</td>`).join('')}<td><button class="icon-button" type="button" data-record-index="${index}" aria-label="View record">${icon('more', 17)}</button></td></tr>`).join('') || `<tr><td colspan="${displayFields.length + 1}"><div class="backlog-empty">No records in this entity.</div></td></tr>`}
          </tbody></table></div>
        </section>
      </div>
    </div>`;
  } catch (error) { renderError(error); }
}

function renderNotFound(message) {
  document.querySelector('#main-content').innerHTML = `<div class="page">${emptyState(message, 'Choose another destination from the navigation.', '<a class="button" href="/" data-route>Go home</a>')}</div>`;
}

function renderError(error) {
  document.querySelector('#main-content').innerHTML = `<div class="page">${emptyState('Something went wrong', error.message, '<button class="button" onclick="location.reload()">Try again</button>')}</div>`;
}

async function openIssue(reference) {
  setBusy(true);
  try {
    const issue = await tool('get_issue', { issue: reference });
    state.selectedIssue = issue;
    const users = state.bootstrap.users;
    const project = findProject(issue.project_id);
    modal({
      title: issue.title,
      eyebrow: `${issue.issue_key} · ${issue.issue_type_name}`,
      size: 'drawer',
      body: `<div class="issue-detail">
        <div class="issue-detail__main">
          <form data-issue-form>
            <input type="hidden" name="issue" value="${issue.id}">
            <label class="field"><span>Summary</span><input name="title" value="${escapeHtml(issue.title)}" required></label>
            <label class="field"><span>Description</span><textarea name="description" rows="6" placeholder="Add a description…">${escapeHtml(issue.description || '')}</textarea></label>
            <div class="form-grid form-grid--3">
              <label class="field"><span>Assignee</span><select name="assignee_id"><option value="">Unassigned</option>${users.map((user) => `<option value="${user.id}" ${user.id === issue.assignee_id ? 'selected' : ''}>${escapeHtml(user.name || user.email)}</option>`).join('')}</select></label>
              <label class="field"><span>Priority</span><select name="priority_id"><option value="">None</option>${state.bootstrap.priorities.map((priority) => `<option value="${priority.id}" ${priority.id === issue.priority_id ? 'selected' : ''}>${escapeHtml(priority.name)}</option>`).join('')}</select></label>
              <label class="field"><span>Due date</span><input type="date" name="due_date" value="${escapeHtml(issue.due_date || '')}"></label>
              <label class="field"><span>Story points</span><input type="number" step="0.5" name="story_points" value="${issue.story_points ?? ''}"></label>
              <label class="field"><span>Remaining minutes</span><input type="number" name="remaining_estimate_minutes" value="${issue.remaining_estimate_minutes ?? ''}"></label>
              <label class="field"><span>Team</span><select name="team_id"><option value="">No team</option>${state.bootstrap.teams.map((team) => `<option value="${team.id}" ${team.id === issue.team_id ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('')}</select></label>
            </div>
            <div class="form-actions"><button class="button button--primary" type="submit">Save changes</button></div>
          </form>
          <section class="issue-section"><h3>${icon('comment', 17)} Activity</h3>
            <form class="comment-form" data-comment-form><input type="hidden" name="issue" value="${issue.id}"><textarea name="body" rows="3" placeholder="Add a comment…" required></textarea><div><span class="muted small">Comments are added to issue history.</span><button class="button button--primary button--compact" type="submit">Comment</button></div></form>
            <div class="comment-list">${issue.comments.slice().reverse().map((comment) => { const author = findUser(comment.author_id); return `<article>${avatar(author, 'sm')}<div><p><strong>${escapeHtml(author?.name || 'Unknown user')}</strong><time>${relativeTime(comment.created_at)}</time></p><div>${escapeHtml(comment.body)}</div></div></article>`; }).join('') || '<p class="muted">No comments yet.</p>'}</div>
          </section>
        </div>
        <aside class="issue-detail__side">
          <label class="field"><span>Status</span><select data-issue-status data-issue-id="${issue.id}">${state.bootstrap.statuses.map((status) => `<option value="${escapeHtml(status.name)}" ${status.id === issue.status_id ? 'selected' : ''}>${escapeHtml(status.name)}</option>`).join('')}</select></label>
          <div class="detail-group"><span>Reporter</span><div>${avatar(findUser(issue.reporter_id), 'xs')} ${escapeHtml(findUser(issue.reporter_id)?.name || 'Unknown')}</div></div>
          <div class="detail-group"><span>Project</span><div><span class="project-avatar project-avatar--tiny" style="--project-color:${colorFromText(project?.project_key)}">${escapeHtml(project?.project_key?.slice(0, 2) || '')}</span>${escapeHtml(project?.name || '')}</div></div>
          <div class="detail-group"><span>Labels</span><div class="tag-list">${issue.labels.map((label) => `<span style="--tag-color:${label.color || '#44546f'}">${escapeHtml(label.name)}</span>`).join('') || '<small>None</small>'}</div></div>
          <div class="detail-group"><span>Created</span><div>${formatDate(issue.created_at, { dateOnly: true })}</div></div>
          <div class="detail-group"><span>Updated</span><div>${relativeTime(issue.updated_at)}</div></div>
          <div class="history"><h3>History</h3>${issue.events.slice().reverse().slice(0, 8).map((event) => `<div><i></i><span>${escapeHtml(event.event_type.replaceAll('_', ' '))}<small>${relativeTime(event.created_at)}</small></span></div>`).join('')}</div>
        </aside>
      </div>`
    });
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(false); }
}

function openCreateIssue(defaults = {}) {
  const projects = state.bootstrap.projects.filter((project) => !project.is_archived);
  const routeProject = state.route.projectKey ? findProject(state.route.projectKey) : null;
  const selectedProject = routeProject || projects[0];
  if (!projects.length) return toast('Create a project before adding issues.', 'error');
  modal({
    title: 'Create issue', eyebrow: 'New work item', size: 'wide',
    body: `<form id="create-issue-form"><div class="form-grid form-grid--2">
      <label class="field"><span>Project</span><select name="project" required>${projects.map((project) => `<option value="${project.id}" ${project.id === selectedProject?.id ? 'selected' : ''}>${escapeHtml(project.project_key)} · ${escapeHtml(project.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Issue type</span><select name="issue_type">${state.bootstrap.issue_types.map((type) => `<option ${type.name === 'Task' ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}</select></label>
    </div><label class="field"><span>Summary</span><input name="title" placeholder="What needs to be done?" required></label>
    <label class="field"><span>Description</span><textarea name="description" rows="5" placeholder="Add context, acceptance criteria, or links…"></textarea></label>
    <div class="form-grid form-grid--3"><label class="field"><span>Status</span><select name="status"><option value="">Default status</option>${state.bootstrap.statuses.map((status) => `<option ${defaults.status === status.name ? 'selected' : ''}>${escapeHtml(status.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Priority</span><select name="priority">${state.bootstrap.priorities.map((priority) => `<option ${priority.name === 'Medium' ? 'selected' : ''}>${escapeHtml(priority.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Assignee</span><select name="assignee_id"><option value="">Unassigned</option>${state.bootstrap.users.filter((user) => user.is_active).map((user) => `<option value="${user.id}">${escapeHtml(user.name || user.email)}</option>`).join('')}</select></label>
      <label class="field"><span>Story points</span><input name="story_points" type="number" step="0.5" min="0"></label><label class="field"><span>Due date</span><input name="due_date" type="date"></label><label class="field"><span>Labels</span><input name="labels" placeholder="launch, frontend"></label>
    </div></form>`,
    footer: '<button class="button" type="button" data-close-modal>Cancel</button><button class="button button--primary" type="submit" form="create-issue-form">Create issue</button>'
  });
}

function openCreateProject() {
  modal({ title: 'Create project', eyebrow: state.bootstrap.organization.name, size: 'wide', body: `<form id="create-project-form">
    <label class="field"><span>Name</span><input name="name" placeholder="e.g. Customer portal" required></label>
    <div class="form-grid form-grid--2"><label class="field"><span>Key</span><input name="project_key" maxlength="20" placeholder="PORTAL" required></label><label class="field"><span>Project lead</span><select name="lead_user_id"><option value="">No lead</option>${state.bootstrap.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name || user.email)}</option>`).join('')}</select></label></div>
    <label class="field"><span>Description</span><textarea name="description" rows="4" placeholder="What is this project for?"></textarea></label>
    <fieldset class="choice-group"><legend>Board type</legend><label><input type="radio" name="board_type" value="scrum" checked><span>${icon('sprint')}<b>Scrum</b><small>Plan work in time-boxed sprints.</small></span></label><label><input type="radio" name="board_type" value="kanban"><span>${icon('board')}<b>Kanban</b><small>Manage a continuous flow of work.</small></span></label></fieldset>
  </form>`, footer: '<button class="button" type="button" data-close-modal>Cancel</button><button class="button button--primary" type="submit" form="create-project-form">Create project</button>' });
}

function openSetupWorkspace() {
  modal({ title: 'Create workspace', eyebrow: 'Workspace setup', size: 'wide', body: `<form id="workspace-form"><label class="field"><span>Workspace name</span><input name="organization_name" placeholder="Your company or team" required></label><div class="form-grid form-grid--2"><label class="field"><span>Admin name</span><input name="admin_name" placeholder="Alex Rivera"></label><label class="field"><span>Admin email</span><input type="email" name="admin_email" placeholder="alex@example.com"></label></div><div class="info-box">${icon('check', 18)}<span>We’ll configure issue types, priorities, statuses, and a default workflow automatically.</span></div></form>`, footer: '<button class="button" type="button" data-close-modal>Cancel</button><button class="button button--primary" type="submit" form="workspace-form">Create workspace</button>' });
}

function openCreateSprint() {
  const board = findBoard(findProject(state.route.projectKey)?.id);
  if (!board) return toast('This project does not have a board.', 'error');
  modal({ title: 'Create sprint', eyebrow: board.name, body: `<form id="sprint-form"><input type="hidden" name="board_id" value="${board.id}"><label class="field"><span>Name</span><input name="name" placeholder="Sprint 25" required></label><label class="field"><span>Goal</span><textarea name="goal" rows="3" placeholder="What should the team accomplish?"></textarea></label><div class="form-grid form-grid--2"><label class="field"><span>Start date</span><input type="datetime-local" name="start_at"></label><label class="field"><span>End date</span><input type="datetime-local" name="end_at"></label></div></form>`, footer: '<button class="button" data-close-modal type="button">Cancel</button><button class="button button--primary" type="submit" form="sprint-form">Create sprint</button>' });
}

function openSprintPicker(issueId) {
  const sprints = state.board?.sprints.filter((sprint) => sprint.status !== 'closed') || [];
  if (!sprints.length) return toast('Create a future sprint first.', 'error');
  modal({ title: 'Add issue to sprint', body: `<form id="sprint-picker-form"><input type="hidden" name="issue" value="${issueId}"><label class="field"><span>Sprint</span><select name="sprint_id">${sprints.map((sprint) => `<option value="${sprint.id}">${escapeHtml(sprint.name)} · ${escapeHtml(sprint.status)}</option>`).join('')}</select></label></form>`, footer: '<button class="button" data-close-modal type="button">Cancel</button><button class="button button--primary" type="submit" form="sprint-picker-form">Add to sprint</button>' });
}

function openSearch() {
  modal({ title: 'Search issues', size: 'wide', body: `<div class="search-dialog"><label>${icon('search', 20)}<input type="search" data-global-search-input placeholder="Search by summary or description" autocomplete="off"></label><div data-search-results>${emptyState('Find anything', 'Start typing to search issues across this workspace.')}</div></div>` });
}

async function openRun(runId) {
  try {
    const run = await tool('get_record', { entity: 'agent_runs', id: runId });
    const [steps, artifacts] = await Promise.all([
      tool('list_records', { entity: 'agent_steps', filters: { agent_run_id: runId }, limit: 100 }),
      tool('list_records', { entity: 'agent_artifacts', filters: { agent_run_id: runId }, limit: 100 })
    ]);
    const agent = state.bootstrap.agents.find((item) => item.id === run.agent_id);
    modal({ title: `${agent?.name || 'Agent'} run`, eyebrow: run.status, size: 'wide', body: `<div class="run-detail"><div class="run-detail__summary"><div><span>Status</span><b><i class="run-dot run-dot--${run.status}"></i>${escapeHtml(run.status)}</b></div><div><span>Started</span><b>${formatDate(run.started_at, { dateOnly: true })}</b></div><div><span>Steps</span><b>${steps.records.length}</b></div><div><span>Artifacts</span><b>${artifacts.records.length}</b></div></div><h3>Execution</h3><div class="step-timeline">${steps.records.sort((a, b) => a.step_number - b.step_number).map((step) => `<article><i class="run-dot run-dot--${step.status}"></i><div><strong>${step.step_number}. ${escapeHtml(step.action_type.replaceAll('_', ' '))}</strong><span>${escapeHtml(step.status)}</span><pre>${escapeHtml(JSON.stringify(step.output || step.input || {}, null, 2))}</pre></div></article>`).join('') || '<p class="muted">No steps recorded.</p>'}</div>${run.error ? `<div class="error-box"><strong>${escapeHtml(run.error.code || 'Run failed')}</strong><p>${escapeHtml(run.error.message || run.error.reason || '')}</p></div>` : ''}<h3>Output</h3><pre class="json-view">${escapeHtml(JSON.stringify(run.output || {}, null, 2))}</pre></div>` });
  } catch (error) { toast(error.message, 'error'); }
}

async function openRecord(index, createMode = false) {
  const schema = (await ensureSchema()).entities[state.dataEntity];
  let record = createMode ? {} : state.dataRecords[index];
  if (!createMode && record?.id) record = await tool('get_record', { entity: state.dataEntity, id: record.id });
  const generated = Object.fromEntries(Object.entries(schema.fields).filter(([, definition]) => definition.required && !definition.generated).map(([name, definition]) => [name, definition.type === 'json' ? {} : definition.type === 'boolean' ? false : null]));
  const value = createMode ? generated : record;
  modal({
    title: createMode ? `Create ${state.dataEntity.replaceAll('_', ' ')}` : 'Record details', eyebrow: state.dataEntity, size: 'wide',
    body: `<form id="record-form"><input type="hidden" name="record_index" value="${index ?? ''}"><label class="field"><span>JSON values</span><textarea class="code-editor" name="values" rows="18" spellcheck="false" ${!createMode && !record?.id ? 'readonly' : ''}>${escapeHtml(JSON.stringify(value, null, 2))}</textarea></label><p class="field-hint">${!createMode && !record?.id ? 'This entity uses a composite key. MCP supports listing and creating these records, while UUID-based update and delete are unavailable.' : 'Generated fields such as <code>id</code> and timestamps are filled automatically on create.'}</p></form>`,
    footer: `${!createMode && record?.id ? '<button class="button button--danger button--left" type="button" data-delete-record>Delete</button>' : ''}<button class="button" data-close-modal type="button">${!createMode && !record?.id ? 'Close' : 'Cancel'}</button>${createMode || record?.id ? `<button class="button button--primary" type="submit" form="record-form" data-record-mode="${createMode ? 'create' : 'update'}">${createMode ? 'Create' : 'Save changes'}</button>` : ''}`
  });
}

async function refreshBootstrap() {
  const suffix = state.organizationId ? `?organization_id=${encodeURIComponent(state.organizationId)}` : '';
  state.bootstrap = await request(`/api/bootstrap${suffix}`);
  if (state.bootstrap.organization) {
    state.organizationId = state.bootstrap.organization.id;
    localStorage.setItem('agent-board.organization', state.organizationId);
  }
}

function navigate(pathname, replace = false) {
  const url = new URL(pathname, location.origin);
  if (replace) history.replaceState({}, '', url.pathname + url.search);
  else history.pushState({}, '', url.pathname + url.search);
  renderRoute();
}

function renderRoute() {
  const path = location.pathname;
  const boardMatch = path.match(/^\/projects\/([^/]+)\/board\/?$/);
  const backlogMatch = path.match(/^\/projects\/([^/]+)\/backlog\/?$/);
  if (path === '/' || path === '') return renderDashboard();
  if (path === '/projects') return renderProjects();
  if (boardMatch) return renderBoard(decodeURIComponent(boardMatch[1]));
  if (backlogMatch) return renderBacklog(decodeURIComponent(backlogMatch[1]));
  if (path === '/agents') return renderAgents();
  if (path === '/data') return renderData(new URLSearchParams(location.search).get('entity') || state.dataEntity);
  state.route = { name: 'not-found' };
  shell();
  renderNotFound('Page not found');
}

document.addEventListener('click', async (event) => {
  const routeLink = event.target.closest('[data-route]');
  if (routeLink) { event.preventDefault(); document.body.classList.remove('sidebar-open'); navigate(routeLink.getAttribute('href')); return; }
  if (event.target.closest('[data-close-modal]') && !event.target.closest('[data-modal-panel]')) { closeModal(); return; }
  if (event.target.closest('[data-close-modal]') && event.target.closest('button')) { closeModal(); return; }
  if (event.target.closest('[data-toggle-sidebar]')) { document.body.classList.toggle('sidebar-open'); return; }
  if (event.target.closest('[data-theme-toggle]')) { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('agent-board.theme', state.theme); document.documentElement.dataset.theme = state.theme; shell(); renderRoute(); return; }
  if (event.target.closest('[data-logout]')) {
    try {
      await request('/api/logout', { method: 'POST', body: '{}' });
      state.currentUser = null; state.bootstrap = null; state.schema = null;
      closeModal(); history.replaceState({}, '', '/login'); await init();
    } catch (error) { toast(error.message, 'error'); }
    return;
  }
  if (event.target.closest('[data-create-issue]')) { openCreateIssue({ status: event.target.closest('[data-create-issue]').dataset.status }); return; }
  if (event.target.closest('[data-create-project]')) { openCreateProject(); return; }
  if (event.target.closest('[data-setup-workspace]')) { openSetupWorkspace(); return; }
  if (event.target.closest('[data-open-search]')) { openSearch(); return; }
  if (event.target.closest('[data-create-sprint]')) { openCreateSprint(); return; }
  if (event.target.closest('[data-board-refresh]')) { renderBoard(state.route.projectKey); return; }
  const issueButton = event.target.closest('[data-issue]');
  if (issueButton && !event.target.closest('[data-add-to-sprint]')) { openIssue(issueButton.dataset.issue); return; }
  const keyButton = event.target.closest('[data-issue-key]');
  if (keyButton) { openIssue(keyButton.dataset.issueKey); return; }
  const entityButton = event.target.closest('[data-entity]');
  if (entityButton) { history.replaceState({}, '', `/data?entity=${encodeURIComponent(entityButton.dataset.entity)}`); renderData(entityButton.dataset.entity); return; }
  if (event.target.closest('[data-data-refresh]')) { renderData(state.dataEntity); return; }
  if (event.target.closest('[data-create-record]')) { openRecord(null, true); return; }
  const recordButton = event.target.closest('[data-record-index]');
  if (recordButton) { openRecord(Number(recordButton.dataset.recordIndex)); return; }
  const runButton = event.target.closest('[data-run]');
  if (runButton) { openRun(runButton.dataset.run); return; }
  const toggleSprint = event.target.closest('[data-toggle-sprint]');
  if (toggleSprint) { toggleSprint.closest('[data-sprint-panel]').classList.toggle('is-collapsed'); return; }
  const addSprint = event.target.closest('[data-add-to-sprint]');
  if (addSprint) { openSprintPicker(addSprint.dataset.addToSprint); return; }
  const startSprint = event.target.closest('[data-start-sprint]');
  if (startSprint) { try { await perform(() => tool('start_sprint', { sprint_id: startSprint.dataset.startSprint }), 'Sprint started'); await renderBacklog(state.route.projectKey); } catch {} return; }
  const closeSprint = event.target.closest('[data-close-sprint]');
  if (closeSprint) { if (!confirm('Complete this sprint? The sprint will be marked closed.')) return; try { await perform(() => tool('close_sprint', { sprint_id: closeSprint.dataset.closeSprint }), 'Sprint completed'); await renderBacklog(state.route.projectKey); } catch {} return; }
  if (event.target.closest('[data-delete-record]')) {
    const record = state.dataRecords[Number(formValue(document.querySelector('#record-form'), 'record_index'))];
    if (!record?.id || !confirm(`Delete this ${state.dataEntity} record? Related records may also be removed.`)) return;
    try { await perform(() => tool('delete_record', { entity: state.dataEntity, id: record.id }), 'Record deleted', false); closeModal(); renderData(state.dataEntity); } catch {} return;
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.matches('[data-organization-switch]')) {
    state.organizationId = event.target.value;
    await refreshBootstrap();
    navigate('/', true);
  }
  if (event.target.matches('[data-issue-status]')) {
    const previous = state.selectedIssue?.status_name;
    try {
      await perform(() => tool('transition_issue', { issue: event.target.dataset.issueId, status: event.target.value }), `Moved to ${event.target.value}`);
      closeModal();
      if (state.route.name === 'board') renderBoard(state.route.projectKey); else if (state.route.name === 'backlog') renderBacklog(state.route.projectKey); else renderDashboard();
    } catch { event.target.value = previous; }
  }
});

let searchTimer;
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-board-filter]')) {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll('[data-card]').forEach((card) => { card.hidden = !card.dataset.title.includes(query); });
  }
  if (event.target.matches('[data-entity-filter]')) {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll('[data-entity]').forEach((button) => { button.hidden = !button.textContent.toLowerCase().includes(query); });
  }
  if (event.target.matches('[data-global-search-input]')) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const query = event.target.value.trim();
      const container = document.querySelector('[data-search-results]');
      if (!query) { container.innerHTML = emptyState('Find anything', 'Start typing to search issues across this workspace.'); return; }
      container.innerHTML = '<div class="page-loading page-loading--small"><span class="spinner"></span></div>';
      try {
        const results = (await tool('search_issues', { text: query, limit: 100 })).records;
        const projectIds = new Set(state.bootstrap.projects.map((project) => project.id));
        const scoped = results.filter((issue) => projectIds.has(issue.project_id));
        container.innerHTML = scoped.length ? `<div class="search-results">${scoped.map((issue) => `<button type="button" data-issue="${issue.id}">${issueIcon(issue.issue_type_name)}<span><b>${escapeHtml(issue.title)}</b><small>${escapeHtml(issue.issue_key)} · ${escapeHtml(issue.status_name)}</small></span>${priorityIcon(issue.priority_name)}</button>`).join('')}</div>` : emptyState('No matches', `No issues match “${query}”.`);
      } catch (error) { container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`; }
    }, 250);
  }
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === 'create-issue-form') {
      const args = { project: formValue(form, 'project'), title: formValue(form, 'title'), description: formValue(form, 'description') || undefined, issue_type: formValue(form, 'issue_type'), status: formValue(form, 'status') || undefined, priority: formValue(form, 'priority'), assignee_id: formValue(form, 'assignee_id') || undefined, story_points: formValue(form, 'story_points') ? Number(formValue(form, 'story_points')) : undefined, due_date: formValue(form, 'due_date') || undefined, labels: formValue(form, 'labels') ? formValue(form, 'labels').split(',').map((item) => item.trim()).filter(Boolean) : [] };
      const issue = await perform(() => tool('create_issue', args), 'Issue created'); closeModal();
      if (state.route.name === 'board') await renderBoard(state.route.projectKey); else if (state.route.name === 'backlog') await renderBacklog(state.route.projectKey); else renderDashboard();
      openIssue(issue.id);
    } else if (form.id === 'create-project-form') {
      const args = { organization_id: state.organizationId, project_key: formValue(form, 'project_key').toUpperCase(), name: formValue(form, 'name'), description: formValue(form, 'description') || undefined, lead_user_id: formValue(form, 'lead_user_id') || undefined, board_type: formValue(form, 'board_type'), create_board: true };
      const result = await perform(() => tool('create_project', args), 'Project created'); closeModal(); navigate(`/projects/${result.project.project_key}/board`);
    } else if (form.id === 'workspace-form') {
      const result = await perform(() => tool('setup_workspace', { organization_name: formValue(form, 'organization_name'), admin_name: formValue(form, 'admin_name') || undefined, admin_email: formValue(form, 'admin_email') || undefined }), 'Workspace created', false);
      state.organizationId = result.organization.id; await refreshBootstrap(); closeModal(); navigate('/', true);
    } else if (form.id === 'sprint-form') {
      await perform(() => tool('create_sprint', { board_id: formValue(form, 'board_id'), name: formValue(form, 'name'), goal: formValue(form, 'goal') || undefined, start_at: formValue(form, 'start_at') ? new Date(formValue(form, 'start_at')).toISOString() : undefined, end_at: formValue(form, 'end_at') ? new Date(formValue(form, 'end_at')).toISOString() : undefined }), 'Sprint created'); closeModal(); renderBacklog(state.route.projectKey);
    } else if (form.id === 'sprint-picker-form') {
      await perform(() => tool('add_issues_to_sprint', { sprint_id: formValue(form, 'sprint_id'), issues: [formValue(form, 'issue')] }), 'Issue added to sprint', false); closeModal(); renderBacklog(state.route.projectKey);
    } else if (form.matches('[data-backlog-filters]')) {
      const filters = Object.fromEntries(['text', 'status', 'priority', 'issue_type'].map((name) => [name, formValue(form, name)]).filter(([, value]) => value));
      renderBacklog(state.route.projectKey, filters);
    } else if (form.matches('[data-issue-form]')) {
      const nullable = (name) => formValue(form, name) || null;
      const numeric = (name) => formValue(form, name) === '' ? null : Number(formValue(form, name));
      await perform(() => tool('update_issue', { issue: formValue(form, 'issue'), values: { title: formValue(form, 'title'), description: nullable('description'), assignee_id: nullable('assignee_id'), priority_id: nullable('priority_id'), due_date: nullable('due_date'), story_points: numeric('story_points'), remaining_estimate_minutes: numeric('remaining_estimate_minutes'), team_id: nullable('team_id') } }), 'Issue updated'); closeModal();
      if (state.route.name === 'board') renderBoard(state.route.projectKey); else if (state.route.name === 'backlog') renderBacklog(state.route.projectKey); else renderDashboard();
    } else if (form.matches('[data-comment-form]')) {
      await perform(() => tool('add_comment', { issue: formValue(form, 'issue'), body: formValue(form, 'body'), author_id: state.currentUser?.id }), 'Comment added', false); const issueId = formValue(form, 'issue'); closeModal(); openIssue(issueId);
    } else if (form.id === 'record-form') {
      const values = JSON.parse(formValue(form, 'values'));
      const mode = event.submitter?.dataset.recordMode;
      if (mode === 'create') await perform(() => tool('create_record', { entity: state.dataEntity, values }), 'Record created', false);
      else {
        const record = state.dataRecords[Number(formValue(form, 'record_index'))];
        const schema = state.schema.entities[state.dataEntity];
        const writable = Object.fromEntries(Object.entries(values).filter(([field]) => !['id', 'created_at', 'updated_at'].includes(field) && schema.fields[field]));
        await perform(() => tool('update_record', { entity: state.dataEntity, id: record.id, values: writable }), 'Record updated', false);
      }
      closeModal(); renderData(state.dataEntity);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) return;
    toast('The JSON values are not valid.', 'error');
  }
});

window.addEventListener('popstate', () => state.currentUser ? renderRoute() : renderAuth());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalRoot.innerHTML) closeModal();
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { event.preventDefault(); openSearch(); }
});

function renderAuth(authState = {}) {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'dark' ? '#2c333a' : '#f1f2f4');
  document.body.classList.remove('modal-open', 'sidebar-open');
  modalRoot.innerHTML = '';
  const mode = location.pathname === '/register' ? 'register' : 'login';
  const workspaceRequired = authState.registration?.workspace_required;
  app.innerHTML = `<app-login mode="${mode}"${workspaceRequired ? ' workspace-required' : ''}></app-login>`;
  app.querySelector('app-login').addEventListener('auth-success', async (event) => {
    state.currentUser = event.detail.user;
    if (state.currentUser?.organization_id) state.organizationId = state.currentUser.organization_id;
    history.replaceState({}, '', '/');
    await init();
  }, { once: true });
}

async function init() {
  try {
    const authState = await request('/api/auth');
    state.currentUser = authState.user;
    if (!state.currentUser) {
      renderAuth(authState);
      return;
    }
    if (location.pathname === '/login' || location.pathname === '/register') history.replaceState({}, '', '/');
    await refreshBootstrap();
    if (!state.bootstrap.organization) {
      app.innerHTML = `<div class="welcome-screen"><div class="brand-mark brand-mark--large" aria-hidden="true"><img src="/favicon.svg" alt=""></div><h1>Welcome to Agent Board</h1><p>Create a workspace to start planning and tracking work.</p><button class="button button--primary" data-setup-workspace>Create workspace</button></div>`;
      return;
    }
    renderRoute();
  } catch (error) {
    app.innerHTML = `<div class="welcome-screen"><span class="empty-state__icon">${icon('alert', 28)}</span><h1>Agent Board couldn’t start</h1><p>${escapeHtml(error.message)}</p><button class="button" onclick="location.reload()">Retry</button></div>`;
  }
}

init();
