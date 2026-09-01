'use strict';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class BoardService {
  constructor(store) {
    this.store = store;
  }

  describeSchema() {
    return this.store.describeSchema();
  }

  list(entityName, filters = {}, limit = 100) {
    this.requireObject(filters, 'filters');
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 1000) {
      throw new Error('limit must be an integer between 1 and 1000');
    }
    return this.store.list(entityName, filters, normalizedLimit);
  }

  get(entityName, id) {
    this.validateUuid(id, 'id');
    const record = this.store.get(entityName, id);
    if (!record) throw new Error(`${entityName} record '${id}' was not found`);
    return record;
  }

  create(entityName, values) {
    const schema = this.store.getSchema(entityName);
    this.requireObject(values, 'values');
    const normalized = this.normalizeValues(schema, values, false);
    this.validateRequired(schema, normalized);
    this.validateReferences(schema, normalized);
    try {
      return this.store.create(entityName, normalized);
    } catch (error) {
      throw this.friendlyDatabaseError(error, entityName);
    }
  }

  update(entityName, id, values) {
    const schema = this.store.getSchema(entityName);
    this.validateUuid(id, 'id');
    this.requireObject(values, 'values');
    if (Object.keys(values).length === 0) throw new Error('values must contain at least one field');
    const normalized = this.normalizeValues(schema, values, true);
    this.validateReferences(schema, normalized);
    try {
      const record = this.store.update(entityName, id, normalized);
      if (!record) throw new Error(`${entityName} record '${id}' was not found`);
      return record;
    } catch (error) {
      throw this.friendlyDatabaseError(error, entityName);
    }
  }

  delete(entityName, id) {
    this.validateUuid(id, 'id');
    const record = this.store.delete(entityName, id);
    if (!record) throw new Error(`${entityName} record '${id}' was not found`);
    return record;
  }

  setupWorkspace(values, options = {}) {
    this.requireObject(values, 'values');
    if (!values.organization_id && !values.organization_name) {
      throw new Error('organization_id or organization_name is required');
    }
    const setup = () => {
      const organization = values.organization_id
        ? this.get('organizations', values.organization_id)
        : this.store.create('organizations', { name: values.organization_name });
      const ensureNamed = (entityName, name, extra = {}) => this.store.findOne(entityName, {
        organization_id: organization.id, name
      }) || this.store.create(entityName, { organization_id: organization.id, name, ...extra });
      const issueTypes = ['Epic', 'Story', 'Task', 'Bug', 'Subtask'].map((name) => ensureNamed('issue_types', name, {
        is_subtask: name === 'Subtask'
      }));
      const priorities = [
        ['Highest', 1, '#d04437'], ['High', 2, '#f15c75'], ['Medium', 3, '#f6c342'],
        ['Low', 4, '#4a90e2'], ['Lowest', 5, '#6b778c']
      ].map(([name, rank, color]) => ensureNamed('priorities', name, { rank, color }));
      const statuses = [
        ['To Do', 'todo', '#6b778c'], ['In Progress', 'in_progress', '#0052cc'], ['Done', 'done', '#36b37e']
      ].map(([name, category, color]) => ensureNamed('statuses', name, { category, color }));
      const workflow = this.store.findOne('workflows', { organization_id: organization.id, name: 'Default' }) ||
        this.store.create('workflows', {
          organization_id: organization.id, name: 'Default', description: 'Default Jira-like workflow', is_default: true
        });
      statuses.forEach((status, position) => {
        if (!this.store.findOne('workflow_statuses', { workflow_id: workflow.id, status_id: status.id })) {
          this.store.create('workflow_statuses', {
            workflow_id: workflow.id, status_id: status.id, position, is_initial: position === 0
          });
        }
      });
      [
        [statuses[0], statuses[1], 'Start progress'],
        [statuses[1], statuses[2], 'Complete'],
        [statuses[2], statuses[0], 'Reopen'],
        [statuses[1], statuses[0], 'Move to todo']
      ].forEach(([from, to, name]) => {
        if (!this.store.findOne('workflow_transitions', {
          workflow_id: workflow.id, from_status_id: from.id, to_status_id: to.id
        })) {
          this.store.create('workflow_transitions', {
            workflow_id: workflow.id, from_status_id: from.id, to_status_id: to.id, name
          });
        }
      });
      let user = null;
      if (values.admin_email) {
        user = this.store.findOne('users', { organization_id: organization.id, email: values.admin_email }) ||
          this.store.create('users', {
          organization_id: organization.id,
          email: values.admin_email,
          name: values.admin_name || values.admin_email
          });
      }
      return { organization, user, issue_types: issueTypes, priorities, statuses, workflow };
    };
    return options.transaction === false ? setup() : this.store.transaction(setup);
  }

  createProject(values) {
    this.requireObject(values, 'values');
    const projectKey = String(values.project_key || values.key || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(projectKey)) {
      throw new Error('project_key must be 2-20 uppercase letters, numbers, or underscores and start with a letter');
    }
    if (!values.organization_id || !values.name) throw new Error('organization_id and name are required');
    return this.store.transaction(() => {
      const project = this.create('projects', {
        organization_id: values.organization_id,
        project_key: projectKey,
        name: values.name,
        description: values.description,
        lead_user_id: values.lead_user_id
      });
      const workflow = this.store.findOne('workflows', { organization_id: values.organization_id, is_default: true });
      const issueTypes = this.store.list('issue_types', { organization_id: values.organization_id }, 100);
      if (workflow) {
        for (const issueType of issueTypes) this.store.create('project_workflows', {
          project_id: project.id, issue_type_id: issueType.id, workflow_id: workflow.id
        });
      }
      let board = null;
      if (values.create_board !== false) {
        board = this.store.create('boards', {
          project_id: project.id,
          name: values.board_name || `${project.name} board`,
          board_type: values.board_type || 'kanban'
        });
        const statuses = this.store.list('statuses', { organization_id: values.organization_id }, 100);
        const categoryNames = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
        for (const [position, category] of ['todo', 'in_progress', 'done'].entries()) {
          const column = this.store.create('board_columns', {
            board_id: board.id, name: categoryNames[category], position
          });
          for (const status of statuses.filter((item) => item.category === category)) {
            this.store.create('board_column_statuses', { board_column_id: column.id, status_id: status.id });
          }
        }
      }
      return { project, board };
    });
  }

  createIssue(values) {
    this.requireObject(values, 'values');
    if (!values.project || !values.title) throw new Error('project and title are required');
    return this.store.transaction(() => {
      const project = this.resolveProject(values.project);
      const issueType = this.resolveConfiguration('issue_types', project.organization_id, values.issue_type || 'Task');
      const status = values.status
        ? this.resolveConfiguration('statuses', project.organization_id, values.status)
        : this.initialStatus(project, issueType);
      const priority = values.priority
        ? this.resolveConfiguration('priorities', project.organization_id, values.priority)
        : this.store.findOne('priorities', { organization_id: project.organization_id, name: 'Medium' });
      const next = this.store.database.prepare(
        'SELECT COALESCE(MAX(issue_number), 0) + 1 AS issue_number FROM issues WHERE project_id = ?'
      ).get(project.id).issue_number;
      const issue = this.store.create('issues', {
        project_id: project.id,
        issue_number: next,
        issue_type_id: issueType.id,
        status_id: status.id,
        priority_id: priority?.id,
        parent_issue_id: values.parent_issue_id,
        reporter_id: values.reporter_id,
        assignee_id: values.assignee_id,
        team_id: values.team_id,
        title: values.title,
        description: values.description,
        story_points: values.story_points,
        original_estimate_minutes: values.original_estimate_minutes,
        remaining_estimate_minutes: values.remaining_estimate_minutes,
        due_date: values.due_date,
        rank: values.rank ?? next,
        metadata: values.metadata
      });
      this.recordEvent(issue.id, values.reporter_id, 'issue_created', null, null, this.issueKey(project, issue));
      for (const labelName of values.labels || []) this.addLabel(issue, project.organization_id, labelName);
      return this.enrichIssue(issue, project);
    });
  }

  getIssue(reference) {
    const { issue, project } = this.resolveIssue(reference);
    return {
      ...this.enrichIssue(issue, project),
      comments: this.store.list('comments', { issue_id: issue.id }, 1000),
      events: this.store.list('issue_events', { issue_id: issue.id }, 1000),
      labels: this.issueLabels(issue.id)
    };
  }

  searchIssues(filters = {}) {
    this.requireObject(filters, 'filters');
    const limit = Number(filters.limit || 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('limit must be an integer between 1 and 1000');
    const where = [];
    const parameters = [];
    const project = filters.project ? this.resolveProject(filters.project) : null;
    if (project) { where.push('i.project_id = ?'); parameters.push(project.id); }
    if (filters.status) { where.push('(s.id = ? OR lower(s.name) = lower(?))'); parameters.push(filters.status, filters.status); }
    if (filters.assignee_id !== undefined) {
      where.push(filters.assignee_id === null ? 'i.assignee_id IS NULL' : 'i.assignee_id = ?');
      if (filters.assignee_id !== null) parameters.push(filters.assignee_id);
    }
    if (filters.priority) { where.push('(pr.id = ? OR lower(pr.name) = lower(?))'); parameters.push(filters.priority, filters.priority); }
    if (filters.issue_type) { where.push('(it.id = ? OR lower(it.name) = lower(?))'); parameters.push(filters.issue_type, filters.issue_type); }
    if (filters.text) { where.push('(lower(i.title) LIKE lower(?) OR lower(COALESCE(i.description, \'\')) LIKE lower(?))'); parameters.push(`%${filters.text}%`, `%${filters.text}%`); }
    if (filters.sprint_id) { where.push('EXISTS (SELECT 1 FROM sprint_issues si WHERE si.issue_id = i.id AND si.sprint_id = ?)'); parameters.push(filters.sprint_id); }
    if (filters.label) { where.push('EXISTS (SELECT 1 FROM issue_labels il JOIN labels l ON l.id = il.label_id WHERE il.issue_id = i.id AND lower(l.name) = lower(?))'); parameters.push(filters.label); }
    const rows = this.store.database.prepare(`
      SELECT i.*, p.project_key, s.name AS status_name, s.category AS status_category,
        pr.name AS priority_name, it.name AS issue_type_name
      FROM issues i
      JOIN projects p ON p.id = i.project_id
      JOIN statuses s ON s.id = i.status_id
      JOIN issue_types it ON it.id = i.issue_type_id
      LEFT JOIN priorities pr ON pr.id = i.priority_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.project_key, i.issue_number
      LIMIT ?
    `).all(...parameters, limit);
    return rows.map((row) => ({ ...row, metadata: this.parseJson(row.metadata), issue_key: `${row.project_key}-${row.issue_number}` }));
  }

  updateIssue(reference, values, actorId) {
    this.requireObject(values, 'values');
    const { issue } = this.resolveIssue(reference);
    const allowed = new Set([
      'title', 'description', 'priority_id', 'assignee_id', 'team_id', 'parent_issue_id', 'story_points',
      'original_estimate_minutes', 'remaining_estimate_minutes', 'due_date', 'rank', 'metadata'
    ]);
    const unknown = Object.keys(values).find((field) => !allowed.has(field));
    if (unknown) throw new Error(`Unknown or workflow-managed issue field '${unknown}'`);
    return this.store.transaction(() => {
      const updated = this.update('issues', issue.id, values);
      for (const [field, newValue] of Object.entries(values)) {
        if (JSON.stringify(issue[field]) !== JSON.stringify(newValue)) {
          this.recordEvent(issue.id, actorId, 'field_updated', field, issue[field], newValue);
        }
      }
      return this.enrichIssue(updated);
    });
  }

  transitionIssue(reference, values) {
    this.requireObject(values, 'values');
    if (!values.status) throw new Error('status is required');
    return this.store.transaction(() => {
      const { issue, project } = this.resolveIssue(reference);
      const target = this.resolveConfiguration('statuses', project.organization_id, values.status);
      if (target.id === issue.status_id) return this.enrichIssue(issue, project);
      const mapping = this.store.findOne('project_workflows', {
        project_id: project.id, issue_type_id: issue.issue_type_id
      });
      if (mapping) {
        const transition = this.store.findOne('workflow_transitions', {
          workflow_id: mapping.workflow_id, from_status_id: issue.status_id, to_status_id: target.id
        });
        if (!transition) throw new Error(`Workflow does not allow this transition to '${target.name}'`);
      }
      const updated = this.store.update('issues', issue.id, {
        status_id: target.id,
        resolved_at: target.category === 'done' ? new Date().toISOString() : null
      });
      this.recordEvent(issue.id, values.actor_id, 'status_changed', 'status_id', issue.status_id, target.id, {
        transition_name: values.transition_name
      });
      return this.enrichIssue(updated, project);
    });
  }

  addComment(reference, values) {
    this.requireObject(values, 'values');
    if (!values.body) throw new Error('body is required');
    const { issue } = this.resolveIssue(reference);
    return this.store.transaction(() => {
      const comment = this.create('comments', {
        issue_id: issue.id, author_id: values.author_id, body: values.body, metadata: values.metadata
      });
      this.recordEvent(issue.id, values.author_id, 'comment_added', null, null, comment.id);
      return comment;
    });
  }

  createSprint(values) {
    this.requireObject(values, 'values');
    if (!values.board_id || !values.name) throw new Error('board_id and name are required');
    return this.create('sprints', {
      board_id: values.board_id, name: values.name, goal: values.goal,
      status: 'future', start_at: values.start_at, end_at: values.end_at
    });
  }

  updateSprintStatus(sprintId, action) {
    this.validateUuid(sprintId, 'sprint_id');
    const sprint = this.get('sprints', sprintId);
    if (action === 'start') {
      if (sprint.status !== 'future') throw new Error('Only a future sprint can be started');
      const active = this.store.findOne('sprints', { board_id: sprint.board_id, status: 'active' });
      if (active) throw new Error(`Board already has active sprint '${active.name}'`);
      return this.update('sprints', sprint.id, { status: 'active', start_at: sprint.start_at || new Date().toISOString() });
    }
    if (action === 'close') {
      if (sprint.status !== 'active') throw new Error('Only an active sprint can be closed');
      return this.update('sprints', sprint.id, { status: 'closed', completed_at: new Date().toISOString() });
    }
    throw new Error("action must be 'start' or 'close'");
  }

  addIssuesToSprint(sprintId, issueReferences) {
    this.validateUuid(sprintId, 'sprint_id');
    if (!Array.isArray(issueReferences) || !issueReferences.length) throw new Error('issues must be a non-empty array');
    return this.store.transaction(() => {
      const sprint = this.get('sprints', sprintId);
      const board = this.get('boards', sprint.board_id);
      const added = [];
      for (const reference of issueReferences) {
        const { issue } = this.resolveIssue(reference);
        if (board.project_id && issue.project_id !== board.project_id) throw new Error(`Issue '${reference}' is not in the board project`);
        const existing = this.store.findOne('sprint_issues', { sprint_id: sprint.id, issue_id: issue.id });
        if (!existing) added.push(this.store.create('sprint_issues', { sprint_id: sprint.id, issue_id: issue.id }));
      }
      return { sprint, added };
    });
  }

  getBoard(boardId) {
    const board = this.get('boards', boardId);
    const columns = this.store.list('board_columns', { board_id: board.id }, 100)
      .sort((a, b) => a.position - b.position)
      .map((column) => ({
        ...column,
        statuses: this.store.list('board_column_statuses', { board_column_id: column.id }, 100)
          .map((mapping) => this.store.get('statuses', mapping.status_id))
      }));
    return {
      board,
      columns,
      sprints: this.store.list('sprints', { board_id: board.id }, 100),
      issues: board.project_id ? this.searchIssues({ project: board.project_id, limit: 1000 }) : []
    };
  }

  resolveProject(reference) {
    if (typeof reference !== 'string' || !reference) throw new Error('project must be a project UUID or key');
    if (UUID_PATTERN.test(reference)) {
      const project = this.store.get('projects', reference);
      if (!project) throw new Error(`Project '${reference}' was not found`);
      return project;
    }
    const matches = this.store.list('projects', { project_key: reference.toUpperCase() }, 2);
    if (!matches.length) throw new Error(`Project '${reference}' was not found`);
    if (matches.length > 1) throw new Error(`Project key '${reference}' is ambiguous across organizations; use its UUID`);
    return matches[0];
  }

  resolveIssue(reference) {
    if (typeof reference !== 'string' || !reference) throw new Error('issue must be an issue UUID or key');
    if (UUID_PATTERN.test(reference)) {
      const issue = this.store.get('issues', reference);
      if (!issue) throw new Error(`Issue '${reference}' was not found`);
      return { issue, project: this.store.get('projects', issue.project_id) };
    }
    const match = /^(.+)-(\d+)$/.exec(reference.toUpperCase());
    if (!match) throw new Error('issue must be an issue UUID or key such as WEB-123');
    const project = this.resolveProject(match[1]);
    const issue = this.store.findOne('issues', { project_id: project.id, issue_number: Number(match[2]) });
    if (!issue) throw new Error(`Issue '${reference}' was not found`);
    return { issue, project };
  }

  resolveConfiguration(entityName, organizationId, reference) {
    if (UUID_PATTERN.test(String(reference))) {
      const record = this.store.get(entityName, reference);
      if (record?.organization_id === organizationId) return record;
    } else {
      const rows = this.store.list(entityName, { organization_id: organizationId }, 1000);
      const record = rows.find((item) => item.name.toLowerCase() === String(reference).toLowerCase());
      if (record) return record;
    }
    throw new Error(`${entityName} value '${reference}' was not found in the project organization`);
  }

  initialStatus(project, issueType) {
    const mapping = this.store.findOne('project_workflows', { project_id: project.id, issue_type_id: issueType.id });
    if (mapping) {
      const initial = this.store.findOne('workflow_statuses', { workflow_id: mapping.workflow_id, is_initial: true });
      if (initial) return this.store.get('statuses', initial.status_id);
    }
    const statuses = this.store.list('statuses', { organization_id: project.organization_id }, 100);
    const status = statuses.find((item) => item.category === 'todo');
    if (!status) throw new Error('Project organization does not have an initial todo status');
    return status;
  }

  enrichIssue(issue, project) {
    project ||= this.store.get('projects', issue.project_id);
    const status = this.store.get('statuses', issue.status_id);
    const issueType = this.store.get('issue_types', issue.issue_type_id);
    const priority = issue.priority_id ? this.store.get('priorities', issue.priority_id) : null;
    return {
      ...issue,
      issue_key: this.issueKey(project, issue),
      project_key: project.project_key,
      status_name: status?.name,
      status_category: status?.category,
      issue_type_name: issueType?.name,
      priority_name: priority?.name,
      labels: this.issueLabels(issue.id)
    };
  }

  issueKey(project, issue) {
    return `${project.project_key}-${issue.issue_number}`;
  }

  issueLabels(issueId) {
    return this.store.list('issue_labels', { issue_id: issueId }, 1000)
      .map((mapping) => this.store.get('labels', mapping.label_id));
  }

  addLabel(issue, organizationId, name) {
    let label = this.store.list('labels', { organization_id: organizationId }, 1000)
      .find((item) => item.name.toLowerCase() === String(name).toLowerCase());
    if (!label) label = this.store.create('labels', { organization_id: organizationId, name: String(name) });
    if (!this.store.findOne('issue_labels', { issue_id: issue.id, label_id: label.id })) {
      this.store.create('issue_labels', { issue_id: issue.id, label_id: label.id });
    }
  }

  recordEvent(issueId, actorId, eventType, fieldName, oldValue, newValue, metadata = {}) {
    return this.store.create('issue_events', {
      issue_id: issueId,
      actor_id: actorId,
      event_type: eventType,
      field_name: fieldName,
      old_value: oldValue,
      new_value: newValue,
      metadata
    });
  }

  normalizeValues(schema, values, updating) {
    const record = {};
    for (const [field, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const definition = schema.fields[field];
      if (!definition) throw new Error(`Unknown field '${field}'`);
      if (updating && (field === 'id' || field === 'created_at' || field === 'updated_at')) {
        throw new Error(`Field '${field}' cannot be updated`);
      }
      if (!updating && (field === 'created_at' || field === 'updated_at')) {
        throw new Error(`Field '${field}' is generated by the database`);
      }
      if (value === null) {
        if (!definition.nullable) throw new Error(`Field '${field}' cannot be null`);
        record[field] = null;
        continue;
      }
      if (definition.type === 'uuid') this.validateUuid(value, field);
      if (definition.type === 'string' && typeof value !== 'string') throw new Error(`Field '${field}' must be a string`);
      if (definition.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Field '${field}' must be a boolean`);
      if (definition.type === 'integer' && !Number.isInteger(Number(value))) throw new Error(`Field '${field}' must be an integer`);
      if (definition.type === 'number' && !Number.isFinite(Number(value))) throw new Error(`Field '${field}' must be a number`);
      record[field] = definition.type === 'integer' ? Number(value)
        : definition.type === 'number' ? Number(value)
          : value;
    }
    return record;
  }

  validateRequired(schema, record) {
    for (const [field, definition] of Object.entries(schema.fields)) {
      if (!definition.required || definition.generated) continue;
      if (record[field] === undefined || record[field] === null || record[field] === '') {
        throw new Error(`Field '${field}' is required`);
      }
    }
  }

  validateReferences(schema, record) {
    for (const [field, definition] of Object.entries(schema.fields)) {
      const value = record[field];
      if (!definition.references || value === undefined || value === null) continue;
      const target = this.store.findOne(definition.references, { [definition.reference.field]: value });
      if (!target) throw new Error(`Field '${field}' references missing ${definition.references} record '${value}'`);
    }
  }

  validateUuid(value, field) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error(`Field '${field}' must be a valid UUID`);
  }

  requireObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  }

  parseJson(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  friendlyDatabaseError(error, entityName) {
    const message = String(error.message || error);
    if (/UNIQUE constraint failed/i.test(message)) return new Error(`Unique constraint failed for ${entityName}: ${message.split(': ').at(-1)}`);
    if (/FOREIGN KEY constraint failed/i.test(message)) return new Error(`Foreign key constraint failed for ${entityName}`);
    if (/NOT NULL constraint failed/i.test(message)) return new Error(`Required field is missing for ${entityName}: ${message.split(': ').at(-1)}`);
    if (/CHECK constraint failed/i.test(message)) return new Error(`Check constraint failed for ${entityName}: ${message.split(': ').at(-1)}`);
    return error;
  }
}

module.exports = { BoardService, UUID_PATTERN };
