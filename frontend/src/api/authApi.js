const API_BASE_URL = "";

async function request(path, options = {}) {
  // sessionStorage 우선 — 같은 브라우저에서 교수/학생 탭이 동시에 열릴 때 탭별 토큰 사용
  const token =
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export function signup(payload) {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return request("/auth/logout", {
    method: "POST",
  });
}

export function getMe() {
  return request("/users/me", { method: "GET" });
}
