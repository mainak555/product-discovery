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
- **Toast dismiss**: Auto-fades success alerts after 4 seconds.

## Configuration Surface

- **Assistant agents**: each card stores `name`, `model`, `system_prompt`, and `temperature`.
- **Human gate**: single optional section with enable toggle, `name`, and `interaction_mode` (`approve_reject` or `feedback`).
- **Team**: nested config with `type` and `max_iterations`; `round_robin` is the default and only current option.
- **Model list**: loaded from root `agent_models.json` and always shown in ascending order.
