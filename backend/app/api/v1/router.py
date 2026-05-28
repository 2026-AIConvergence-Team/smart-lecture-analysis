from fastapi import APIRouter

from app.api.v1 import auth, courses, lectures, quizzes, users, teacher_report, student_report


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(courses.router)
api_router.include_router(lectures.router)
api_router.include_router(quizzes.router)
api_router.include_router(teacher_report.router)
api_router.include_router(student_report.router)
