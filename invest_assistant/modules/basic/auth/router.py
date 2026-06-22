from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.auth.schemas import ChangePasswordRequest, LoginRequest, TokenResponse, UserMe
from invest_assistant.modules.basic.auth.security import create_access_token
from invest_assistant.modules.basic.auth.service import authenticate_user, change_password, ensure_default_user

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
    return UserMe.model_validate(user)


@router.post("/change-password")
def update_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: UserAccount = Depends(get_current_user),
) -> dict[str, bool]:
    if not change_password(db, user, payload.old_password, payload.new_password):
        raise HTTPException(status_code=400, detail="invalid old password")
    return {"success": True}
