from sqlalchemy import Column, ForeignKey, Integer, String, Text

from app.db.session import Base


class Concept(Base):
    __tablename__ = "concepts"

    id = Column(Integer, primary_key=True, index=True)
    # 마찬가지로 강의가 삭제되면 추출된 개념 데이터도 자동 삭제되도록 설정했습니다.
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    concept_name = Column(String, nullable=False)  # 추출된 핵심 용어 (예: 스택)
    page_num = Column(Integer, nullable=False)
    keywords = Column(Text, nullable=False)  # 콤마(,) 혹은 JSON 문자열 구조로 유연하게 저장
    sentences = Column(Text, nullable=False)  # 퀴즈 생성을 위한 본문 핵심 문장 데이터 (JSON/텍스트)