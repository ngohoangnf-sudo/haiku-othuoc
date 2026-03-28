import { reactive } from "vue";
import { API_BASE } from "src/utils/runtime";
import authStore from "src/stores/authStore";

const state = reactive({
  posts: [],
  essays: [],
  authors: [],
  loading: false,
  essaysLoading: false,
  error: "",
  essaysError: "",
  loaded: false,
  essaysLoaded: false,
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

async function loadEssays(force = false) {
  if (state.essaysLoading) return state.essays;
  if (state.essaysLoaded && !force) return state.essays;

  state.essaysLoading = true;
  setEssaysError("");

  try {
    const res = await fetch(`${API_BASE}/essays`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.essays = Array.isArray(data) ? data : [];
    state.essaysLoaded = true;
  } catch (err) {
    console.error("Không tải được bài luận", err);
    setEssaysError("Không tải được bài luận từ máy chủ.");
  } finally {
    state.essaysLoading = false;
  }

  return state.essays;
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
  return state.posts.find((post) => post.id === id);
}

function getEssayBySlug(slug) {
  return state.essays.find((essay) => essay.slug === slug);
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
    const res = await fetch(`${API_BASE}/essays/${slug}`);
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
  loadEssays,
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
