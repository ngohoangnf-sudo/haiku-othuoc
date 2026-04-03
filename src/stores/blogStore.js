import { reactive } from "vue";
import { API_BASE } from "src/utils/runtime";
import authStore from "src/stores/authStore";

const state = reactive({
  posts: [],
  essays: [],
  essayTags: [],
  authors: [],
  loading: false,
  essaysLoading: false,
  error: "",
  essaysError: "",
  loaded: false,
  essaysLoaded: false,
  essaysStatus: "published",
});

function setError(message = "") {
  state.error = message;
}

function setEssaysError(message = "") {
  state.essaysError = message;
}

async function loadPosts(force = false) {
  if (state.loading) return state.posts;
  if (state.loaded && !force) return state.posts;

  state.loading = true;
  setError("");

  try {
    const res = await fetch(`${API_BASE}/posts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.posts = Array.isArray(data) ? data : [];
    state.loaded = true;
  } catch (err) {
    console.error("Không tải được bài viết", err);
    setError("Không tải được bài viết từ máy chủ.");
  } finally {
    state.loading = false;
  }

  return state.posts;
}

async function loadAuthors() {
  try {
    const res = await fetch(`${API_BASE}/authors`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.authors = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Không tải được danh sách tác giả", err);
  }
  return state.authors;
}

async function fetchPagedPosts(options = {}) {
  const params = new URLSearchParams();

  if (options.category) {
    params.set("category", options.category);
  }

  if (options.authorSlug) {
    params.set("authorSlug", options.authorSlug);
  }

  if (options.kind) {
    params.set("kind", options.kind);
  }

  if (options.page !== undefined) {
    params.set("page", String(options.page));
  }

  if (options.pageSize !== undefined) {
    params.set("pageSize", String(options.pageSize));
  }

  if (options.seed) {
    params.set("seed", String(options.seed));
  }

  const query = params.toString();
  const res = await fetch(`${API_BASE}/posts${query ? `?${query}` : ""}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total) || 0,
    totalPages: Math.max(1, Number(data?.totalPages) || 1),
    page: Math.max(1, Number(data?.page) || 1),
    pageSize: Math.max(1, Number(data?.pageSize) || Number(options.pageSize) || 1),
  };
}

async function loadEssays(options = {}) {
  const force = typeof options === "boolean" ? options : Boolean(options.force);
  const status =
    typeof options === "object" && typeof options.status === "string" && options.status.trim()
      ? options.status.trim()
      : "published";

  if (state.essaysLoading) return state.essays;
  if (state.essaysLoaded && state.essaysStatus === status && !force) return state.essays;

  state.essaysLoading = true;
  setEssaysError("");

  try {
    const query = status && status !== "published" ? `?status=${encodeURIComponent(status)}` : "";
    const res = await fetch(`${API_BASE}/essays${query}`, {
      headers: authStore.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.essays = Array.isArray(data) ? data : [];
    state.essaysLoaded = true;
    state.essaysStatus = status;
  } catch (err) {
    console.error("Không tải được bài luận", err);
    setEssaysError("Không tải được bài luận từ máy chủ.");
  } finally {
    state.essaysLoading = false;
  }

  return state.essays;
}

async function fetchPagedEssays(options = {}) {
  const params = new URLSearchParams();

  if (options.authorSlug) {
    params.set("authorSlug", options.authorSlug);
  }

  if (options.kind) {
    params.set("kind", options.kind);
  }

  if (options.tagSlug) {
    params.set("tagSlug", options.tagSlug);
  }

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.search) {
    params.set("search", options.search);
  }

  if (options.page !== undefined) {
    params.set("page", String(options.page));
  }

  if (options.pageSize !== undefined) {
    params.set("pageSize", String(options.pageSize));
  }

  const query = params.toString();
  const res = await fetch(`${API_BASE}/essays${query ? `?${query}` : ""}`, {
    headers: authStore.getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total) || 0,
    totalPages: Math.max(1, Number(data?.totalPages) || 1),
    page: Math.max(1, Number(data?.page) || 1),
    pageSize: Math.max(1, Number(data?.pageSize) || Number(options.pageSize) || 1),
  };
}

async function loadEssayTags(options = {}) {
  const status =
    typeof options === "object" && typeof options.status === "string" && options.status.trim()
      ? options.status.trim()
      : "published";

  const query = status && status !== "published" ? `?status=${encodeURIComponent(status)}` : "";
  const kindQuery =
    typeof options === "object" && typeof options.kind === "string" && options.kind.trim()
      ? `${query ? "&" : "?"}kind=${encodeURIComponent(options.kind.trim())}`
      : "";

  try {
    const res = await fetch(`${API_BASE}/essay-tags${query}${kindQuery}`, {
      headers: authStore.getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.essayTags = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Không tải được danh sách tag bài luận", err);
    state.essayTags = [];
  }

  return state.essayTags;
}

async function fetchPostById(id) {
  const existing = getPostById(id);
  if (existing) return existing;

  state.loading = true;
  setError("");

  try {
    const res = await fetch(`${API_BASE}/posts/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    upsertPost(data);
    return data;
  } catch (err) {
    console.error("Không tải được bài viết", err);
    return null;
  } finally {
    state.loading = false;
  }
}

async function addPost(postInput) {
  try {
    const res = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: authStore.getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(postInput),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const data = await res.json();
    upsertPost(data, true);
    state.authors = [];
    return data;
  } catch (err) {
    console.error("Không tạo được bài viết", err);
    setError("Không tạo được bài viết, thử lại sau.");
    throw err;
  }
}

async function addEssay(essayInput) {
  try {
    const res = await fetch(`${API_BASE}/essays`, {
      method: "POST",
      headers: authStore.getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(essayInput),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const data = await res.json();
    upsertEssay(data, true);
    state.essaysStatus = data.status === "draft" ? "all" : state.essaysStatus;
    return data;
  } catch (err) {
    console.error("Không tạo được bài luận", err);
    setEssaysError("Không tạo được bài luận, thử lại sau.");
    throw err;
  }
}

async function updatePost(id, postInput) {
  try {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      method: "PUT",
      headers: authStore.getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(postInput),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const data = await res.json();
    upsertPost(data);
    state.authors = [];
    return data;
  } catch (err) {
    console.error("Không cập nhật được bài viết", err);
    setError("Không cập nhật được bài viết, thử lại sau.");
    throw err;
  }
}

async function updateEssay(slug, essayInput) {
  try {
    const res = await fetch(`${API_BASE}/essays/${slug}`, {
      method: "PUT",
      headers: authStore.getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(essayInput),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const data = await res.json();
    upsertEssay(data);
    return data;
  } catch (err) {
    console.error("Không cập nhật được bài luận", err);
    setEssaysError("Không cập nhật được bài luận, thử lại sau.");
    throw err;
  }
}

async function deletePost(id) {
  try {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
      method: "DELETE",
      headers: authStore.getAuthHeaders(),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    state.posts = state.posts.filter((post) => post.id !== id);
    state.authors = [];
  } catch (err) {
    console.error("Không xóa được bài viết", err);
    setError("Không xóa được bài viết, thử lại sau.");
    throw err;
  }
}

async function deleteEssay(slug) {
  try {
    const res = await fetch(`${API_BASE}/essays/${slug}`, {
      method: "DELETE",
      headers: authStore.getAuthHeaders(),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    state.essays = state.essays.filter((essay) => essay.slug !== slug);
  } catch (err) {
    console.error("Không xóa được bài luận", err);
    setEssaysError("Không xóa được bài luận, thử lại sau.");
    throw err;
  }
}

function upsertPost(post, toTop = false) {
  const others = state.posts.filter((p) => p.id !== post.id);
  state.posts = toTop ? [post, ...others] : [...others, post];
  state.loaded = true;
}

function upsertEssay(essay, toTop = false) {
  const others = state.essays.filter((item) => item.slug !== essay.slug && item.id !== essay.id);
  state.essays = toTop ? [essay, ...others] : [...others, essay];
  state.essaysLoaded = true;
}

function getPostsByCategory(category = "jp") {
  return state.posts.filter((post) => post.category === category);
}

function getPostById(id) {
  return state.posts.find((post) => post.id === id || post.slug === id);
}

function getEssayBySlug(slug) {
  const essay = state.essays.find((item) => item.slug === slug);
  if (!essay) {
    return undefined;
  }

  if (essay.status === "draft" && !authStore.canEdit()) {
    return undefined;
  }

  return essay;
}

function getPostsByAuthorSlug(slug) {
  return state.posts.filter((post) => post.authorSlug === slug);
}

function getAuthors() {
  if (state.authors.length) return state.authors;
  const seen = new Map();
  state.posts.forEach((post) => {
    if (!seen.has(post.authorSlug)) {
      seen.set(post.authorSlug, {
        author: post.author,
        authorSlug: post.authorSlug,
        latest: post.publishedAt,
      });
    }
  });
  return Array.from(seen.values());
}

function slugify(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function fetchEssayBySlug(slug) {
  const existing = getEssayBySlug(slug);
  if (existing) return existing;

  state.essaysLoading = true;
  setEssaysError("");

  try {
    const res = await fetch(`${API_BASE}/essays/${slug}`, {
      headers: authStore.getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    upsertEssay(data);
    return data;
  } catch (err) {
    console.error("Không tải được bài luận", err);
    return null;
  } finally {
    state.essaysLoading = false;
  }
}

export default {
  state,
  loadPosts,
  fetchPagedPosts,
  loadEssays,
  fetchPagedEssays,
  loadEssayTags,
  loadAuthors,
  addPost,
  addEssay,
  updatePost,
  updateEssay,
  deletePost,
  deleteEssay,
  fetchPostById,
  fetchEssayBySlug,
  getPostById,
  getEssayBySlug,
  getPostsByAuthorSlug,
  getPostsByCategory,
  getAuthors,
  slugify,
};
