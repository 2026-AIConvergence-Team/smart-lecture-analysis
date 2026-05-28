from fastapi import APIRouter, status, Depends, File, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import fitz
import json
import secrets

from app.db.session import get_db
from app.core.deps import get_current_user
from app.repositories import (
    anonymous_question_repository,
    concept_repository,
    course_repository,
    lecture_participant_repository,
    lecture_repository,
    page_content_repository,
)
from app.services.lecture.lecture_processing import (
    analyze_page_contents_to_concepts,
    extract_pdf_text_to_page_contents,
)
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/api/lectures")
TEACHER_LECTURE_TAG = "Teacher Lectures"
STUDENT_LECTURE_TAG = "Student Lectures"
SHARED_LECTURE_TAG = "Shared Lectures"
CLASS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CLASS_CODE_LENGTH = 6


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


def get_accessible_lecture(
    db: Session,
    lecture_id: int,
    current_user: models.User,
):
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return None, error_response

    if current_user.role == "student":
        participant = lecture_participant_repository.get_participant(
            db,
            lecture.id,
            current_user.id,
        )
        if participant is None:
            return None, JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"error": "Lecture not found."},
            )
    elif current_user.role != "teacher":
        return None, JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "You do not have permission to access this lecture."},
        )

    return lecture, None


def get_teacher_owned_lecture(
    db: Session,
    lecture_id: int,
    current_user: models.User,
):
    if current_user.role != "teacher":
        return None, JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Only the lecture owner can access this resource."},
        )

    return get_visible_lecture(db, lecture_id, current_user)


def normalize_class_code(class_code: str) -> str:
    return "".join(str(class_code or "").upper().split())


def generate_unique_class_code(db: Session) -> str:
    for _ in range(20):
        class_code = "".join(
            secrets.choice(CLASS_CODE_ALPHABET)
            for _ in range(CLASS_CODE_LENGTH)
        )
        if not lecture_repository.get_lecture_by_class_code(db, class_code):
            return class_code

    raise RuntimeError("Failed to generate unique class code.")


def join_current_user_to_lecture(
    db: Session,
    lecture: models.Lecture,
    current_user: models.User,
) -> dict | JSONResponse:
    if current_user.role != "student":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Only students can join lectures."},
        )

    if lecture.status != "ACTIVE":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Lecture is not active."},
        )

    if not lecture.class_code:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Class code has not been created."},
        )

    course_already_joined = (
        lecture.course_id is not None
        and course_repository.student_has_joined_course(
            db,
            lecture.course_id,
            current_user.id,
        )
    )

    participant = lecture_participant_repository.get_participant(
        db,
        lecture.id,
        current_user.id,
    )
    already_joined = participant is not None

    if participant is None:
        participant = models.LectureParticipant(
            lecture_id=lecture.id,
            user_id=current_user.id,
        )
        try:
            participant = lecture_participant_repository.create_participant(
                db,
                participant,
            )
        except Exception as e:
            lecture_participant_repository.rollback(db)
            participant = lecture_participant_repository.get_participant(
                db,
                lecture.id,
                current_user.id,
            )
            if participant is None:
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={"error": f"Failed to join lecture: {str(e)}"},
                )
            already_joined = True

    return {
        "participant_id": participant.id,
        "lecture_id": lecture.id,
        "course_id": lecture.course_id,
        "user_id": current_user.id,
        "joined_at": participant.joined_at,
        "class_code": lecture.class_code,
        "already_joined": already_joined,
        "course_already_joined": course_already_joined,
    }


def question_to_response(
    question: models.AnonymousQuestion,
    author: models.User | None,
    current_user: models.User,
) -> dict:
    is_mine = question.user_id == current_user.id

    return {
        "id": question.id,
        "lecture_id": question.lecture_id,
        "content": question.content,
        "is_mine": is_mine,
        "author_id": author.id if is_mine and author else None,
        "author_name": author.name if is_mine and author else None,
        "author_role": author.role if is_mine and author else None,
        "author_display_name": author.name if is_mine and author else "익명",
        "created_at": question.created_at,
    }


def concept_to_response(concept: models.Concept) -> dict:
    return {
        "concept_id": concept.id,
        "lecture_id": concept.lecture_id,
        "concept_name": concept.concept_name,
        "page_num": concept.page_num,
        "keywords": concept.keywords.split(",") if concept.keywords else [],
        "sentences": json.loads(concept.sentences) if concept.sentences else [],
        "image_paths": json.loads(concept.image_paths) if concept.image_paths else [],
        "image_descriptions": json.loads(concept.image_descriptions)
        if concept.image_descriptions
        else [],
    }


# 1. POST /api/lectures
@router.post(
    "",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create lecture session",
    tags=[TEACHER_LECTURE_TAG],
)
def create_lecture(
    request_data: schemas.LectureCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not request_data.title or not request_data.title.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "title is required."},
        )

    if current_user.role != "teacher":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Only teachers can create lectures."},
        )

    course = course_repository.get_course_by_id(db, request_data.course_id)
    if not course or course.user_id != current_user.id:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Course not found."},
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
        total_pages=0,
    )

    try:
        lecture_repository.create_lecture(db, new_lecture)
        return new_lecture
    except Exception as e:
        lecture_repository.rollback(db)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Database error: {str(e)}"},
        )


@router.post(
    "/{lecture_id}/code",
    response_model=schemas.LectureCodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Create lecture class code",
    tags=[TEACHER_LECTURE_TAG],
)
def create_lecture_code(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "teacher":
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": "Only teachers can create class codes."},
        )

    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    if not lecture.class_code:
        try:
            lecture.class_code = generate_unique_class_code(db)
            lecture_repository.save_lecture(db, lecture)
        except Exception as e:
            lecture_repository.rollback(db)
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"error": f"Failed to create class code: {str(e)}"},
            )

    return {
        "lecture_id": lecture.id,
        "class_code": lecture.class_code,
    }


@router.post(
    "/join",
    response_model=schemas.LectureJoinResponse,
    status_code=status.HTTP_200_OK,
    summary="Join lecture with class code",
    tags=[STUDENT_LECTURE_TAG],
)
def join_lecture_by_class_code(
    request_data: schemas.LectureJoinRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    normalized_class_code = normalize_class_code(request_data.class_code)
    if not normalized_class_code:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "class_code is required."},
        )

    lecture = lecture_repository.get_lecture_by_class_code(
        db,
        normalized_class_code,
    )
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Lecture not found for this class code."},
        )

    return join_current_user_to_lecture(db, lecture, current_user)


@router.post(
    "/{lecture_id}/questions",
    response_model=schemas.AnonymousQuestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create anonymous lecture question",
    tags=[STUDENT_LECTURE_TAG],
)
def create_lecture_question(
    lecture_id: int,
    request_data: schemas.AnonymousQuestionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    content = request_data.content.strip()
    if not content:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "content is required."},
        )

    try:
        question = anonymous_question_repository.create_question(
            db=db,
            lecture_id=lecture.id,
            user_id=current_user.id,
            content=content,
        )
    except Exception as e:
        anonymous_question_repository.rollback(db)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Failed to create question: {str(e)}"},
        )

    return question_to_response(question, current_user, current_user)


@router.get(
    "/{lecture_id}/questions",
    response_model=list[schemas.AnonymousQuestionResponse],
    status_code=status.HTTP_200_OK,
    summary="List anonymous lecture questions",
    tags=[SHARED_LECTURE_TAG],
)
def list_lecture_questions(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    question_rows = anonymous_question_repository.get_questions_by_lecture(
        db,
        lecture.id,
    )

    return [
        question_to_response(question, author, current_user)
        for question, author in question_rows
    ]


# 2. POST /api/lectures/{lecture_id}/pdf
@router.post(
    "/{lecture_id}/pdf",
    response_model=schemas.PDFUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload lecture PDF",
    tags=[TEACHER_LECTURE_TAG],
)
async def upload_lecture_pdf(
    lecture_id: int,
    file: UploadFile = File(..., description="PDF file to upload"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_visible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    if not file.filename.lower().endswith(".pdf"):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Only PDF files can be uploaded."},
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
            content={"error": f"Failed to process PDF file: {str(e)}"},
        )


# 3. POST /api/lectures/{lecture_id}/pdf/analyze
@router.post(
    "/{lecture_id}/pdf/analyze",
    status_code=status.HTTP_200_OK,
    summary="Analyze lecture PDF",
    tags=[TEACHER_LECTURE_TAG],
)
def analyze_lecture_pdf(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_teacher_owned_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    if not lecture.file_name:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "PDF file is required before analysis."},
        )

    file_path = f"uploads/lectures/{lecture_id}/{lecture.file_name}"
    if not os.path.exists(file_path):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "Stored PDF file was not found."},
        )

    try:
        text_message = extract_pdf_text_to_page_contents(
            db=db,
            lecture=lecture,
            lecture_id=lecture_id,
            file_path=file_path,
        )

        page_contents = page_content_repository.get_page_contents_by_lecture(
            db,
            lecture_id,
        )
        if not page_contents:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "No extracted page text exists."},
            )

        concept_message = analyze_page_contents_to_concepts(
            db=db,
            lecture=lecture,
            lecture_id=lecture_id,
            page_contents=page_contents,
        )

        concepts = concept_repository.get_concepts_by_lecture(db, lecture_id)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "lecture_id": lecture_id,
                "status": "completed",
                "extract_status": lecture.extract_status,
                "analyze_status": lecture.analyze_status,
                "messages": {
                    "text_extraction": text_message,
                    "concept_extraction": concept_message,
                },
                "concept_count": len(concepts),
                "concepts": [concept_to_response(concept) for concept in concepts],
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"Failed to analyze PDF: {str(e)}"},
        )


# 4. GET /api/lectures/{lecture_id}
@router.get(
    "/{lecture_id}",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_200_OK,
    summary="Get lecture status and info",
    tags=[SHARED_LECTURE_TAG],
)
def get_lecture_status(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_accessible_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response
    return lecture


@router.patch(
    "/{lecture_id}/status",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_200_OK,
    summary="Update lecture session status",
    tags=[TEACHER_LECTURE_TAG],
)
def update_lecture_status(
    lecture_id: int,
    request_data: schemas.LectureStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_teacher_owned_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    normalized_status = str(request_data.status or "").strip().upper()
    if normalized_status not in {"ACTIVE", "ENDED"}:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "status must be ACTIVE or ENDED."},
        )

    lecture.status = normalized_status
    lecture_repository.save_lecture(db, lecture)
    return lecture


# 5. GET /api/lectures/{lecture_id}/concepts
@router.get(
    "/{lecture_id}/concepts",
    status_code=status.HTTP_200_OK,
    summary="Get extracted concepts",
    tags=[TEACHER_LECTURE_TAG],
)
def get_lecture_concepts(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error_response = get_teacher_owned_lecture(db, lecture_id, current_user)
    if error_response:
        return error_response

    concepts = concept_repository.get_concepts_by_lecture(db, lecture_id)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "lecture_id": lecture_id,
            "concepts": [concept_to_response(concept) for concept in concepts],
        },
    )