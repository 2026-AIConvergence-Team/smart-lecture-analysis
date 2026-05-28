from fastapi import APIRouter, status, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import json

from app.db.session import get_db
from app.core.deps import get_current_user
from app.repositories import (
    quiz_set_repository,
    quiz_repository,
    submission_repository,
    submission_answer_repository,
    memo_repository,
    lecture_repository,
)
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/api/lectures", tags=["Reports"])


def error_response(status_code: int, message: str):
    return JSONResponse(status_code=status_code, content={"error": message})


def format_date(date_obj):
    """날짜를 'YYYY.MM.DD' 형식으로 포맷"""
    if not date_obj:
        return ""
    return date_obj.strftime("%Y.%m.%d")


@router.get(
    "/{lecture_id}/review",
    response_model=schemas.StudentReviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Get student review report",
)
def get_student_review(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 인증 확인 (student만 가능)
    if current_user.role != "student":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only students can access this review.",
        )

    # 강의 존재 확인
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "LECTURE_NOT_FOUND",
        )

    # 강의 상태 확인 (ENDED가 아니면 403 반환)
    if lecture.status != "ENDED":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "LECTURE_NOT_ENDED",
        )

    # 1. 세트 목록 조회
    quiz_sets = quiz_set_repository.get_quiz_sets_by_lecture(db, lecture_id)
    if not quiz_sets:
        return schemas.StudentReviewResponse(
            lecture_id=lecture_id,
            week=0,  # TODO: 강의 주차 정보 계산 또는 모델에서 가져오기
            date=format_date(lecture.date),
            my_stats=schemas.StudentStats(
                total_quiz_count=0,
                my_correct_count=0,
                my_correct_rate=0.0,
            ),
            sets=[],
        )

    # 2. 내 메모 조회
    my_memos = memo_repository.get_memos_by_student_and_lecture(
        db, current_user.id, lecture_id
    )
    memo_map = {m.quiz_id: m.content for m in my_memos}

    # 3. 전체 퀴즈 통계 및 세트별 결과 계산
    total_quiz_count = 0
    total_correct_count = 0
    sets_data = []

    for quiz_set in quiz_sets:
        # 세트별 퀴즈 조회 (DELETED 제외한 모든 퀴즈)
        quizzes = quiz_repository.get_lecture_quizzes(
            db=db,
            lecture_id=lecture_id,
            set_id=quiz_set.id,
        )

        if not quizzes:
            continue

        # 내 제출 조회
        my_submission = submission_repository.get_submission_by_set_and_student(
            db, quiz_set.id, current_user.id
        )

        # 내 답안 조회
        my_answers = {}
        my_set_correct_count = 0
        if my_submission:
            answers = submission_answer_repository.get_answers_by_submission(
                db, my_submission.id
            )
            for answer in answers:
                my_answers[answer.quiz_id] = {
                    "selected": answer.selected,
                    "is_correct": answer.is_correct,
                }
                if answer.is_correct:
                    my_set_correct_count += 1

        # 세트별 내 성적
        set_quiz_count = len(quizzes)
        total_quiz_count += set_quiz_count
        total_correct_count += my_set_correct_count

        my_set_correct_rate = (
            (my_set_correct_count / set_quiz_count * 100)
            if set_quiz_count > 0
            else 0.0
        )

        # 4. 퀴즈별 복습 정보
        set_quizzes = []
        for quiz in quizzes:
            # 모든 답안 조회 (전체 학생 오답률 계산)
            all_answers = submission_answer_repository.get_answers_by_quiz(
                db, quiz.id
            )
            wrong_count = sum(1 for a in all_answers if not a.is_correct)
            class_wrong_rate = (
                (wrong_count / len(all_answers) * 100) if all_answers else 0.0
            )

            # 내 답안
            my_answer_info = my_answers.get(quiz.id)
            my_selected = my_answer_info["selected"] if my_answer_info else None
            is_correct = my_answer_info["is_correct"] if my_answer_info else None

            # options 파싱
            options = []
            if quiz.options:
                try:
                    options = json.loads(quiz.options)
                except:
                    options = []

            set_quizzes.append(
                schemas.StudentQuiz(
                    quiz_id=quiz.id,
                    question=quiz.question,
                    options=options,
                    answer=quiz.answer,
                    my_answer=my_selected,
                    is_correct=is_correct,
                    explanation=quiz.explanation,
                    memo=memo_map.get(quiz.id),
                    class_wrong_rate=class_wrong_rate,
                )
            )

        sets_data.append(
            schemas.StudentSet(
                set_id=quiz_set.id,
                set_number=quiz_set.set_number,
                page_start=quiz_set.page_start,
                page_end=quiz_set.page_end,
                quiz_count=set_quiz_count,
                my_correct_count=my_set_correct_count,
                my_correct_rate=my_set_correct_rate,
                quizzes=set_quizzes,
            )
        )

    # 5. 전체 통계 계산
    my_total_correct_rate = (
        (total_correct_count / total_quiz_count * 100)
        if total_quiz_count > 0
        else 0.0
    )

    return schemas.StudentReviewResponse(
        lecture_id=lecture_id,
        week=0,  # TODO: 강의 주차 정보 계산 또는 모델에서 가져오기
        date=format_date(lecture.date),
        my_stats=schemas.StudentStats(
            total_quiz_count=total_quiz_count,
            my_correct_count=total_correct_count,
            my_correct_rate=my_total_correct_rate,
        ),
        sets=sets_data,
    )
