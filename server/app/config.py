"""HumanSign configuration module."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # Database
    database_url: str = "postgres://postgres:postgres@localhost:5432/humansign"
    database_pool_size: int = 10
    
    # Server
    server_host: str = "0.0.0.0"
    server_port: int = 8000
    debug: bool = False
    
    # ML Model
    onnx_model_path: str = "./keystroke_multiclass.onnx"
    
    # Security
    secret_key: str = "change-this-in-production"
    cors_origins: list[str] = ["http://localhost:3000"]
    
    # Keystroke Processing
    max_batch_size: int = 100
    session_timeout_minutes: int = 30
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
