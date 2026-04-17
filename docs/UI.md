# UI & Templates

## Page Layout

The app is a single-page application using HTMX for partial page updates.

```
┌─────────────────────────────────────────────────────────┐
│  HEADER                                                 │
│  [Projects ▾] [New Session] [Secret Key ___] [Configurations] │
├──────────────┬──────────────────────────────────────────┤
│  SIDEBAR     │  MAIN CONTENT (#main-content)            │
│  (project    │                                          │
│   list)      │  - Config form (create/edit)             │
│              │  - Config readonly view                  │
│  #sidebar-   │  - Placeholder text                     │
│   list       │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

## HTMX Interaction Flow

1. **Page load**: `config.html` renders the full shell and server-renders the sidebar list.
2. **Open project**: clicking a sidebar item or project dropdown entry sends `hx-get="/projects/<name>/"` and swaps `#main-content`.
3. **Secret key handling**: `app.js` injects `X-App-Secret-Key` into every HTMX request when the header input has a value.
4. **Readonly vs edit**: opening a project without a valid secret key returns `config_readonly.html`; opening it with a valid secret key returns `config_form.html`.
5. **Click "Configurations"**: browser navigates to `/projects/`, and the page auto-loads a blank create form into `#main-content`.
6. **Submit form**: `hx-post="/projects/<name>/"` swaps `#main-content` with the updated form. Response includes `HX-Trigger: refreshSidebar`, which causes sidebar re-fetch.
7. **Click "Clear"**: clears all form fields visually and resets assistant cards to one empty card.

## Template Hierarchy

```
config.html                        ← Full HTML document, loaded once
├── partials/header.html           ← Included server-side via {% include %}
├── #sidebar-list                  ← Swapped by HTMX (sidebar.html)
└── #main-content                  ← Swapped by HTMX:
    ├── partials/config_form.html  ← Create/edit mode
    │   └── partials/_agent_card.html  ← Repeated per agent
    └── partials/config_readonly.html  ← Read-only mode
```

## CSS Class Conventions

- **BEM-like**: `.block__element` (e.g., `.header__title`, `.agent-card__header`)
- **Modifiers**: `.block--modifier` (e.g., `.btn--primary`, `.agent-card--readonly`)
- **Utilities**: `.badge`, `.alert`, `.form-group`, `.form-row`

## Dynamic Agent Cards (JS)

`app.js` handles:
- **Add agent**: Clones `<template id="agent-card-template">`, replaces `__IDX__` with next index.
- **Remove agent**: Removes card from DOM, re-indexes remaining cards' `name` attributes.
- **Form URL**: For "create" mode, updates `hx-post` URL as user types the project name.
- **Secret key header**: Adds `X-App-Secret-Key` to HTMX requests from the header input.
- **Human gate toggle**: Shows or hides the single human gate section and enforces the max-iteration cap when disabled.
- **Team type toggle**: Shows or hides the `#selector-fields` section when `team_type` changes.
- **Toast dismiss**: Auto-fades success alerts after 4 seconds.

## Configuration Surface

- **Assistant agents**: each card stores `name`, `model`, `system_prompt`, and `temperature`. The project `objective` is automatically appended to each agent's resolved system prompt at runtime.
- **Human gate**: single optional section with enable toggle, `name`, and `interaction_mode` (`approve_reject` or `feedback`). `approve_reject` pauses after each round and lets the user approve (continue) or reject (provide feedback). `feedback` always collects free-text feedback before continuing.
- **Team**: nested config with `type` and `max_iterations`. Supported types:
  - `round_robin` — agents take turns in fixed order.
  - `selector` — a dedicated model client routes between agents each turn. Requires `model`, `system_prompt` (supports `{roles}`, `{history}`, `{participants}`), `temperature` (default `0.0`), and `allow_repeated_speaker`.
- **Model list**: loaded from root `agent_models.json` and always shown in ascending order.

## Secret Key Gating

All write operations require a valid `APP_SECRET_KEY`. The secret is entered once in the header input (`#global-secret-key`) and injected into every HTMX request via `X-App-Secret-Key` header in `app.js`.

### Affected UI Elements

| Element | Location | Mechanism | No key | With key |
|---|---|---|---|---|
| **Create / Update button** | `config_form.html` — `type="submit"` | JS `disabled` | Disabled + tooltip | Enabled |
| **Clone button** | `config_form.html` — `type="button"`, `.js-requires-secret` | JS `disabled` | Disabled + tooltip | Enabled |
| **Delete (project)** | `sidebar.html` — `.sidebar__delete` | JS `hidden` | Hidden | Visible |
| **New Chat button** | `home.html` — `#new-chat-btn` | JS `hidden` | Hidden | Visible |
| **Chat send button** | `home.html` — `#chat-send-btn` | JS `disabled` | Disabled + tooltip | Enabled |
| **Chat input** | `home.html` — `#chat-input` | JS `disabled` + placeholder | Disabled with hint | Enabled |
| **Delete (chat session)** | `chat_session_list.html` — `.chat-session-item__delete` | JS `hidden` | Hidden | Visible |
| **New-session modal** | `home.html` — `#new-session-modal` | JS closes if key removed | Auto-closed | Openable |

All write-endpoint views (`project_create`, `project_delete`, `project_clone`, `project_detail POST`, `chat_session_create`, `chat_session_delete`) also enforce the secret on the server and return a 403 response if the header is missing or invalid.

### JS Functions

- **`updateSubmitState()`** — runs on page load, after every HTMX swap (`htmx:afterSwap`), and on every keystroke in `#global-secret-key`. Handles `type="submit"` buttons and `.js-requires-secret` buttons on `.config-form`, plus `.sidebar__delete` visibility.
- **`updateChatAuthState()`** — same trigger points, but scoped to the home-page chat surface (`#new-chat-btn`, `#chat-send-btn`, `#chat-input`, `.chat-session-item__delete`, `#new-session-modal`).

### Adding a New Secret-Gated Button

To gate any new `type="button"` action button on the config form under the same rule:

1. Add class `js-requires-secret` to the `<button>` element in the template.
2. No JS changes required — `updateSubmitState()` already selects `.config-form .js-requires-secret`.
3. Ensure the corresponding view checks `_has_valid_secret(request)` and returns 403 if missing.

### Read-Only Mode

When no secret key is present, visiting a project URL (`GET /projects/<id>/`) returns `config_readonly.html` instead of `config_form.html`. The readonly template shows all fields as plain text with no form, no Clone button, and no Delete controls. This is the default state on every fresh page load.

## Textarea Pre-fill Pattern

Large `<textarea>` fields (System Prompt, Selector Prompt) follow this convention:

- CSS classes: `input input--textarea input--sm input--prompt`
- `rows="12"`
- `placeholder="Paste the <field name>…"`
- Content uses an explicit `if/else` to pre-fill with a default/hint when no saved value exists:
  ```django
  {% if value %}{{ value }}{% else %}{{ hint_var }}{% endif %}
  ```
- **Do NOT use the `|default` filter** — it cannot distinguish between an unset value and an empty string submitted by the user.
- Hint variables (`default_system_prompt`, `selector_prompt_hint`) are injected by the view via the template context.
