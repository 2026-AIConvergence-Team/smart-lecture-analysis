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
    throw new Error(data?.error || data?.detail || "?îÏ≤≠ Ï≤òÎ¶¨ Ï§??§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§.");
  }

  return data;
}

// ?Ä?Ä Í∞ïÏùò ?ùÏÑ± ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// POST /api/lectures
// { title, date, time } ??{ id, title, date, time, class_code, created_at }
export function createLecture(payload) {
  return request("/api/lectures", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ?Ä?Ä Í∞ïÏùò Ï°∞Ìöå ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// GET /api/lectures/{lecture_id}
export function getLecture(lectureId) {
  return request(`/api/lectures/${lectureId}`);
}

// POST /api/lectures/join
// { class_code } -> { participant_id, lecture_id, course_id, user_id, joined_at, class_code, already_joined, course_already_joined }
export function joinLectureByCode(classCode) {
  return request("/api/lectures/join", {
    method: "POST",
    body: JSON.stringify({ class_code: classCode }),
  });
}

// ?Ä?Ä PDF ?ÖÎ°ú???Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// POST /api/lectures/{lecture_id}/pdf
// FormData { file } ??{ id, file_name, pdf_url, total_pages, ... }
export function uploadPdf(lectureId, file) {
  const token = localStorage.getItem("access_token");
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`/api/lectures/${lectureId}/pdf`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Content-Type?Ä ?§Ï†ï?òÏ? ?äÏùå ??Î∏åÎùº?∞Ï?Í∞Ä multipart boundaryÎ•??êÎèô ?§Ï†ï
    },
    body: formData,
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || data?.detail || "PDF ?ÖÎ°ú?úÏóê ?§Ìå®?àÏäµ?àÎã§.");
    return data;
  });
}

// ?Ä?Ä ?çÏä§??Ï∂îÏ∂ú ?úÏûë (?ôÍ∏∞) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// POST /api/lectures/{lecture_id}/pdf/analyze
// ??{ message }
export function analyzePdf(lectureId) {
  return request(`/api/lectures/${lectureId}/pdf/analyze`, {
    method: "POST",
  });
}

// ?Ä?Ä Í∞úÎÖê Ï∂îÏ∂ú (?ôÍ∏∞) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// ??{ message }
// ?Ä?Ä Í∞úÎÖê Î™©Î°ù Ï°∞Ìöå ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// GET /api/lectures/{lecture_id}/concepts
// ??{ lecture_id, concepts: [{concept_id, lecture_id, concept_name, page_num, keywords, sentences}] }
export function getConcepts(lectureId) {
  return request(`/api/lectures/${lectureId}/concepts`);
}

// ?Ä?Ä ?êÎèô ?¥Ï¶à ?ùÏÑ± ?úÏûë (?ôÍ∏∞) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// POST /api/lectures/{lecture_id}/quizzes/generate
// { page_start, page_end, quiz_type, concept_ids?, count_per_concept?, option_count?, use_ai? }
// ??{ lecture_id, job_id, status: "completed", generated_count, ... }
export function generateQuizzes(lectureId, payload) {
  return request(`/api/lectures/${lectureId}/quizzes/generate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ?Ä?Ä ?¥Ï¶à ?ùÏÑ± ?ÅÌÉú + Í≤∞Í≥º Ï°∞Ìöå ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// GET /api/lectures/{lecture_id}/quizzes/generate/status
// ??{ lecture_id, job_id, status, progress, generated_count, quizzes: [...] }
export function getQuizGenerateStatus(lectureId) {
  return request(`/api/lectures/${lectureId}/quizzes/generate/status`);
}

// ?Ä?Ä ?¥Ï¶à Î™©Î°ù Ï°∞Ìöå ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// GET /api/lectures/{lecture_id}/quizzes?status=ACTIVE&page_start=5&page_end=12&concept_id=1
// ??{ lecture_id, total_count, quizzes: [...] }
export function getLectureQuizzes(lectureId, params = {}) {
  const query = new URLSearchParams();
  if (params.status)     query.append("status", params.status);
  if (params.page_start) query.append("page_start", params.page_start);
  if (params.page_end)   query.append("page_end", params.page_end);
  if (params.concept_id) query.append("concept_id", params.concept_id);
  const qs = query.toString();
  return request(`/api/lectures/${lectureId}/quizzes${qs ? `?${qs}` : ""}`);
}

// ?Ä?Ä ?¥Ï¶à ?ÅÏÑ∏ Ï°∞Ìöå ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// GET /api/quizzes/{quiz_id}
// ??{ quiz_id, lecture_id, concept_id, concept, page, quiz_type, question, options, answer, ... }
export function getQuizDetail(quizId) {
  return request(`/api/quizzes/${quizId}`);
}

// ?Ä?Ä ?¥Ï¶à ?òÏ†ï ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// PATCH /api/quizzes/{quiz_id}
// { question?, options?, answer?, explanation?, status? } ???òÏ†ï???¥Ï¶à ?ÑÏ≤¥ Î∞òÌôò
export function updateQuiz(quizId, payload, setId = null) {
  const path = setId
    ? `/api/quiz-sets/${setId}/quizzes/${quizId}`
    : `/api/quizzes/${quizId}`;
  return request(path, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ?Ä?Ä ?¥Ï¶à ??†ú (?åÌîÑ?? ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// DELETE /api/quizzes/{quiz_id}
// ??{ quiz_id, previous_status, current_status: "DELETED", message }
export function deleteQuiz(quizId, setId = null) {
  const path = setId
    ? `/api/quiz-sets/${setId}/quizzes/${quizId}`
    : `/api/quizzes/${quizId}`;
  return request(path, {
    method: "DELETE",
  });
}

// ?Ä?Ä ?òÎèô ?¥Ï¶à Ï∂îÍ? ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// POST /api/lectures/{lecture_id}/quizzes
// { concept_id?, quiz_type, question, options, answer, explanation?, source_sentence?, page?, status }
// ???ùÏÑ±???¥Ï¶à ?ÑÏ≤¥ Î∞òÌôò
export function createManualQuiz(lectureId, payload) {
  return request(`/api/lectures/${lectureId}/quizzes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ?Ä?Ä ?¥Ï¶à ?ÅÌÉú Î≥ÄÍ≤??Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
// PATCH /api/quizzes/{quiz_id}/status
// { status: "ACTIVE" | "DELETED" }
// ???òÏ†ï???¥Ï¶à ?ÑÏ≤¥ Î∞òÌôò
export function updateQuizStatus(quizId, status, setId = null) {
  const path = setId
    ? `/api/quiz-sets/${setId}/quizzes/${quizId}/status`
    : `/api/quizzes/${quizId}/status`;
  return request(path, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// PATCH /api/quiz-sets/{set_id}/status
// { status: "DRAFT" | "SENT" | "CLOSED" }
export function updateQuizSetStatus(setId, status) {
  return request(`/api/quiz-sets/${setId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
