"""Input validation for project configuration data."""

from .model_catalog import get_agent_model_names

TEAM_TYPES = ("round_robin", "selector")
HUMAN_GATE_INTERACTION_MODES = ("approve_reject", "feedback")
JIRA_TYPES = ("software", "service_desk", "business")


def validate_agent(data):
    """Validate and clean a single assistant agent dict."""
    if not isinstance(data, dict):
        raise ValueError("Agent must be a JSON object.")

    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("Agent 'name' is required.")

    # AutoGen requires agent names to be valid Python identifiers.
    # Sanitise: replace spaces/hyphens with underscores, strip the rest.
    import re
    sanitised = re.sub(r"[\s\-]+", "_", name)
    sanitised = re.sub(r"[^\w]", "", sanitised)
    if sanitised and sanitised[0].isdigit():
        sanitised = "_" + sanitised
    if not sanitised or not sanitised.isidentifier():
        raise ValueError(
            f"Agent name '{name}' is not a valid identifier. "
            "Use only letters, digits, and underscores (no spaces or special characters)."
        )
    name = sanitised

    model = (data.get("model") or data.get("model_name") or "").strip()
    available_models = get_agent_model_names()
    if not model:
        raise ValueError(f"Agent '{name}': 'model' is required.")
    if model not in available_models:
        raise ValueError(
            f"Agent '{name}': 'model' must be one of {', '.join(available_models)}."
        )

    system_prompt = (data.get("system_prompt") or "").strip()
    if not system_prompt:
        raise ValueError(f"Agent '{name}': 'system_prompt' is required.")

    raw_temperature = data.get("temperature", 0.7)
    try:
        temperature = float(raw_temperature)
        if not (0.0 <= temperature <= 2.0):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError(
            f"Agent '{name}': 'temperature' must be a number between 0 and 2."
        )

    return {
        "name": name,
        "model": model,
        "system_prompt": system_prompt,
        "temperature": temperature,
    }


def validate_human_gate(data):
    """Validate and clean the optional human gate configuration."""
    if not isinstance(data, dict):
        return {
            "enabled": False,
            "name": "",
            "interaction_mode": "approve_reject",
        }

    enabled = bool(data.get("enabled", False))
    name = (data.get("name") or "").strip()
    interaction_mode = (data.get("interaction_mode") or "approve_reject").strip()

    if interaction_mode not in HUMAN_GATE_INTERACTION_MODES:
        raise ValueError(
            "'human_gate.interaction_mode' must be 'approve_reject' or 'feedback'."
        )

    if enabled and not name:
        raise ValueError("'human_gate.name' is required when human gate is enabled.")

    if not enabled:
        name = ""
        interaction_mode = "approve_reject"

    return {
        "enabled": enabled,
        "name": name,
        "interaction_mode": interaction_mode,
    }


def validate_team(data, human_gate_enabled):
    """Validate and clean team configuration."""
    if not isinstance(data, dict):
        data = {}

    team_type = (data.get("type") or "round_robin").strip()
    if team_type not in TEAM_TYPES:
        raise ValueError(f"'team.type' must be one of {TEAM_TYPES}.")

    max_iterations = data.get("max_iterations", 5)
    try:
        max_iterations = int(max_iterations)
        if max_iterations < 1:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("'team.max_iterations' must be a positive integer.")

    if not human_gate_enabled and max_iterations > 10:
        raise ValueError(
            "'team.max_iterations' cannot be greater than 10 when human gate is disabled."
        )

    cleaned = {
        "type": team_type,
        "max_iterations": max_iterations,
    }

    if team_type == "selector":
        from .model_catalog import get_agent_model_names
        available_models = get_agent_model_names()

        model = (data.get("model") or "").strip()
        if not model:
            raise ValueError("'team.model' is required for Selector team type.")
        if model not in available_models:
            raise ValueError(
                f"'team.model' must be one of {', '.join(available_models)}."
            )

        system_prompt = (data.get("system_prompt") or "").strip()
        if not system_prompt:
            raise ValueError("'team.system_prompt' is required for Selector team type.")

        raw_temperature = data.get("temperature", 0.0)
        try:
            temperature = float(raw_temperature)
            if not (0.0 <= temperature <= 2.0):
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError("'team.temperature' must be a number between 0 and 2.")

        allow_repeated_raw = data.get("allow_repeated_speaker", True)
        # Checkbox sends "on" from HTML form, or bool from API
        if isinstance(allow_repeated_raw, str):
            allow_repeated_speaker = allow_repeated_raw.lower() in ("on", "true", "1", "yes")
        else:
            allow_repeated_speaker = bool(allow_repeated_raw)

        cleaned["model"] = model
        cleaned["system_prompt"] = system_prompt
        cleaned["temperature"] = temperature
        cleaned["allow_repeated_speaker"] = allow_repeated_speaker

    return cleaned


def validate_chat_session(data):
    """Validate and clean a chat session creation payload."""
    if not isinstance(data, dict):
        raise ValueError("Session data must be a JSON object.")

    project_id = (data.get("project_id") or "").strip()
    if not project_id:
        raise ValueError("'project_id' is required.")

    description = (data.get("description") or "").strip()
    if not description:
        raise ValueError("'description' is required.")

    if len(description) > 150:
        description = description[:150]

    return {
        "project_id": project_id,
        "description": description,
    }


def validate_export_mapping(data, provider_label="trello"):
    """Validate and clean an export_mapping sub-object."""
    if not isinstance(data, dict):
        data = {}

    system_prompt = (data.get("system_prompt") or "").strip()

    model = (data.get("model") or "").strip()
    valid_models = get_agent_model_names()
    if model and model not in valid_models:
        raise ValueError(
            f"'export_mapping.model' '{model}' is not in the model catalog."
        )

    try:
        temperature = float(data.get("temperature") or 0.0)
    except (TypeError, ValueError):
        temperature = 0.0
    temperature = max(0.0, min(2.0, temperature))

    return {"system_prompt": system_prompt, "model": model, "temperature": temperature}


def validate_jira_type_config(raw_type, type_name, agent_names):
    """Validate a single Jira type sub-config (software/service_desk/business)."""
    if not isinstance(raw_type, dict):
        return {"enabled": False}

    type_enabled = bool(raw_type.get("enabled", False))
    cfg = {"enabled": type_enabled}

    if not type_enabled:
        return cfg

    site_url = (raw_type.get("site_url") or "").strip()
    if not site_url:
        raise ValueError(
            f"'integrations.jira.{type_name}.site_url' is required when {type_name} is enabled."
        )

    email = (raw_type.get("email") or "").strip()
    if not email:
        raise ValueError(
            f"'integrations.jira.{type_name}.email' is required when {type_name} is enabled."
        )

    api_key = (raw_type.get("api_key") or "").strip()
    if not api_key:
        raise ValueError(
            f"'integrations.jira.{type_name}.api_key' is required when {type_name} is enabled."
        )

    # Per-type export_agents
    raw_ea = raw_type.get("export_agents") or []
    if isinstance(raw_ea, str):
        raw_ea = [raw_ea] if raw_ea else []
    export_agents = [n.strip() for n in raw_ea if isinstance(n, str) and n.strip()]
    lower_names = [n.lower() for n in agent_names]
    for ea in export_agents:
        if ea.lower() not in lower_names:
            raise ValueError(
                f"'integrations.jira.{type_name}.export_agents' entry '{ea}' must match an existing agent name."
            )

    cfg["site_url"] = site_url
    cfg["email"] = email
    cfg["api_key"] = api_key
    cfg["default_project_key"] = (raw_type.get("default_project_key") or "").strip()
    cfg["default_project_name"] = (raw_type.get("default_project_name") or "").strip()
    cfg["export_agents"] = export_agents
    cfg["export_mapping"] = validate_export_mapping(raw_type.get("export_mapping") or {}, provider_label=f"jira.{type_name}")

    return cfg


def validate_jira_integration(raw_jira, agent_names):
    """Validate and clean the full jira integration config."""
    if not isinstance(raw_jira, dict):
        return {"enabled": False}

    jira_enabled = bool(raw_jira.get("enabled", False))
    if not jira_enabled:
        return {"enabled": False}

    jira = {
        "enabled": True,
    }

    any_type_enabled = False
    for type_name in JIRA_TYPES:
        raw_type = raw_jira.get(type_name) or {}
        jira[type_name] = validate_jira_type_config(raw_type, type_name, agent_names)
        if jira[type_name].get("enabled"):
            any_type_enabled = True

    if not any_type_enabled:
        raise ValueError(
            "At least one Jira project type (software, service_desk, business) must be enabled when Jira is enabled."
        )

    return jira


def validate_integrations(data, agent_names):
    """Validate and clean the optional integrations configuration."""
    if not isinstance(data, dict):
        return {
            "enabled": False,
            "trello": {"enabled": False},
            "jira": {"enabled": False},
        }

    enabled = bool(data.get("enabled", False))

    if not enabled:
        return {
            "enabled": False,
            "trello": {"enabled": False},
            "jira": {"enabled": False},
        }

    # --- Trello ---
    raw_trello = data.get("trello") or {}
    trello_enabled = bool(raw_trello.get("enabled", False))
    trello = {"enabled": trello_enabled}

    if trello_enabled:
        app_name = (raw_trello.get("app_name") or "").strip()
        if not app_name:
            raise ValueError("'integrations.trello.app_name' is required when Trello is enabled.")

        api_key = (raw_trello.get("api_key") or "").strip()
        if not api_key:
            raise ValueError("'integrations.trello.api_key' is required when Trello is enabled.")

        # Validate export_agents list
        raw_ea = raw_trello.get("export_agents") or []
        if isinstance(raw_ea, str):
            raw_ea = [raw_ea] if raw_ea else []
        export_agents = [n.strip() for n in raw_ea if isinstance(n, str) and n.strip()]
        lower_names = [n.lower() for n in agent_names]
        for ea in export_agents:
            if ea.lower() not in lower_names:
                raise ValueError(
                    f"'integrations.trello.export_agents' entry '{ea}' must match an existing agent name."
                )

        trello["export_agents"] = export_agents
        trello["app_name"] = app_name
        trello["api_key"] = api_key
        trello["token"] = (raw_trello.get("token") or "").strip()
        trello["token_generated_at"] = (raw_trello.get("token_generated_at") or "").strip()
        trello["default_workspace_id"] = (raw_trello.get("default_workspace_id") or "").strip()
        trello["default_workspace_name"] = (raw_trello.get("default_workspace_name") or raw_trello.get("default_workspace") or "").strip()
        trello["default_board_id"] = (raw_trello.get("default_board_id") or "").strip()
        trello["default_board_name"] = (raw_trello.get("default_board_name") or "").strip()
        trello["default_list_id"] = (raw_trello.get("default_list_id") or "").strip()
        trello["default_list_name"] = (raw_trello.get("default_list_name") or "").strip()
        trello["export_mapping"] = validate_export_mapping(
            raw_trello.get("export_mapping") or {}
        )

    # --- Jira ---
    raw_jira = data.get("jira") or {}
    jira = validate_jira_integration(raw_jira, agent_names)

    # At least one provider must be enabled
    if not trello_enabled and not jira.get("enabled"):
        raise ValueError(
            "At least one export provider (Trello or Jira) must be enabled when integrations are enabled."
        )

    return {
        "enabled": enabled,
        "trello": trello,
        "jira": jira,
    }


def validate_project(data):
    """Validate and clean a full project settings dict."""
    if not isinstance(data, dict):
        raise ValueError("Project data must be a JSON object.")

    project_name = (data.get("project_name") or "").strip()
    if not project_name:
        raise ValueError("'project_name' is required.")

    objective = (data.get("objective") or "").strip()
    if not objective:
        raise ValueError("'objective' is required.")

    raw_agents = data.get("agents")
    if not isinstance(raw_agents, list) or len(raw_agents) == 0:
        raise ValueError("At least one assistant agent is required.")

    agents = [validate_agent(agent) for agent in raw_agents]
    agent_names = [agent["name"].lower() for agent in agents]
    if len(agent_names) != len(set(agent_names)):
        raise ValueError("Assistant agent names must be unique.")

    human_gate = validate_human_gate(data.get("human_gate") or {})
    team = validate_team(data.get("team") or {}, human_gate["enabled"])
    integrations = validate_integrations(
        data.get("integrations") or {},
        [a["name"] for a in agents],
    )

    return {
        "project_name": project_name,
        "objective": objective,
        "agents": agents,
        "human_gate": human_gate,
        "team": team,
        "integrations": integrations,
    }
