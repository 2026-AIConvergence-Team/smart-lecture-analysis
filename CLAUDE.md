# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Smart Lecture Analysis는 교수자가 업로드한 강의 PDF를 분석해 자동 퀴즈와 수업 리포트를 제공하는 서비스 프로토타입입니다.

**시스템 흐름:**
```
PDF 업로드 → 키워드 추출 → 퀴즈 생성 → 학생 응답 수집 → 실시간 오답 분석 → 리포트 생성
```

## 개발 환경 설정

### 백엔드 (FastAPI + SQLite)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

- API 주소: http://127.0.0.1:8000
- Swagger 문서: http://127.0.0.1:8000/docs
- 데이터베이스: `backend/app.db` (자동 생성)

### 프론트엔드 (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

- 개발 서버: http://localhost:5173
- 빌드: `npm run build`
- 미리보기: `npm run preview`

**CORS 주의:** 프론트엔드(5173)와 백엔드(8000)가 다른 포트에서 실행되므로, 백엔드의 CORS 설정을 확인하세요. `main.py`에서 `allow_origins`를 필요한 URL로 설정하세요.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 18 + Vite + React Router |
| Backend | FastAPI + SQLAlchemy ORM |
| Database | SQLite |
| Auth | JWT (python-jose) |
| Password Hashing | bcrypt |
| PDF Parsing | PyMuPDF (fitz) |
| Keyword Extraction | TF-IDF |
| Real-time | WebSocket (향후 계획) |

## 프로젝트 아키텍처

### 백엔드 구조

```
backend/
├── main.py           # FastAPI 앱, 라우터 등록, CORS 설정
├── database.py       # SQLite 연결, DB 세션 설정
├── models.py         # SQLAlchemy ORM 모델 (User, Lecture, PageContent, Concept)
├── schemas.py        # Pydantic 요청/응답 스키마
├── auth.py           # 인증 로직 (암호화, JWT 생성/검증)
├── users.py          # 사용자 관련 API 엔드포인트
├── lectures.py       # 강의 분석 엔진 (파트 1: PDF 업로드, 분석)
├── requirements.txt  # Python 의존성
└── app.db            # SQLite 데이터베이스 (자동 생성)
```

**주요 모델:**
- `User`: 사용자 (role: "teacher" | "student")
- `Lecture`: 강의 정보 (파일, 상태, 날짜, 시간)
- `PageContent`: 추출된 PDF 페이지별 텍스트
- `Concept`: 자동 추출된 핵심 개념 (개념명, 키워드, 문장)

### 프론트엔드 구조

```
frontend/src/
├── App.jsx                    # 라우팅 설정
├── main.jsx                   # 진입점
├── api/
│   └── authApi.js             # 인증 API (signup, login, logout, getMe)
├── components/
│   ├── AuthCard.jsx           # 인증 UI 공통 컴포넌트
│   ├── StatCard.jsx           # 대시보드 카드 컴포넌트
│   └── RoleLayout.jsx         # 역할별 레이아웃
├── pages/
│   ├── LoginPage.jsx          # 로그인
│   ├── SignupPage.jsx         # 회원가입
│   ├── QuizSyncApp.jsx        # 프로토타입 앱
│   ├── student/               # 학생 페이지들
│   └── teacher/               # 교수 페이지들
├── data/
│   ├── mockData.js            # Mock 데이터
│   └── quizSyncMock.js        # 프로토타입 mock 데이터
└── styles/
    ├── main.css               # 공통 스타일
    └── quizsync.css           # 프로토타입 스타일
```

**라우팅:**
- `/login` - 로그인
- `/signup` - 회원가입
- `/app` - 프로토타입 앱 (학생/교수 역할 선택)
- `/student/*` - 학생 페이지들
- `/teacher/*` - 교수 페이지들

## 개발 워크플로우

### 1. 백엔드 개발

**API 추가 단계:**
1. `schemas.py`에서 요청/응답 Pydantic 모델 정의
2. `models.py`에서 필요시 SQLAlchemy ORM 모델 추가
3. `main.py` 또는 라우터 파일(예: `users.py`, `lectures.py`)에 엔드포인트 구현
4. Swagger UI(`http://127.0.0.1:8000/docs`)에서 직접 테스트

**주요 인증:**
- JWT 토큰은 `auth.py`의 `create_access_token()` 함수로 생성
- 인증이 필요한 엔드포인트는 `get_current_user` 의존성 추가: `current_user: User = Depends(get_current_user)`
- 비밀번호는 bcrypt로 해시하여 저장

### 2. 프론트엔드 개발

**API 호출:**
- `authApi.js`의 `request()` 함수를 통해 API 호출
- 토큰은 `localStorage`에 `access_token` 키로 저장
- 인증이 필요한 요청은 헤더에 `Authorization: Bearer {token}` 추가

**상태 관리:**
- 현재는 localStorage 기반 간단한 상태 관리
- 로그인 성공 시 토큰 저장, 로그아웃 시 토큰 제거

**개발 서버:**
- HMR(Hot Module Replacement) 지원으로 파일 변경 시 자동 새로고침
- React DevTools 브라우저 확장 권장

## 주요 API 엔드포인트

### 인증 API

| Method | URL | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/auth/signup` | ❌ | 회원가입 |
| POST | `/auth/login` | ❌ | 로그인, JWT 토큰 발급 |
| POST | `/auth/logout` | ✅ | 로그아웃 |
| GET | `/users/me` | ✅ | 현재 사용자 정보 조회 |

### 강의 분석 API (진행 중)

| Method | URL | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/lectures/upload` | ✅ | PDF 업로드 및 분석 시작 |
| GET | `/lectures/{lecture_id}` | ✅ | 강의 상세 정보 조회 |
| GET | `/lectures` | ✅ | 강의 목록 조회 |
| GET | `/lectures/{lecture_id}/concepts` | ✅ | 추출된 개념 조회 |

## 개발 팀 역할

현재 프로젝트는 여러 팀 멤버가 다양한 파트를 맡고 있습니다:

- **다영님**: 백엔드 기초 (auth, users 라우터)
- **승연님**: 파트 1 - 강의 분석 엔진 (PDF 업로드, 키워드 추출, 개념 분석)
- 추후 추가: 파트 2 (퀴즈 생성), 파트 3 (오답 분석), 파트 4 (리포트)

## 주의사항

### 보안

- `SECRET_KEY`는 현재 `auth.py`에 하드코딩됨 → 실제 서비스에선 `.env` 환경변수로 분리
- CORS `allow_origins`를 명확히 설정 (현재: `["http://localhost:5173"]`)
- 비밀번호는 항상 bcrypt로 해시하여 저장 (평문 저장 금지)

### 데이터베이스

- SQLite는 프로토타입/학습용으로 적합하나, 프로덕션에선 PostgreSQL 등으로 마이그레이션 필요
- 테이블 스키마 변경 시 `models.py` 수정 후 서버 재시작 (자동으로 마이그레이션되지 않음)
- 강의 삭제 시 연관 PageContent, Concept은 `CASCADE`로 자동 삭제됨

### 파일 업로드

- PDF 파일은 `backend/uploads/` 폴더에 저장
- 파일 크기 제한은 FastAPI 기본값 사용 (필요시 조정)

## 자주 사용하는 명령

```bash
# 백엔드
cd backend
.\venv\Scripts\Activate.ps1                    # 가상환경 활성화
pip install -r requirements.txt                # 의존성 설치
python -m uvicorn main:app --reload           # 개발 서버 시작
python -m pytest tests/                        # 테스트 실행 (향후)

# 프론트엔드
cd frontend
npm install                                    # 의존성 설치
npm run dev                                    # 개발 서버 시작
npm run build                                  # 프로덕션 빌드
npm run preview                                # 빌드된 앱 미리보기
```

## 참고 문서

- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/en/20/orm/)
- [React 공식 문서](https://react.dev/)
- [Vite 공식 문서](https://vite.dev/)
