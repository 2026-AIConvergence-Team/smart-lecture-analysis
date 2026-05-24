from sqlalchemy import Column, Integer, Text, Boolean, ForeignKey

from app.db.session import Base


class SubmissionAnswer(Base):
    __tablename__ = "submission_answers"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    quiz_id = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    selected = Column(Text, nullable=False)
    is_correct = Column(Boolean, nullable=False)
