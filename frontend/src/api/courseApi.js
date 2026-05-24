const BASE = "";

async function request(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || data?.detail || "요청 처리 중 오류가 발생했습니다.");
  }

  return data;
}

// ── 내 과목들 조회 ─────────────────────────────────────
// GET /api/courses
// → [{ id, user_id, title, department, year, semester, schedule, student_count, section, created_at, updated_at }]
export function getCourses() {
  return request("/api/courses");
}

// ── 과목 생성 ──────────────────────────────────────────
// POST /api/courses
// { title, department, year, semester, schedule, student_count, section }
// → { id, user_id, title, department, year, semester, schedule, student_count, section, created_at, updated_at }
export function createCourse(payload) {
  return request("/api/courses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── 과목에 있는 수업들 조회 ────────────────────────────
// GET /api/courses/{course_id}/lectures
// → [{ id, course_id, title, date, time, class_code, status, created_at }]
export function getCourseLectures(courseId) {
  return request(`/api/courses/${courseId}/lectures`);
}

// ── 과목 정보 수정 ─────────────────────────────────────
// PATCH /api/courses/{course_id}
// { title, department, year, semester, schedule, student_count, section }
// → { id, user_id, title, department, year, semester, schedule, student_count, section, created_at, updated_at }
export function updateCourse(courseId, payload) {
  return request(`/api/courses/${courseId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ── 과목 삭제 ──────────────────────────────────────────
// DELETE /api/courses/{course_id}
// Request/Response 모두 없음
export function deleteCourse(courseId) {
  return request(`/api/courses/${courseId}`, {
    method: "DELETE",
  });
}
