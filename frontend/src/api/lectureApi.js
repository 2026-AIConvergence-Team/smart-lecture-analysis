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

// ── 강의 생성 ──────────────────────────────────────────
// POST /api/lectures
// { title, date, time } → { id, title, date, time, class_code, created_at }
export function createLecture(payload) {
  return request("/api/lectures", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── 강의 조회 ──────────────────────────────────────────
// GET /api/lectures/{lecture_id}
export function getLecture(lectureId) {
  return request(`/api/lectures/${lectureId}`);
}

// ── PDF 업로드 ─────────────────────────────────────────
// POST /api/lectures/{lecture_id}/pdf
// FormData { file } → { id, file_name, pdf_url, total_pages, ... }
export function uploadPdf(lectureId, file) {
  const token = localStorage.getItem("access_token");
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`/api/lectures/${lectureId}/pdf`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Content-Type은 설정하지 않음 — 브라우저가 multipart boundary를 자동 설정
    },
    body: formData,
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || data?.detail || "PDF 업로드에 실패했습니다.");
    return data;
  });
}

// ── 텍스트 추출 + 개념 추출 (통합, 동기) ─────────────
// POST /api/lectures/{lecture_id}/pdf/analyze
// → { message }
export function analyzePdf(lectureId) {
  return request(`/api/lectures/${lectureId}/pdf/analyze`, {
    method: "POST",
  });
}

// ── 개념 목록 조회 ─────────────────────────────────────
// GET /api/lectures/{lecture_id}/concepts
// → { lecture_id, concepts: [{concept_id, lecture_id, concept_name, page_num, keywords, sentences}] }
export function getConcepts(lectureId) {
  return request(`/api/lectures/${lectureId}/concepts`);
}

// ── 자동 퀴즈 생성 시작 (동기) ────────────────────────
// POST /api/lectures/{lecture_id}/quizzes/generate
// { page_start, page_end, quiz_type, concept_ids?, count_per_concept?, option_count?, use_ai? }
// → { lecture_id, job_id, status: "completed", generated_count, ... }
export function generateQuizzes(lectureId, payload) {
  return request(`/api/lectures/${lectureId}/quizzes/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── 퀴즈 생성 상태 + 결과 조회 ────────────────────────
// GET /api/lectures/{lecture_id}/quizzes/generate/status
// → { lecture_id, job_id, status, progress, generated_count, quizzes: [...] }
export function getQuizGenerateStatus(lectureId) {
  return request(`/api/lectures/${lectureId}/quizzes/generate/status`);
}

// ── 퀴즈 목록 조회 ────────────────────────────────────
// GET /api/lectures/{lecture_id}/quizzes?status=DRAFT&page_start=5&page_end=12&concept_id=1
// → { lecture_id, total_count, quizzes: [...] }
export function getLectureQuizzes(lectureId, params = {}) {
  const query = new URLSearchParams();
  if (params.status)     query.append("status", params.status);
  if (params.page_start) query.append("page_start", params.page_start);
  if (params.page_end)   query.append("page_end", params.page_end);
  if (params.concept_id) query.append("concept_id", params.concept_id);
  const qs = query.toString();
  return request(`/api/lectures/${lectureId}/quizzes${qs ? `?${qs}` : ""}`);
}

// ── 퀴즈 상세 조회 ────────────────────────────────────
// GET /api/quizzes/{quiz_id}
// → { quiz_id, lecture_id, concept_id, concept, page, quiz_type, question, options, answer, ... }
export function getQuizDetail(quizId) {
  return request(`/api/quizzes/${quizId}`);
}

// ── 퀴즈 수정 ─────────────────────────────────────────
// PATCH /api/quiz-sets/{set_id}/quizzes/{quiz_id}
// { question?, options?, answer?, explanation?, status? } → 수정된 퀴즈 전체 반환
export function updateQuiz(setId, quizId, payload) {
  return request(`/api/quiz-sets/${setId}/quizzes/${quizId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ── 퀴즈 삭제 (소프트) ────────────────────────────────
// DELETE /api/quiz-sets/{set_id}/quizzes/{quiz_id}
// → { quiz_id, set_id, previous_status, current_status: "DELETED", message }
export function deleteQuiz(setId, quizId) {
  return request(`/api/quiz-sets/${setId}/quizzes/${quizId}`, {
    method: "DELETE",
  });
}

// ── 수동 퀴즈 추가 ────────────────────────────────────
// POST /api/lectures/{lecture_id}/quizzes
// { concept_id?, quiz_type, question, options, answer, explanation?, source_sentence?, page?, status }
// → 생성된 퀴즈 전체 반환
export function createManualQuiz(lectureId, payload) {
  return request(`/api/lectures/${lectureId}/quizzes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── 퀴즈 상태 변경 ────────────────────────────────────
// PATCH /api/quiz-sets/{set_id}/quizzes/{quiz_id}/status
// { status: "DRAFT" | "READY" | "DELETED" }
// → { quiz_id, set_id, previous_status, current_status, message }
export function updateQuizStatus(setId, quizId, status) {
  return request(`/api/quiz-sets/${setId}/quizzes/${quizId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ── 수업 코드 발급 (재생성) ────────────────────────────
// POST /api/lectures/{lecture_id}/code
// → { lecture_id, class_code }
export function generateClassCode(lectureId) {
  return request(`/api/lectures/${lectureId}/code`, {
    method: "POST",
  });
}

// ── 수업 참가 (lecture_id + class_code) ───────────────
// POST /api/lectures/{lecture_id}/join
// { class_code } → { participant_id, lecture_id, user_id, joined_at, class_code, already_joined }
export function joinLecture(lectureId, classCode) {
  return request(`/api/lectures/${lectureId}/join`, {
    method: "POST",
    body: JSON.stringify({ class_code: classCode }),
  });
}

// ── 강의실 입장 (class_code만으로 입장) ───────────────
// POST /api/lectures/join
// { class_code } → { participant_id, lecture_id, ... }
export function joinLectureByCode(classCode) {
  return request(`/api/lectures/join`, {
    method: "POST",
    body: JSON.stringify({ class_code: classCode }),
  });
}

// ── 강의 상태 변경 ─────────────────────────────────────
// PATCH /api/lectures/{lecture_id}/status
// { status: "active" | "ended" }
// → { id, course_id, title, date, time, class_code, status, created_at }
export function updateLectureStatus(lectureId, status) {
  return request(`/api/lectures/${lectureId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ── 한 수업의 세트 목록 조회 ────────────────────────────
// GET /api/lectures/{lecture_id}/quiz-sets
// → { lecture_id, total_count, sets: [{set_id, lecture_id, generation_job_id,
//     set_number, page_start, page_end, status, quiz_count, created_at, updated_at}] }
export function getQuizSets(lectureId) {
  return request(`/api/lectures/${lectureId}/quiz-sets`);
}

// ── 특정 세트 상태 변경 ────────────────────────────────
// PATCH /api/quiz-sets/{set_id}/status
// { status } → { status: "string" }
export function updateQuizSetStatus(setId, status) {
  return request(`/api/quiz-sets/${setId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ── 익명 질문 제출 ─────────────────────────────────────
// POST /api/lectures/{lecture_id}/questions
// { content } → { id, lecture_id, content, is_mine, author_display_name, created_at, ... }
export function submitQuestion(lectureId, content) {
  return request(`/api/lectures/${lectureId}/questions`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// ── 수업 중 익명 질문 조회 ─────────────────────────────
// GET /api/lectures/{lecture_id}/questions
// → [{ id, lecture_id, content, is_mine, author_display_name, created_at, ... }]
export function getQuestions(lectureId) {
  return request(`/api/lectures/${lectureId}/questions`);
}

// ── 특정 퀴즈에 메모 달기 ──────────────────────────────
// POST /api/quizzes/{quiz_id}/memo
// { content } → { id, quiz_id, student_id, content, updated_at }
export function createMemo(quizId, content) {
  return request(`/api/quizzes/${quizId}/memo`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// ── 메모 수정 ───────────────────────────────────────────
// PATCH /api/quizzes/{quiz_id}/memo
// { content } → { id, quiz_id, student_id, content, updated_at }
export function updateMemo(quizId, content) {
  return request(`/api/quizzes/${quizId}/memo`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

// ── 퀴즈 재생성 ────────────────────────────────────────
// POST /api/quiz-sets/{set_id}/quizzes/{quiz_id}/regenerate
// { quiz_type?, option_count?, use_ai?, difficulty?, ai_provider?, reason? }
// → 재생성된 퀴즈 전체 반환
export function regenerateQuiz(setId, quizId, payload = {}) {
  return request(`/api/quiz-sets/${setId}/quizzes/${quizId}/regenerate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── 학생 답안 제출 ─────────────────────────────────────
// POST /api/lectures/{lecture_id}/quiz-sets/{set_id}/submissions
// { answers: [{ quiz_id, selected }] }
// → { id, set_id, lecture_id, student_id, submitted_at, answers, total_count, correct_count }
export function submitAnswers(lectureId, setId, payload) {
  return request(`/api/lectures/${lectureId}/quiz-sets/${setId}/submissions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
