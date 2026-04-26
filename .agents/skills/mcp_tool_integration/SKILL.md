---
name: mcp-tool-integration
description: Use when adding, changing, or reviewing MCP (Model Context Protocol) tool wiring — per-agent `mcp_tools` scope, `mcp_configuration`, project-level `shared_mcp_tools`, new transports, `agents/mcp_tools.py` runtime wiring, or new deployment topologies under `deployments/`. Enforces validation, layering (`server/` never imports AutoGen MCP), redaction (no `args`/`env`/`headers` in logs/spans), lifecycle cleanup via `evict_team()`, and SSE rejection.
---

# MCP Tool Integration Skill

Use this skill when adding, changing, or reviewing anything that touches
MCP (Model Context Protocol) tool wiring for assistant agents.

## When this skill applies

- Adding or modifying the per-agent `mcp_tools` scope or `mcp_configuration`.
- Changing project-level `shared_mcp_tools`.
- Adding a new MCP transport (stdio / streamable HTTP).
- Editing `agents/mcp_tools.py`, `agents/team_builder.py`, or
  `agents/runtime.py` MCP integration points.
- Adding a new deployment topology under `deployments/`.

## Mandatory contracts

### Data model

- Per-agent: `mcp_tools` ∈ {`none`, `shared`, `dedicated`} **and**
  `mcp_configuration` (dict; `{}` when not dedicated).
- Project-level: `shared_mcp_tools` (dict; `{}` when no shared servers).
- Top-level shape of any MCP config: `{"mcpServers": {<name>: <entry>}}`.

### Validation

- All validation lives in `server/schemas.py`.
- `dedicated` agents with empty `mcp_configuration` → `ValueError`.
- Any `shared` agent with empty `shared_mcp_tools` → `ValueError`.
- `transport: "sse"` is rejected with an explicit deprecation message.
- Server entries must have either `command` (stdio) or `url` (HTTP).

### Runtime wiring

- All workbench construction goes through `agents/mcp_tools.py`.
- `team_builder.py` calls `resolve_mcp_servers_for_agent()` +
  `build_mcp_workbenches()` only — never instantiates `McpWorkbench` directly.
- Workbenches are passed to `AssistantAgent(workbench=...)`.
- `agents/runtime.py::evict_team()` MUST call
  `close_session_workbenches(session_id)`.

### Layering

- `server/` may **never** import from `autogen_ext.tools.mcp`. All AutoGen
  imports live under `agents/`.
- The frontend may not parse or transform MCP JSON beyond syntax validation
  in `project_config.js`.

### Observability (see [docs/observability.md](../../docs/observability.md))

- Logger: `agents.mcp_tools` (`logging.getLogger(__name__)`).
- Event names: `agents.mcp.created`, `agents.mcp.closed`, `agents.mcp.failed`.
- **Never** log `args`, `env`, `headers`, or full `url`. Allowed payload
  fields: `scope`, `server_count`, `server_names`, `fingerprint`,
  `session_id`, `phase`.
- All payloads carried into spans must go through `set_payload_attribute()`
  + `redact_payload()`.

### Deployment

- Standalone (`deployments/standalone/`) bundles Node in the app image.
- Compose / K8s use a Node-based mcp-gateway sidecar exposing servers over
  streamable HTTP.
- Any new deployment target must follow the same split.

### Documentation parity

- Schema or validation changes → update [docs/mcp_integration.md](../../docs/mcp_integration.md).
- New transport → update both `_validate_mcp_server_entry()` and
  `_build_server_params()`.
- Deployment changes → update `deployments/README.md` and the relevant
  per-topology README.

## Anti-patterns (block in review)

- Using `print()` or logging server entries directly.
- Spawning `McpWorkbench` outside `agents/mcp_tools.py`.
- Adding SSE support back without explicit upstream re-deprecation reversal.
- Storing MCP credentials in plaintext code (use env vars or secret managers).
- Skipping `evict_team()` cleanup.
