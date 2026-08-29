import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import invest_assistant.modules.basic.auth.models  # noqa: F401
import invest_assistant.modules.basic.mcp.oauth.models  # noqa: F401
import invest_assistant.modules.basic.system_config.models  # noqa: F401
from invest_assistant.bootstrap.database import Base


@pytest.fixture()
def oauth_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
