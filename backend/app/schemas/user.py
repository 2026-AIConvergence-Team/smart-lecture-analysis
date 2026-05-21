from pydantic import BaseModel, ConfigDict

from app.schemas.auth import UserRole


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: UserRole