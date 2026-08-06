from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# The Aurora Data API dialect (postgresql+auroradataapi://) ignores
# credentials in the URL itself — the cluster and secret ARNs have to be
# passed separately via connect_args. Local dev (a plain
# postgresql+psycopg:// URL) doesn't need this at all.
_connect_args = {}
if settings.database_url.startswith("postgresql+auroradataapi://"):
    if not settings.db_cluster_arn or not settings.db_secret_arn:
        raise RuntimeError(
            "DATABASE_URL uses the Aurora Data API dialect but "
            "DB_CLUSTER_ARN / DB_SECRET_ARN aren't set."
        )
    _connect_args = {
        "aurora_cluster_arn": settings.db_cluster_arn,
        "secret_arn": settings.db_secret_arn,
    }

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()