'use strict';

const readline = require('node:readline');
const { entityNames } = require('./schema');

const PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
  '2024-11-05'
]);
const entityProperty = { type: 'string', enum: entityNames, description: 'Table/entity name from db/schema.sql' };

const tools = [
  {
    name: 'get_schema',
    title: 'Get board schema',
    description: 'Return the entities, fields, relationships, and constraints from db/schema.sql.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_records',
    title: 'List records',
    description: 'List records from a schema entity, optionally filtered by exact field values.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: entityProperty,
        filters: { type: 'object', description: 'Exact field/value matches', additionalProperties: true },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      },
      required: ['entity'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'get_record',
    title: 'Get record',
    description: 'Get one record by entity and UUID.',
    inputSchema: {
      type: 'object',
      properties: { entity: entityProperty, id: { type: 'string', format: 'uuid' } },
      required: ['entity', 'id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'create_record',
    title: 'Create record',
    description: 'Create a record. UUID and created_at are generated when applicable.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: entityProperty,
        values: { type: 'object', description: 'Column values for the new record', additionalProperties: true }
      },
      required: ['entity', 'values'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'update_record',
    title: 'Update record',
    description: 'Update writable fields on a record by entity and UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: entityProperty,
        id: { type: 'string', format: 'uuid' },
        values: { type: 'object', description: 'Writable fields to replace', additionalProperties: true }
      },
      required: ['entity', 'id', 'values'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'delete_record',
    title: 'Delete record',
    description: 'Delete a record using the foreign-key cascade/set-null behavior defined in db/schema.sql.',
    inputSchema: {
      type: 'object',
      properties: { entity: entityProperty, id: { type: 'string', format: 'uuid' } },
      required: ['entity', 'id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true }
  },
  {
    name: 'setup_workspace',
    title: 'Set up a project workspace',
    description: 'Create or configure an organization with Jira-like issue types, priorities, statuses, and a default workflow. Safe to call repeatedly.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', format: 'uuid', description: 'Existing organization to configure' },
        organization_name: { type: 'string' },
        admin_email: { type: 'string' },
        admin_name: { type: 'string' }
      },
      anyOf: [{ required: ['organization_id'] }, { required: ['organization_name'] }],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'create_project',
    title: 'Create project',
    description: 'Create a keyed project, connect its default workflows, and optionally create a Kanban or Scrum board.',
    inputSchema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string', format: 'uuid' },
        project_key: { type: 'string', minLength: 2, maxLength: 20 },
        name: { type: 'string' },
        description: { type: 'string' },
        lead_user_id: { type: 'string', format: 'uuid' },
        create_board: { type: 'boolean', default: true },
        board_name: { type: 'string' },
        board_type: { type: 'string', enum: ['kanban', 'scrum'], default: 'kanban' }
      },
      required: ['organization_id', 'project_key', 'name'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'create_issue',
    title: 'Create issue',
    description: 'Create the next numbered issue in a project. Names or UUIDs can identify issue type, status, and priority.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project UUID or key' },
        title: { type: 'string' },
        description: { type: 'string' },
        issue_type: { type: 'string', default: 'Task' },
        status: { type: 'string' },
        priority: { type: 'string', default: 'Medium' },
        reporter_id: { type: 'string', format: 'uuid' },
        assignee_id: { type: 'string', format: 'uuid' },
        team_id: { type: 'string', format: 'uuid' },
        parent_issue_id: { type: 'string', format: 'uuid' },
        story_points: { type: 'number' },
        original_estimate_minutes: { type: 'integer' },
        remaining_estimate_minutes: { type: 'integer' },
        due_date: { type: 'string', format: 'date' },
        rank: { type: 'number' },
        labels: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object', additionalProperties: true }
      },
      required: ['project', 'title'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'get_issue',
    title: 'Get issue',
    description: 'Get an issue and its comments, labels, and event history by UUID or issue key such as WEB-123.',
    inputSchema: {
      type: 'object',
      properties: { issue: { type: 'string' } },
      required: ['issue'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'search_issues',
    title: 'Search issues',
    description: 'Search the backlog by project, status, assignee, priority, type, text, sprint, or label.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project UUID or key' },
        status: { type: 'string' },
        assignee_id: { oneOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
        priority: { type: 'string' },
        issue_type: { type: 'string' },
        text: { type: 'string' },
        sprint_id: { type: 'string', format: 'uuid' },
        label: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'update_issue',
    title: 'Update issue',
    description: 'Update issue content, assignment, estimates, priority, due date, rank, or metadata. Use transition_issue for status.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string' },
        values: { type: 'object', additionalProperties: true },
        actor_id: { type: 'string', format: 'uuid' }
      },
      required: ['issue', 'values'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'transition_issue',
    title: 'Transition issue',
    description: 'Move an issue to a workflow-allowed status and record the status change.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string' },
        status: { type: 'string', description: 'Target status name or UUID' },
        actor_id: { type: 'string', format: 'uuid' }
      },
      required: ['issue', 'status'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'add_comment',
    title: 'Add issue comment',
    description: 'Add a comment to an issue and record it in issue history.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string' },
        body: { type: 'string' },
        author_id: { type: 'string', format: 'uuid' },
        metadata: { type: 'object', additionalProperties: true }
      },
      required: ['issue', 'body'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'create_sprint',
    title: 'Create sprint',
    description: 'Create a future sprint on a Scrum board.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        goal: { type: 'string' },
        start_at: { type: 'string', format: 'date-time' },
        end_at: { type: 'string', format: 'date-time' }
      },
      required: ['board_id', 'name'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'start_sprint',
    title: 'Start sprint',
    description: 'Start a future sprint, enforcing one active sprint per board.',
    inputSchema: {
      type: 'object', properties: { sprint_id: { type: 'string', format: 'uuid' } },
      required: ['sprint_id'], additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'close_sprint',
    title: 'Close sprint',
    description: 'Close an active sprint and set its completion time.',
    inputSchema: {
      type: 'object', properties: { sprint_id: { type: 'string', format: 'uuid' } },
      required: ['sprint_id'], additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'add_issues_to_sprint',
    title: 'Add issues to sprint',
    description: 'Add issues by UUID or issue key to a sprint on their project board.',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_id: { type: 'string', format: 'uuid' },
        issues: { type: 'array', minItems: 1, items: { type: 'string' } }
      },
      required: ['sprint_id', 'issues'], additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'get_board',
    title: 'Get board',
    description: 'Get board columns, mapped statuses, sprints, and project issues.',
    inputSchema: {
      type: 'object', properties: { board_id: { type: 'string', format: 'uuid' } },
      required: ['board_id'], additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  }
];

function result(value) {
  const structuredContent = Array.isArray(value) ? { records: value } : value;
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

async function callTool(service, name, args) {
  switch (name) {
    case 'get_schema': return result(service.describeSchema());
    case 'list_records': return result(await service.list(args.entity, args.filters || {}, args.limit || 100));
    case 'get_record': return result(await service.get(args.entity, args.id));
    case 'create_record': return result(await service.create(args.entity, args.values));
    case 'update_record': return result(await service.update(args.entity, args.id, args.values));
    case 'delete_record': return result({ deleted: await service.delete(args.entity, args.id) });
    case 'setup_workspace': return result(await service.setupWorkspace(args));
    case 'create_project': return result(await service.createProject(args));
    case 'create_issue': return result(await service.createIssue(args));
    case 'get_issue': return result(await service.getIssue(args.issue));
    case 'search_issues': return result(await service.searchIssues(args));
    case 'update_issue': return result(await service.updateIssue(args.issue, args.values, args.actor_id));
    case 'transition_issue': return result(await service.transitionIssue(args.issue, args));
    case 'add_comment': return result(await service.addComment(args.issue, args));
    case 'create_sprint': return result(await service.createSprint(args));
    case 'start_sprint': return result(await service.updateSprintStatus(args.sprint_id, 'start'));
    case 'close_sprint': return result(await service.updateSprintStatus(args.sprint_id, 'close'));
    case 'add_issues_to_sprint': return result(await service.addIssuesToSprint(args.sprint_id, args.issues));
    case 'get_board': return result(await service.getBoard(args.board_id));
    default: throw Object.assign(new Error(`Unknown tool '${name}'`), { code: -32602 });
  }
}

async function handleMessage(service, message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    throw Object.assign(new Error('Invalid JSON-RPC request'), { code: -32600 });
  }
  if (message.id === undefined) return null;
  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(message.params?.protocolVersion)
          ? message.params.protocolVersion
          : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'agent-board', title: 'Agent Board', version: '1.0.0' },
        instructions: 'Use setup_workspace, create_project, and the issue/board/sprint tools for Jira-like project management. Generic record tools expose every table in db/schema.sql for advanced operations.'
      };
    case 'ping': return {};
    case 'tools/list': return { tools };
    case 'tools/call': {
      const params = message.params || {};
      if (typeof params.name !== 'string') throw Object.assign(new Error('Tool name is required'), { code: -32602 });
      try {
        return await callTool(service, params.name, params.arguments || {});
      } catch (error) {
        if (error.code) throw error;
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
    default: throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 });
  }
}

function startMcpServer(service, input = process.stdin, output = process.stdout) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  lines.on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    try {
      const response = await handleMessage(service, message);
      if (response !== null) output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: response })}\n`);
    } catch (error) {
      if (message.id !== undefined) {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: error.code || -32603, message: error.message } })}\n`);
      }
    }
  });
  return lines;
}

module.exports = { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, tools, callTool, handleMessage, startMcpServer };
