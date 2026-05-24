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
