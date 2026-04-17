"""Helpers for building AutoGen teams from saved configuration."""

from __future__ import annotations

from .factory import build_model_client
from .prompt_builder import resolve_system_prompt


def build_agent_runtime_spec(agent_config: dict) -> dict:
    """Return a lightweight runtime spec for a configured assistant agent."""
    return {
        "name": agent_config["name"],
        "model_client": build_model_client(
            agent_config["model"],
            temperature=agent_config.get("temperature", 0.6),
        ),
        "system_message": resolve_system_prompt(agent_config.get("system_prompt")),
    }


def build_team(project: dict):
    """
    Build a RoundRobinGroupChat team from a normalized project config.

    Termination strategy:
      - human_gate disabled → MaxMessageTermination(n_agents × max_iterations)
        All rounds fire automatically, no pause.
      - human_gate enabled  → MaxMessageTermination(n_agents)
        Stops after one full round so the human can review and decide.
        Caller is responsible for calling run_stream() again per round.
    """
    from autogen_agentchat.agents import AssistantAgent
    from autogen_agentchat.conditions import MaxMessageTermination
    from autogen_agentchat.teams import RoundRobinGroupChat

    agents = []
    import re
    for agent_cfg in project["agents"]:
        spec = build_agent_runtime_spec(agent_cfg)
        # Ensure name is a valid Python identifier (safety net for legacy docs)
        safe_name = re.sub(r"[\s\-]+", "_", spec["name"])
        safe_name = re.sub(r"[^\w]", "", safe_name)
        if safe_name and safe_name[0].isdigit():
            safe_name = "_" + safe_name
        if not safe_name:
            safe_name = f"agent_{len(agents)}"
        agents.append(
            AssistantAgent(
                name=safe_name,
                model_client=spec["model_client"],
                system_message=spec["system_message"],
            )
        )

    has_gate = project.get("human_gate", {}).get("enabled", False)
    n_agents = len(agents)
    max_iter = project.get("team", {}).get("max_iterations", 5)

    n_messages = n_agents if has_gate else n_agents * max_iter
    termination = MaxMessageTermination(n_messages)

    return RoundRobinGroupChat(agents, termination_condition=termination)
