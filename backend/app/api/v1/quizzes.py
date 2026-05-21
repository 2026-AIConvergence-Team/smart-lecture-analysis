import json
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import app.models as models
import app.schemas as schemas
from app.core.deps import get_current_user
from app.db.session import get_db
from app.services.quiz.quiz_generation import (
    deserialize_options,
    generate_quizzes_for_concepts,
    serialize_options,
)
from app.services.quiz.quiz_validation import (
    error_response,
    normalize_quiz_status,
    normalize_quiz_type,
    validate_options_and_answer,
    validate_quiz_status,
    validate_quiz_type,
    validate_ready_quiz,
)


router = APIRouter(tags=["Quizzes"])


def quiz_to_response_dict(
    quiz: models.Quiz,
    concept: Optional[models.Concept] = None,
) -> dict:
    return {
        "quiz_id": quiz.id,
        "lecture_id": quiz.lecture_id,
        "concept_id": quiz.concept_id,
        "concept": concept.concept_name if concept else None,
        "page": quiz.page_num,
        "quiz_type": quiz.quiz_type,
        "question": quiz.question,
        "options": deserialize_options(quiz.options),
        "answer": quiz.answer,
        "explanation": quiz.explanation,
        "source_sentence": quiz.source_sentence,
        "status": quiz.status,
        "created_at": quiz.created_at.isoformat() if quiz.created_at else None,
        "updated_at": quiz.updated_at.isoformat() if quiz.updated_at else None,
    }


def get_lecture_or_404(db: Session, lecture_id: int):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()

    if not lecture:
        return None, error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 강의를 찾을 수 없습니다.",
        )

    return lecture, None


def get_quiz_or_404(db: Session, quiz_id: int):
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()

    if not quiz:
        return None, error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 퀴즈를 찾을 수 없습니다.",
        )

    return quiz, None


@router.post(
    "/api/lectures/{lecture_id}/quizzes/generate",
    status_code=status.HTTP_201_CREATED,
    summary="Generate quizzes from extracted concepts",
)
def generate_lecture_quizzes(
    lecture_id: int,
    request_data: schemas.QuizGenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    quiz_type = normalize_quiz_type(request_data.quiz_type)
    quiz_type_error = validate_quiz_type(quiz_type)
    if quiz_type_error:
        return quiz_type_error

    if request_data.page_start > request_data.page_end:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "page_start가 page_end보다 큽니다.",
        )

    if lecture.total_pages and request_data.page_end > lecture.total_pages:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "페이지 범위가 PDF 전체 페이지 수를 초과합니다.",
        )

    running_job = db.query(models.QuizGenerationJob).filter(
        models.QuizGenerationJob.lecture_id == lecture_id,
        models.QuizGenerationJob.status == "generating",
    ).first()

    if running_job:
        return error_response(
            status.HTTP_409_CONFLICT,
            "이미 퀴즈 생성이 진행 중입니다.",
        )

    base_concept_query = db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id,
    )

    all_lecture_concepts = base_concept_query.order_by(
        models.Concept.page_num,
        models.Concept.id,
    ).all()

    if not all_lecture_concepts:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "분석 결과가 없습니다. /concept-extract를 먼저 호출하세요.",
        )

    concept_query = base_concept_query.filter(
        models.Concept.page_num >= request_data.page_start,
        models.Concept.page_num <= request_data.page_end,
    )

    if request_data.concept_ids:
        concept_query = concept_query.filter(
            models.Concept.id.in_(request_data.concept_ids),
        )

    target_concepts = concept_query.order_by(
        models.Concept.page_num,
        models.Concept.id,
    ).all()

    if not target_concepts:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "해당 범위에서 퀴즈를 생성할 수 있는 개념을 찾지 못했습니다.",
        )

    job = models.QuizGenerationJob(
        lecture_id=lecture_id,
        status="generating",
        progress=0,
        page_start=request_data.page_start,
        page_end=request_data.page_end,
        quiz_type=quiz_type,
        generated_count=0,
        failed_count=0,
        message="퀴즈 생성이 시작되었습니다.",
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        generated_quizzes, failed_count = generate_quizzes_for_concepts(
            concepts=target_concepts,
            all_lecture_concepts=all_lecture_concepts,
            quiz_type=quiz_type,
            count_per_concept=request_data.count_per_concept,
            option_count=request_data.option_count,
        )

        if not generated_quizzes:
            job.status = "failed"
            job.progress = 100
            job.generated_count = 0
            job.failed_count = failed_count
            job.message = "해당 범위에서 퀴즈를 생성할 수 있는 문장을 찾지 못했습니다."
            db.commit()

            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "해당 범위에서 퀴즈를 생성할 수 있는 문장을 찾지 못했습니다.",
            )

        for item in generated_quizzes:
            new_quiz = models.Quiz(
                lecture_id=item["lecture_id"],
                concept_id=item["concept_id"],
                quiz_type=item["quiz_type"],
                question=item["question"],
                options=serialize_options(item["options"]),
                answer=item["answer"],
                explanation=item["explanation"],
                source_sentence=item["source_sentence"],
                page_num=item["page_num"],
                status="DRAFT",
            )
            db.add(new_quiz)

        job.status = "completed"
        job.progress = 100
        job.generated_count = len(generated_quizzes)
        job.failed_count = failed_count
        job.message = "퀴즈 생성이 완료되었습니다."

        db.commit()

        return {
            "lecture_id": lecture_id,
            "status": "completed",
            "page_start": request_data.page_start,
            "page_end": request_data.page_end,
            "quiz_type": quiz_type,
            "generated_count": len(generated_quizzes),
            "failed_count": failed_count,
            "message": "퀴즈 생성이 완료되었습니다. GET /api/lectures/{lecture_id}/quizzes/generate/status 에서 결과를 확인하세요.",
        }

    except Exception as exc:
        db.rollback()

        job.status = "failed"
        job.progress = 100
        job.message = f"퀴즈 생성 중 서버 오류가 발생했습니다: {str(exc)}"
        db.commit()

        return error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"퀴즈 생성 중 서버 오류가 발생했습니다: {str(exc)}",
        )


@router.get(
    "/api/lectures/{lecture_id}/quizzes/generate/status",
    status_code=status.HTTP_200_OK,
    summary="Get latest quiz generation status",
)
def get_quiz_generation_status(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    latest_job = db.query(models.QuizGenerationJob).filter(
        models.QuizGenerationJob.lecture_id == lecture_id,
    ).order_by(
        models.QuizGenerationJob.created_at.desc(),
        models.QuizGenerationJob.id.desc(),
    ).first()

    if not latest_job:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "퀴즈 생성 작업을 찾을 수 없습니다.",
        )

    quizzes = db.query(models.Quiz).filter(
        models.Quiz.lecture_id == lecture_id,
        models.Quiz.page_num >= latest_job.page_start,
        models.Quiz.page_num <= latest_job.page_end,
        models.Quiz.quiz_type == latest_job.quiz_type,
    ).order_by(
        models.Quiz.id.asc(),
    ).all()

    concept_ids = [quiz.concept_id for quiz in quizzes if quiz.concept_id]
    concepts = db.query(models.Concept).filter(
        models.Concept.id.in_(concept_ids)
    ).all() if concept_ids else []

    concept_map = {concept.id: concept for concept in concepts}

    return {
        "lecture_id": lecture_id,
        "status": latest_job.status,
        "progress": latest_job.progress,
        "generated_count": latest_job.generated_count,
        "failed_count": latest_job.failed_count,
        "quizzes": [
            quiz_to_response_dict(quiz, concept_map.get(quiz.concept_id))
            for quiz in quizzes
            if quiz.status != "DELETED"
        ],
    }


@router.get(
    "/api/lectures/{lecture_id}/quizzes",
    status_code=status.HTTP_200_OK,
    summary="Get lecture quizzes",
)
def get_lecture_quizzes(
    lecture_id: int,
    quiz_status: Optional[str] = Query(default=None, alias="status"),
    page_start: Optional[int] = Query(default=None),
    page_end: Optional[int] = Query(default=None),
    concept_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    query = db.query(models.Quiz).filter(models.Quiz.lecture_id == lecture_id)

    if quiz_status:
        normalized_status = normalize_quiz_status(quiz_status)
        status_error = validate_quiz_status(normalized_status)
        if status_error:
            return status_error

        query = query.filter(models.Quiz.status == normalized_status)
    else:
        query = query.filter(models.Quiz.status != "DELETED")

    if page_start is not None:
        query = query.filter(models.Quiz.page_num >= page_start)

    if page_end is not None:
        query = query.filter(models.Quiz.page_num <= page_end)

    if concept_id is not None:
        query = query.filter(models.Quiz.concept_id == concept_id)

    quizzes = query.order_by(
        models.Quiz.id.asc(),
    ).all()

    concept_ids = [quiz.concept_id for quiz in quizzes if quiz.concept_id]
    concepts = db.query(models.Concept).filter(
        models.Concept.id.in_(concept_ids)
    ).all() if concept_ids else []

    concept_map = {concept.id: concept for concept in concepts}

    return {
        "lecture_id": lecture_id,
        "total_count": len(quizzes),
        "quizzes": [
            quiz_to_response_dict(quiz, concept_map.get(quiz.concept_id))
            for quiz in quizzes
        ],
    }


@router.get(
    "/api/quizzes/{quiz_id}",
    status_code=status.HTTP_200_OK,
    summary="Get quiz detail",
)
def get_quiz_detail(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return error

    concept = None
    if quiz.concept_id:
        concept = db.query(models.Concept).filter(
            models.Concept.id == quiz.concept_id,
        ).first()

    return quiz_to_response_dict(quiz, concept)


@router.patch(
    "/api/quizzes/{quiz_id}",
    status_code=status.HTTP_200_OK,
    summary="Update quiz",
)
def update_quiz(
    quiz_id: int,
    request_data: schemas.QuizUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return error

    if quiz.status == "DELETED":
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "삭제된 퀴즈는 수정할 수 없습니다.",
        )

    if request_data.question is not None:
        if not request_data.question.strip():
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "question은 필수값입니다.",
            )
        quiz.question = request_data.question.strip()

    if request_data.options is not None:
        options = [
            option.strip()
            for option in request_data.options
            if option and option.strip()
        ]

        answer_for_validation = request_data.answer if request_data.answer is not None else quiz.answer

        validation_error = validate_options_and_answer(options, answer_for_validation)
        if validation_error:
            return validation_error

        quiz.options = json.dumps(options, ensure_ascii=False)

    if request_data.answer is not None:
        current_options = deserialize_options(quiz.options)
        validation_error = validate_options_and_answer(
            current_options,
            request_data.answer,
        )
        if validation_error:
            return validation_error

        quiz.answer = request_data.answer

    if request_data.explanation is not None:
        quiz.explanation = request_data.explanation

    if request_data.status is not None:
        normalized_status = normalize_quiz_status(request_data.status)
        status_error = validate_quiz_status(normalized_status)
        if status_error:
            return status_error

        if normalized_status == "READY":
            ready_error = validate_ready_quiz(
                quiz.question,
                deserialize_options(quiz.options),
                quiz.answer,
            )
            if ready_error:
                return ready_error

        quiz.status = normalized_status

    db.commit()
    db.refresh(quiz)

    concept = None
    if quiz.concept_id:
        concept = db.query(models.Concept).filter(
            models.Concept.id == quiz.concept_id,
        ).first()

    return quiz_to_response_dict(quiz, concept)


@router.delete(
    "/api/quizzes/{quiz_id}",
    status_code=status.HTTP_200_OK,
    summary="Soft delete quiz",
)
def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return error

    if quiz.status == "DELETED":
        return error_response(
            status.HTTP_409_CONFLICT,
            "이미 삭제된 퀴즈입니다.",
        )

    previous_status = quiz.status
    quiz.status = "DELETED"

    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "previous_status": previous_status,
        "current_status": quiz.status,
        "message": "퀴즈가 삭제되었습니다.",
    }


@router.post(
    "/api/lectures/{lecture_id}/quizzes",
    status_code=status.HTTP_201_CREATED,
    summary="Create manual quiz",
)
def create_manual_quiz(
    lecture_id: int,
    request_data: schemas.ManualQuizCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    quiz_type = normalize_quiz_type(request_data.quiz_type)
    quiz_type_error = validate_quiz_type(quiz_type)
    if quiz_type_error:
        return quiz_type_error

    quiz_status = normalize_quiz_status(request_data.status)
    status_error = validate_quiz_status(quiz_status)
    if status_error:
        return status_error

    if not request_data.question or not request_data.question.strip():
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "question은 필수값입니다.",
        )

    validation_error = validate_options_and_answer(
        request_data.options,
        request_data.answer,
    )
    if validation_error:
        return validation_error

    if quiz_status == "READY":
        ready_error = validate_ready_quiz(
            request_data.question,
            request_data.options,
            request_data.answer,
        )
        if ready_error:
            return ready_error

    concept = None
    if request_data.concept_id is not None:
        concept = db.query(models.Concept).filter(
            models.Concept.id == request_data.concept_id,
            models.Concept.lecture_id == lecture_id,
        ).first()

        if not concept:
            return error_response(
                status.HTTP_404_NOT_FOUND,
                "해당 개념을 찾을 수 없습니다.",
            )

    new_quiz = models.Quiz(
        lecture_id=lecture_id,
        concept_id=request_data.concept_id,
        quiz_type=quiz_type,
        question=request_data.question.strip(),
        options=json.dumps(request_data.options, ensure_ascii=False),
        answer=request_data.answer,
        explanation=request_data.explanation,
        source_sentence=request_data.source_sentence,
        page_num=request_data.page,
        status=quiz_status,
    )

    db.add(new_quiz)
    db.commit()
    db.refresh(new_quiz)

    return quiz_to_response_dict(new_quiz, concept)


@router.patch(
    "/api/quizzes/{quiz_id}/status",
    status_code=status.HTTP_200_OK,
    summary="Update quiz status",
)
def update_quiz_status(
    quiz_id: int,
    request_data: schemas.QuizStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return error

    if quiz.status == "DELETED":
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "삭제된 퀴즈는 상태를 변경할 수 없습니다.",
        )

    new_status = normalize_quiz_status(request_data.status)
    status_error = validate_quiz_status(new_status)
    if status_error:
        return status_error

    if new_status == "READY":
        ready_error = validate_ready_quiz(
            quiz.question,
            deserialize_options(quiz.options),
            quiz.answer,
        )
        if ready_error:
            return ready_error

    previous_status = quiz.status
    quiz.status = new_status

    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "previous_status": previous_status,
        "current_status": quiz.status,
        "message": "퀴즈 상태가 변경되었습니다.",
    }