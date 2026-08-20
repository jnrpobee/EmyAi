"""Structured event markers the pipeline prints to stdout for web_app.py to parse."""

import json

# Every event line starts with this so Gradio can spot it in stdout.
EVENT_PREFIX = "EVENT:"


def emit_event(event_type: str, **payload) -> None:
    """Print an event line that Gradio can read.

    `event_type` names the event (e.g. "final_result"); `payload` becomes the
    rest of the JSON object's fields.
    """
    event = {"type": event_type, **payload}
    # `flush=True` sends it right away instead of waiting.
    print(f"{EVENT_PREFIX} {json.dumps(event, ensure_ascii=True)}", flush=True)
