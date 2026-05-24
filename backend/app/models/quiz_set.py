from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db.session import Base


class QuizSet(Base):
    __tablename__ = "sets"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(
        Integer,
        ForeignKey("lectures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    generation_job_id = Column(
        Integer,
        ForeignKey("quiz_generation_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    set_number = Column(Integer, nullable=False)
    page_start = Column(Integer, nullable=False)
    page_end = Column(Integer, nullable=False)
    status = Column(String, default="DRAFT", nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
