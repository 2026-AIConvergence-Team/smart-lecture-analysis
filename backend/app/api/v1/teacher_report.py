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


def format_date(date_obj):
    """날짜를 'YYYY.MM.DD' 형식으로 포맷"""
    if not date_obj:
        return ""
    return date_obj.strftime("%Y.%m.%d")


@router.get(
    "/{lecture_id}/report",
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
            "Only teachers can access this report.",
        )

    # 강의 존재 확인
    lecture = lecture_repository.get_lecture_by_id(db, lecture_id)
    if not lecture:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "LECTURE_NOT_FOUND",
        )

    # 강의 권한 확인 (자신의 강의만 조회 가능)
    if lecture.course_id:
        from app.repositories import course_repository

        course = course_repository.get_course_by_id(db, lecture.course_id)
        if not course or course.user_id != current_user.id:
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
        return schemas.TeacherReportResponse(
            lecture_id=lecture_id,
            week=0,  # TODO: 강의 주차 정보 계산 또는 모델에서 가져오기
            date=format_date(lecture.date),
            stats=schemas.TeacherReportStats(
                participant_count=0,
                set_count=0,
                quiz_count=0,
                avg_correct_rate=0.0,
                anonymous_question_count=0,
            ),
            concept_stats=[],
            sets=[],
            anonymous_questions=[],
        )

    # 2. 집계 계산
    all_submissions = []
    concept_correct_counts = {}  # concept_id -> (correct_count, total_count)
    total_quiz_count = 0
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

            correct_rate = 0.0
            top_wrong_answer = None
            top_wrong_rate = 0.0

            if all_answers:
                correct_count = sum(1 for a in all_answers if a.is_correct)
                total_count = len(all_answers)
                correct_rate = (
                    (correct_count / total_count * 100) if total_count > 0 else 0.0
                )

                # concept 정답률 집계
                if quiz.concept_id:
                    concept_correct_counts[quiz.concept_id][0] += correct_count
                    concept_correct_counts[quiz.concept_id][1] += total_count

                set_correct_total += correct_count
                set_answer_total += total_count

                # top_wrong_answer와 top_wrong_rate 계산
                wrong_answers = [a.selected for a in all_answers if not a.is_correct]
                if wrong_answers:
                    top_wrong_answer = Counter(wrong_answers).most_common(1)[0][0]
                    top_wrong_count = Counter(wrong_answers).most_common(1)[0][1]
                    top_wrong_rate = (
                        (top_wrong_count / total_count * 100)
                        if total_count > 0
                        else 0.0
                    )

            quiz_results.append(
                schemas.TeacherQuiz(
                    quiz_id=quiz.id,
                    question=quiz.question,
                    correct_rate=correct_rate,
                    top_wrong_answer=top_wrong_answer,
                    top_wrong_rate=top_wrong_rate,
                )
            )

        # 세트별 평균 정답률
        set_avg_correct_rate = (
            (set_correct_total / set_answer_total * 100)
            if set_answer_total > 0
            else 0.0
        )

        total_quiz_count += len(quiz_results)

        sets_data.append(
            schemas.TeacherSet(
                set_id=quiz_set.id,
                set_number=quiz_set.set_number,
                page_start=quiz_set.page_start,
                page_end=quiz_set.page_end,
                quiz_count=len(quiz_results),
                avg_correct_rate=set_avg_correct_rate,
                quizzes=quiz_results,
            )
        )

    # 3. 개념별 이해도 계산 (퀴즈가 출제된 개념만 포함)
    concepts = concept_repository.get_concepts_by_lecture(db, lecture_id)
    concept_stats = []

    for concept in concepts:
        # 퀴즈가 출제된 개념만 처리
        if concept.id not in concept_correct_counts:
            continue

        correct_count, total_count = concept_correct_counts[concept.id]
        correct_rate = (
            (correct_count / total_count * 100) if total_count > 0 else 0.0
        )

        is_weak = correct_rate < 50

        # 키워드에서 앞 1~2개 추출 (없으면 개념명 사용)
        kw_list = [k.strip() for k in (concept.keywords or "").split(",") if k.strip()]
        display_name = ", ".join(kw_list[:2]) if kw_list else concept.concept_name

        concept_stats.append(
            schemas.ConceptStat(
                concept=display_name,
                avg_correct_rate=correct_rate,
                is_weak=is_weak,
            )
        )

    # is_weak 순서대로 정렬 (낮은 순)
    concept_stats.sort(key=lambda x: x.avg_correct_rate)

    # 4. 익명 질문 조회
    anon_questions = anonymous_question_repository.get_questions_by_lecture(
        db, lecture_id
    )
    anon_items = [
        schemas.AnonymousQuestion(
            question_id=q.id,
            content=q.content,
            created_at=q.created_at,
        )
        for q in anon_questions
    ]

    # 5. 참여 학생 수 계산 (중복 제거)
    student_ids = set(s.student_id for s in all_submissions)
    participant_count = len(student_ids)

    # 6. 전체 정답률 계산
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
        week=0,  # TODO: 강의 주차 정보 계산 또는 모델에서 가져오기
        date=format_date(lecture.date),
        stats=schemas.TeacherReportStats(
            participant_count=participant_count,
            set_count=len(quiz_sets),
            quiz_count=total_quiz_count,
            avg_correct_rate=avg_correct_rate,
            anonymous_question_count=len(anon_items),
        ),
        concept_stats=concept_stats,
        sets=sets_data,
        anonymous_questions=anon_items,
    )
