# Smart Lecture Analysis Frontend

스마트 강의 분석 시스템의 실험용 프론트엔드 프로토타입입니다.

React + Vite로 구성되어 있으며, 현재 백엔드의 인증 API와 연결할 수 있도록 로그인, 회원가입, 로그아웃, 사용자 정보 조회 구조를 포함합니다. 퀴즈, 피드백, 교수 대시보드, 수업 리포트 화면은 mock data를 사용합니다.

## 사용 기술

- React
- Vite
- React Router
- Fetch API
- CSS

## 실행 방법

프로젝트 루트에서 `frontend` 폴더로 이동합니다.

```bash
cd frontend
```

패키지를 설치합니다.

```bash
npm install
```

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 Vite가 안내하는 주소로 접속합니다.

```text
http://localhost:5173
```

## 주요 화면

- `/login`: 로그인
- `/signup`: 회원가입
- `/student/home`: 학생 홈
- `/student/materials`: 교수자가 올린 PDF/개념 확인
- `/student/quiz`: 학생 퀴즈 화면
- `/student/questions`: 익명 질문 작성
- `/student/result`: 내 퀴즈 결과 확인
- `/teacher/home`: 교수자 홈
- `/teacher/upload`: PDF 업로드
- `/teacher/concepts`: 추출 개념 확인
- `/teacher/quizzes`: 자동 생성 퀴즈 확인 및 배포
- `/teacher/dashboard`: 실시간 오답률 대시보드
- `/teacher/questions`: 익명 질문 확인
- `/teacher/report`: 수업 리포트 확인

## 백엔드 연결

현재 프론트엔드는 아래 FastAPI 주소를 사용합니다.

```text
http://127.0.0.1:8000
```

사용하는 API:

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /users/me`

로그인 성공 시 `access_token`을 `localStorage`에 저장합니다.

로그아웃 시 localStorage의 access_token을 제거합니다.

`/users/me` 요청에는 아래 헤더를 사용합니다.

```text
Authorization: Bearer JWT_TOKEN_VALUE
```

## CORS 안내

프론트엔드 개발 서버는 보통 `http://localhost:5173`에서 실행되고, 백엔드는 `http://127.0.0.1:8000`에서 실행됩니다.

브라우저에서 CORS 오류가 발생하면 백엔드에 CORS 설정이 필요합니다. 이번 프로토타입에서는 요청 조건에 따라 백엔드 코드는 수정하지 않았습니다.
