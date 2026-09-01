# Agent Board

A dependency-free Node.js CLI and MCP server for the entities in
[`db/schema.sql`](db/schema.sql). Records are persisted in a local JSON file;
foreign keys, required fields, UUIDs, project key length, and the unique
organization/project-key pair are validated before writes.

Requires Node.js 18 or newer. No install step is required.

## CLI

```sh
node bin/agent-board.js create organizations --name "Acme"
node bin/agent-board.js list organizations
node bin/agent-board.js create projects \
  --organization-id <organization-uuid> --key WEB --name "Website"
```

Commands print JSON. Use `--data <path>` before or after the command, or set
`AGENT_BOARD_DATA`, to select another data file. Run the built-in help for all
commands:

```sh
node bin/agent-board.js --help
```

## MCP server

Configure an MCP client to launch:

```json
{
  "mcpServers": {
    "agent-board": {
      "command": "node",
      "args": ["/absolute/path/to/agent-board/bin/agent-board.js", "mcp"],
      "env": {
        "AGENT_BOARD_DATA": "/absolute/path/to/agent-board-data.json"
      }
    }
  }
}
```

The stdio server implements MCP initialization, ping, `tools/list`, and
`tools/call`. It exposes `get_schema`, `list_records`, `get_record`,
`create_record`, `update_record`, and `delete_record`. Protocol messages are
newline-delimited JSON-RPC; stdout is reserved exclusively for those messages.

### Streamable HTTP

Start the dependency-free Streamable HTTP server:

```sh
node bin/agent-board.js mcp-http
```

The MCP endpoint defaults to `http://127.0.0.1:3000/mcp`. Override it with
`--host`, `--port`, and `--path`, or the `AGENT_BOARD_HOST`,
`AGENT_BOARD_PORT`, and `AGENT_BOARD_PATH` environment variables. For example:

```sh
node bin/agent-board.js mcp-http --port 8080 --path /mcp
```

The transport returns JSON responses to POST requests and does not expose a
standalone SSE stream, so GET requests return `405 Method Not Allowed`. It is
stateless and compatible with MCP protocol versions 2025-11-25, 2025-06-18,
2025-03-26, and 2024-11-05.

The server binds to localhost by default and rejects cross-origin browser
requests. Add comma-separated trusted origins with `--allowed-origin` or
`AGENT_BOARD_ALLOWED_ORIGINS`. Set `AGENT_BOARD_TOKEN` to require clients to
send `Authorization: Bearer <token>`. Use TLS and authentication when exposing
the endpoint beyond localhost.

## Test

```sh
npm test
```
