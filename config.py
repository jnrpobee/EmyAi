"""Shared config types and the loader for the agent pipeline's config file (agents.yaml)."""

from pathlib import Path
from typing import NotRequired, TypedDict


class Agent(TypedDict):
    """Definition of a single agent as declared under `agents:` in the config file."""

    name: str  # Unique identifier; also used as the tool name other agents call to delegate to it.
    description: str  # Human-readable summary; becomes the tool's docstring when exposed to other agents.
    prompt: str  # System prompt that defines the agent's role/instructions.
    model: str  # OpenAI model id used for this agent's responses.
    tools: list[str]  # Names of tools (including other agents) this agent may call.
    kwargs: dict | None  # Extra keyword args forwarded to client.responses.create().


class Config(TypedDict):
    """Top-level shape of the loaded config file: the agent roster plus its entry point(s)."""

    agents: list[Agent]
    main: str  # Name of the agent to start with in interactive mode.
    automated: NotRequired[str]  # Optional: agent to start with in automated/auto mode (falls back to `main`).


def load_config(config_path: Path = "agents.yaml") -> Config:
    """Load a pipeline config from YAML, JSON, or markdowndata, based on the file extension."""
    ext = config_path.suffix.lower()
    if ext in [".yaml", ".yml"]:
        import yaml

        return yaml.safe_load(config_path.read_text())

    elif ext in [".json"]:
        import json

        return json.loads(config_path.read_text())

    elif ext in [".md", ".mdd"]:
        import markdowndata

        return markdowndata.loads(config_path.read_text())

    else:
        raise NotImplementedError(f"Unsupported config format: {config_path.suffix}")
