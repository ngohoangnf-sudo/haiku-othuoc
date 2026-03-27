import { reactive } from "vue";

const API_BASE = import.meta.env?.VITE_API_BASE || "/api";

const state = reactive({
  posts: [],
  authors: [],
  loading: false,
  error: "",
  loaded: false,
});

function setError(message = "") {
  state.error = message;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postInput),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const data = await res.json();
    upsertPost(data, true);
    return data;
  } catch (err) {
    console.error("Không tạo được bài viết", err);
    setError("Không tạo được bài viết, thử lại sau.");
    throw err;
  }
}

function upsertPost(post, toTop = false) {
  const others = state.posts.filter((p) => p.id !== post.id);
  state.posts = toTop ? [post, ...others] : [...others, post];
  state.loaded = true;
}

function getPostsByCategory(category = "jp") {
  return state.posts.filter((post) => post.category === category);
}

function getPostById(id) {
  return state.posts.find((post) => post.id === id);
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

export default {
  state,
  loadPosts,
  loadAuthors,
  addPost,
  fetchPostById,
  getPostById,
  getPostsByAuthorSlug,
  getPostsByCategory,
  getAuthors,
  slugify,
};
