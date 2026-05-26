from sqlalchemy.orm import Session

import app.models as models


def get_course_by_id(db: Session, course_id: int):
    return db.query(models.Course).filter(models.Course.id == course_id).first()


def get_courses(db: Session):
    return db.query(models.Course).order_by(models.Course.year.desc(), models.Course.id.desc()).all()


def get_courses_by_user(db: Session, user_id: int):
    return (
        db.query(models.Course)
        .filter(models.Course.user_id == user_id)
        .order_by(models.Course.year.desc(), models.Course.id.desc())
        .all()
    )


def get_courses_joined_by_student(db: Session, user_id: int):
    return (
        db.query(models.Course)
        .join(models.Lecture, models.Lecture.course_id == models.Course.id)
        .join(
            models.LectureParticipant,
            models.LectureParticipant.lecture_id == models.Lecture.id,
        )
        .filter(models.LectureParticipant.user_id == user_id)
        .distinct()
        .order_by(models.Course.year.desc(), models.Course.id.desc())
        .all()
    )


def student_has_joined_course(db: Session, course_id: int, user_id: int) -> bool:
    return (
        db.query(models.LectureParticipant.id)
        .join(models.Lecture, models.Lecture.id == models.LectureParticipant.lecture_id)
        .filter(
            models.Lecture.course_id == course_id,
            models.LectureParticipant.user_id == user_id,
        )
        .first()
        is not None
    )


def create_course(db: Session, course: models.Course):
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def save_course(db: Session, course: models.Course):
    db.commit()
    db.refresh(course)
    return course


def delete_course(db: Session, course: models.Course):
    db.delete(course)
    db.commit()


def rollback(db: Session):
    db.rollback()
