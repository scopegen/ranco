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
    # 90 days — sessions should survive normal day-to-day use (closing and
    # reopening the browser, coming back the next day) without re-prompting
    # for login, same as most consumer apps. Trade-off: a leaked token stays
    # valid for the full window since there's no server-side revoke short of
    # rotating jwt_secret (which logs everyone out at once).
    jwt_expire_minutes: int = 129_600
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()