from sqlalchemy import Column, Integer, String, Date, Time, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)


# ---- 🚀 승연님 파트 1: 강의 분석 엔진 테이블 추가 ----

class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    class_code = Column(String, nullable=True)  # 초기값 null
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 파트 1 비동기 파이프라인 상태 관리용 컬럼
    extract_status = Column(String, default="pending", nullable=False)  # pending | extracting | completed | failed
    analyze_status = Column(String, default="pending", nullable=False)  # pending | analyzing | completed | failed
    total_pages = Column(Integer, default=0, nullable=False)
    file_name = Column(String, nullable=True)
    pdf_url = Column(String, nullable=True)


class PageContent(Base):
    __tablename__ = "page_contents"

    id = Column(Integer, primary_key=True, index=True)
    # 데이터베이스 레벨에서 강의가 삭제되면 연관된 텍스트 데이터도 함께 지워지도록 CASCADE 설정을 적용했습니다.
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    page_num = Column(Integer, nullable=False)  # 1부터 시작하는 페이지 번호
    text_content = Column(Text, nullable=False)


class Concept(Base):
    __tablename__ = "concepts"

    id = Column(Integer, primary_key=True, index=True)
    # 마찬가지로 강의가 삭제되면 추출된 개념 데이터도 자동 삭제되도록 설정했습니다.
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    concept_name = Column(String, nullable=False)  # 추출된 핵심 용어 (예: 스택)
    page_num = Column(Integer, nullable=False)
    keywords = Column(Text, nullable=False)  # 콤마(,) 혹은 JSON 문자열 구조로 유연하게 저장
    sentences = Column(Text, nullable=False)  # 퀴즈 생성을 위한 본문 핵심 문장 데이터 (JSON/텍스트)