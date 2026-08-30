from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./var/db/liuli.sqlite3"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 1440
    tushare_token: str = ""
    openai_api_key: str = ""
    qwen_api_key: str = ""
    deepseek_api_key: str = ""
    log_level: str = "INFO"
    mcp_public_base_url: str = "http://127.0.0.1:8000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
