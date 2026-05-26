from fastapi import APIRouter, status, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from collections import Counter

from app.db.session import get_db
from app.core.deps import get_current_user
from app.repositories import (
    quiz_set_repository,
    quiz_repository,
    submission_repository,
    submission_answer_repository,
    concept_repository,
    anonymous_question_repository,
    lecture_repository,
)
import app.models as models
import app.schemas as schemas

router = APIRouter(prefix="/api/lectures", tags=["Reports"])


def error_response(status_code: int, message: str):
    return JSONResponse(status_code=status_code, content={"error": message})


@router.get(
    "/{lecture_id}/report/teacher",
    response_model=schemas.TeacherReportResponse,
    status_code=status.HTTP_200_OK,
    summary="Get teacher lecture report",
)
def get_teacher_report(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 인증 확인 (teacher만 가능)
    if current_user.role != "teacher":
        return error_response(
            status.HTTP_403_FORBIDDEN,
            "Only teachers can access teacher report.",
        )

    # 강의 존재 확인
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Lecture not found.",
        )

    # 강의 권한 확인 (자신의 강의만 조회 가능)
    if lecture.course_id:
        from app.repositories import course_repository

        course = course_repository.get_course_by_id(db, lecture.course_id)
        if not course or course.user_id != current_user.id:
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
        return schemas.TeacherReportResponse(
            lecture_id=lecture_id,
            summary={
                "student_count": 0,
                "set_count": 0,
                "total_quiz_count": 0,
                "avg_correct_rate": 0.0,
                "anon_q_count": 0,
            },
            concept_scores=[],
            set_results=[],
            anonymous_questions=[],
        )

    # 2. 집계 계산
    all_submissions = []  # 모든 submission 수집 (학생 수 계산용)
    concept_correct_counts = {}  # concept_id -> (correct_count, total_count)
    set_results = []

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

        # 세트별 제출 조회
        submissions = submission_repository.get_submissions_by_set(db, quiz_set.id)
        all_submissions.extend(submissions)

        # 퀴즈별 결과 계산
        quiz_results = []
        set_correct_total = 0
        set_answer_total = 0

        for quiz in quizzes:
            # concept별 정답률 집계
            if quiz.concept_id:
                if quiz.concept_id not in concept_correct_counts:
                    concept_correct_counts[quiz.concept_id] = [0, 0]

            # 퀴즈별 모든 답안 조회
            all_answers = submission_answer_repository.get_answers_by_quiz(
                db, quiz.id
            )

            if all_answers:
                correct_count = sum(1 for a in all_answers if a.is_correct)
                total_count = len(all_answers)
                correct_rate = (correct_count / total_count * 100) if total_count > 0 else 0

                # concept 정답률 집계
                if quiz.concept_id:
                    concept_correct_counts[quiz.concept_id][0] += correct_count
                    concept_correct_counts[quiz.concept_id][1] += total_count

                set_correct_total += correct_count
                set_answer_total += total_count

                # top_wrong_answer 계산 (가장 많이 선택된 오답)
                wrong_answers = [a.selected for a in all_answers if not a.is_correct]
                top_wrong_answer = None
                if wrong_answers:
                    top_wrong_answer = Counter(wrong_answers).most_common(1)[0][0]

                quiz_results.append(
                    schemas.QuizResult(
                        quiz_id=quiz.id,
                        question=quiz.question,
                        correct_rate=correct_rate,
                        top_wrong_answer=top_wrong_answer,
                    )
                )

        # 세트별 평균 정답률
        set_avg_correct_rate = (
            (set_correct_total / set_answer_total * 100)
            if set_answer_total > 0
            else 0.0
        )

        set_results.append(
            schemas.SetResult(
                set_id=quiz_set.id,
                set_number=quiz_set.set_number,
                page_start=quiz_set.page_start,
                page_end=quiz_set.page_end,
                avg_correct_rate=set_avg_correct_rate,
                quiz_results=quiz_results,
            )
        )

    # 3. 개념별 이해도 계산
    concepts = concept_repository.get_concepts_by_lecture(db, lecture_id)
    concept_scores = []

    for concept in concepts:
        if concept.id in concept_correct_counts:
            correct_count, total_count = concept_correct_counts[concept.id]
            correct_rate = (
                (correct_count / total_count * 100) if total_count > 0 else 0.0
            )
        else:
            correct_rate = 0.0

        is_weak = correct_rate < 60

        concept_scores.append(
            schemas.ConceptScore(
                concept_id=concept.id,
                concept_name=concept.concept_name,
                correct_rate=correct_rate,
                is_weak=is_weak,
            )
        )

    # 4. 익명 질문 조회
    anon_questions = anonymous_question_repository.get_questions_by_lecture(
        db, lecture_id
    )
    anon_items = [
        schemas.AnonymousQuestionItem(
            id=q.id,
            content=q.content,
            created_at=q.created_at,
        )
        for q in anon_questions
    ]

    # 5. 참여 학생 수 계산 (중복 제거)
    student_ids = set(s.student_id for s in all_submissions)
    student_count = len(student_ids)

    # 6. 전체 정답률 계산
    total_correct = sum(1 for s in all_submissions for a in submission_repository.get_submission_by_id(db, s.id).submission_answers if a.is_correct) if hasattr(all_submissions[0] if all_submissions else None, 'submission_answers') else 0

    # 더 효율적인 전체 정답률 계산
    total_correct = 0
    total_answers = 0
    for submission in all_submissions:
        answers = submission_answer_repository.get_answers_by_submission(
            db, submission.id
        )
        total_correct += sum(1 for a in answers if a.is_correct)
        total_answers += len(answers)

    avg_correct_rate = (
        (total_correct / total_answers * 100) if total_answers > 0 else 0.0
    )

    return schemas.TeacherReportResponse(
        lecture_id=lecture_id,
        summary={
            "student_count": student_count,
            "set_count": len(quiz_sets),
            "total_quiz_count": sum(len(sr.quiz_results) for sr in set_results),
            "avg_correct_rate": avg_correct_rate,
            "anon_q_count": len(anon_items),
        },
        concept_scores=concept_scores,
        set_results=set_results,
        anonymous_questions=anon_items,
    )
