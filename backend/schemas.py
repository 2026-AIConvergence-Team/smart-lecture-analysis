from enum import Enum
from datetime import date, time, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

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


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: UserRole


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- 🚀 승연님 파트 1: 데이터 검증 및 직렬화 스키마 추가 ----

# 1. 강의 생성 Request
class LectureCreate(BaseModel):
    title: str = Field(..., min_length=1)
    date: date
    time: time


# 2. 강의 생성 및 조회용 공통 Response
class LectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    # 데이터베이스의 id 필드를 프론트엔드 명세서 규칙인 'lecture_id'로 변환하여 출력합니다.
    lecture_id: int = Field(..., alias="id")
    title: str
    date: date
    time: time
    class_code: Optional[str] = None
    created_at: datetime


# 3. PDF 업로드 성공 Response
class PDFUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    lecture_id: int = Field(..., alias="id")
    file_name: Optional[str] = None
    pdf_url: Optional[str] = None
    total_pages: int
    uploaded_at: datetime = Field(alias="created_at")  # 생성 시간을 업로드 시간으로 매핑


# 4. 텍스트 추출 시작 Response
class TextExtractStartResponse(BaseModel):
    lecture_id: int
    status: str
    total_pages: int
    message: str


# 5. 추출 상태 확인 내부 구조 (페이지별 프리뷰)
class PagePreview(BaseModel):
    page: int
    text_preview: str


# 6. 추출 상태 확인 Response
class TextExtractStatusResponse(BaseModel):
    lecture_id: int
    status: str
    progress: int
    total_pages: int
    extracted_pages: int
    pages: List[PagePreview]


# 7. PDF 분석 시작 Request
class LectureAnalyzeRequest(BaseModel):
    page_start: int = Field(..., gte=1)
    page_end: int = Field(..., gte=1)


# 8. PDF 분석 시작 Response
class LectureAnalyzeResponse(BaseModel):
    lecture_id: int
    status: str
    page_start: int
    page_end: int
    message: str


# 9. 개념 목록 내부 구조
class ConceptDetail(BaseModel):
    concept_id: int
    concept: str
    page: int
    keywords: List[str]
    sentences: List[str]


# 10. 개념 목록 조회 최종 Response
class LectureConceptsResponse(BaseModel):
    lecture_id: int
    status: str
    page_start: int
    page_end: int
    keywords: List[str]
    concepts: List[ConceptDetail]