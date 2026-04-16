# API Reference

## URL Routes

All routes are under the `server` app namespace.

| Method | Path | View | Description |
|--------|------|------|-------------|
| `GET` | `/` | `index` | Full SPA page (base.html) |
| `GET` | `/projects/` | `configurations_page` | Full configurations page (sidebar + create form preloaded) |
| `GET` | `/projects/list/` | `project_list` | HTMX partial — sidebar project list |
| `GET` | `/projects/new/` | `project_new` | HTMX partial — blank config form |
| `GET` | `/projects/<name>/` | `project_detail` | HTMX partial — config form or readonly |
| `POST` | `/projects/<name>/` | `project_detail` | Create or update a project |

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
- `team[type]` — currently `round_robin`
- `team[max_iterations]` — integer string

**Success response**: HTML partial (`config_form.html`) with `HX-Trigger: refreshSidebar`

**Error response**: `<div class="alert alert-error">message</div>` with status 400 or 403

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
    "type": "round_robin",
    "max_iterations": 5
  }
}
```
