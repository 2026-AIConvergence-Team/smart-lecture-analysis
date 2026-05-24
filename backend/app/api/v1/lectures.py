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
    course_repository,
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


def get_visible_lecture(
    db: Session,
    lecture_id: int,
    current_user: models.User,
):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return None, JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Lecture not found."},
        )

    if current_user.role == "teacher":
        if lecture.course_id is None:
            return None, JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"error": "Lecture is not linked to a course."},
            )

        course = course_repository.get_course_by_id(db, lecture.course_id)
        if not course or course.user_id != current_user.id:
            return None, JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"error": "Lecture not found."},
            )

    return lecture, None


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
            content={"error": "title is required."}
        )

    if current_user.role != "teacher":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Only teachers can create lectures."}
        )

    course = course_repository.get_course_by_id(db, request_data.course_id)
    if not course or course.user_id != current_user.id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Course not found."}
        )

    new_lecture = models.Lecture(
        course_id=request_data.course_id,
        title=request_data.title.strip(),
        date=request_data.date,
        time=request_data.time,
        class_code=None,
        status="ACTIVE",
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
            content={"error": f"Database error: {str(e)}"}
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
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    if not file.filename.lower().endswith('.pdf'):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Only PDF files can be uploaded."}
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
            content={"error": f"Failed to process PDF file: {str(e)}"}
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
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    if not lecture.file_name:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "PDF file is required before text extraction."}
        )

    file_path = f"uploads/lectures/{lecture_id}/{lecture.file_name}"
    if not os.path.exists(file_path):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Stored PDF file was not found."}
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
            content={"error": f"Failed to extract text: {str(e)}"}
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
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    page_contents = page_content_repository.get_page_contents_by_lecture(
        db,
        lecture_id,
    )

    if not page_contents:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "No extracted page text exists. Run text extraction first."}
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
            content={"error": f"Failed to extract concepts: {str(e)}"}
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
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response
    return lecture


@router.patch(
    "/{lecture_id}/status",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_200_OK,
    summary="Update lecture session status",
)
def update_lecture_status(
    lecture_id: int,
    request_data: schemas.LectureStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    normalized_status = str(request_data.status or "").strip().upper()
    if normalized_status not in {"ACTIVE", "ENDED"}:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "status must be ACTIVE or ENDED."}
        )

    lecture.status = normalized_status
    lecture_repository.save_lecture(db, lecture)
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
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

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
