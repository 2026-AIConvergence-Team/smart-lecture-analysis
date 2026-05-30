from collections import defaultdict
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

import app.models as models
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal
from app.repositories import (
    course_repository,
    lecture_participant_repository,
    lecture_repository,
)


router = APIRouter(tags=["Lecture Realtime"])


TEACHER_EVENTS = {
    "COURSE_INFO",
    "PDF_LOADED",
    "PDF_PAGE",
    "QUIZ_PUBLISHED",
    "QUIZ_SET_BACKEND_ID",
    "QUIZ_CLOSED",
    "CLASS_ENDED",
}

STUDENT_EVENTS = {
    "STATE_REQUEST",
    "STUDENT_ANSWER",
    "STUDENT_QUESTION",
}


class LectureConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, lecture_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[lecture_id].add(websocket)

    def disconnect(self, lecture_id: int, websocket: WebSocket) -> None:
        room = self._rooms.get(lecture_id)
        if not room:
            return

        room.discard(websocket)
        if not room:
            self._rooms.pop(lecture_id, None)

    async def broadcast(
        self,
        lecture_id: int,
        sender: WebSocket,
        message: dict[str, Any],
    ) -> None:
        for websocket in list(self._rooms.get(lecture_id, set())):
            if websocket is sender:
                continue

            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(lecture_id, websocket)


manager = LectureConnectionManager()


def get_user_from_token(db: Session, token: str | None) -> models.User | None:
    if not token:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    return db.query(models.User).filter(models.User.id == int(user_id)).first()


def can_access_lecture(db: Session, lecture: models.Lecture, user: models.User) -> bool:
    if user.role == "teacher":
        if lecture.course_id is None:
            return False

        course = course_repository.get_course_by_id(db, lecture.course_id)
        return bool(course and course.user_id == user.id)

    if user.role == "student":
        return (
            lecture_participant_repository.get_participant(db, lecture.id, user.id)
            is not None
        )

    return False


def can_send_realtime_event(user_role: str, event_type: str | None) -> bool:
    if not event_type:
        return False

    if user_role == "teacher":
        return event_type in TEACHER_EVENTS

    if user_role == "student":
        return event_type in STUDENT_EVENTS

    return False


@router.websocket("/ws/lectures/{lecture_id}")
async def lecture_realtime_ws(websocket: WebSocket, lecture_id: int):
    token = websocket.query_params.get("token")

    db = SessionLocal()
    try:
        user = get_user_from_token(db, token)
        lecture = lecture_repository.get_lecture_by_id(db, lecture_id)

        if not user or not lecture or not can_access_lecture(db, lecture, user):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        sender_id = user.id
        sender_role = user.role

    finally:
        db.close()

    await manager.connect(lecture_id, websocket)

    try:
        while True:
            message = await websocket.receive_json()

            if not isinstance(message, dict):
                continue

            event_type = message.get("type")
            payload = message.get("payload") or {}

            if not can_send_realtime_event(sender_role, event_type):
                await websocket.send_json({
                    "type": "ERROR",
                    "payload": {
                        "message": "허용되지 않은 실시간 이벤트입니다.",
                        "event_type": event_type,
                    },
                })
                continue

            await manager.broadcast(
                lecture_id,
                websocket,
                {
                    "type": event_type,
                    "payload": payload,
                    "sender_role": sender_role,
                    "sender_id": sender_id,
                },
            )

    except WebSocketDisconnect:
        manager.disconnect(lecture_id, websocket)

    except Exception:
        manager.disconnect(lecture_id, websocket)
        raise