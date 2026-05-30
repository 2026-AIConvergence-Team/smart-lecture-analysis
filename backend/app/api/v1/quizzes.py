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
    memo_repository,
    quiz_generation_job_repository,
    quiz_repository,
    quiz_set_repository,
    submission_repository,
)
from app.services.quiz.quiz_generation import (
    AI_BATCH_SIZE,
    calculate_target_quiz_count,
    deserialize_options,
    filter_quality_quizzes,
    generate_quizzes_for_concepts,
    get_concept_label,
    infer_concept_label_from_source_sentence,
    is_generation_quiz_type_enabled,
    normalize_selected_keywords,
    prepare_quiz_materials_for_ai,
    serialize_options,
)
from app.services.quiz.ai_quiz_generation import (
    AIQuotaExceededError,
    enhance_quiz_with_ai,
    generate_quizzes_with_ai_batch,
    normalize_ai_provider,
    quiz_model_to_draft_dict,
)
from app.services.quiz.quiz_validation import (
    canonicalize_quiz_type,
    error_response,
    normalize_difficulty,
    normalize_quiz_set_status,
    normalize_quiz_status,
    normalize_quiz_type,
    validate_difficulty,
    validate_options_and_answer,
    validate_quiz_set_status,
    validate_quiz_status,
    validate_quiz_type,
)

from app.constants.quiz_constants import (
    AI_TARGET_MAX_QUIZZES,
    AI_TARGET_MIN_QUIZZES,
    SERVICE_MAX_QUIZ_COUNT,
)

router = APIRouter()
TEACHER_QUIZ_TAG = "Teacher Quizzes"
STUDENT_QUIZ_TAG = "Student Quizzes"
SHARED_QUIZ_TAG = "Shared Quizzes"
STUDENT_VISIBLE_QUIZ_SET_STATUSES = {"SENT", "CLOSED"}

GROQ_AI_MAX_ENHANCE_ITEMS = 3


def is_multiple_choice_quiz(quiz_type: str) -> bool:
    return canonicalize_quiz_type(quiz_type) == "MULTIPLE_CHOICE"


def parse_choice_number(selected: object, option_count: int) -> int | None:
    selected_text = str(selected or "").strip()

    if not selected_text.isdecimal():
        return None

    choice_number = int(selected_text)
    if choice_number < 1 or choice_number > option_count:
        return None

    return choice_number


def get_correct_choice_number(quiz: models.Quiz) -> int | None:
    options = deserialize_options(quiz.options)
    correct_answer = str(quiz.answer or "").strip()

    for index, option in enumerate(options, start=1):
        if str(option or "").strip() == correct_answer:
            return index

    return None


def quiz_model_supports_generation_job_id() -> bool:
    """
    현재 Quiz 모델이 generation_job_id 필드를 지원하는지 확인합니다.
    """
    return hasattr(models.Quiz, "generation_job_id")


def quiz_model_supports_set_id() -> bool:
    return hasattr(models.Quiz, "set_id")

def infer_quiz_display_concept_from_quiz_content(quiz: models.Quiz) -> Optional[str]:
    """
    DB concept_name이 PDF 조각이거나, source_sentence가 여러 개념을 포함하는 경우
    실제 문항의 question/answer/source_sentence 중심으로 표시 concept를 보정합니다.
    """
    text = " ".join([
        quiz.question or "",
        quiz.answer or "",
        quiz.source_sentence or "",
    ])

    normalized = "".join(str(text or "").lower().split())

    priority_rules = [
        ("제로섬게임", "제로섬 게임"),
        ("zero-sumgame", "제로섬 게임"),
        ("zerosumgame", "제로섬 게임"),
        ("죄수의딜레마", "죄수의 딜레마"),
        ("prisoner", "죄수의 딜레마"),
        ("내시균형", "내시균형"),
        ("내쉬균형", "내쉬균형"),
        ("nashequilibrium", "내시균형"),
        ("파블로프", "파블로프 전략"),
        ("pavlov", "파블로프 전략"),
        ("맞대응", "맞대응 전략"),
        ("tit-for-tat", "맞대응 전략"),
        ("titfortat", "맞대응 전략"),
        ("일회성", "일회성 게임"),
        ("one-shot", "일회성 게임"),
        ("oneshot", "일회성 게임"),
        ("반복적", "반복적 게임"),
        ("iterative", "반복적 게임"),
        ("최상의대응", "최상의 대응"),
        ("bestresponse", "최상의 대응"),
        ("최적의전략", "최적의 전략"),
        ("optimalstrategy", "최적의 전략"),
        ("사회적의사결정", "사회적 의사결정"),
        ("게임이론", "게임 이론"),
    ]

    for marker, label in priority_rules:
        if marker in normalized:
            return label

    return None

def get_quiz_display_concept(
    quiz: models.Quiz,
    concept: Optional[models.Concept] = None,
) -> Optional[str]:
    """
    퀴즈에 노출할 개념명을 결정합니다.

    실제 문항의 question/answer/source_sentence를 먼저 보고,
    그 다음 DB concept를 fallback으로 사용합니다.
    """
    inferred_from_quiz = infer_quiz_display_concept_from_quiz_content(quiz)
    if inferred_from_quiz:
        return inferred_from_quiz

    if concept:
        refined_label = get_concept_label(concept)
        if refined_label:
            return refined_label

        if concept.concept_name:
            return concept.concept_name

    inferred_label = infer_concept_label_from_source_sentence(
        quiz.source_sentence or ""
    )
    if inferred_label:
        return inferred_label

    return None

def quiz_to_response_dict(
    quiz: models.Quiz,
    concept: Optional[models.Concept] = None,
) -> dict:
    response = {
        "quiz_id": quiz.id,
        "set_id": quiz.set_id,
        "lecture_id": quiz.lecture_id,
        "concept_id": quiz.concept_id,
        "concept": get_quiz_display_concept(quiz, concept),
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
        response["generation_job_id"] = quiz.generation_job_id

    return response


def quiz_set_to_response_dict(
    quiz_set: models.QuizSet,
    quiz_count: int = 0,
) -> dict:
    return {
        "set_id": quiz_set.id,
        "lecture_id": quiz_set.lecture_id,
        "generation_job_id": quiz_set.generation_job_id,
        "set_number": quiz_set.set_number,
        "page_start": quiz_set.page_start,
        "page_end": quiz_set.page_end,
        "status": quiz_set.status,
        "quiz_count": quiz_count,
        "created_at": quiz_set.created_at.isoformat() if quiz_set.created_at else None,
        "updated_at": quiz_set.updated_at.isoformat() if quiz_set.updated_at else None,
    }


def get_lecture_or_404(db: Session, lecture_id: int):
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)

    if not lecture:
        return None, error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 강의를 찾을 수 없습니다.",
        )

    return lecture, None


def is_student_visible_quiz_set(quiz_set: models.QuizSet | None) -> bool:
    return bool(quiz_set and quiz_set.status in STUDENT_VISIBLE_QUIZ_SET_STATUSES)


def is_student_visible_quiz(db: Session, quiz: models.Quiz) -> bool:
    if quiz.status == "DELETED":
        return False

    if quiz.set_id is None:
        return False

    return is_student_visible_quiz_set(
        quiz_set_repository.get_quiz_set_by_id(db, quiz.set_id),
    )


def require_teacher_user(current_user: models.User):
    if current_user.role != "teacher":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only teachers can manage quizzes.",
        )

    return None


def get_quiz_or_404(
    db: Session,
    quiz_id: int,
    set_id: Optional[int] = None,
):
    quiz = quiz_repository.get_quiz_by_id(db, quiz_id)

    if not quiz:
        return None, error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 퀴즈를 찾을 수 없습니다.",
        )

    if set_id is not None:
        quiz_set_id = (
            getattr(quiz, "set_id", None)
            if quiz_model_supports_set_id()
            else None
        )

        if quiz_set_id != set_id:
            return None, error_response(
                status.HTTP_404_NOT_FOUND,
                "해당 set_id에 속한 quiz_id를 찾을 수 없습니다.",
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

def get_page_context_map(
    db: Session,
    lecture_id: int,
    page_start: int,
    page_end: int,
) -> dict[int, str]:
    """
    퀴즈 생성 시 concept.sentences만 쓰면 문맥이 너무 짧아져
    AI가 '선수', '전략' 같은 단어를 잘못 해석할 수 있습니다.

    PageContent 모델이 있으면 page별 원문 텍스트를 함께 넘깁니다.
    모델명/컬럼명이 약간 달라도 최대한 안전하게 동작하도록 getattr 기반으로 처리합니다.
    """
    PageContent = getattr(models, "PageContent", None)
    if PageContent is None:
        print("[QUIZ_PAGE_CONTEXT_SKIP] reason=PageContent 모델을 찾지 못했습니다.")
        return {}

    page_num_column = getattr(PageContent, "page_num", None) or getattr(PageContent, "page", None)
    if page_num_column is None:
        print("[QUIZ_PAGE_CONTEXT_SKIP] reason=PageContent page_num/page 컬럼을 찾지 못했습니다.")
        return {}

    try:
        rows = (
            db.query(PageContent)
            .filter(PageContent.lecture_id == lecture_id)
            .filter(page_num_column >= page_start)
            .filter(page_num_column <= page_end)
            .all()
        )
    except Exception as exc:
        print(f"[QUIZ_PAGE_CONTEXT_SKIP] reason=PageContent 조회 실패, error={exc}")
        return {}

    context_map: dict[int, str] = {}

    for row in rows:
        page_num = getattr(row, "page_num", None) or getattr(row, "page", None)
        if page_num is None:
            continue

        text = (
            getattr(row, "text", None)
            or getattr(row, "content", None)
            or getattr(row, "page_text", None)
            or getattr(row, "raw_text", None)
            or ""
        )

        text = str(text or "").strip()
        if text:
            context_map[int(page_num)] = text

    print(
        "[QUIZ_PAGE_CONTEXT_RESULT] "
        f"lecture_id={lecture_id}, "
        f"pages={len(context_map)}, "
        f"page_range={page_start}-{page_end}"
    )

    return context_map

def get_latest_job_quizzes_query(
    db: Session,
    lecture_id: int,
    latest_job: models.QuizGenerationJob,
):
    """
    최신 생성 작업과 연결된 퀴즈 조회 쿼리를 반환합니다.
    """
    return quiz_repository.get_latest_job_quizzes_query(
        db=db,
        lecture_id=lecture_id,
        latest_job=latest_job,
        quiz_set=quiz_set_repository.get_quiz_set_by_job_id(db, latest_job.id),
    )


@router.post(
    "/api/lectures/{lecture_id}/quizzes/generate",
    status_code=status.HTTP_201_CREATED,
    summary="Generate quizzes from extracted concepts",
    tags=[TEACHER_QUIZ_TAG],
)
def generate_lecture_quizzes(
    lecture_id: int,
    request_data: schemas.QuizGenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    quiz_type = normalize_quiz_type(request_data.quiz_type)
    quiz_type_error = validate_quiz_type(quiz_type)
    if quiz_type_error:
        return quiz_type_error

    if quiz_type != "MIXED" and not is_generation_quiz_type_enabled(quiz_type):
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"{quiz_type} quiz generation is currently disabled.",
        )

    difficulty = normalize_difficulty(request_data.difficulty)
    difficulty_error = validate_difficulty(difficulty)
    if difficulty_error:
        return difficulty_error

    if request_data.page_start > request_data.page_end:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "page_start는 page_end보다 클 수 없습니다.",
        )

    if lecture.total_pages and request_data.page_end > lecture.total_pages:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "페이지 범위가 PDF 전체 페이지 수를 초과합니다.",
        )

    if not request_data.use_ai:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "현재 퀴즈 생성은 AI 생성 방식만 지원합니다. use_ai=true로 요청하세요.",
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
            "분석 결과가 없습니다. /api/lectures/{lecture_id}/pdf/analyze를 먼저 호출하세요.",
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

    selected_keywords = normalize_selected_keywords(request_data.selected_keywords)

    if selected_keywords:
        target_quiz_count = min(SERVICE_MAX_QUIZ_COUNT, len(selected_keywords))
        available_material_count = len(selected_keywords)
    else:
        target_quiz_count = calculate_target_quiz_count(
            page_start=request_data.page_start,
            page_end=request_data.page_end,
            available_concept_count=len(target_concepts),
        )
        available_material_count = len(target_concepts)

    if target_quiz_count <= 0:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "해당 범위에서 퀴즈를 생성할 수 있는 충분한 개념을 찾지 못했습니다.",
        )

    # AI batch에 넘길 최대 목표 수.
    # 최종 저장 수는 target_quiz_count를 넘지 않도록 아래에서 다시 자릅니다.
    internal_target_max = min(
        SERVICE_MAX_QUIZ_COUNT,
        AI_TARGET_MAX_QUIZZES,
        available_material_count,
        max(target_quiz_count + 2, target_quiz_count),
    )

    # target_min이 target_max보다 커지면 AI batch가 비현실적인 목표를 갖게 되므로 보정합니다.
    internal_target_min = min(
        AI_TARGET_MIN_QUIZZES,
        internal_target_max,
        target_quiz_count,
    )

    # 그래도 최소 1개는 시도합니다.
    internal_target_max = max(1, internal_target_max)
    internal_target_min = max(1, internal_target_min)

    job = models.QuizGenerationJob(
        lecture_id=lecture_id,
        status="generating",
        progress=0,
        page_start=request_data.page_start,
        page_end=request_data.page_end,
        quiz_type=quiz_type,
        generated_count=0,
        failed_count=0,
        message="AI 퀴즈 생성을 시작했습니다.",
    )

    quiz_generation_job_repository.create_job(db, job)

    try:
        failed_count = 0

        ai_provider = normalize_ai_provider(request_data.ai_provider)

        if ai_provider == "groq":
            effective_batch_size = 1
            effective_target_min = min(4, internal_target_max)
            effective_target_max = min(6, internal_target_max)
            effective_retry_missing_once = True
            effective_quota_retry_count = 1
            effective_request_delay_seconds = 2.5
        else:
            effective_batch_size = AI_BATCH_SIZE
            effective_target_min = internal_target_min
            effective_target_max = internal_target_max
            effective_retry_missing_once = True
            effective_quota_retry_count = 0
            effective_request_delay_seconds = 0.0
            
        print(
            "[QUIZ_GENERATE_AI_ONLY_START] "
            f"lecture_id={lecture_id}, "
            f"provider={ai_provider}, "
            f"quiz_type={quiz_type}, "
            f"difficulty={difficulty}, "
            f"concepts={len(target_concepts)}, "
            f"target_quiz_count={target_quiz_count}, "
            f"target_min={effective_target_min}, "
            f"target_max={effective_target_max}"
        )

        page_context_map = get_page_context_map(
            db=db,
            lecture_id=lecture_id,
            page_start=request_data.page_start,
            page_end=request_data.page_end,
        )
        ai_materials, prefilter_failed_count = prepare_quiz_materials_for_ai(
            concepts=target_concepts,
            quiz_type=quiz_type,
            count_per_concept=request_data.count_per_concept,
            option_count=request_data.option_count,
            target_min=effective_target_min,
            target_max=effective_target_max,
            page_context_map=page_context_map,
            selected_keywords=selected_keywords,
        )

        failed_count += prefilter_failed_count

        print(
            "[QUIZ_GENERATE_AI_MATERIAL_RESULT] "
            f"concepts={len(target_concepts)}, "
            f"materials={len(ai_materials)}, "
            f"prefilter_failed={prefilter_failed_count}, "
            f"target_min={effective_target_min}, "
            f"target_max={effective_target_max}"
        )

        if not ai_materials:
            job.status = "failed"
            job.progress = 100
            job.generated_count = 0
            job.failed_count = failed_count
            job.message = (
                "AI 출제용 material을 만들 수 없습니다. "
                "concept.sentences 또는 source_sentence 필터를 확인하세요."
            )
            quiz_generation_job_repository.save_job(db, job)

            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "해당 범위에서 퀴즈를 생성할 수 있는 문장을 찾지 못했습니다.",
            )

        generated_quizzes, ai_generated_count = generate_quizzes_with_ai_batch(
            materials=ai_materials,
            difficulty=difficulty,
            option_count=request_data.option_count,
            use_ai=request_data.use_ai,
            batch_size=effective_batch_size,
            target_min=effective_target_min,
            target_max=effective_target_max,
            retry_missing_once=effective_retry_missing_once,
            provider=ai_provider,
            quota_retry_count=effective_quota_retry_count,
            request_delay_seconds=effective_request_delay_seconds,
        )

        ai_missing_count = max(
            0,
            min(len(ai_materials), effective_target_max) - len(generated_quizzes),
        )

        print(
            "[QUIZ_GENERATE_AI_BATCH_RESULT] "
            f"materials={len(ai_materials)}, "
            f"ai_generated={ai_generated_count}, "
            f"generated_quizzes={len(generated_quizzes)}, "
            f"ai_missing={ai_missing_count}"
        )

        if not generated_quizzes:
            job.status = "failed"
            job.progress = 100
            job.generated_count = 0
            job.failed_count = failed_count + ai_missing_count
            job.message = (
                "AI가 퀴즈를 생성하지 못했습니다. "
                "AI provider 설정, API key, rate limit, 프롬프트 응답 형식을 확인하세요."
            )
            quiz_generation_job_repository.save_job(db, job)

            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "AI가 퀴즈를 생성하지 못했습니다. AI 설정 또는 응답 로그를 확인해 주세요.",
            )

        quality_quizzes, rejected_count = filter_quality_quizzes(
            generated_quizzes,
            option_count=request_data.option_count,
        )

        print(
            "[QUIZ_GENERATE_AI_QUALITY_RESULT] "
            f"before_quality={len(generated_quizzes)}, "
            f"after_quality={len(quality_quizzes)}, "
            f"quality_rejected={rejected_count}"
        )

        if not quality_quizzes:
            total_failed_count = failed_count + rejected_count + ai_missing_count

            job.status = "failed"
            job.progress = 100
            job.generated_count = 0
            job.failed_count = total_failed_count
            job.message = (
                "AI 퀴즈는 생성됐지만 품질 기준을 통과한 퀴즈가 없습니다. "
                f"prefilter_failed={prefilter_failed_count}, "
                f"ai_missing={ai_missing_count}, "
                f"quality_rejected={rejected_count}"
            )
            quiz_generation_job_repository.save_job(db, job)

            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "AI가 생성한 퀴즈가 품질 기준을 통과하지 못했습니다.",
            )

        # 최종 저장 수는 목표 문항 수를 넘지 않도록 제한합니다.
        if len(quality_quizzes) > target_quiz_count:
            quality_quizzes = quality_quizzes[:target_quiz_count]

        total_failed_count = failed_count + rejected_count + ai_missing_count

        quiz_set = models.QuizSet(
            lecture_id=lecture_id,
            generation_job_id=job.id,
            set_number=quiz_set_repository.get_next_set_number(db, lecture_id),
            page_start=request_data.page_start,
            page_end=request_data.page_end,
            status="DRAFT",
        )
        quiz_set_repository.create_quiz_set(db, quiz_set)

        saved_quizzes = []

        for item in quality_quizzes:
            new_quiz = models.Quiz(
                lecture_id=item["lecture_id"],
                concept_id=item["concept_id"],
                set_id=quiz_set.id,
                generation_job_id=job.id,
                quiz_type=item["quiz_type"],
                question=item["question"],
                options=serialize_options(item.get("options") or []),
                answer=item["answer"],
                explanation=item.get("explanation"),
                source_sentence=item.get("source_sentence"),
                page_num=item["page_num"],
                status="ACTIVE",
            )

            saved_quizzes.append(new_quiz)

        job.status = "completed"
        job.progress = 100
        job.generated_count = len(saved_quizzes)
        job.failed_count = total_failed_count
        job.message = (
            "AI 퀴즈 생성이 완료되었습니다. "
            f"AI 생성 {ai_generated_count}개, "
            f"품질 통과 {len(saved_quizzes)}개, "
            f"quality_rejected={rejected_count}, "
            f"ai_missing={ai_missing_count}"
        )

        quiz_repository.save_generated_quizzes(db, saved_quizzes)

        return {
            "lecture_id": lecture_id,
            "job_id": job.id,
            "set_id": quiz_set.id,
            "status": "completed",
            "page_start": request_data.page_start,
            "page_end": request_data.page_end,
            "quiz_type": quiz_type,
            "generated_count": len(saved_quizzes),
            "target_quiz_count": target_quiz_count,
            "failed_count": total_failed_count,
            "rejected_count": rejected_count,
            "ai_requested": request_data.use_ai,
            "ai_provider": ai_provider,
            "ai_generated_count": ai_generated_count,
            "generation_mode": "ai_only",
            "message": (
                "AI 퀴즈 생성이 완료되었습니다. "
                "GET /api/lectures/{lecture_id}/quizzes/generate/status 에서 최신 생성 결과를 확인하세요."
            ),
        }

    except Exception as exc:
        quiz_repository.rollback(db)

        failed_job = quiz_generation_job_repository.get_job_by_id(db, job.id)

        if failed_job:
            failed_job.status = "failed"
            failed_job.progress = 100
            failed_job.generated_count = 0
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
    tags=[TEACHER_QUIZ_TAG],
)
def get_quiz_generation_status(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "teacher":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only teachers can view quiz generation status.",
        )

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

    latest_set = quiz_set_repository.get_quiz_set_by_job_id(db, latest_job.id)

    quizzes = quiz_repository.get_latest_job_quizzes(
        db=db,
        lecture_id=lecture_id,
        latest_job=latest_job,
        quiz_set=latest_set,
    )

    concept_ids = [quiz.concept_id for quiz in quizzes if quiz.concept_id]
    concepts = concept_repository.get_concepts_by_ids(db, concept_ids) if concept_ids else []

    concept_map = {concept.id: concept for concept in concepts}

    return {
        "lecture_id": lecture_id,
        "job_id": latest_job.id,
        "set_id": latest_set.id if latest_set else None,
        "status": latest_job.status,
        "progress": latest_job.progress,
        "page_start": latest_job.page_start,
        "page_end": latest_job.page_end,
        "quiz_type": latest_job.quiz_type,
        "generated_count": latest_job.generated_count,
        "failed_count": latest_job.failed_count,
        "returned_count": len(quizzes),
        "message": latest_job.message,
        "uses_set_id": latest_set is not None,
        "quizzes": [
            quiz_to_response_dict(quiz, concept_map.get(quiz.concept_id))
            for quiz in quizzes
        ],
    }


@router.get(
    "/api/lectures/{lecture_id}/quizzes",
    response_model=schemas.LectureQuizSetsWithQuizzesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get lecture quizzes",
    tags=[SHARED_QUIZ_TAG],
)
def get_lecture_quizzes(
    lecture_id: int,
    quiz_status: Optional[str] = Query(default=None, alias="status"),
    page_start: Optional[int] = Query(default=None),
    page_end: Optional[int] = Query(default=None),
    concept_id: Optional[int] = Query(default=None),
    set_id: Optional[int] = Query(default=None),
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

    student_requested_hidden_status = (
        current_user.role == "student"
        and normalized_status is not None
        and normalized_status == "DELETED"
    )

    if set_id is not None:
        if not quiz_model_supports_set_id():
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "set_id 필터를 사용하려면 Quiz 모델과 DB에 set_id 컬럼이 필요합니다.",
            )
        quiz_set = quiz_set_repository.get_quiz_set_by_id(db, set_id)
        if not quiz_set or quiz_set.lecture_id != lecture_id:
            return error_response(
                status.HTTP_404_NOT_FOUND,
                "Quiz set not found for this lecture.",
            )
        if current_user.role == "student" and not is_student_visible_quiz_set(quiz_set):
            return error_response(
                status.HTTP_404_NOT_FOUND,
                "Quiz set not found for this lecture.",
            )
        quiz_sets = [quiz_set]
    else:
        quiz_sets = quiz_set_repository.get_quiz_sets_by_lecture(
            db=db,
            lecture_id=lecture_id,
        )
        if current_user.role == "student":
            quiz_sets = [
                quiz_set
                for quiz_set in quiz_sets
                if is_student_visible_quiz_set(quiz_set)
            ]

    if student_requested_hidden_status:
        quizzes = []
    else:
        quizzes = quiz_repository.get_lecture_quizzes(
            db=db,
            lecture_id=lecture_id,
            quiz_status=normalized_status,
            page_start=page_start,
            page_end=page_end,
            concept_id=concept_id,
            set_id=set_id,
        )

    if current_user.role == "student":
        visible_set_ids = {quiz_set.id for quiz_set in quiz_sets}
        quizzes = [
            quiz
            for quiz in quizzes
            if quiz.set_id in visible_set_ids
        ]

    concept_ids = [quiz.concept_id for quiz in quizzes if quiz.concept_id]
    concepts = concept_repository.get_concepts_by_ids(db, concept_ids) if concept_ids else []

    concept_map = {concept.id: concept for concept in concepts}
    quizzes_by_set_id: dict[int, list[models.Quiz]] = {}
    for quiz in quizzes:
        if quiz.set_id is None:
            continue
        quizzes_by_set_id.setdefault(quiz.set_id, []).append(quiz)

    return {
        "lecture_id": lecture_id,
        "total_set_count": len(quiz_sets),
        "total_quiz_count": len(quizzes),
        "sets": [
            {
                **quiz_set_to_response_dict(
                    quiz_set,
                    quiz_count=len(quizzes_by_set_id.get(quiz_set.id, [])),
                ),
                "quizzes": [
                    quiz_to_response_dict(quiz, concept_map.get(quiz.concept_id))
                    for quiz in quizzes_by_set_id.get(quiz_set.id, [])
                ],
            }
            for quiz_set in quiz_sets
        ],
    }


@router.get(
    "/api/lectures/{lecture_id}/quiz-sets",
    status_code=status.HTTP_200_OK,
    summary="Get quiz sets for a lecture",
    tags=[SHARED_QUIZ_TAG],
)
def get_lecture_quiz_sets(
    lecture_id: int,
    set_status: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    normalized_status = None
    if set_status:
        normalized_status = normalize_quiz_set_status(set_status)
        status_error = validate_quiz_set_status(normalized_status)
        if status_error:
            return status_error

    if (
        current_user.role == "student"
        and normalized_status is not None
        and normalized_status not in STUDENT_VISIBLE_QUIZ_SET_STATUSES
    ):
        quiz_sets = []
    else:
        quiz_sets = quiz_set_repository.get_quiz_sets_by_lecture(
            db=db,
            lecture_id=lecture_id,
            set_status=normalized_status,
        )

    if current_user.role == "student":
        quiz_sets = [
            quiz_set
            for quiz_set in quiz_sets
            if is_student_visible_quiz_set(quiz_set)
        ]

    return {
        "lecture_id": lecture_id,
        "total_count": len(quiz_sets),
        "sets": [
            quiz_set_to_response_dict(
                quiz_set,
                quiz_count=len(
                    quiz_repository.get_lecture_quizzes(
                        db=db,
                        lecture_id=lecture_id,
                        set_id=quiz_set.id,
                    )
                ),
            )
            for quiz_set in quiz_sets
        ],
    }


@router.post(
    "/api/lectures/{lecture_id}/quiz-sets/{set_id}/submissions",
    response_model=schemas.SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit answers for a lecture quiz set",
    tags=[STUDENT_QUIZ_TAG],
)
def submit_quiz_set_answers(
    lecture_id: int,
    set_id: int,
    request_data: schemas.QuizSetSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "student":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only students can submit quiz answers.",
        )

    lecture, error = get_lecture_or_404(db, lecture_id)
    if error:
        return error

    quiz_set = quiz_set_repository.get_quiz_set_by_id(db, set_id)
    if not quiz_set or quiz_set.lecture_id != lecture.id:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Quiz set not found for this lecture.",
        )

    if quiz_set.status != "SENT":
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "Quiz set must be SENT before submitting answers.",
        )

    existing_submission = submission_repository.get_submission_by_set_and_student(
        db,
        set_id,
        current_user.id,
    )
    if existing_submission:
        return error_response(
            status.HTTP_409_CONFLICT,
            "Answers have already been submitted for this quiz set.",
        )

    quizzes = quiz_repository.get_lecture_quizzes(
        db=db,
        lecture_id=lecture.id,
        set_id=set_id,
    )
    if not quizzes:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "No active quizzes exist in this quiz set.",
        )

    quiz_map = {quiz.id: quiz for quiz in quizzes}
    expected_quiz_ids = set(quiz_map.keys())
    submitted_quiz_ids = [answer.quiz_id for answer in request_data.answers]

    if len(submitted_quiz_ids) != len(set(submitted_quiz_ids)):
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "Duplicate quiz_id values are not allowed.",
        )

    submitted_quiz_id_set = set(submitted_quiz_ids)
    unknown_quiz_ids = submitted_quiz_id_set - expected_quiz_ids
    missing_quiz_ids = expected_quiz_ids - submitted_quiz_id_set

    if unknown_quiz_ids:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"quiz_id values do not belong to this quiz set: {sorted(unknown_quiz_ids)}",
        )

    if missing_quiz_ids:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"Answers are required for every quiz in the set. Missing quiz_id values: {sorted(missing_quiz_ids)}",
        )

    answer_rows = []
    for answer in request_data.answers:
        selected = str(answer.selected).strip()
        if not selected:
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "selected is required for every answer.",
            )

        quiz = quiz_map[answer.quiz_id]

        if is_multiple_choice_quiz(quiz.quiz_type):
            options = deserialize_options(quiz.options)
            choice_number = parse_choice_number(selected, len(options))
            if choice_number is None:
                return error_response(
                    status.HTTP_400_BAD_REQUEST,
                    (
                        "selected must be a 1-based option number for "
                        f"multiple-choice quizzes. quiz_id={quiz.id}"
                    ),
                )

            correct_choice_number = get_correct_choice_number(quiz)
            if correct_choice_number is None:
                return error_response(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    f"Quiz answer is not included in options. quiz_id={quiz.id}",
                )

            is_correct = choice_number == correct_choice_number
        else:
            is_correct = selected == str(quiz.answer or "").strip()

        answer_rows.append(
            {
                "quiz_id": quiz.id,
                "selected": selected,
                "is_correct": is_correct,
            }
        )

    try:
        submission, saved_answers = submission_repository.create_submission_with_answers(
            db=db,
            set_id=quiz_set.id,
            student_id=current_user.id,
            answers=answer_rows,
        )
    except Exception as exc:
        submission_repository.rollback(db)
        return error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to submit answers: {exc}",
        )

    return {
        "id": submission.id,
        "set_id": submission.set_id,
        "lecture_id": lecture.id,
        "student_id": submission.student_id,
        "submitted_at": submission.submitted_at,
        "answers": saved_answers,
        "total_count": len(saved_answers),
        "correct_count": sum(1 for answer in saved_answers if answer.is_correct),
    }


@router.patch(
    "/api/quiz-sets/{set_id}/status",
    status_code=status.HTTP_200_OK,
    summary="Update quiz set status",
    tags=[TEACHER_QUIZ_TAG],
)
def update_quiz_set_status(
    set_id: int,
    request_data: schemas.QuizSetStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

    quiz_set = quiz_set_repository.get_quiz_set_by_id(db, set_id)
    if not quiz_set:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "해당 set_id를 찾을 수 없습니다.",
        )

    new_status = normalize_quiz_set_status(request_data.status)
    status_error = validate_quiz_set_status(new_status)
    if status_error:
        return status_error

    previous_status = quiz_set.status
    quiz_set.status = new_status
    quiz_set_repository.save_quiz_set(db, quiz_set)

    return {
        "set_id": quiz_set.id,
        "lecture_id": quiz_set.lecture_id,
        "previous_status": previous_status,
        "current_status": quiz_set.status,
        "message": "퀴즈 세트 상태가 변경되었습니다.",
    }


@router.get(
    "/api/quizzes/{quiz_id}",
    status_code=status.HTTP_200_OK,
    summary="Get quiz detail",
    tags=[SHARED_QUIZ_TAG],
)
def get_quiz_detail(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return error

    if current_user.role == "student" and not is_student_visible_quiz(db, quiz):
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Quiz not found.",
        )

    concept = None
    if quiz.concept_id:
        concept = concept_repository.get_concept_by_id(db, quiz.concept_id)

    return quiz_to_response_dict(quiz, concept)


def get_closed_quiz_for_memo(db: Session, quiz_id: int):
    quiz, error = get_quiz_or_404(db, quiz_id)
    if error:
        return None, error

    if quiz.status == "DELETED":
        return None, error_response(
            status.HTTP_400_BAD_REQUEST,
            "Deleted quizzes cannot have memos.",
        )

    lecture, error = get_lecture_or_404(db, quiz.lecture_id)
    if error:
        return None, error

    if quiz.set_id is not None:
        quiz_set = quiz_set_repository.get_quiz_set_by_id(db, quiz.set_id)
        if not quiz_set or quiz_set.lecture_id != quiz.lecture_id:
            return None, error_response(
                status.HTTP_404_NOT_FOUND,
                "Quiz set not found for this quiz.",
            )

        if quiz_set.status != "CLOSED":
            return None, error_response(
                status.HTTP_400_BAD_REQUEST,
                "Quiz set must be CLOSED before saving a memo.",
            )
    elif lecture.status != "ENDED":
        return None, error_response(
            status.HTTP_400_BAD_REQUEST,
            "Lecture must be ENDED before saving a memo for this quiz.",
        )

    return quiz, None


@router.post(
    "/api/quizzes/{quiz_id}/memo",
    response_model=schemas.MemoResponse,
    status_code=status.HTTP_200_OK,
    summary="Create or update memo for a closed quiz",
    tags=[STUDENT_QUIZ_TAG],
)
def upsert_quiz_memo(
    quiz_id: int,
    request_data: schemas.MemoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "student":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only students can create quiz memos.",
        )

    quiz, error = get_closed_quiz_for_memo(db, quiz_id)
    if error:
        return error

    content = request_data.content.strip()
    if not content:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "content is required.",
        )

    try:
        return memo_repository.upsert_memo(
            db=db,
            quiz_id=quiz.id,
            student_id=current_user.id,
            content=content,
        )
    except Exception as exc:
        memo_repository.rollback(db)
        return error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to save memo: {exc}",
        )


@router.patch(
    "/api/quizzes/{quiz_id}/memo",
    response_model=schemas.MemoResponse,
    status_code=status.HTTP_200_OK,
    summary="Update memo for a closed quiz",
    tags=[STUDENT_QUIZ_TAG],
)
def update_quiz_memo(
    quiz_id: int,
    request_data: schemas.MemoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "student":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only students can update quiz memos.",
        )

    quiz, error = get_closed_quiz_for_memo(db, quiz_id)
    if error:
        return error

    memo = memo_repository.get_memo(db, quiz.id, current_user.id)
    if not memo:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Memo not found for this quiz.",
        )

    content = request_data.content.strip()
    if not content:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "content is required.",
        )

    memo.content = content

    try:
        return memo_repository.save_memo(db, memo)
    except Exception as exc:
        memo_repository.rollback(db)
        return error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to update memo: {exc}",
        )


@router.post(
    "/api/quiz-sets/{set_id}/quizzes/{quiz_id}/regenerate",
    response_model=schemas.QuizMutationResponse,
    status_code=status.HTTP_200_OK,
    summary="Regenerate one quiz in a quiz set",
    tags=[TEACHER_QUIZ_TAG],
)
def regenerate_quiz(
    quiz_id: int,
    set_id: int,
    request_data: schemas.QuizRegenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

    quiz, error = get_quiz_or_404(db, quiz_id, set_id)
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
            "개념이 연결되지 않은 퀴즈는 자동 재생성할 수 없습니다.",
        )

    requested_quiz_type = request_data.quiz_type or quiz.quiz_type
    quiz_type = normalize_quiz_type(requested_quiz_type)
    quiz_type_error = validate_quiz_type(quiz_type)
    if quiz_type_error:
        return quiz_type_error

    if quiz_type != "MIXED" and not is_generation_quiz_type_enabled(quiz_type):
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"{quiz_type} quiz generation is currently disabled.",
        )

    difficulty = normalize_difficulty(request_data.difficulty)
    difficulty_error = validate_difficulty(difficulty)
    if difficulty_error:
        return difficulty_error

    # 재생성에는 같은 개념 주변 페이지의 개념 정보를 함께 사용합니다.
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
        provider=request_data.ai_provider,
    )

    quality_quizzes, rejected_count = filter_quality_quizzes(
        [regenerated_quiz],
        option_count=request_data.option_count,
    )

    if not quality_quizzes:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "재생성된 퀴즈가 품질 기준을 통과하지 못했습니다. 다른 유형이나 AI 사용 옵션으로 다시 시도해 주세요.",
        )

    regenerated_quiz = quality_quizzes[0]

    quiz.quiz_type = regenerated_quiz["quiz_type"]
    quiz.question = regenerated_quiz["question"]
    quiz.options = serialize_options(regenerated_quiz["options"])
    quiz.answer = regenerated_quiz["answer"]
    quiz.explanation = regenerated_quiz.get("explanation")
    quiz.source_sentence = regenerated_quiz.get("source_sentence")
    quiz.page_num = regenerated_quiz.get("page_num") or concept.page_num
    quiz.status = "ACTIVE"

    quiz_repository.save_quiz(db, quiz)

    response = quiz_to_response_dict(quiz, concept)
    response["updated_fields"] = [
        "quiz_type",
        "question",
        "options",
        "answer",
        "explanation",
        "source_sentence",
        "page",
        "status",
    ]
    response["ai_used"] = ai_used
    response["rejected_count"] = rejected_count
    response["message"] = "퀴즈가 재생성되었습니다."
    return response


@router.patch(
    "/api/quiz-sets/{set_id}/quizzes/{quiz_id}",
    response_model=schemas.QuizMutationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update quiz in a quiz set",
    tags=[TEACHER_QUIZ_TAG],
)
def update_quiz(
    quiz_id: int,
    set_id: int,
    request_data: schemas.QuizUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

    quiz, error = get_quiz_or_404(db, quiz_id, set_id)
    if error:
        return error

    if quiz.status == "DELETED":
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "삭제된 퀴즈는 수정할 수 없습니다.",
        )

    updated_fields = []

    if request_data.question is not None:
        if not request_data.question.strip():
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "question은 필수값입니다.",
            )
        quiz.question = request_data.question.strip()
        updated_fields.append("question")

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
        updated_fields.append("options")

    if request_data.answer is not None:
        current_options = deserialize_options(quiz.options)
        validation_error = validate_options_and_answer(
            current_options,
            request_data.answer,
        )
        if validation_error:
            return validation_error

        quiz.answer = request_data.answer
        updated_fields.append("answer")

    if request_data.explanation is not None:
        quiz.explanation = request_data.explanation
        updated_fields.append("explanation")

    if request_data.status is not None:
        normalized_status = normalize_quiz_status(request_data.status)
        status_error = validate_quiz_status(normalized_status)
        if status_error:
            return status_error

        quiz.status = normalized_status
        updated_fields.append("status")

    quiz_repository.save_quiz(db, quiz)

    concept = None
    if quiz.concept_id:
        concept = concept_repository.get_concept_by_id(db, quiz.concept_id)

    response = quiz_to_response_dict(quiz, concept)
    response["updated_fields"] = updated_fields
    response["ai_used"] = None
    response["rejected_count"] = None
    response["message"] = (
        "Quiz updated."
        if updated_fields
        else "No quiz fields were changed."
    )
    return response


@router.delete(
    "/api/quiz-sets/{set_id}/quizzes/{quiz_id}",
    status_code=status.HTTP_200_OK,
    summary="Soft delete quiz in a quiz set",
    tags=[TEACHER_QUIZ_TAG],
)
def delete_quiz(
    quiz_id: int,
    set_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

    quiz, error = get_quiz_or_404(db, quiz_id, set_id)
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
        "set_id": set_id,
        "previous_status": previous_status,
        "current_status": quiz.status,
        "message": "퀴즈가 삭제되었습니다.",
    }


@router.post(
    "/api/lectures/{lecture_id}/quizzes",
    status_code=status.HTTP_201_CREATED,
    summary="Create manual quiz",
    tags=[TEACHER_QUIZ_TAG],
)
def create_manual_quiz(
    lecture_id: int,
    request_data: schemas.ManualQuizCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

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

    quiz_set = None
    if request_data.set_id is not None:
        quiz_set = quiz_set_repository.get_quiz_set_by_id(db, request_data.set_id)
        if not quiz_set or quiz_set.lecture_id != lecture_id:
            return error_response(
                status.HTTP_404_NOT_FOUND,
                "해당 강의에 속한 set_id를 찾을 수 없습니다.",
            )
    else:
        quiz_set = models.QuizSet(
            lecture_id=lecture_id,
            generation_job_id=None,
            set_number=quiz_set_repository.get_next_set_number(db, lecture_id),
            page_start=request_data.page,
            page_end=request_data.page,
            status="DRAFT",
        )
        quiz_set_repository.create_quiz_set(db, quiz_set)

    new_quiz = models.Quiz(
        lecture_id=lecture_id,
        concept_id=request_data.concept_id,
        set_id=quiz_set.id,
        generation_job_id=quiz_set.generation_job_id,
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
    "/api/quiz-sets/{set_id}/quizzes/{quiz_id}/status",
    status_code=status.HTTP_200_OK,
    summary="Update quiz status in a quiz set",
    tags=[TEACHER_QUIZ_TAG],
)
def update_quiz_status(
    quiz_id: int,
    set_id: int,
    request_data: schemas.QuizStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    teacher_error = require_teacher_user(current_user)
    if teacher_error:
        return teacher_error

    quiz, error = get_quiz_or_404(db, quiz_id, set_id)
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

    previous_status = quiz.status
    quiz.status = new_status

    quiz_repository.save_quiz(db, quiz)

    return {
        "quiz_id": quiz.id,
        "set_id": set_id,
        "previous_status": previous_status,
        "current_status": quiz.status,
        "message": "퀴즈 상태가 변경되었습니다.",
    }
