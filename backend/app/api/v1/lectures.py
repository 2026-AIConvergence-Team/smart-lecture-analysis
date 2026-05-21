from fastapi import APIRouter, status, Depends, File, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import fitz
import json

from app.db.session import get_db
from app.core.deps import get_current_user
from app.repositories import (
    concept_repository,
    lecture_repository,
    page_content_repository,
)
from app.services.lecture.lecture_processing import (
    analyze_page_contents_to_concepts,
    extract_pdf_text_to_page_contents,
)
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/api/lectures", tags=["Lectures"])


# 1. POST /api/lectures
@router.post(
    "", 
    response_model=schemas.LectureResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Create lecture session"
)
def create_lecture(
    request_data: schemas.LectureCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not request_data.title or not request_data.title.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "title은 필수값입니다."}
        )

    new_lecture = models.Lecture(
        title=request_data.title.strip(),
        date=request_data.date,
        time=request_data.time,
        class_code=None,
        extract_status="pending",
        analyze_status="pending",
        total_pages=0
    )

    try:
        lecture_repository.create_lecture(db, new_lecture)
        return new_lecture
    except Exception as e:
        lecture_repository.rollback(db)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"서버 내부 데이터베이스 오류: {str(e)}"}
        )

    
# 2. POST /api/lectures/{lecture_id}/pdf
@router.post(
    "/{lecture_id}/pdf",
    response_model=schemas.PDFUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload lecture PDF"
)
async def upload_lecture_pdf(
    lecture_id: int,
    file: UploadFile = File(..., description="PDF file to upload"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    if not file.filename.lower().endswith('.pdf'):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "PDF 파일만 업로드 가능합니다."}
        )

    try:
        upload_dir = f"uploads/lectures/{lecture_id}"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename)

        file_content = await file.read()
        with open(file_path, "wb") as f:
            f.write(file_content)

        doc = fitz.open(file_path)
        total_pages = doc.page_count
        doc.close()

        lecture.file_name = file.filename
        lecture.pdf_url = f"/files/lectures/{lecture_id}/{file.filename}"
        lecture.total_pages = total_pages
        
        lecture_repository.save_lecture(db, lecture)

        return lecture
    except Exception as e:
        lecture_repository.rollback(db)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"서버에서 PDF 파일을 처리하는 중 오류가 발생했습니다: {str(e)}"}
        )

    
# 3. POST /api/lectures/{lecture_id}/text-extract
@router.post(
    "/{lecture_id}/text-extract",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start PDF text extraction"
)
async def start_text_extraction(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    if not lecture.file_name:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "텍스트를 추출할 PDF 파일이 업로드되지 않았습니다."}
        )

    file_path = f"uploads/lectures/{lecture_id}/{lecture.file_name}"
    if not os.path.exists(file_path):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "서버에 저장된 PDF 파일을 물리적으로 찾을 수 없습니다."}
        )

    try:
        message = extract_pdf_text_to_page_contents(
            db=db,
            lecture=lecture,
            lecture_id=lecture_id,
            file_path=file_path,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": message}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"텍스트 추출 중 서버 오류 발생: {str(e)}"}
        )


# 4. POST /api/lectures/{lecture_id}/concept-extract
@router.post(
    "/{lecture_id}/concept-extract",
    status_code=status.HTTP_200_OK,
    summary="Extract lecture concepts via TF-IDF"
)
def extract_lecture_concepts(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    page_contents = page_content_repository.get_page_contents_by_lecture(
        db,
        lecture_id,
    )

    if not page_contents:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "추출된 페이지 텍스트가 없습니다. 3단계를 먼저 진행해주세요."}
        )

    try:
        message = analyze_page_contents_to_concepts(
            db=db,
            lecture=lecture,
            lecture_id=lecture_id,
            page_contents=page_contents,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": message}
        )

    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"알고리즘 내부 연산 중 서버 예외 발생: {str(e)}"}
        )
    
    
# 5. GET /api/lectures/{lecture_id}
@router.get(
    "/{lecture_id}",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_200_OK,
    summary="Get lecture status and info"
)
def get_lecture_status(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )
    return lecture


# 6. GET /api/lectures/{lecture_id}/concepts
@router.get(
    "/{lecture_id}/concepts",
    status_code=status.HTTP_200_OK,
    summary="Get extracted concepts"
)
def get_lecture_concepts(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    concepts = concept_repository.get_concepts_by_lecture(db, lecture_id)

    result_list = []
    for c in concepts:
        result_list.append({
            "concept_id": c.id,
            "lecture_id": c.lecture_id,
            "concept_name": c.concept_name,
            "page_num": c.page_num,
            "keywords": c.keywords.split(",") if c.keywords else [],
            "sentences": json.loads(c.sentences) if c.sentences else []
        })

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"lecture_id": lecture_id, "concepts": result_list}
    )
