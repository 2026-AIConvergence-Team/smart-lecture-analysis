from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db.session import Base


class QuizGenerationJob(Base):
    __tablename__ = "quiz_generation_jobs"

    id = Column(Integer, primary_key=True, index=True)

    lecture_id = Column(
        Integer,
        ForeignKey("lectures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(String, default="pending", nullable=False)
    progress = Column(Integer, default=0, nullable=False)

    page_start = Column(Integer, nullable=False)
    page_end = Column(Integer, nullable=False)

    quiz_type = Column(String, nullable=False)

    generated_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)

    message = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )