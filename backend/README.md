# Smart Lecture Analysis Backend

교수자와 학생이 사용하는 스마트 강의 분석 시스템의 공통 인증 백엔드입니다.

FastAPI, SQLAlchemy, SQLite, bcrypt, JWT를 사용해 회원가입, 로그인, 내 정보 조회 기능을 제공합니다.

## 기능

- `GET /health`: 서버 상태 확인
- `POST /auth/signup`: 회원가입
- `POST /auth/login`: 로그인 후 JWT 토큰 발급
- `GET /users/me`: 로그인한 사용자 정보 조회

## 파일 구조

```text
backend/
  main.py
  database.py
  models.py
  schemas.py
  auth.py
  users.py
  requirements.txt
  README.md
```

## 실행 방법

가상환경이 없다면 먼저 생성합니다.

```bash
python -m venv venv
```

Windows PowerShell 기준으로 가상환경을 실행합니다.

```bash
.\venv\Scripts\Activate.ps1
```

필요한 패키지를 설치합니다.

```bash
pip install -r requirements.txt
```

FastAPI 서버를 실행합니다.

```bash
uvicorn main:app --reload
```

서버가 실행되면 아래 주소에서 Swagger 문서를 확인할 수 있습니다.

```text
http://127.0.0.1:8000/docs
```

## Swagger 테스트 순서

1. `POST /auth/signup`으로 회원가입합니다.

```json
{
  "email": "teacher@example.com",
  "name": "Kim Teacher",
  "role": "teacher",
  "password": "password123"
}
```

`role`은 `teacher` 또는 `student`만 사용할 수 있습니다.

2. `POST /auth/login`으로 로그인합니다.

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

3. Swagger 오른쪽 위 `Authorize` 버튼을 누르고 토큰을 입력합니다.

```text
JWT_TOKEN_VALUE
```

`curl`이나 프론트엔드에서 직접 호출할 때는 `Authorization: Bearer JWT_TOKEN_VALUE` 헤더를 사용합니다.

4. `GET /users/me`를 실행해 현재 로그인한 사용자 정보를 확인합니다.

## SQLite DB

서버를 처음 실행하면 `app.db` 파일이 자동으로 생성됩니다.

학습용 프로젝트라서 `SECRET_KEY`는 `auth.py`에 간단히 작성되어 있습니다. 실제 서비스에서는 환경 변수로 분리해야 합니다.
