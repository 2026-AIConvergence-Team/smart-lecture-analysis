from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.db.session import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)

    lecture_id = Column(
        Integer,
        ForeignKey("lectures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    concept_id = Column(
        Integer,
        ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # 어떤 퀴즈 생성 작업에서 만들어진 퀴즈인지 연결합니다.
    # 이 컬럼이 있어야 generate/status에서 "최신 작업 결과만" 정확히 조회할 수 있습니다.
    set_id = Column(
        Integer,
        ForeignKey("sets.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    generation_job_id = Column(
        Integer,
        ForeignKey("quiz_generation_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # BLANK | DEFINITION | KEYWORD_CHOICE | OX
    quiz_type = Column(String, nullable=False)

    question = Column(Text, nullable=False)

    options = Column(Text, nullable=False)

    answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    source_sentence = Column(Text, nullable=True)

    page_num = Column(Integer, nullable=False, index=True)

    # ACTIVE | DELETED
    status = Column(String, default="ACTIVE", nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
