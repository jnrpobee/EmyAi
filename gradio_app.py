"""Compatibility launcher for EmyAI.

Kept as a separate entrypoint (legacy Gradio-named script) that simply serves
the real FastAPI/web app defined in web_app.py via uvicorn.
"""

from __future__ import annotations

import uvicorn

from web_app import app

if __name__ == "__main__":
    # Serve the web_app FastAPI app on all interfaces, port 7861.
    uvicorn.run(app, host="0.0.0.0", port=7861)
