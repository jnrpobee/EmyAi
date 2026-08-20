"""Structured event markers the pipeline prints to stdout for web_app.py to parse."""

import json

# Every event line starts with this so the web app's reader thread can spot it in stdout.
EVENT_PREFIX = "EVENT:"


def emit_event(event_type: str, **payload) -> None:
    """Print an event line that web_app.py's subprocess reader thread can parse.

    `event_type` names the event (e.g. "final_result"); `payload` becomes the
    rest of the JSON object's fields.
    """
    event = {"type": event_type, **payload}
    # `flush=True` sends it right away instead of waiting.
    print(f"{EVENT_PREFIX} {json.dumps(event, ensure_ascii=True)}", flush=True)
