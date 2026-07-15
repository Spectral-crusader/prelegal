"""Runtime configuration, resolved from the environment with local-dev defaults."""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# Local dev reads the repo-root .env; in the image the same keys arrive as real
# environment variables (docker-compose `env_file`), where this is a no-op.
load_dotenv(REPO_ROOT / ".env")

# The SQLite file. Ephemeral by design: it lives on the container filesystem so
# each `docker compose up` starts from an empty database.
DB_PATH = Path(os.environ.get("PRELEGAL_DB_PATH", BACKEND_DIR / "prelegal.db"))

# The statically exported frontend. In the image the build stage drops it next
# to the backend; locally it stays in frontend/out.
STATIC_DIR = Path(os.environ.get("PRELEGAL_STATIC_DIR", REPO_ROOT / "frontend" / "out"))

# The document registry. Lives at the repo root beside catalog.json, whose
# template filenames it references; the image copies it next to the backend.
DOCUMENTS_PATH = Path(os.environ.get("PRELEGAL_DOCUMENTS_PATH", REPO_ROOT / "documents.json"))
