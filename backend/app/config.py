"""Runtime configuration, resolved from the environment with local-dev defaults."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# The SQLite file. Ephemeral by design: it lives on the container filesystem so
# each `docker compose up` starts from an empty database.
DB_PATH = Path(os.environ.get("PRELEGAL_DB_PATH", BACKEND_DIR / "prelegal.db"))

# The statically exported frontend. In the image the build stage drops it next
# to the backend; locally it stays in frontend/out.
STATIC_DIR = Path(os.environ.get("PRELEGAL_STATIC_DIR", REPO_ROOT / "frontend" / "out"))
