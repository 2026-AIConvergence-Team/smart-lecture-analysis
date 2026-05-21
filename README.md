# Smart Lecture Analysis

스마트 강의 분석 시스템은 교수자가 업로드한 강의 PDF를 분석해 자동 퀴즈와 수업 리포트를 제공하는 서비스 프로토타입입니다.  
PDF 분석 → 자동 퀴즈 생성 → 학생 응답 수집 → 실시간 오답 분석 → 수업 리포트 생성 흐름을 목표로 합니다.

## 핵심 기능

### 학생 기능

- 실시간 퀴즈 응답
- 강의 피드백 확인
- 익명 질문 작성
- 로그아웃

### 교수 기능

- PDF 업로드
- 자동 퀴즈 생성
- 실시간 오답률 분석
- 수업 리포트 확인
- 로그아웃

## 시스템 흐름

```text
PDF 업로드
→ 키워드 추출
→ 퀴즈 생성
→ 학생 응답 수집
→ 실시간 오답 분석
→ 리포트 생성
```

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React + Vite |
| Backend | FastAPI |
| Database | SQLite |
| Auth | JWT |
| PDF Parsing | PyMuPDF |
| Keyword Extraction | TF-IDF |
| Realtime | WebSocket |

## 실행 방법

### Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 접속 주소

| 구분 | 주소 |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000 |
| Swagger Docs | http://127.0.0.1:8000/docs |

## 현재 구현 상태

- 역할 기반 학생/교수 화면 분리
- 로그인 / 회원가입 / 로그아웃
- JWT 기반 인증
- 학생 퀴즈 프로토타입 UI
- 교수 대시보드 UI
- 수업 리포트 UI
