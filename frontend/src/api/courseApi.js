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
    throw new Error(data?.error || data?.detail || "Request failed.");
  }

  return data;
}

export function listCourses() {
  return request("/api/courses");
}

export function listCourseLectures(courseId) {
  return request(`/api/courses/${courseId}/lectures`);
}
