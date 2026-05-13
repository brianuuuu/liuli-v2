from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.auth.security import hash_password, verify_password
from invest_assistant.shared.time_utils import utc_now


def ensure_default_user(db: Session) -> UserAccount:
    user = db.scalar(select(UserAccount).where(UserAccount.username == "admin"))
    if user is not None:
        return user
    user = UserAccount(
        username="admin",
        password_hash=hash_password("admin123"),
        display_name="Admin",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> UserAccount | None:
    user = db.scalar(select(UserAccount).where(UserAccount.username == username))
    if user is None or user.status != "active":
        return None
    if not verify_password(password, user.password_hash):
        return None
    user.last_login_at = utc_now()
    db.commit()
    db.refresh(user)
    return user


def get_user_by_id(db: Session, user_id: int) -> UserAccount | None:
    return db.get(UserAccount, user_id)


def change_password(db: Session, user: UserAccount, old_password: str, new_password: str) -> bool:
    if not verify_password(old_password, user.password_hash):
        return False
    user.password_hash = hash_password(new_password)
    db.commit()
    return True
