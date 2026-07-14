"""FastAPI application: the API plus the statically built frontend.

The frontend is exported to plain HTML/JS by Next.js and served from here, so
the whole product is one process on one port.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import STATIC_DIR
from .db import init_db
from .routes.api import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Prelegal", lifespan=lifespan)

# Registered before the static mount below, which is a catch-all at "/".
app.include_router(api_router)

# Absent until `npm run build` has produced the export, which is the normal
# state when running backend tests.
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
