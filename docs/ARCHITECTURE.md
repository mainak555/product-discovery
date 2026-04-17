# Architecture

## Project Structure

```
product-discovery/
├── agents/              # Root AutoGen runtime package (model factory, team builder)
├── agent_models.json    # Shared model catalog keyed by model name
├── config/              # Django project package (settings, root URLs, WSGI)
├── server/              # Main Django app
│   ├── db.py            # MongoDB connection singleton (PyMongo)
│   ├── model_catalog.py # Shared model catalog + default prompt loader for Django
│   ├── schemas.py       # Input validation (validate_project, validate_agent)
│   ├── services.py      # Business logic (CRUD, auth verification)
│   ├── views.py         # HTMX view controllers (thin, delegates to services)
│   ├── urls.py          # App URL routing
│   ├── templates/server/
│   │   ├── config.html             # Full SPA shell
│   │   └── partials/
│   │       ├── header.html          # Header bar
│   │       ├── sidebar.html         # Project list
│   │       ├── config_form.html     # Create/Edit form
│   │       ├── config_readonly.html # Read-only view
│   │       └── _agent_card.html     # Reusable agent card fragment
│   └── static/server/
│       ├── scss/        # SCSS source (compiled by django-compressor)
│       └── js/          # Client-side JS (agent card dynamics)
├── docs/                # Project documentation
├── .env                 # Environment variables (gitignored)
├── Dockerfile           # Production container
├── requirements.txt     # Python dependencies
└── manage.py            # Django management
```

## Layer Responsibilities

### `db.py` — Data Access
- Provides `get_client()`, `get_db()`, `get_collection(name)`.
- Manages MongoDB connection as a module-level singleton.
- Creates indexes on startup (`project_name` unique index on `project_settings`).

### `schemas.py` — Validation
- `validate_project(data)` — validates and cleans project configuration data.
- `validate_agent(data)` — validates a single assistant agent entry.
- `validate_human_gate(data)` — validates the optional approval/feedback gate.
- `validate_team(data, human_gate_enabled)` — validates team type and max iterations.
- Returns cleaned `dict` or raises `ValueError` with a descriptive message.
- No database or request coupling.

### `services.py` — Business Logic
- `list_projects()` — returns all projects sorted by name.
- `get_project(name)` — returns a single normalized project or `None`.
- `create_project(data)` — validates, inserts, handles duplicate name errors.
- `update_project(name, data)` — validates, replaces existing document.
- `normalize_project(data)` — adapts old documents to the new nested shape for display.
- `get_available_models()` — returns the sorted model catalog used by the UI.
- `verify_secret_key(key)` — constant-time comparison against `APP_SECRET_KEY`.
- All functions work with plain dicts — no HTTP/request coupling.

### `views.py` — HTTP/HTMX Controllers
- Parses request data, calls service functions, renders HTMX partials.
- Checks `X-App-Secret-Key` request headers for write access.
- Returns `HX-Trigger` headers for cross-partial updates (e.g., sidebar refresh).

### Root `agents/` Package — Runtime Integration
- `agents/config_loader.py` reads the shared `agent_models.json` catalog.
- `agents/factory.py` resolves provider-specific AutoGen model clients from model names.
- `agents/prompt_builder.py` owns prompt defaults and prompt resolution.
- `agents/team_builder.py` is the future handoff point for building AutoGen teams from saved configuration.

Provider client resolution in `agents/factory.py` (builder-per-provider pattern):
- `openai`          → `OpenAIChatCompletionClient` — direct OpenAI API
- `anthropic`       → `AnthropicChatCompletionClient` — direct Anthropic API
- `google`          → `GeminiChatCompletionClient` — direct Google Gemini API
- `azure_openai`    → `AzureOpenAIChatCompletionClient` — Azure AI Foundry OpenAI deployment
- `azure_anthropic` → `AnthropicChatCompletionClient` with `base_url` — Anthropic model on Azure AI Foundry

To add a new provider, define a `_build_<name>` function in `agents/factory.py` and add one entry to `_PROVIDER_BUILDERS`.

## Conventions

- **Env vars**: Always `os.getenv("VAR", "default")`. No third-party env library.
- **Provider secrets**: API keys are read from env only — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_ANTHROPIC_API_KEY`.
- **Provider endpoints**: Azure endpoint URLs are stored per-model in `agent_models.json` under the `endpoint` field. No endpoint env var is used; each Azure resource has its own URL.
- **No Django ORM**: `DATABASES = {}`. Sessions use signed cookies.
- **Secret key auth**: GET/POST HTMX requests can carry `X-App-Secret-Key`; invalid or missing keys get read-only views or rejected saves.
- **Model catalog**: `agent_models.json` is keyed by model name/deployment name; provider stays internal to runtime code.
- **SCSS**: Compiled at request time in dev, offline in production.
- **Template naming**: Partials in `partials/` subdirectory, prefixed with `_` for includes.
