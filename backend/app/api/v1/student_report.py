from fastapi import APIRouter, status, Depends, Query
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


@router.get(
    "/{lecture_id}/report/student",
    response_model=schemas.StudentReviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Get student review report",
)
def get_student_report(
    lecture_id: int,
    filter: str = Query("all", regex="^(all|wrong|hot)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 인증 확인 (student만 가능)
    if current_user.role != "student":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only students can access student review report.",
        )

    # 강의 존재 확인
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Lecture not found.",
        )

    # 강의 상태 확인 (ENDED일 때만 리포트 조회 가능)
    if lecture.status != "ENDED":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Report is only available after the lecture ends.",
        )

    # 1. 세트 목록 조회
    quiz_sets = quiz_set_repository.get_quiz_sets_by_lecture(db, lecture_id)
    if not quiz_sets:
        return schemas.StudentReviewResponse(
            lecture_id=lecture_id,
            my_scores=[],
            quiz_reviews=[],
        )

    # 2. 내 메모 조회 (모두 한 번에 로드)
    my_memos = memo_repository.get_memos_by_student_and_lecture(
        db, current_user.id, lecture_id
    )
    memo_map = {m.quiz_id: m.content for m in my_memos}

    # 3. 세트별 결과 계산
    my_scores = []
    quiz_reviews = []

    for quiz_set in quiz_sets:
        # 세트별 퀴즈 조회
        quizzes = quiz_repository.get_lecture_quizzes(
            db=db,
            lecture_id=lecture_id,
            quiz_status="READY",
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
        my_correct_count = 0
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
                    my_correct_count += 1

        # 세트별 내 성적
        total_quiz_count = len(quizzes)
        my_correct_rate = (
            (my_correct_count / total_quiz_count * 100)
            if total_quiz_count > 0
            else 0.0
        )

        # 세트별 전체 평균 정답률 계산
        set_correct_total = 0
        set_answer_total = 0
        for quiz in quizzes:
            all_answers = submission_answer_repository.get_answers_by_quiz(
                db, quiz.id
            )
            correct_count = sum(1 for a in all_answers if a.is_correct)
            set_correct_total += correct_count
            set_answer_total += len(all_answers)

        class_avg_rate = (
            (set_correct_total / set_answer_total * 100)
            if set_answer_total > 0
            else 0.0
        )

        my_scores.append(
            schemas.MySetScore(
                set_id=quiz_set.id,
                set_number=quiz_set.set_number,
                correct_count=my_correct_count,
                total_count=total_quiz_count,
                correct_rate=my_correct_rate,
                class_avg_rate=class_avg_rate,
            )
        )

        # 4. 퀴즈별 복습 정보
        set_quizzes = []
        for quiz in quizzes:
            # 모든 답안 조회 (오답률 계산)
            all_answers = submission_answer_repository.get_answers_by_quiz(
                db, quiz.id
            )
            wrong_count = sum(1 for a in all_answers if not a.is_correct)
            wrong_rate = (
                (wrong_count / len(all_answers) * 100)
                if all_answers
                else 0.0
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

            quiz_review = schemas.QuizReview(
                quiz_id=quiz.id,
                question=quiz.question,
                options=options,
                answer=quiz.answer,
                explanation=quiz.explanation,
                my_answer=my_selected,
                is_correct=is_correct,
                wrong_rate=wrong_rate,
                memo=memo_map.get(quiz.id),
            )

            # 필터 적용
            if filter == "wrong" and is_correct is not False:
                continue
            if filter == "hot":
                # hot 필터는 정렬 시점에 처리
                pass

            set_quizzes.append(quiz_review)

        # hot 필터: 오답률 높은 순 정렬
        if filter == "hot":
            set_quizzes.sort(key=lambda q: q.wrong_rate, reverse=True)

        quiz_reviews.append(
            schemas.SetReview(
                set_id=quiz_set.id,
                set_number=quiz_set.set_number,
                quizzes=set_quizzes,
            )
        )

    return schemas.StudentReviewResponse(
        lecture_id=lecture_id,
        my_scores=my_scores,
        quiz_reviews=quiz_reviews,
    )
