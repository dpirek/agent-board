# Agent Board

Agent Board is a SQLite-backed Jira-like project-management service with a
command-line interface and MCP transports for stdio and Streamable HTTP. The
full 35-table domain in [`db/schema.sql`](db/schema.sql)—projects, workflows,
issues, boards, sprints, releases, custom fields, audit events, and agent
runs—is created automatically in SQLite.

It requires Node.js 22.5 or newer and uses the built-in `node:sqlite` module,
so there are no runtime dependencies to install.

## Storage

The database defaults to `db/agent-board.sqlite`. Select another
database with `--db <path>` or `AGENT_BOARD_DB`:

```sh
node bin/agent-board.js --db /absolute/path/board.sqlite list projects
```

On the first default startup, an existing `.agent-board/data.json` is imported
transactionally into `db/agent-board.sqlite` and renamed to
`data.json.migrated`. SQLite is the only active storage format after migration.
`--data` and `AGENT_BOARD_DATA` remain aliases for a SQLite database path so
older launch configurations do not fail.

## CLI

Every table can be managed with generic commands:

```sh
node bin/agent-board.js create organizations --name "Acme"
node bin/agent-board.js create projects \
  --organization-id <organization-uuid> --project-key WEB --name "Website"
node bin/agent-board.js list projects --organization-id <organization-uuid>
node bin/agent-board.js get projects <project-uuid>
node bin/agent-board.js update projects <project-uuid> --description "Public site"
node bin/agent-board.js delete projects <project-uuid>
```

Values accept strings, `null`, `true`, `false`, or structured JSON prefixed
with `json:`. Run `node bin/agent-board.js --help` for complete usage.

## MCP server

Configure an MCP client to launch the stdio transport:

```json
{
  "mcpServers": {
    "agent-board": {
      "command": "node",
      "args": ["/absolute/path/to/agent-board/bin/agent-board.js", "mcp"],
      "env": {
        "AGENT_BOARD_DB": "/absolute/path/to/agent-board.sqlite"
      }
    }
  }
}
```

The server exposes project-management tools designed for agents:

- `setup_workspace` creates or idempotently configures an organization with
  default issue types, priorities, statuses, and workflow.
- `create_project` creates a keyed project, workflow mappings, and board.
- `create_issue`, `get_issue`, `search_issues`, `update_issue`, and
  `transition_issue` manage a numbered backlog with keys such as `WEB-123`.
- `add_comment` records issue discussion and audit history.
- `create_sprint`, `add_issues_to_sprint`, `start_sprint`, and `close_sprint`
  manage Scrum planning.
- `get_board` returns columns, mapped statuses, sprints, and issues.
- `get_schema`, `list_records`, `get_record`, `create_record`, `update_record`,
  and `delete_record` provide advanced access to every schema table.

### Streamable HTTP

Start the HTTP transport:

```sh
node bin/agent-board.js mcp-http
```

The endpoint defaults to `http://127.0.0.1:3000/mcp`. Override it with
`--host`, `--port`, and `--path`, or `AGENT_BOARD_HOST`, `AGENT_BOARD_PORT`,
and `AGENT_BOARD_PATH`. The stateless transport accepts MCP POST requests and
supports protocol versions 2025-11-25, 2025-06-18, 2025-03-26, and 2024-11-05.

The server binds to localhost and rejects cross-origin browser requests by
default. Add trusted origins with `--allowed-origin` or
`AGENT_BOARD_ALLOWED_ORIGINS`. Set `AGENT_BOARD_TOKEN` to require a bearer
token. Use TLS when exposing the endpoint beyond localhost.

## Test

```sh
npm test
```
