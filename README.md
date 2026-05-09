# Smart Lecture Analysis

스마트 강의 분석 시스템은 교수자가 강의 PDF를 업로드하면 핵심 개념을 분석하고, 자동 퀴즈를 생성하며, 학생 응답을 실시간으로 수집해 교수 대시보드와 수업 리포트를 제공하는 팀 프로젝트입니다.

현재 저장소에는 프로젝트의 공통 기반이 되는 **FastAPI 인증 백엔드**가 구현되어 있습니다.

## 프로젝트 소개

이 프로젝트는 강의 자료 분석부터 수업 중 학생 반응 수집까지 이어지는 학습 보조 시스템을 목표로 합니다.

교수자는 PDF 강의 자료를 업로드하고, 시스템은 자료에서 주요 개념과 키워드를 추출합니다. 이후 추출된 개념을 기반으로 퀴즈를 생성하고, 학생들이 제출한 답변을 실시간으로 수집해 수업 이해도와 취약 개념을 분석합니다.

## 주요 기능 목표

- PDF 강의 자료 업로드 및 텍스트 추출
- 핵심 개념과 키워드 분석
- 개념 기반 자동 퀴즈 생성
- 학생 응답 실시간 수집
- 정답률, 오답률, 평균 이해도 계산
- 교수자 대시보드 제공
- 수업 후 취약 개념 리포트 생성
- 교수자와 학생을 구분하는 인증 기반 제공

## 현재 구현된 기능

현재 구현 범위는 **백엔드 인증 기반**입니다.

- 회원가입
- 로그인
- bcrypt 비밀번호 해시
- JWT 인증 토큰 발급
- 로그인한 사용자 정보 조회
- 서버 상태 확인
- Swagger UI 기반 API 테스트

## 사용 기술

| 구분 | 기술 |
| --- | --- |
| Backend | FastAPI |
| Database | SQLite |
| ORM | SQLAlchemy |
| Authentication | JWT, bcrypt |
| API Documentation | Swagger UI |
| Language | Python |

## 폴더 구조

```text
smart-lecture-analysis/
├── backend/
│   ├── main.py              # FastAPI 앱 시작 파일
│   ├── database.py          # SQLite 연결 및 DB 세션 설정
│   ├── models.py            # SQLAlchemy 사용자 모델
│   ├── schemas.py           # 요청/응답 스키마
│   ├── auth.py              # 비밀번호 해시, JWT 인증 처리
│   ├── users.py             # 사용자 관련 API
│   ├── requirements.txt     # Python 패키지 목록
│   └── README.md            # 백엔드 상세 설명
├── .gitignore
└── README.md                # GitHub 메인 README
```

## 실행 방법

아래 명령어는 프로젝트 루트 폴더에서 시작한다고 가정합니다.

### 1. backend 폴더로 이동

```bash
cd backend
```

### 2. 가상환경 생성

```bash
python -m venv venv
```

### 3. 가상환경 실행

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

### 4. 패키지 설치

```bash
pip install -r requirements.txt
```

### 5. 서버 실행

```bash
uvicorn main:app --reload
```

서버가 정상적으로 실행되면 아래 주소에서 API 서버에 접속할 수 있습니다.

```text
http://127.0.0.1:8000
```

## Swagger API 문서

FastAPI는 Swagger UI를 자동으로 제공합니다.

서버 실행 후 브라우저에서 아래 주소로 접속하면 API 목록을 확인하고 직접 테스트할 수 있습니다.

```text
http://127.0.0.1:8000/docs
```

## 구현된 API 목록

| Method | URL | 인증 필요 | 설명 |
| --- | --- | --- | --- |
| GET | `/health` | 아니오 | 서버 상태 확인 |
| POST | `/auth/signup` | 아니오 | 회원가입 |
| POST | `/auth/login` | 아니오 | 로그인 및 JWT 토큰 발급 |
| GET | `/users/me` | 예 | 현재 로그인한 사용자 정보 조회 |

## 사용자 모델

현재 인증 백엔드의 사용자 모델은 아래 필드를 사용합니다.

| 필드 | 설명 |
| --- | --- |
| `id` | 사용자 고유 ID |
| `email` | 로그인 이메일 |
| `name` | 사용자 이름 |
| `role` | 사용자 역할 |
| `hashed_password` | bcrypt로 해시된 비밀번호 |

`role`은 아래 값 중 하나입니다.

| Role | 설명 |
| --- | --- |
| `teacher` | 교수자 |
| `student` | 학생 |

## 요청 예시

회원가입 요청 예시:

```json
{
  "email": "teacher@example.com",
  "name": "Kim Teacher",
  "role": "teacher",
  "password": "password123"
}
```

로그인 응답 예시:

```json
{
  "access_token": "JWT_TOKEN_VALUE",
  "token_type": "bearer"
}
```

## 팀별 기능 계획

| 팀원 | 담당 영역 | 주요 기능 |
| --- | --- | --- |
| 1번 | PDF 분석 및 개념 추출 | PDF 텍스트 추출, 키워드 분석, 개념 목록 생성 |
| 2번 | 자동 퀴즈 생성 | 빈칸 퀴즈, 객관식 퀴즈, 선택지 생성 |
| 3번 | 실시간 수업 세션 | 학생 입장, 실시간 응답 수집, 이해도 계산 |
| 4번 | 교수 대시보드 및 리포트 | 실시간 분석 화면, 취약 개념 리포트 |
| 공통 | 인증 백엔드 | 회원가입, 로그인, JWT 인증, 사용자 조회 |

## 참고

백엔드 실행과 Swagger 테스트에 대한 더 자세한 설명은 [backend/README.md](backend/README.md)를 참고하세요.

현재 프로젝트는 학습 및 팀 프로젝트용으로 구성되어 있습니다. 실제 서비스에 배포할 때는 `SECRET_KEY`를 환경 변수로 분리하고, 운영 환경에 맞는 데이터베이스와 보안 설정을 적용해야 합니다.
