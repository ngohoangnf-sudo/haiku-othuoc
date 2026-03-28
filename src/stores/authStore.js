import { reactive } from "vue";
import { API_BASE } from "src/utils/runtime";

const STORAGE_KEY = "haiku.auth.token";

const state = reactive({
  token: loadToken(),
  user: null,
  role: "viewer",
  initialized: false,
  loading: false,
  error: "",
  users: [],
  usersLoading: false,
  usersError: "",
  activity: [],
  activityLoading: false,
  activityError: "",
});

let sessionPromise = null;

function loadToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function saveToken(token) {
  state.token = token || "";

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (state.token) {
      window.localStorage.setItem(STORAGE_KEY, state.token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (_error) {
    // ignore storage failure
  }
}

function applyViewerState() {
  state.user = null;
  state.role = "viewer";
  state.initialized = true;
}

function applyUserState(user) {
  state.user = user || null;
  state.role = user?.role || "viewer";
  state.initialized = true;
}

function setError(message = "") {
  state.error = message;
}

function getAuthHeaders(extraHeaders = {}) {
  return state.token
    ? {
        ...extraHeaders,
        Authorization: `Bearer ${state.token}`,
      }
    : { ...extraHeaders };
}

async function parseResponseError(response, fallbackMessage) {
  try {
    const data = await response.json();
    return data?.message || fallbackMessage;
  } catch (_error) {
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch (_textError) {
      return fallbackMessage;
    }
  }
}

async function ensureSession(force = false) {
  if (sessionPromise) {
    return sessionPromise;
  }

  if (state.initialized && !force) {
    return state.user;
  }

  if (!state.token) {
    applyViewerState();
    return null;
  }

  state.loading = true;
  setError("");

  sessionPromise = fetch(`${API_BASE}/auth/session`, {
    headers: getAuthHeaders(),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(await parseResponseError(response, "Không xác thực được phiên đăng nhập."));
      }

      const data = await response.json();
      if (data?.authenticated && data.user) {
        applyUserState(data.user);
        return data.user;
      }

      saveToken("");
      applyViewerState();
      return null;
    })
    .catch((error) => {
      saveToken("");
      applyViewerState();
      setError(error.message || "Không xác thực được phiên đăng nhập.");
      return null;
    })
    .finally(() => {
      state.loading = false;
      sessionPromise = null;
    });

  return sessionPromise;
}

async function login(username, password) {
  state.loading = true;
  setError("");

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(await parseResponseError(response, "Không đăng nhập được."));
    }

    const data = await response.json();
    saveToken(data.token || "");
    applyUserState(data.user || null);
    return data.user;
  } catch (error) {
    saveToken("");
    applyViewerState();
    setError(error.message || "Không đăng nhập được.");
    throw error;
  } finally {
    state.loading = false;
  }
}

async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  } catch (_error) {
    // ignore logout network failure
  } finally {
    saveToken("");
    applyViewerState();
    state.users = [];
    state.activity = [];
  }
}

async function loadUsers(force = false) {
  if (state.usersLoading) {
    return state.users;
  }

  if (state.users.length && !force) {
    return state.users;
  }

  state.usersLoading = true;
  state.usersError = "";

  try {
    const response = await fetch(`${API_BASE}/admin/users`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseResponseError(response, "Không tải được danh sách tài khoản."));
    }

    const data = await response.json();
    state.users = Array.isArray(data) ? data : [];
  } catch (error) {
    state.usersError = error.message || "Không tải được danh sách tài khoản.";
    throw error;
  } finally {
    state.usersLoading = false;
  }

  return state.users;
}

async function createUser(payload) {
  const response = await fetch(`${API_BASE}/admin/users`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Không tạo được tài khoản."));
  }

  const user = await response.json();
  state.users = [...state.users, user];
  return user;
}

async function updateUser(id, payload) {
  const response = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: "PATCH",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Không cập nhật được tài khoản."));
  }

  const user = await response.json();
  state.users = state.users.map((item) => (item.id === user.id ? user : item));
  if (state.user?.id === user.id) {
    applyUserState(user);
  }
  return user;
}

async function loadActivity(force = false, limit = 100) {
  if (state.activityLoading) {
    return state.activity;
  }

  if (state.activity.length && !force) {
    return state.activity;
  }

  state.activityLoading = true;
  state.activityError = "";

  try {
    const response = await fetch(`${API_BASE}/admin/activity?limit=${encodeURIComponent(limit)}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseResponseError(response, "Không tải được nhật ký hoạt động."));
    }

    const data = await response.json();
    state.activity = Array.isArray(data) ? data : [];
  } catch (error) {
    state.activityError = error.message || "Không tải được nhật ký hoạt động.";
    throw error;
  } finally {
    state.activityLoading = false;
  }

  return state.activity;
}

function canEdit() {
  return state.role === "editor" || state.role === "admin";
}

function isAdmin() {
  return state.role === "admin";
}

export default {
  state,
  ensureSession,
  login,
  logout,
  loadUsers,
  createUser,
  updateUser,
  loadActivity,
  getAuthHeaders,
  canEdit,
  isAdmin,
};
