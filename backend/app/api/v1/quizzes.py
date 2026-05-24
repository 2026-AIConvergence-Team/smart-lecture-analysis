import json
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

import app.models as models
import app.schemas as schemas
from app.core.deps import get_current_user
from app.db.session import get_db
from app.repositories import (
    concept_repository,
    lecture_repository,
    quiz_generation_job_repository,
    quiz_repository,
)
from app.services.quiz.quiz_generation import (
    AI_BATCH_SIZE,
    calculate_target_quiz_count,
    deserialize_options,
    filter_quality_quizzes,
    generate_quizzes_for_concepts,
    prepare_quiz_materials_for_ai,
    serialize_options,
)
from app.services.quiz.ai_quiz_generation import (
    enhance_quiz_with_ai,
    generate_quizzes_with_ai_batch,
    quiz_model_to_draft_dict,
)
from app.services.quiz.quiz_validation import (
    error_response,
    normalize_difficulty,
    normalize_quiz_status,
    normalize_quiz_type,
    validate_difficulty,
    validate_options_and_answer,
    validate_quiz_status,
    validate_quiz_type,
    validate_ready_quiz,
)


router = APIRouter(tags=["Quizzes"])


def quiz_model_supports_generation_job_id() -> bool:
    """
    generation_job_id 컬럼 적용 전후를 모두 지원합니다.
    """
    return hasattr(models.Quiz, "generation_job_id")


def quiz_to_response_dict(
    quiz: models.Quiz,
    concept: Optional[models.Concept] = None,
) -> dict:
    response = {
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

    if quiz_model_supports_generation_job_id():
        response["generation_job_id"] = getattr(quiz, "generation_job_id", None)

    return response


def get_lecture_or_404(db: Session, lecture_id: int):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)

    if not lecture:
        return None, error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 강의를 찾을 수 없습니다.",
        )

    return lecture, None


def get_quiz_or_404(db: Session, quiz_id: int):
    quiz = quiz_repository.get_quiz_by_id(db, quiz_id)

    if not quiz:
        return None, error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 퀴즈를 찾을 수 없습니다.",
        )

    return quiz, None


def get_concepts_for_quiz_generation(
    db: Session,
    lecture_id: int,
    page_start: int,
    page_end: int,
    concept_ids: Optional[list[int]] = None,
) -> list[models.Concept]:
    return concept_repository.get_concepts_for_quiz_generation(
        db=db,
        lecture_id=lecture_id,
        page_start=page_start,
        page_end=page_end,
        concept_ids=concept_ids,
    )


def get_latest_job_quizzes_query(
    db: Session,
    lecture_id: int,
    latest_job: models.QuizGenerationJob,
):
    """
    generation_job_id가 없던 배포본에서는 생성 시점과 요청 범위로 최신 작업 결과를 좁힙니다.
    """
    return quiz_repository.get_latest_job_quizzes_query(
        db=db,
        lecture_id=lecture_id,
        latest_job=latest_job,
        supports_generation_job_id=quiz_model_supports_generation_job_id(),
    )


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

    difficulty = normalize_difficulty(request_data.difficulty)
    difficulty_error = validate_difficulty(difficulty)
    if difficulty_error:
        return difficulty_error

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

    running_job = quiz_generation_job_repository.get_running_job_for_lecture(
        db,
        lecture_id,
    )

    if running_job:
        return error_response(
            status.HTTP_409_CONFLICT,
            "이미 퀴즈 생성이 진행 중입니다.",
        )

    all_concept_exists = concept_repository.lecture_has_concepts(db, lecture_id)

    if not all_concept_exists:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "분석 결과가 없습니다. /concept-extract를 먼저 호출하세요.",
        )

    target_concepts = get_concepts_for_quiz_generation(
        db=db,
        lecture_id=lecture_id,
        page_start=request_data.page_start,
        page_end=request_data.page_end,
        concept_ids=request_data.concept_ids,
    )

    if not target_concepts:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "해당 범위에서 퀴즈를 생성할 수 있는 개념을 찾지 못했습니다.",
        )

    # 서비스 정책상 페이지 범위에 따라 최종 문항 수를 1~5개로 제한합니다.
    target_quiz_count = calculate_target_quiz_count(
        page_start=request_data.page_start,
        page_end=request_data.page_end,
        available_concept_count=len(target_concepts),
    )

    if target_quiz_count <= 0:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "해당 범위에서 퀴즈를 생성할 수 있는 충분한 개념을 찾지 못했습니다.",
        )


    internal_target_max = min(
        len(target_concepts),
        target_quiz_count + 1,
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

    quiz_generation_job_repository.create_job(db, job)

    try:
        failed_count = 0
        ai_enhanced_count = 0
        generated_quizzes = []

        # AI 생성은 알고리즘으로 선별한 material을 batch로 넘겨 최종 퀴즈를 만듭니다.
        if request_data.use_ai:
            ai_materials, prefilter_failed_count = prepare_quiz_materials_for_ai(
                concepts=target_concepts,
                quiz_type=quiz_type,
                count_per_concept=request_data.count_per_concept,
                option_count=request_data.option_count,
            )
            failed_count += prefilter_failed_count

            generated_quizzes, ai_enhanced_count = generate_quizzes_with_ai_batch(
                materials=ai_materials,
                difficulty=difficulty,
                option_count=request_data.option_count,
                use_ai=request_data.use_ai,
                batch_size=internal_target_max,
                target_min=target_quiz_count,
                target_max=internal_target_max,
                retry_missing_once=True,
            )

            ai_missing_count = max(0, min(len(ai_materials), internal_target_max) - len(generated_quizzes))
            failed_count += ai_missing_count

            print(
                "[QUIZ_GENERATE_AI_RESULT] "
                f"materials={len(ai_materials)}, "
                f"target={target_quiz_count}, "
                f"internal_target_max={internal_target_max}, "
                f"ai_generated={len(generated_quizzes)}, "
                f"ai_missing={ai_missing_count}"
            )

        # AI 미사용 또는 AI 생성 실패 시 알고리즘 생성으로 대체합니다.
        if not generated_quizzes:
            algorithm_quizzes, algorithm_failed_count = generate_quizzes_for_concepts(
                concepts=target_concepts,
                all_lecture_concepts=target_concepts,
                quiz_type=quiz_type,
                count_per_concept=request_data.count_per_concept,
                option_count=request_data.option_count,
            )

            failed_count += algorithm_failed_count
            generated_quizzes = algorithm_quizzes
            ai_enhanced_count = 0

        if not generated_quizzes:
            job.status = "failed"
            job.progress = 100
            job.generated_count = 0
            job.failed_count = failed_count
            job.message = "해당 범위에서 퀴즈를 생성할 수 있는 문장을 찾지 못했습니다."
            quiz_generation_job_repository.save_job(db, job)

            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "해당 범위에서 퀴즈를 생성할 수 있는 문장을 찾지 못했습니다.",
            )

        # 생성 방식과 관계없이 저장 전 품질 검수는 동일하게 적용합니다.
        quality_quizzes, rejected_count = filter_quality_quizzes(
            generated_quizzes,
            option_count=request_data.option_count,
        )
        print(
            "[QUIZ_GENERATE_QUALITY_RESULT] "
            f"before_quality={len(generated_quizzes)}, "
            f"after_quality={len(quality_quizzes)}, "
            f"rejected={rejected_count}"
        )

        # 최종 저장 수는 페이지 범위 기반 목표 문항 수를 넘지 않습니다.
        if len(quality_quizzes) > target_quiz_count:
            quality_quizzes = quality_quizzes[:target_quiz_count]

        if not quality_quizzes:
            total_failed_count = failed_count + rejected_count

            job.status = "failed"
            job.progress = 100
            job.generated_count = 0
            job.failed_count = total_failed_count
            job.message = (
                "퀴즈 초안은 생성되었지만 품질 기준을 통과한 퀴즈가 없습니다. "
                f"생성 실패 {failed_count}건, 품질 제외 {rejected_count}건"
            )
            quiz_generation_job_repository.save_job(db, job)

            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "품질 기준을 통과한 퀴즈가 없습니다. AI 사용 또는 개념 범위를 조정해 주세요.",
            )

        generated_quizzes = quality_quizzes
        total_failed_count = failed_count + rejected_count

        if ai_enhanced_count > 0 and len(generated_quizzes) < ai_enhanced_count:
            ai_enhanced_count = len(generated_quizzes)

        generation_mode = "hybrid" if ai_enhanced_count > 0 else "algorithm"

        saved_quizzes = []

        for item in generated_quizzes:
            new_quiz = models.Quiz(
                lecture_id=item["lecture_id"],
                concept_id=item["concept_id"],
                quiz_type=item["quiz_type"],
                question=item["question"],
                options=serialize_options(item["options"]),
                answer=item["answer"],
                explanation=item.get("explanation"),
                source_sentence=item.get("source_sentence"),
                page_num=item["page_num"],
                status="DRAFT",
            )

            if quiz_model_supports_generation_job_id():
                new_quiz.generation_job_id = job.id

            saved_quizzes.append(new_quiz)

        job.status = "completed"
        job.progress = 100
        job.generated_count = len(generated_quizzes)
        job.failed_count = total_failed_count
        job.message = (
            f"퀴즈 생성이 완료되었습니다. "
            f"AI 개선 {ai_enhanced_count}건, "
            f"알고리즘 fallback {len(generated_quizzes) - ai_enhanced_count}건, "
            f"품질 제외 {rejected_count}건"
        )

        quiz_repository.save_generated_quizzes(db, saved_quizzes)

        return {
            "lecture_id": lecture_id,
            "job_id": job.id,
            "status": "completed",
            "page_start": request_data.page_start,
            "page_end": request_data.page_end,
            "quiz_type": quiz_type,
            "generated_count": len(generated_quizzes),
            "target_quiz_count": target_quiz_count,
            "failed_count": total_failed_count,
            "rejected_count": rejected_count,
            "ai_requested": request_data.use_ai,
            "ai_enhanced_count": ai_enhanced_count,
            "generation_mode": generation_mode,
            "message": "퀴즈 생성이 완료되었습니다. GET /api/lectures/{lecture_id}/quizzes/generate/status 에서 최신 생성 결과를 확인하세요.",
        }

    except Exception as exc:
        quiz_repository.rollback(db)

        failed_job = quiz_generation_job_repository.get_job_by_id(db, job.id)

        if failed_job:
            failed_job.status = "failed"
            failed_job.progress = 100
            failed_job.message = f"퀴즈 생성 중 서버 오류가 발생했습니다: {str(exc)}"
            quiz_generation_job_repository.save_job(db, failed_job)

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

    latest_job = quiz_generation_job_repository.get_latest_job_for_lecture(
        db,
        lecture_id,
    )

    if not latest_job:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "퀴즈 생성 작업을 찾을 수 없습니다.",
        )

    quizzes = quiz_repository.get_latest_job_quizzes(
        db=db,
        lecture_id=lecture_id,
        latest_job=latest_job,
        supports_generation_job_id=quiz_model_supports_generation_job_id(),
    )

    concept_ids = [quiz.concept_id for quiz in quizzes if quiz.concept_id]
    concepts = concept_repository.get_concepts_by_ids(db, concept_ids) if concept_ids else []

    concept_map = {concept.id: concept for concept in concepts}

    return {
        "lecture_id": lecture_id,
        "job_id": latest_job.id,
        "status": latest_job.status,
        "progress": latest_job.progress,
        "page_start": latest_job.page_start,
        "page_end": latest_job.page_end,
        "quiz_type": latest_job.quiz_type,
        "generated_count": latest_job.generated_count,
        "failed_count": latest_job.failed_count,
        "returned_count": len(quizzes),
        "message": latest_job.message,
        "uses_generation_job_id": quiz_model_supports_generation_job_id(),
        "quizzes": [
            quiz_to_response_dict(quiz, concept_map.get(quiz.concept_id))
            for quiz in quizzes
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
    generation_job_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    normalized_status = None

    if quiz_status:
        normalized_status = normalize_quiz_status(quiz_status)
        status_error = validate_quiz_status(normalized_status)
        if status_error:
            return status_error

    if generation_job_id is not None:
        if not quiz_model_supports_generation_job_id():
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "generation_job_id 필터를 사용하려면 Quiz 모델과 DB에 generation_job_id 컬럼을 추가해야 합니다.",
            )

    quizzes = quiz_repository.get_lecture_quizzes(
        db=db,
        lecture_id=lecture_id,
        quiz_status=normalized_status,
        page_start=page_start,
        page_end=page_end,
        concept_id=concept_id,
        generation_job_id=generation_job_id,
    )

    concept_ids = [quiz.concept_id for quiz in quizzes if quiz.concept_id]
    concepts = concept_repository.get_concepts_by_ids(db, concept_ids) if concept_ids else []

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
        concept = concept_repository.get_concept_by_id(db, quiz.concept_id)

    return quiz_to_response_dict(quiz, concept)


@router.post(
    "/api/quizzes/{quiz_id}/regenerate",
    status_code=status.HTTP_200_OK,
    summary="Regenerate one quiz",
)
def regenerate_quiz(
    quiz_id: int,
    request_data: schemas.QuizRegenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return error

    if quiz.status == "DELETED":
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "삭제된 퀴즈는 재생성할 수 없습니다.",
        )

    concept = None
    if quiz.concept_id:
        concept = concept_repository.get_concept_by_id_and_lecture(
            db,
            quiz.concept_id,
            quiz.lecture_id,
        )

    if not concept:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "개념과 연결되지 않은 수동 퀴즈는 자동 재생성할 수 없습니다.",
        )

    requested_quiz_type = request_data.quiz_type or quiz.quiz_type
    quiz_type = normalize_quiz_type(requested_quiz_type)
    quiz_type_error = validate_quiz_type(quiz_type)
    if quiz_type_error:
        return quiz_type_error

    difficulty = normalize_difficulty(request_data.difficulty)
    difficulty_error = validate_difficulty(difficulty)
    if difficulty_error:
        return difficulty_error

    # 재생성 보기는 해당 개념 주변 페이지의 후보만 사용합니다.
    nearby_concepts = concept_repository.get_nearby_concepts_for_regeneration(
        db,
        quiz.lecture_id,
        concept.page_num,
    )

    if not nearby_concepts:
        nearby_concepts = [concept]

    generated_quizzes, _ = generate_quizzes_for_concepts(
        concepts=[concept],
        all_lecture_concepts=nearby_concepts,
        quiz_type=quiz_type,
        count_per_concept=1,
        option_count=request_data.option_count,
    )

    if generated_quizzes:
        draft_quiz = generated_quizzes[0]
    else:
        draft_quiz = quiz_model_to_draft_dict(quiz)

    regenerated_quiz, ai_used = enhance_quiz_with_ai(
        draft_quiz=draft_quiz,
        concept=concept,
        difficulty=difficulty,
        option_count=request_data.option_count,
        use_ai=request_data.use_ai,
        reason=request_data.reason,
    )

    quality_quizzes, rejected_count = filter_quality_quizzes(
        [regenerated_quiz],
        option_count=request_data.option_count,
    )

    if not quality_quizzes:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "재생성된 퀴즈가 품질 기준을 통과하지 못했습니다. 다른 유형이나 AI 사용 옵션으로 다시 시도하세요.",
        )

    regenerated_quiz = quality_quizzes[0]

    quiz.quiz_type = regenerated_quiz["quiz_type"]
    quiz.question = regenerated_quiz["question"]
    quiz.options = serialize_options(regenerated_quiz["options"])
    quiz.answer = regenerated_quiz["answer"]
    quiz.explanation = regenerated_quiz.get("explanation")
    quiz.source_sentence = regenerated_quiz.get("source_sentence")
    quiz.page_num = regenerated_quiz.get("page_num") or concept.page_num
    quiz.status = "DRAFT"

    quiz_repository.save_quiz(db, quiz)

    response = quiz_to_response_dict(quiz, concept)
    response["ai_used"] = ai_used
    response["rejected_count"] = rejected_count
    response["message"] = "퀴즈가 재생성되었습니다."
    return response


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

    quiz_repository.save_quiz(db, quiz)

    concept = None
    if quiz.concept_id:
        concept = concept_repository.get_concept_by_id(db, quiz.concept_id)

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

    quiz_repository.save_quiz(db, quiz)

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
        concept = concept_repository.get_concept_by_id_and_lecture(
            db,
            request_data.concept_id,
            lecture_id,
        )

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

    quiz_repository.create_quiz(db, new_quiz)

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

    quiz_repository.save_quiz(db, quiz)

    return {
        "quiz_id": quiz.id,
        "previous_status": previous_status,
        "current_status": quiz.status,
        "message": "퀴즈 상태가 변경되었습니다.",
    }
