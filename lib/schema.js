'use strict';

// Table names from db/schema.sql. Field metadata is read from SQLite at runtime,
// so the SQL schema remains the source of truth.
const entityNames = Object.freeze([
  'organizations', 'users', 'teams', 'team_members', 'projects', 'project_members',
  'issue_types', 'priorities', 'statuses', 'workflows', 'workflow_statuses',
  'workflow_transitions', 'project_workflows', 'issues', 'comments', 'attachments',
  'labels', 'issue_labels', 'issue_links', 'issue_watchers', 'boards', 'board_columns',
  'board_column_statuses', 'sprints', 'sprint_issues', 'versions', 'issue_versions',
  'custom_fields', 'custom_field_values', 'issue_events', 'agents', 'agent_runs',
  'agent_steps', 'agent_tool_calls', 'agent_artifacts'
]);

module.exports = { entityNames };
