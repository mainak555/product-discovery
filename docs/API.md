# API Reference

## URL Routes

All routes are under the `server` app namespace.

| Method | Path | View | Description |
|--------|------|------|-------------|
| `GET` | `/` | `index` | Full SPA page (config.html) |
| `GET` | `/projects/` | `configurations_page` | Full configurations page (sidebar + create form preloaded) |
| `GET` | `/projects/list/` | `project_list` | HTMX partial — sidebar project list |
| `GET` | `/projects/new/` | `project_new` | HTMX partial — blank config form |
| `GET` | `/projects/<name>/` | `project_detail` | HTMX partial — config form or readonly |
| `POST` | `/projects/<name>/` | `project_detail` | Create or update a project |
| `GET` | `/trello/<session_id>/auth-url/` | `trello_auth_url` | Return Trello authorization URL |
| `POST` | `/trello/<session_id>/store-token/` | `trello_store_token` | Store session Trello token |
| `GET` | `/trello/<session_id>/token-status/` | `trello_token_status` | Check token validity |
| `GET` | `/trello/<session_id>/workspaces/` | `trello_workspaces` | List Trello workspaces |
| `GET` | `/trello/<session_id>/boards/` | `trello_boards` | List boards (opt. `?workspace=`) |
| `GET` | `/trello/<session_id>/lists/` | `trello_lists` | List lists (`?board=` required) |
| `POST` | `/trello/<session_id>/create-board/` | `trello_create_board` | Create a new board |
| `POST` | `/trello/<session_id>/create-list/` | `trello_create_list` | Create a new list |
| `POST` | `/trello/<session_id>/extract/` | `trello_extract` | Run extraction agent |
| `POST` | `/trello/<session_id>/push/` | `trello_push` | Push items to Trello |

See [docs/trello_integration.md](trello_integration.md) for full Trello integration details.

## Request/Response Details

### `POST /projects/<name>/`

**Content-Type**: `application/x-www-form-urlencoded` (standard HTML form)

**Required request header for write access**:
- `X-App-Secret-Key` — must match `APP_SECRET_KEY`

**Form fields**:
- `project_name` — string (ignored on update; URL path is authoritative)
- `objective` — string
- `agents[0][name]` — string
- `agents[0][model]` — selected model name from `agent_models.json`
- `agents[0][system_prompt]` — textarea string
- `agents[0][temperature]` — float string
- `human_gate[enabled]` — `"on"` if checked
- `human_gate[name]` — string
- `human_gate[interaction_mode]` — `approve_reject | feedback`
- `team[type]` — `round_robin` | `selector`
- `team[max_iterations]` — integer string
- `team[model]` — model name (required when `team[type]=selector`)
- `team[system_prompt]` — routing prompt string; supports `{roles}`, `{history}`, `{participants}` (required when `team[type]=selector`)
- `team[temperature]` — float string (default `0.0`; only used for selector)
- `team[allow_repeated_speaker]` — `"on"` if checked (default on; only used for selector)

**Success response**: HTML partial (`config_form.html`) with `HX-Trigger: refreshSidebar`

**Error response**: `<div class="alert alert-error">message</div>` with status 400 or 403

Model runtime notes:
- Model provider metadata is sourced from `agent_models.json` in the root.
- Runtime client creation expects provider keys in environment variables: `<PROVIDER>_API_KEY`.
- Azure models additionally require `AZURE_API_URL`.
- For Azure entries, model keys are deployment names.

## MongoDB Collection

**Collection**: `project_settings`

**Schema**:
```json
{
  "project_name": "string (unique)",
  "objective": "string",
  "agents": [
    {
      "name": "string",
      "model": "string",
      "system_prompt": "string",
      "temperature": 0.7
    }
  ],
  "human_gate": {
    "enabled": true,
    "name": "Architect",
    "interaction_mode": "approve_reject"
  },
  "team": {
    "type": "round_robin | selector",
    "max_iterations": 5,
    "model": "string (selector only)",
    "system_prompt": "string (selector only)",
    "temperature": 0.0,
    "allow_repeated_speaker": true
  }
}
```
