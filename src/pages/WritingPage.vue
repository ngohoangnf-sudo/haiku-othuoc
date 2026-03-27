<template>
  <div class="write-page">
    <section class="write-page__composer">
      <div class="write-page__intro">
        <h1 class="write-page__heading">Viết & đăng bài</h1>
        <p class="write-page__lead">
          Nhập từng dòng haiku, chọn tác giả và phân loại. Bài sẽ được lưu trên máy chủ.
        </p>
        <p v-if="error" class="write-page__status write-page__status--error">{{ error }}</p>
        <p v-else-if="loading" class="write-page__status">Đang tải danh sách...</p>
      </div>

      <form class="write-form" @submit.prevent="submitPost">
        <label class="form-field">
          <span class="form-field__label">Tiêu đề</span>
          <input v-model="form.title" class="input" placeholder="Tiêu đề bài" />
        </label>
        <label class="form-field">
          <span class="form-field__label">Tác giả</span>
          <input v-model="form.author" class="input" placeholder="Tên tác giả" />
        </label>
        <label class="form-field">
          <span class="form-field__label">Phân loại</span>
          <select v-model="form.category" class="input">
            <option v-for="option in categoryOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="form-field">
          <span class="form-field__label">Tóm tắt</span>
          <input v-model="form.summary" class="input" placeholder="1-2 câu mô tả ngắn" />
        </label>
        <label class="form-field">
          <span class="form-field__label">Ảnh (tùy chọn)</span>
          <input v-model="form.image" class="input" placeholder="URL ảnh hoặc tên file trong assets" />
        </label>
        <label class="form-field form-field--wide">
          <span class="form-field__label">Nội dung (mỗi dòng haiku cách nhau bởi xuống dòng)</span>
          <textarea
            v-model="form.linesInput"
            class="input"
            rows="4"
            placeholder="Ví dụ:\nBỏ lên chiếc quạt nhỏ\nTừ Phú Sĩ gửi đi ngọn gió\nMột chút quà Edo"
          ></textarea>
        </label>
        <button class="submit-btn" type="submit">Đăng bài</button>
        <p v-if="message" class="form-feedback">{{ message }}</p>
      </form>
    </section>

    <section v-if="posts.length" class="write-page__previews">
      <div class="write-page__previews-head">
        <h2 class="write-page__subheading">Bài đã đăng</h2>
        <p class="write-page__subcopy">{{ posts.length }} bài hiện có trong hệ thống.</p>
      </div>

      <div class="write-page__preview-list">
        <article v-for="poem in posts" :key="poem.id" class="write-page__preview">
          <h3 class="write-page__preview-title">{{ poem.title || "Haiku" }}</h3>
          <div class="write-page__preview-body">
            <p v-for="(line, i) in poem.lines" :key="i" class="write-page__preview-line">{{ line }}</p>
          </div>
          <div class="write-page__preview-meta">
            <router-link :to="'/authors/' + poem.authorSlug" class="write-page__preview-author">
              {{ poem.author }}
            </router-link>
            <router-link :to="'/post/' + poem.id" class="write-page__preview-link">
              Xem bài · {{ formatDate(poem.publishedAt) }}
            </router-link>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, onMounted, reactive, ref } from "vue";
import blogStore from "src/stores/blogStore";

const CATEGORY_OPTIONS = [
  { value: "jp", label: "Haiku Nhật" },
  { value: "vi", label: "Haiku Việt" },
  { value: "global", label: "Haiku thế giới" },
];

export default defineComponent({
  name: "WritingPage",
  setup() {
    onMounted(() => {
      blogStore.loadPosts();
    });

    const form = reactive({
      title: "",
      author: "",
      category: "vi",
      summary: "",
      image: "",
      linesInput: "",
    });

    const message = ref("");

    const posts = computed(() => blogStore.state.posts);
    const categoryOptions = CATEGORY_OPTIONS;

    const resetForm = () => {
      form.title = "";
      form.author = "";
      form.category = "vi";
      form.summary = "";
      form.image = "";
      form.linesInput = "";
    };

    const submitPost = async () => {
      message.value = "";
      const lines = form.linesInput
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) {
        message.value = "Hãy nhập ít nhất một dòng haiku.";
        return;
      }

      try {
        const post = await blogStore.addPost({
          title: form.title,
          author: form.author,
          category: form.category,
          summary: form.summary,
          image: form.image,
          lines,
        });

        message.value = `Đã đăng "${post.title}" của ${post.author}.`;
        resetForm();
      } catch (err) {
        message.value = "Không đăng được bài. Thử lại sau.";
      }
    };

    const formatDate = (value) => {
      if (!value) return "";
      try {
        const date = new Date(value);
        return new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(date);
      } catch (err) {
        return value;
      }
    };

    const loading = computed(() => blogStore.state.loading);
    const error = computed(() => blogStore.state.error);

    return {
      form,
      posts,
      categoryOptions,
      submitPost,
      message,
      formatDate,
      loading,
      error,
    };
  },
});
</script>

<style scoped>
.write-page {
  width: min(1040px, calc(100vw - 4rem));
  margin: 0 auto;
  padding: 7rem 0 5rem;
  display: grid;
  gap: 5rem;
}

.write-page__composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  align-items: start;
}

.write-page__intro {
  position: static;
}

.write-page__heading {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  font-size: clamp(2.6rem, 7vw, 5.8rem);
  line-height: 0.96;
  color: var(--color-title);
}

.write-page__lead,
.write-page__status,
.write-page__subcopy {
  margin: 1.25rem 0 0;
  max-width: 46rem;
  font-size: 1.05rem;
  line-height: 1.7;
  color: var(--color-description);
}

.write-page__status--error {
  color: #f0b9b0;
}

.write-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  align-items: start;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02)),
    rgba(27, 25, 25, 0.38);
  backdrop-filter: blur(10px);
}

.form-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.form-field__label {
  display: block;
  margin-bottom: 0.55rem;
  font-size: 0.95rem;
  letter-spacing: 0.01em;
  color: var(--color-description);
}

.form-field--wide {
  grid-column: 1 / -1;
}

.input,
.write-form textarea,
.write-form select {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e6e0db;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
}

.write-form textarea {
  min-height: 11rem;
  resize: vertical;
}

.input:focus,
.write-form textarea:focus,
.write-form select:focus {
  outline: 2px solid rgba(221, 82, 90, 0.6);
}

.submit-btn {
  grid-column: 1 / -1;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #e6e0db;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.submit-btn:hover {
  background: rgba(221, 82, 90, 0.1);
}

.form-feedback {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-description);
}

.write-page__previews {
  display: grid;
  gap: 2rem;
}

.write-page__previews-head {
  display: grid;
  gap: 0.35rem;
}

.write-page__subheading {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  font-size: clamp(1.8rem, 4vw, 3rem);
  color: var(--color-title);
}

.write-page__subcopy {
  margin-top: 0;
}

.write-page__preview-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.write-page__preview {
  min-height: 24rem;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 1.25rem;
  align-content: start;
}

.write-page__preview-title {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  font-size: clamp(2rem, 5vw, 3.6rem);
  line-height: 0.96;
  color: var(--color-title);
}

.write-page__preview-body {
  display: grid;
  gap: 0.75rem;
}

.write-page__preview-line {
  margin: 0;
  color: var(--color-description);
  font-style: italic;
}

.write-page__preview-meta {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}

.write-page__preview-author,
.write-page__preview-link {
  color: var(--color-description);
  text-decoration: none;
}

.write-page__preview-link:hover,
.write-page__preview-author:hover {
  color: var(--color-title);
}

@media screen and (max-width: 56em) {
  .write-page {
    width: min(100vw - 2rem, 100%);
    padding-top: 5rem;
    gap: 3rem;
  }

  .write-form {
    padding: 1rem;
  }
}
</style>
