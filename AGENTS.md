# AGENTS.md — Development Instructions

## Overview

Product Discovery is a Django SPA for managing AutoGen agent configurations.
It uses HTMX for partial page updates, SCSS for styling, and PyMongo for MongoDB persistence.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for:
- Project structure and directory layout
- Layer responsibilities (db → schemas → services → views → templates)
- Root `agents/` runtime package responsibilities
- Conventions and coding standards

## API Reference

See [docs/API.md](docs/API.md) for:
- All URL routes and HTTP methods
- Request/response formats
- HTMX partial swap patterns

## UI & Templates

See [docs/UI.md](docs/UI.md) for:
- Page layout and HTMX interaction flow
- Template hierarchy (base → partials)
- CSS class naming conventions

## Key Rules

1. **Business logic lives in `server/services.py`** — views are thin controllers
2. **Validation lives in `server/schemas.py`** — returns clean dicts or raises `ValueError`
3. **MongoDB access lives in `server/db.py`** — singleton connection, no ORM
4. **Model catalog lives in `agent_models.json`** — model names are the UI key and are always displayed ascending
5. **AutoGen runtime code belongs in root `agents/`** — keep provider/client logic out of `server/`
6. **No Django ORM** — `DATABASES = {}`, sessions use signed cookies
7. **`APP_SECRET_KEY`** gates write access — HTMX requests send it as `X-App-Secret-Key`
8. **All env vars** read via `os.getenv()` with sensible defaults
9. **Templates** use HTMX partials pattern: full page loads `config.html`, subsequent interactions swap partials into `#main-content` or `#sidebar-list`
10. **SCSS** compiled by django-compressor + django-libsass
11. **No test suite yet** — planned for a future phase