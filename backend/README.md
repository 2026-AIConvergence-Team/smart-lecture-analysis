# Smart Lecture Analysis Backend

교수자가 강의 PDF를 업로드하면 개념 분석, 자동 퀴즈 생성, 학생 응답 수집, 교수 대시보드와 리포트 제공까지 이어지는 **스마트 강의 분석 시스템**의 백엔드 프로젝트입니다.

현재 버전은 팀 프로젝트의 공통 기반이 되는 **회원가입, 로그인, JWT 인증, 내 정보 조회** 기능을 제공합니다.

## 사용 기술

| 기술 | 설명 |
| --- | --- |
| FastAPI | Python 기반 웹 API 프레임워크 |
| SQLite | 가볍게 사용할 수 있는 파일 기반 데이터베이스 |
| SQLAlchemy | Python ORM, 데이터베이스 모델 관리 |
| bcrypt | 비밀번호 해시 처리 |
| JWT | 로그인 사용자 인증 토큰 |
| Swagger UI | API 문서 확인 및 테스트 |

## 폴더 구조

```text
backend/
├── main.py              # FastAPI 앱 시작 파일, 라우터 등록
├── database.py          # SQLite 연결, DB 세션 설정
├── models.py            # SQLAlchemy User 모델
├── schemas.py           # 요청/응답 Pydantic 스키마
├── auth.py              # 비밀번호 해시, JWT 생성/검증
├── users.py             # 사용자 관련 API
├── requirements.txt     # 필요한 Python 패키지 목록
└── README.md            # 프로젝트 설명 문서
```

## 실행 방법

아래 명령어는 `backend` 폴더에서 실행합니다.

```bash
cd backend
```

### 1. 가상환경 생성

```bash
python -m venv venv
```

### 2. 가상환경 실행

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Windows CMD:

```cmd
venv\Scripts\activate.bat
```

macOS 또는 Linux:

```bash
source venv/bin/activate
```

### 3. 패키지 설치

```bash
pip install -r requirements.txt
```

### 4. 서버 실행

```bash
uvicorn main:app --reload
```

실행에 성공하면 터미널에 아래와 비슷한 메시지가 표시됩니다.

```text
Uvicorn running on http://127.0.0.1:8000
```

## Swagger 주소

브라우저에서 아래 주소로 접속하면 API를 직접 테스트할 수 있습니다.

```text
http://127.0.0.1:8000/docs
```

## 구현된 API 목록

| Method | URL | 인증 필요 | 설명 |
| --- | --- | --- | --- |
| GET | `/health` | 아니오 | 서버 상태 확인 |
| POST | `/auth/signup` | 아니오 | 회원가입 |
| POST | /auth/login | 아니오 | 로그인 및 JWT 토큰 발급 |
| POST | /auth/logout | 예 | 로그아웃 |
| GET | /users/me | 예 | 현재 로그인 사용자 정보 조회 |

## Swagger 테스트 순서

### 1. 회원가입

`POST /auth/signup`을 실행합니다.

요청 예시:

```json
{
  "email": "teacher@example.com",
  "name": "Kim Teacher",
  "role": "teacher",
  "password": "password123"
}
```

`role`은 아래 두 값 중 하나만 사용할 수 있습니다.

```text
teacher
student
```

### 2. 로그인

`POST /auth/login`을 실행합니다.

요청 예시:

```json
{
  "email": "teacher@example.com",
  "password": "password123"
}
```

응답 예시:

```json
{
  "access_token": "JWT_TOKEN_VALUE",
  "token_type": "bearer"
}
```

### 3. JWT 토큰 등록

Swagger 화면 오른쪽 위의 `Authorize` 버튼을 누릅니다.

입력창에 로그인 응답으로 받은 토큰 값을 넣습니다.

```text
JWT_TOKEN_VALUE
```

프론트엔드나 curl에서 직접 요청할 때는 아래 헤더 형식으로 보냅니다.

```text
Authorization: Bearer JWT_TOKEN_VALUE
```

### 4. 내 정보 조회

`GET /users/me`를 실행하면 현재 로그인한 사용자의 정보를 확인할 수 있습니다.

응답 예시:

```json
{
  "id": 1,
  "email": "teacher@example.com",
  "name": "Kim Teacher",
  "role": "teacher"
}
```

### 5. 로그아웃

POST /auth/logout 을 실행합니다.

## 데이터베이스

이 프로젝트는 SQLite를 사용합니다.

서버를 처음 실행하면 `backend/app.db` 파일이 자동으로 생성됩니다. 별도의 데이터베이스 서버를 설치하지 않아도 되기 때문에 초보자가 실습하기 좋습니다.

## 참고 사항

현재 `SECRET_KEY`는 학습용으로 `auth.py` 파일에 직접 작성되어 있습니다. 실제 서비스에서는 `.env` 같은 환경 변수 파일로 분리하는 것이 좋습니다.

비밀번호는 원문으로 저장하지 않고 bcrypt로 해시한 값만 데이터베이스에 저장합니다.
