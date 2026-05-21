from enum import Enum

from pydantic import BaseModel, Field


EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class UserRole(str, Enum):
    teacher = "teacher"
    student = "student"


class UserCreate(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    name: str = Field(min_length=1, max_length=50)
    role: UserRole
    password: str = Field(min_length=6, max_length=72)


class UserLogin(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"