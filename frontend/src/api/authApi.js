const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function getStoredToken() {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token")
  );
}

async function request(path, options = {}) {
  const {
    skipAuth = false,
    authToken = null,
    headers = {},
    ...fetchOptions
  } = options;

  const token = authToken || (!skipAuth ? getStoredToken() : null);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...fetchOptions,
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
    skipAuth: true,
  });
}

export function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

export function logout() {
  return request("/auth/logout", {
    method: "POST",
  });
}

export function getMe(token) {
  return request("/users/me", {
    method: "GET",
    authToken: token,
  });
}