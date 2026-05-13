from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.auth.security import decode_access_token
from invest_assistant.modules.basic.auth.service import get_user_by_id


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> UserAccount:
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        user_id = int(subject)
    except (JWTError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="invalid authentication credentials") from exc
    user = get_user_by_id(db, user_id)
    if user is None or user.status != "active":
        raise HTTPException(status_code=401, detail="invalid authentication credentials")
    return user
