from datetime import date, datetime, time
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# 1. 강의 생성 Request
class LectureCreate(BaseModel):
    course_id: int = Field(..., gt=0)
    title: str = Field(..., min_length=1)
    date: date
    time: time


# 2. 강의 생성 및 조회용 공통 Response
class LectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    # 데이터베이스의 id 필드를 프론트엔드 명세서 규칙인 'lecture_id'로 변환하여 출력합니다.
    lecture_id: int = Field(..., alias="id")
    course_id: Optional[int] = None
    title: str
    date: date
    time: time
    class_code: Optional[str] = None
    status: str
    created_at: datetime


class LectureCodeResponse(BaseModel):
    lecture_id: int
    class_code: str


class LectureJoinRequest(BaseModel):
    class_code: str = Field(..., min_length=1)


class LectureJoinResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    participant_id: int
    lecture_id: int
    user_id: int
    joined_at: datetime
    class_code: str
    already_joined: bool = False


class LectureStatusUpdateRequest(BaseModel):
    status: str


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
