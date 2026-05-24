from sqlalchemy.orm import Session

import app.models as models


def get_running_job_for_lecture(db: Session, lecture_id: int):
    return db.query(models.QuizGenerationJob).filter(
        models.QuizGenerationJob.lecture_id == lecture_id,
        models.QuizGenerationJob.status == "generating",
    ).first()


def get_job_by_id(db: Session, job_id: int):
    return db.query(models.QuizGenerationJob).filter(
        models.QuizGenerationJob.id == job_id,
    ).first()


def get_latest_job_for_lecture(db: Session, lecture_id: int):
    return db.query(models.QuizGenerationJob).filter(
        models.QuizGenerationJob.lecture_id == lecture_id,
    ).order_by(
        models.QuizGenerationJob.created_at.desc(),
        models.QuizGenerationJob.id.desc(),
    ).first()


def create_job(db: Session, job: models.QuizGenerationJob):
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def save_job(db: Session, job: models.QuizGenerationJob):
    db.commit()
    return job
