# Liuli Phase 1 System Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-stage `liuli` backend skeleton from `docs/liuli_system_spec_v6.md`: FastAPI app, worker entrypoint, SQLite/SQLAlchemy foundation, auth, stock master, system config, job center, report library, and disclosure library base APIs.

**Architecture:** Treat `D:\code\ai\liuli-v2` as the new `liuli` project root and set the package/project metadata to `liuli`; do not create a nested `liuli/` directory. Backend code follows the spec's module-first layout under `invest_assistant/`, with business modules owning their models, schemas, services, routers, and jobs. Web and Android do not switch technology stacks in this phase; they remain future consumers of the new API.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.x, Pydantic v2, APScheduler, SQLite, pytest, httpx, passlib/bcrypt, python-jose.

---

## Scope Boundaries

This phase implements only spec stage 1 plus basic library modules needed by stage 1.

In scope:
- Backend project skeleton from spec section 9.
- FastAPI API process and separate worker process.
- SQLite database at `var/db/liuli.sqlite3`.
- SQLAlchemy model metadata and deterministic table creation for MVP.
- JWT login, default single user, password hashing, authenticated API dependencies.
- Basic CRUD/list endpoints for `stock_master`, `system_config`, `job_center`, `report_library`, and `disclosure_library`.
- Job definition registry, manual run request creation, worker polling loop, execution log writing.
- Empty `JOBS` registration points for later business modules.
- Minimal tests that prove the skeleton boots, tables exist, auth works, and manual job requests flow through the job center.

Out of scope:
- Market radar ingestion, CLS news sync, tag extraction, heat aggregation, and graph generation.
- CNInfo announcement fetching, PDF download, and PDF parsing.
- Web/Android rewrites or technology migration.
- Old database migrations and old table compatibility.
- Multi-user SaaS permissions, tenancy, or role management.

Old system references allowed:
- `old/invest_assistant/modules/task_center/base.py` for task metadata ideas only.
- `old/invest_assistant/modules/task_center/jobs/job_sync_stock_basic_ak_free/job.py` for later stock sync parsing ideas only; do not create `stock_basic_ak`.
- `old/invest_assistant/modules/news_center/service.py` for later CLS ingestion ideas only; not used in phase 1.
- `old/invest_assistant/modules/ai_analysis/providers/*` for later provider adapter patterns only; no centralized AI center in phase 1.

## File Structure

Create:
- `pyproject.toml`: Python package metadata, dependencies, pytest config, console commands.
- `.env.example`: startup and sensitive config keys from the spec.
- `README.md`: phase 1 run commands and backend/frontend boundary notes.
- `invest_assistant/__init__.py`: package marker.
- `invest_assistant/main.py`: API process entrypoint exposing `app`.
- `invest_assistant/worker.py`: worker process entrypoint.
- `invest_assistant/bootstrap/config.py`: environment settings.
- `invest_assistant/bootstrap/database.py`: SQLAlchemy engine/session/base.
- `invest_assistant/bootstrap/logging.py`: logging setup.
- `invest_assistant/bootstrap/app.py`: FastAPI app factory and router registration.
- `invest_assistant/bootstrap/scheduler.py`: APScheduler construction for later scheduled jobs.
- `invest_assistant/shared/errors.py`: typed HTTP/domain errors.
- `invest_assistant/shared/time_utils.py`: UTC/local timestamp helpers.
- `invest_assistant/shared/pagination.py`: pagination input/output helpers.
- `invest_assistant/shared/response.py`: simple API response helpers.
- `invest_assistant/shared/file_utils.py`: runtime directory creation and safe relative path helpers.
- `invest_assistant/shared/enums.py`: common status constants with no business logic.
- `invest_assistant/shared/db_types.py`: JSON text type helpers for SQLite.
- `invest_assistant/modules/basic/auth/models.py`
- `invest_assistant/modules/basic/auth/schemas.py`
- `invest_assistant/modules/basic/auth/security.py`
- `invest_assistant/modules/basic/auth/dependencies.py`
- `invest_assistant/modules/basic/auth/service.py`
- `invest_assistant/modules/basic/auth/router.py`
- `invest_assistant/modules/basic/stock_master/models.py`
- `invest_assistant/modules/basic/stock_master/schemas.py`
- `invest_assistant/modules/basic/stock_master/service.py`
- `invest_assistant/modules/basic/stock_master/router.py`
- `invest_assistant/modules/basic/stock_master/jobs.py`
- `invest_assistant/modules/basic/system_config/models.py`
- `invest_assistant/modules/basic/system_config/schemas.py`
- `invest_assistant/modules/basic/system_config/service.py`
- `invest_assistant/modules/basic/system_config/router.py`
- `invest_assistant/modules/basic/job_center/models.py`
- `invest_assistant/modules/basic/job_center/schemas.py`
- `invest_assistant/modules/basic/job_center/types.py`
- `invest_assistant/modules/basic/job_center/registry.py`
- `invest_assistant/modules/basic/job_center/service.py`
- `invest_assistant/modules/basic/job_center/dispatcher.py`
- `invest_assistant/modules/basic/job_center/scheduler.py`
- `invest_assistant/modules/basic/job_center/worker.py`
- `invest_assistant/modules/basic/job_center/router.py`
- `invest_assistant/modules/basic/report_library/models.py`
- `invest_assistant/modules/basic/report_library/schemas.py`
- `invest_assistant/modules/basic/report_library/service.py`
- `invest_assistant/modules/basic/report_library/router.py`
- `invest_assistant/modules/basic/disclosure_library/models.py`
- `invest_assistant/modules/basic/disclosure_library/schemas.py`
- `invest_assistant/modules/basic/disclosure_library/service.py`
- `invest_assistant/modules/basic/disclosure_library/router.py`
- `invest_assistant/modules/basic/disclosure_library/jobs.py`
- `invest_assistant/modules/console/router.py`
- `invest_assistant/modules/market_radar/jobs.py`
- `invest_assistant/modules/alert_center/jobs.py`
- `invest_assistant/modules/knowledge_base/jobs.py`
- `tests/conftest.py`
- `tests/unit/test_auth.py`
- `tests/unit/test_job_center.py`
- `tests/unit/test_basic_modules.py`
- `tests/integration/test_app_boot.py`

Keep:
- `docs/liuli_system_spec_v6.md`: sole architecture source.
- `old/`: reference only, never import from it.
- Existing Web/Android under `old/`: not migrated in phase 1.

## Task 1: Project Metadata And Runtime Directories

**Files:**
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `README.md`
- Create: `data/seed/.gitkeep`
- Create: `data/samples/.gitkeep`
- Create: `data/import/.gitkeep`
- Create: `data/export/.gitkeep`
- Create: `tools/dev/.gitkeep`
- Create: `tools/jobs/.gitkeep`
- Create: `tools/debug/.gitkeep`
- Create: `tools/export/.gitkeep`
- Create: `var/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing metadata tests**

Create `tests/integration/test_app_boot.py` with:

```python
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parents[2]


def test_project_is_named_liuli():
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert data["project"]["name"] == "liuli"


def test_runtime_directories_are_ignored_but_present():
    assert (ROOT / "var").exists()
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "var/*" in gitignore
    assert "!var/.gitkeep" in gitignore
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pytest tests/integration/test_app_boot.py -q
```

Expected: failure because `pyproject.toml` and `var/.gitkeep` do not exist yet.

- [ ] **Step 3: Create metadata and directory files**

Create `pyproject.toml`:

```toml
[project]
name = "liuli"
version = "0.1.0"
description = "Personal investment assistant backend"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.111.0",
  "uvicorn[standard]>=0.30.0",
  "sqlalchemy>=2.0.30",
  "pydantic>=2.7.0",
  "pydantic-settings>=2.2.1",
  "apscheduler>=3.10.4",
  "python-jose[cryptography]>=3.3.0",
  "passlib[bcrypt]>=1.7.4",
  "python-multipart>=0.0.9",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.2.0",
  "httpx>=0.27.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

Create `.env.example`:

```env
DATABASE_URL=sqlite:///./var/db/liuli.sqlite3
SECRET_KEY=change-me
ACCESS_TOKEN_EXPIRE_MINUTES=1440
TUSHARE_TOKEN=
OPENAI_API_KEY=
QWEN_API_KEY=
LOG_LEVEL=INFO
```

Create `README.md`:

```markdown
# liuli

`liuli` is a personal investment assistant system. The backend follows `docs/liuli_system_spec_v6.md`.

## Phase 1 Backend

Run API:

```powershell
uvicorn invest_assistant.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Run worker:

```powershell
python -m invest_assistant.worker
```

Run tests:

```powershell
pytest
```

## Frontend Boundary

The existing Web and Android technology stacks are not migrated in this rewrite. Backend implementation follows the spec strictly; Web and Android will adapt to the new API later.
```

Update `.gitignore`:

```gitignore
__pycache__/
.pytest_cache/
.venv/
*.pyc
.env
var/*
!var/.gitkeep
!var/db/.gitkeep
!var/logs/.gitkeep
!var/cache/.gitkeep
!var/raw/.gitkeep
!var/processed/.gitkeep
!var/reports/.gitkeep
!var/exports/.gitkeep
```

Create the listed `.gitkeep` files, including `var/db/.gitkeep`, `var/logs/.gitkeep`, `var/cache/.gitkeep`, `var/raw/.gitkeep`, `var/processed/.gitkeep`, `var/reports/.gitkeep`, and `var/exports/.gitkeep`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pytest tests/integration/test_app_boot.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add pyproject.toml .env.example README.md .gitignore data tools var tests/integration/test_app_boot.py
git commit -m "chore: initialize liuli project metadata"
```

## Task 2: Bootstrap FastAPI And Database Foundation

**Files:**
- Create: `invest_assistant/__init__.py`
- Create: `invest_assistant/main.py`
- Create: `invest_assistant/worker.py`
- Create: `invest_assistant/bootstrap/__init__.py`
- Create: `invest_assistant/bootstrap/config.py`
- Create: `invest_assistant/bootstrap/database.py`
- Create: `invest_assistant/bootstrap/logging.py`
- Create: `invest_assistant/bootstrap/app.py`
- Create: `invest_assistant/bootstrap/scheduler.py`
- Create: `invest_assistant/shared/time_utils.py`
- Create: `invest_assistant/shared/errors.py`
- Create: `invest_assistant/shared/pagination.py`
- Create: `invest_assistant/shared/response.py`
- Create: `invest_assistant/shared/file_utils.py`
- Create: `invest_assistant/shared/enums.py`
- Create: `invest_assistant/shared/db_types.py`
- Modify: `tests/integration/test_app_boot.py`

- [ ] **Step 1: Extend failing app boot tests**

Append to `tests/integration/test_app_boot.py`:

```python
from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.config import get_settings


def test_app_health_endpoint_returns_ok():
    client = TestClient(create_app())
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_settings_default_database_url_points_to_var_db():
    settings = get_settings()
    assert settings.database_url.endswith("var/db/liuli.sqlite3")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pytest tests/integration/test_app_boot.py::test_app_health_endpoint_returns_ok tests/integration/test_app_boot.py::test_settings_default_database_url_points_to_var_db -q
```

Expected: import failure because bootstrap modules do not exist.

- [ ] **Step 3: Implement bootstrap files**

Create `invest_assistant/bootstrap/config.py`:

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./var/db/liuli.sqlite3"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 1440
    tushare_token: str = ""
    openai_api_key: str = ""
    qwen_api_key: str = ""
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Create `invest_assistant/bootstrap/database.py`:

```python
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from invest_assistant.bootstrap.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return
    raw_path = database_url.replace("sqlite:///", "", 1)
    db_path = Path(raw_path)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)


settings = get_settings()
_ensure_sqlite_parent(settings.database_url)
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all_tables() -> None:
    import invest_assistant.modules.basic.auth.models
    import invest_assistant.modules.basic.stock_master.models
    import invest_assistant.modules.basic.system_config.models
    import invest_assistant.modules.basic.job_center.models
    import invest_assistant.modules.basic.report_library.models
    import invest_assistant.modules.basic.disclosure_library.models

    Base.metadata.create_all(bind=engine)
```

Create `invest_assistant/bootstrap/app.py`:

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="liuli", version="0.1.0")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

Create `invest_assistant/main.py`:

```python
from invest_assistant.bootstrap.app import create_app

app = create_app()
```

Create `invest_assistant/worker.py`:

```python
def main() -> None:
    from invest_assistant.modules.basic.job_center.worker import run_worker

    run_worker()


if __name__ == "__main__":
    main()
```

Create minimal shared files:

```python
# invest_assistant/shared/time_utils.py
from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
```

```python
# invest_assistant/shared/response.py
def ok(data=None, message: str = "ok") -> dict:
    return {"success": True, "message": message, "data": data}
```

```python
# invest_assistant/shared/pagination.py
from pydantic import BaseModel, Field


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size
```

```python
# invest_assistant/shared/errors.py
class LiuliError(Exception):
    pass


class NotFoundError(LiuliError):
    pass
```

```python
# invest_assistant/shared/file_utils.py
from pathlib import Path


def ensure_dir(path: str | Path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target
```

```python
# invest_assistant/shared/enums.py
ACTIVE = "active"
DISABLED = "disabled"
ARCHIVED = "archived"
```

```python
# invest_assistant/shared/db_types.py
import json
from typing import Any


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads_json(value: str | None) -> Any:
    if not value:
        return None
    return json.loads(value)
```

Create `invest_assistant/bootstrap/logging.py`:

```python
import logging

from invest_assistant.bootstrap.config import get_settings


def configure_logging() -> None:
    logging.basicConfig(level=get_settings().log_level)
```

Create `invest_assistant/bootstrap/scheduler.py`:

```python
from apscheduler.schedulers.background import BackgroundScheduler


def create_scheduler() -> BackgroundScheduler:
    return BackgroundScheduler(timezone="Asia/Shanghai")
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pytest tests/integration/test_app_boot.py -q
```

Expected: all tests in that file pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add invest_assistant tests/integration/test_app_boot.py
git commit -m "feat: add FastAPI bootstrap"
```

## Task 3: Auth Module

**Files:**
- Create: `invest_assistant/modules/basic/auth/models.py`
- Create: `invest_assistant/modules/basic/auth/schemas.py`
- Create: `invest_assistant/modules/basic/auth/security.py`
- Create: `invest_assistant/modules/basic/auth/dependencies.py`
- Create: `invest_assistant/modules/basic/auth/service.py`
- Create: `invest_assistant/modules/basic/auth/router.py`
- Modify: `invest_assistant/bootstrap/app.py`
- Create: `tests/unit/test_auth.py`

- [ ] **Step 1: Write failing auth tests**

Create `tests/unit/test_auth.py`:

```python
from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, engine


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_login_returns_token_for_default_user():
    reset_db()
    client = TestClient(create_app())
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


def test_me_requires_bearer_token():
    reset_db()
    client = TestClient(create_app())
    response = client.get("/api/auth/me")
    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pytest tests/unit/test_auth.py -q
```

Expected: failure because `/api/auth/login` and auth tables do not exist.

- [ ] **Step 3: Implement auth**

Create `models.py` with SQLAlchemy `UserAccount` matching `user_account`: `id`, `username`, `password_hash`, `display_name`, `email`, `status`, `last_login_at`, `created_at`, `updated_at`.

Create `schemas.py`:

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    email: str | None = None
    status: str
```

Create `security.py` using `passlib.context.CryptContext` and `jose.jwt`:

```python
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from invest_assistant.bootstrap.config import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expires}, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
```

Create `service.py` with `ensure_default_user(db)`, `authenticate_user(db, username, password)`, and `change_password(db, user, old_password, new_password)`. `ensure_default_user` creates username `admin`, password `admin123`, display name `Admin`, status `active`.

Create `dependencies.py` using `OAuth2PasswordBearer(tokenUrl="/api/auth/login")`; load user from JWT `sub`, return 401 on missing/invalid/inactive user.

Create `router.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.auth.schemas import LoginRequest, TokenResponse, UserMe
from invest_assistant.modules.basic.auth.security import create_access_token
from invest_assistant.modules.basic.auth.service import authenticate_user, ensure_default_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    ensure_default_user(db)
    user = authenticate_user(db, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="invalid username or password")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/logout")
def logout() -> dict[str, bool]:
    return {"success": True}


@router.get("/me", response_model=UserMe)
def me(user: UserAccount = Depends(get_current_user)) -> UserMe:
    return UserMe.model_validate(user, from_attributes=True)
```

Update `bootstrap/app.py` to call `create_all_tables()` and include `auth.router`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pytest tests/unit/test_auth.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add invest_assistant/modules/basic/auth invest_assistant/bootstrap/app.py tests/unit/test_auth.py
git commit -m "feat: add single-user auth"
```

## Task 4: Stock Master And System Config

**Files:**
- Create: `invest_assistant/modules/basic/stock_master/*`
- Create: `invest_assistant/modules/basic/system_config/*`
- Modify: `invest_assistant/bootstrap/app.py`
- Create: `tests/unit/test_basic_modules.py`

- [ ] **Step 1: Write failing basic module tests**

Create `tests/unit/test_basic_modules.py`:

```python
from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, engine


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_stock_import_and_search():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    response = client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "A股", "exchange": "SZSE"}],
        headers=headers,
    )
    assert response.status_code == 200
    search = client.get("/api/stocks/search?keyword=平安", headers=headers)
    assert search.status_code == 200
    assert search.json()[0]["stock_name"] == "平安银行"


def test_system_config_crud():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    create = client.post(
        "/api/system-config",
        json={
            "config_key": "market_radar.heat_window",
            "config_value": "24h",
            "config_type": "string",
            "module_name": "market_radar",
            "description": "Market radar default heat window",
            "enabled": True,
        },
        headers=headers,
    )
    assert create.status_code == 200
    update = client.put(
        "/api/system-config/market_radar.heat_window",
        json={"config_value": "7d", "enabled": True},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["config_value"] == "7d"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pytest tests/unit/test_basic_modules.py -q
```

Expected: failure because routes and models do not exist.

- [ ] **Step 3: Implement models, schemas, services, routers**

For `stock_master`:
- `stock`: `id`, `stock_code`, `stock_name`, `market`, `exchange`, `status`, `created_at`, `updated_at`.
- `stock_alias`: `id`, `stock_id`, `alias`, `alias_type`, `source`, `created_at`.
- Endpoints: `GET /api/stocks`, `GET /api/stocks/{stock_id}`, `GET /api/stocks/search`, `POST /api/stocks/import`, `PUT /api/stocks/{stock_id}`, `GET /api/stocks/{stock_id}/aliases`, `POST /api/stocks/{stock_id}/aliases`.
- `POST /api/stocks/import` upserts by `(stock_code, exchange)`.
- `jobs.py` exposes `JOBS = []` for phase 1.

For `system_config`:
- `system_config`: `id`, `config_key`, `config_value`, `config_type`, `module_name`, `description`, `enabled`, `created_at`, `updated_at`.
- Endpoints: `GET /api/system-config`, `GET /api/system-config/{config_key}`, `PUT /api/system-config/{config_key}`, `POST /api/system-config`.
- `config_key` is unique.

Protect all routes with `get_current_user`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pytest tests/unit/test_basic_modules.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add invest_assistant/modules/basic/stock_master invest_assistant/modules/basic/system_config invest_assistant/bootstrap/app.py tests/unit/test_basic_modules.py
git commit -m "feat: add stock master and system config"
```

## Task 5: Job Center Core

**Files:**
- Create: `invest_assistant/modules/basic/job_center/models.py`
- Create: `invest_assistant/modules/basic/job_center/schemas.py`
- Create: `invest_assistant/modules/basic/job_center/types.py`
- Create: `invest_assistant/modules/basic/job_center/registry.py`
- Create: `invest_assistant/modules/basic/job_center/service.py`
- Create: `invest_assistant/modules/basic/job_center/dispatcher.py`
- Create: `invest_assistant/modules/basic/job_center/scheduler.py`
- Create: `invest_assistant/modules/basic/job_center/worker.py`
- Create: `invest_assistant/modules/basic/job_center/router.py`
- Modify: `invest_assistant/bootstrap/app.py`
- Modify: `invest_assistant/worker.py`
- Create: `tests/unit/test_job_center.py`

- [ ] **Step 1: Write failing job center tests**

Create `tests/unit/test_job_center.py`:

```python
from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.service import sync_job_definitions


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_sync_definitions_creates_job_configs():
    reset_db()
    db = SessionLocal()
    try:
        count = sync_job_definitions(db)
        assert count >= 1
    finally:
        db.close()


def test_manual_run_writes_pending_request():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)
    response = client.post("/api/jobs/stock_master.sync_stock_basic/run", json={"params": {}}, headers=headers)
    assert response.status_code == 200
    assert response.json()["job_name"] == "stock_master.sync_stock_basic"
    assert response.json()["status"] == "pending"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pytest tests/unit/test_job_center.py -q
```

Expected: failure because job center does not exist.

- [ ] **Step 3: Implement job center**

Create `types.py`:

```python
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

TriggerType = Literal["schedule", "manual", "both"]


@dataclass
class JobResult:
    success: bool
    message: str = ""
    fetched_count: int = 0
    processed_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    extra: dict | None = None


@dataclass
class JobDefinition:
    job_name: str
    module_name: str
    display_name: str
    description: str
    handler: Callable[..., Any]
    trigger_type: TriggerType = "manual"
    cron_expr: str | None = None
    enabled: bool = True
    timeout_seconds: int = 300
    max_retries: int = 0
    params_schema: dict | None = None
    tags: list[str] | None = None
```

Create a phase-1 `stock_master.sync_stock_basic` placeholder handler in `stock_master/jobs.py`:

```python
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult


def sync_stock_basic_job(**kwargs) -> JobResult:
    return JobResult(success=True, message="stock sync is not implemented in phase 1")


JOBS = [
    JobDefinition(
        job_name="stock_master.sync_stock_basic",
        module_name="stock_master",
        display_name="同步股票基础库",
        description="阶段 1 仅注册任务定义，真实 AkShare 同步在后续阶段实现",
        handler=sync_stock_basic_job,
        trigger_type="manual",
    )
]
```

Create `models.py` with `job_config`, `job_run_request`, and `job_run_log` fields exactly from spec section 32.4.

Create `registry.py` importing `STOCK_MASTER_JOBS`, `DISCLOSURE_JOBS`, `MARKET_RADAR_JOBS`, `ALERT_CENTER_JOBS`, and `KNOWLEDGE_BASE_JOBS`; modules not implemented in phase 1 expose empty `JOBS = []`.

Create `service.py`:
- `sync_job_definitions(db)` upserts `job_config` rows from `JOB_REGISTRY`.
- `create_run_request(db, job_name, params, requested_by)` creates `pending` request.
- `list_job_configs(db)` returns jobs ordered by `module_name`, `job_name`.

Create `dispatcher.py`:
- `execute_job(db, job_name, params, trigger_type)` loads `JOB_REGISTRY[job_name]`, executes handler, writes `job_run_log`, updates `job_config.last_run_at/last_status`, and returns `JobResult`.

Create `worker.py`:
- `run_once()` claims one pending `job_run_request`, marks it `running`, calls dispatcher, then marks it `success` or `failed`.
- `run_worker(poll_seconds=5)` loops forever.

Create `router.py`:
- `GET /api/jobs`
- `GET /api/jobs/{job_name}`
- `POST /api/jobs/sync-definitions`
- `POST /api/jobs/{job_name}/run`
- `PUT /api/jobs/{job_name}`
- `GET /api/jobs/{job_name}/logs`
- `GET /api/jobs/run-requests`

Protect all routes with `get_current_user`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pytest tests/unit/test_job_center.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add invest_assistant/modules/basic/job_center invest_assistant/modules/basic/stock_master/jobs.py invest_assistant/worker.py invest_assistant/bootstrap/app.py tests/unit/test_job_center.py
git commit -m "feat: add lightweight job center"
```

## Task 6: Report And Disclosure Libraries

**Files:**
- Create: `invest_assistant/modules/basic/report_library/*`
- Create: `invest_assistant/modules/basic/disclosure_library/*`
- Modify: `invest_assistant/bootstrap/app.py`
- Modify: `tests/unit/test_basic_modules.py`

- [ ] **Step 1: Add failing report/disclosure tests**

Append to `tests/unit/test_basic_modules.py`:

```python
def test_report_library_creates_report_index():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    response = client.post(
        "/api/reports",
        json={
            "title": "阶段 1 测试报告",
            "report_type": "daily",
            "source_module": "system",
            "target_type": "market",
            "target_id": None,
            "summary": "test summary",
            "file_format": "md",
            "file_path": "reports/test.md",
            "generated_by": "manual",
            "status": "draft",
            "publish_time": None,
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "阶段 1 测试报告"


def test_disclosure_library_creates_index_without_fetching_file():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    stock = client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "A股", "exchange": "SZSE"}],
        headers=headers,
    ).json()[0]
    response = client.post(
        "/api/disclosures",
        json={
            "stock_id": stock["id"],
            "source": "cninfo",
            "disclosure_type": "announcement",
            "title": "测试公告",
            "publish_time": "2026-05-13T00:00:00",
            "report_period": "2026Q1",
            "source_url": "https://example.com/disclosure.pdf",
            "file_path": None,
            "parsed_text_path": None,
            "parsed_markdown_path": None,
            "parse_status": "pending",
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "测试公告"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pytest tests/unit/test_basic_modules.py::test_report_library_creates_report_index tests/unit/test_basic_modules.py::test_disclosure_library_creates_index_without_fetching_file -q
```

Expected: 404 for missing report/disclosure routes.

- [ ] **Step 3: Implement report and disclosure libraries**

For `report_library`:
- `report` table fields exactly from spec section 32.5.
- Endpoints: `GET /api/reports`, `GET /api/reports/{id}`, `GET /api/reports/{id}/content`, `GET /api/reports/{id}/download`, `POST /api/reports`, `PUT /api/reports/{id}`, `DELETE /api/reports/{id}`.
- In phase 1, content/download endpoints return 404 if the file does not exist.

For `disclosure_library`:
- `company_disclosure` table fields exactly from spec section 32.6.
- Endpoints: `GET /api/disclosures`, `GET /api/disclosures/{id}`, `POST /api/disclosures`, `POST /api/disclosures/fetch`, `POST /api/disclosures/{id}/download`, `POST /api/disclosures/{id}/parse`, `GET /api/disclosures/{id}/file`, `GET /api/disclosures/{id}/parsed`, `POST /api/disclosures/{id}/to-source-item`, `POST /api/disclosures/{id}/to-track-evidence`, `POST /api/disclosures/{id}/to-stock-analysis`.
- In phase 1, fetch/download/parse/action endpoints create job requests or return clear `501` messages without performing network/PDF work.
- `jobs.py` exposes placeholder `disclosure_library.fetch_cninfo` and `disclosure_library.parse_pdf` definitions that return `JobResult(success=True, message="not implemented in phase 1")`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pytest tests/unit/test_basic_modules.py -q
```

Expected: all tests in that file pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add invest_assistant/modules/basic/report_library invest_assistant/modules/basic/disclosure_library invest_assistant/bootstrap/app.py tests/unit/test_basic_modules.py
git commit -m "feat: add report and disclosure libraries"
```

## Task 7: Console Read APIs And Full Verification

**Files:**
- Create: `invest_assistant/modules/console/router.py`
- Modify: `invest_assistant/bootstrap/app.py`
- Modify: `tests/integration/test_app_boot.py`

- [ ] **Step 1: Add failing console tests**

Append to `tests/integration/test_app_boot.py`:

```python
def test_console_system_status_requires_auth_and_returns_status_when_authenticated():
    client = TestClient(create_app())
    unauthenticated = client.get("/api/console/system-status")
    assert unauthenticated.status_code == 401
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    response = client.get("/api/console/system-status", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["api"] == "ok"
    assert response.json()["database"] == "ok"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pytest tests/integration/test_app_boot.py::test_console_system_status_requires_auth_and_returns_status_when_authenticated -q
```

Expected: 404 for missing console route.

- [ ] **Step 3: Implement console router**

Create `invest_assistant/modules/console/router.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/console", tags=["console"], dependencies=[Depends(get_current_user)])


@router.get("/dashboard")
def dashboard() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/system-status")
def system_status(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"api": "ok", "database": "ok"}


@router.get("/data-sources")
def data_sources() -> list[dict[str, str]]:
    return []


@router.get("/ai-logs")
def ai_logs() -> list[dict[str, str]]:
    return []
```

Update `bootstrap/app.py` to include the console router.

- [ ] **Step 4: Run full verification**

Run:

```powershell
pytest -q
```

Expected: all tests pass.

Run:

```powershell
python -m compileall invest_assistant
```

Expected: command exits with code 0.

- [ ] **Step 5: Commit**

Run:

```powershell
git add invest_assistant/modules/console invest_assistant/bootstrap/app.py tests/integration/test_app_boot.py
git commit -m "feat: add console status APIs"
```

## Final Verification Checklist

- [ ] `pytest -q` passes.
- [ ] `python -m compileall invest_assistant` passes.
- [ ] `uvicorn invest_assistant.main:app --host 127.0.0.1 --port 8000 --workers 1` starts and `/api/health` returns `{"status":"ok"}`.
- [ ] `python -m invest_assistant.worker` imports and starts without missing-module errors.
- [ ] No imports from `old/` exist.
- [ ] No old table names such as `news_center`, `target_assets`, `stock_basic_ak`, `task_center`, or `ai_prompt_template` are introduced.
- [ ] Web and Android technology stacks are not modified.

## Self-Review

Spec coverage:
- Stage 1 backend skeleton is covered by Tasks 1-7.
- API process and worker process are covered by Tasks 2 and 5.
- SQLite and SQLAlchemy foundation are covered by Task 2.
- Auth is covered by Task 3.
- `stock_master`, `system_config`, and `job_center` are covered by Tasks 4 and 5.
- `report_library` and `disclosure_library` base tables/APIs are covered by Task 6.
- Console status APIs are covered by Task 7.

Known gaps intentionally deferred:
- Market radar and all data ingestion are stage 2.
- Disclosure fetching/parsing is stage 3.
- Web and Android API adaptation is after backend API shape stabilizes.
- Database migration tooling can be introduced before the first non-MVP deployment; phase 1 uses deterministic table creation for local MVP tests.
