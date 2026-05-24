from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    title: str = Field(..., min_length=1)
    department: str = Field(..., min_length=1)
    year: int = Field(..., ge=2000, le=2100)
    semester: str = Field(..., min_length=1)
    schedule: str = Field(..., min_length=1)
    student_count: int = Field(default=0, ge=0)
    section: str = Field(..., min_length=1)


class CourseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    department: Optional[str] = Field(default=None, min_length=1)
    year: Optional[int] = Field(default=None, ge=2000, le=2100)
    semester: Optional[str] = Field(default=None, min_length=1)
    schedule: Optional[str] = Field(default=None, min_length=1)
    student_count: Optional[int] = Field(default=None, ge=0)
    section: Optional[str] = Field(default=None, min_length=1)


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    department: str
    year: int
    semester: str
    schedule: str
    student_count: int
    section: str
    created_at: datetime
    updated_at: datetime
