import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import close_db, init_db
from routers import auth, compile, health, history, kb
from utils.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title="Sourced API",
    description="Generates job-tailored LaTeX resumes from a personal knowledge base",
    version="0.2.0",
    lifespan=lifespan,
)


class PasswordGate:
    """
    Plain ASGI middleware, deliberately not @app.middleware("http"): that style
    (BaseHTTPMiddleware) wraps the connection and hides client disconnects, which
    silently broke Cancel — a cancelled generation ran to the end and was billed (tested).
    This passes `receive` straight through, so the endpoint still sees the disconnect.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and auth.gate_enabled():
            request = Request(scope)
            if (
                request.method != "OPTIONS"  # CORS preflights carry no token
                and request.url.path.startswith("/api/")
                and request.url.path not in auth.OPEN_PATHS
                and not auth.token_valid(auth.bearer(request))
            ):
                response = JSONResponse({"detail": "Sign in required"}, status_code=401)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


# Middleware added later wraps earlier ones, so the gate runs *inside* CORS — a 401 still
# carries CORS headers and the browser shows it as a 401 instead of a network error.
app.add_middleware(PasswordGate)


extra_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:4173",  # Vite preview
        "http://127.0.0.1:5173",
        *extra_origins,  # the deployed frontend (CORS_ORIGINS)
    ],
    allow_credentials=False,  # auth is a bearer token, not a cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(health.router)
app.include_router(kb.router)
app.include_router(compile.router)
app.include_router(history.router)


@app.get("/")
async def root():
    return {"message": "Sourced API is running. See /docs for API reference."}
