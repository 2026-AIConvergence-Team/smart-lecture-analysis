# Smart Lecture Analysis

교수자가 강의 PDF를 업로드하면 핵심 개념을 분석하고, 자동 퀴즈와 수업 리포트를 제공하는 스마트 강의 분석 서비스 프로토타입입니다.  
현재는 **React 프론트엔드**와 **FastAPI 인증 백엔드**를 기반으로 학생/교수 역할별 화면을 분리해 구현했습니다.

## 주요 기능

### 학생 기능

- 로그인 / 회원가입
- 교수자가 업로드한 PDF 자료와 추출 개념 확인
- 퀴즈 풀이 화면
- 익명 질문 작성
- 내 퀴즈 결과 확인

### 교수 기능

- PDF 업로드 화면
- 추출 개념 확인
- 자동 생성 퀴즈 확인 및 배포 화면
- 실시간 오답률 대시보드
- 익명 질문 확인
- mock 데이터 기반 수업 리포트 확인

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React, Vite, React Router |
| Backend | FastAPI, SQLAlchemy |
| Database | SQLite |
| Auth | JWT, bcrypt |
| API Docs | Swagger UI |

## 프로젝트 구조

```text
smart-lecture-analysis/
├── frontend/   # React + Vite 프론트엔드
├── backend/    # FastAPI 백엔드
└── README.md
```

## 실행 방법

### Backend 실행

```bash
cd backend
python -m venv venv
```

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

패키지 설치 및 서버 실행:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

## 접속 주소

| 구분 | 주소 |
| --- | --- |
| Frontend | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8000 |
| Swagger Docs | http://127.0.0.1:8000/docs |

## 현재 구현 상태

| 항목 | 상태 |
| --- | --- |
| JWT 로그인 / 회원가입 | 구현 완료 |
| 역할 기반 화면 분리 | 구현 완료 |
| 학생 퀴즈 UI | 구현 완료 |
| 교수 대시보드 UI | 구현 완료 |
| 수업 리포트 UI | mock 데이터 기반 구현 |
| PDF 분석 | 추후 구현 예정 |
| 자동 퀴즈 생성 API | 추후 구현 예정 |
| 실시간 응답 수집 | 추후 구현 예정 |

## 참고

- 백엔드 상세 설명: [backend/README.md](backend/README.md)
- 프론트엔드 상세 설명: [frontend/README.md](frontend/README.md)
