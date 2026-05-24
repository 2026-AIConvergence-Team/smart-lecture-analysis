from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.repositories import course_repository, lecture_repository
import app.models as models
import app.schemas as schemas


router = APIRouter(prefix="/api/courses", tags=["Courses"])


def require_teacher(current_user: models.User) -> None:
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can manage courses.",
        )


def get_visible_course_or_404(
    db: Session,
    course_id: int,
    current_user: models.User,
    *,
    owner_required: bool = False,
) -> models.Course:
    course = course_repository.get_course_by_id(db, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found.",
        )

    if owner_required:
        require_teacher(current_user)

    if current_user.role == "teacher" and course.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found.",
        )

    return course


@router.post(
    "",
    response_model=schemas.CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create course",
)
def create_course(
    request_data: schemas.CourseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_teacher(current_user)

    course = models.Course(
        user_id=current_user.id,
        title=request_data.title.strip(),
        department=request_data.department.strip(),
        year=request_data.year,
        semester=request_data.semester.strip(),
        schedule=request_data.schedule.strip(),
        student_count=request_data.student_count,
        section=request_data.section.strip(),
    )

    try:
        return course_repository.create_course(db, course)
    except Exception as exc:
        course_repository.rollback(db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create course: {exc}",
        ) from exc


@router.get(
    "",
    response_model=List[schemas.CourseResponse],
    status_code=status.HTTP_200_OK,
    summary="List courses",
)
def list_courses(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role == "teacher":
        return course_repository.get_courses_by_user(db, current_user.id)
    return course_repository.get_courses(db)


@router.get(
    "/{course_id}",
    response_model=schemas.CourseWithLecturesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get course with lectures",
)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return get_visible_course_or_404(db, course_id, current_user)


@router.patch(
    "/{course_id}",
    response_model=schemas.CourseResponse,
    status_code=status.HTTP_200_OK,
    summary="Update course",
)
def update_course(
    course_id: int,
    request_data: schemas.CourseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = get_visible_course_or_404(
        db,
        course_id,
        current_user,
        owner_required=True,
    )

    for field, value in request_data.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip()
        setattr(course, field, value)

    try:
        return course_repository.save_course(db, course)
    except Exception as exc:
        course_repository.rollback(db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update course: {exc}",
        ) from exc


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete course",
)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = get_visible_course_or_404(
        db,
        course_id,
        current_user,
        owner_required=True,
    )

    try:
        course_repository.delete_course(db, course)
    except Exception as exc:
        course_repository.rollback(db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete course: {exc}",
        ) from exc


@router.post(
    "/{course_id}/lectures",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create lecture in course",
)
def create_course_lecture(
    course_id: int,
    request_data: schemas.CourseLectureCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = get_visible_course_or_404(
        db,
        course_id,
        current_user,
        owner_required=True,
    )

    lecture = models.Lecture(
        course_id=course.id,
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
        return lecture_repository.create_lecture(db, lecture)
    except Exception as exc:
        lecture_repository.rollback(db)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create lecture: {exc}",
        ) from exc


@router.get(
    "/{course_id}/lectures",
    response_model=List[schemas.LectureResponse],
    status_code=status.HTTP_200_OK,
    summary="List lectures in course",
)
def list_course_lectures(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = get_visible_course_or_404(db, course_id, current_user)
    return lecture_repository.get_lectures_by_course(db, course.id)
