from typing import List, Optional

from fastapi import status
from fastapi.responses import JSONResponse


SUPPORTED_QUIZ_TYPES = {"BLANK", "DEFINITION", "KEYWORD_CHOICE", "OX"}
SUPPORTED_QUIZ_STATUSES = {"DRAFT", "READY", "DELETED"}


def normalize_quiz_type(quiz_type: str) -> str:
    return quiz_type.strip().upper()


def normalize_quiz_status(status_value: str) -> str:
    return status_value.strip().upper()


def error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": message},
    )


def validate_quiz_type(quiz_type: str) -> Optional[JSONResponse]:
    if normalize_quiz_type(quiz_type) not in SUPPORTED_QUIZ_TYPES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 quiz_type입니다.",
        )
    return None


def validate_quiz_status(status_value: str) -> Optional[JSONResponse]:
    if normalize_quiz_status(status_value) not in SUPPORTED_QUIZ_STATUSES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 status입니다.",
        )
    return None


def validate_options_and_answer(
    options: List[str],
    answer: str,
) -> Optional[JSONResponse]:
    cleaned_options = [opt.strip() for opt in options if opt and opt.strip()]

    if len(cleaned_options) < 2:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "객관식 선택지는 최소 2개 이상이어야 합니다.",
        )

    if answer not in cleaned_options:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "answer는 options 안에 포함되어야 합니다.",
        )

    return None


def validate_ready_quiz(
    question: str,
    options: List[str],
    answer: str,
) -> Optional[JSONResponse]:
    if not question or not question.strip() or not options or not answer:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "문제, 선택지, 정답이 모두 있어야 READY 상태로 변경할 수 있습니다.",
        )

    return validate_options_and_answer(options, answer)