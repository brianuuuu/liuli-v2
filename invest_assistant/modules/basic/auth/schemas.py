from pydantic import BaseModel, ConfigDict


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

    model_config = ConfigDict(from_attributes=True)
