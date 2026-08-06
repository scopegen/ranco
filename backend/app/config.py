from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    # Only needed when database_url uses the postgresql+auroradataapi://
    # dialect (production, running against Aurora Serverless v2 via RDS
    # Data API). Unused for local dev against a normal Postgres connection.
    db_cluster_arn: str | None = None
    db_secret_arn: str | None = None
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()