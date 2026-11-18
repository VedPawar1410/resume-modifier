from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.parent


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""

    # Primary model for resume generation (Claude, via Anthropic's OpenAI-compatible
    # endpoint). Groq and OpenRouter are fallbacks.
    kb_model: str = "claude-haiku-5-5"

    # kb.md lives in a separate private repo, cloned next to this one by default.
    kb_path: Path = ROOT_DIR.parent / "resume-knowledge-base" / "kb.md"

    # ── Deployment settings — all optional; unset means local-dev behaviour ──────
    # Read kb.md from the private GitHub repo instead of kb_path ("owner/repo"), with a
    # fine-grained token that can only read that repo's contents.
    kb_github_repo: str = ""
    github_token: str = ""
    # Postgres (Neon) instead of the local SQLite file.
    database_url: str = ""
    # Password gate: when set, every API route except /api/health and /api/login needs a
    # token from /api/login. Unset = no gate (local dev).
    app_password: str = ""
    # Signs login tokens; changing it logs every device out.
    auth_secret: str = ""
    # Extra allowed browser origins, comma-separated (e.g. the Vercel URL).
    cors_origins: str = ""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
