<template>
  <div class="write-page">
    <section class="write-page__composer">
      <div class="write-page__intro">
        <h1 class="write-page__heading page-reading-h2">Viết & đăng bài</h1>
        <p v-if="!canEdit" class="write-page__status page-reading-copy">
          Bạn đang ở quyền Viewer. Hãy <router-link to="/login">đăng nhập</router-link> bằng tài khoản Editor hoặc Admin để đăng và chỉnh sửa bài.
        </p>
        <p v-if="editingPostId" class="write-page__status page-reading-copy">
          Đang chỉnh sửa một bài đã đăng.
        </p>
        <p v-if="error" class="write-page__status write-page__status--error page-reading-copy">{{ error }}</p>
        <p v-else-if="loading" class="write-page__status page-reading-copy">Đang tải danh sách...</p>
      </div>

      <form v-if="canEdit" class="write-form" @submit.prevent="submitPost">
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
          <span class="form-field__label">URL ảnh (tùy chọn)</span>
          <input v-model="form.image" class="input" placeholder="https://... hoặc data URL" />
        </label>
        <label class="form-field">
          <span class="form-field__label">Tải ảnh trực tiếp (tùy chọn)</span>
          <input
            ref="imageInput"
            class="input input--file"
            type="file"
            accept="image/*"
            @change="handleImageUpload"
          />
          <span v-if="uploadedImageName" class="form-field__hint">{{ uploadedImageName }}</span>
        </label>
        <label class="form-field form-field--wide">
          <span class="form-field__label">Nội dung</span>
          <textarea
            v-model="form.linesInput"
            class="input"
            rows="4"
            placeholder="Bỏ lên chiếc quạt nhỏ
Từ Phú Sĩ gửi đi ngọn gió
Một chút quà Edo"
          ></textarea>
        </label>
        <div class="write-form__actions">
          <button class="submit-btn" type="submit">
            {{ editingPostId ? "Lưu chỉnh sửa" : "Đăng bài" }}
          </button>
          <button
            v-if="editingPostId"
            class="submit-btn submit-btn--ghost"
            type="button"
            @click="cancelEditing"
          >
            Hủy chỉnh sửa
          </button>
        </div>
        <p v-if="message" class="form-feedback page-reading-copy">{{ message }}</p>
      </form>
    </section>

    <section v-if="posts.length" class="write-page__previews">
      <div class="write-page__previews-head">
        <h2 class="write-page__subheading page-reading-h3">Bài đã đăng</h2>
        <p class="write-page__subcopy page-reading-copy">{{ posts.length }} bài hiện có trong hệ thống.</p>
      </div>

      <div class="write-page__preview-list">
        <article
          v-for="poem in posts"
          :key="poem.id"
          class="write-page__preview"
          :class="{ 'write-page__preview--active': editingPostId === poem.id }"
        >
          <h3 v-if="poem.title" class="write-page__preview-title page-reading-h3">{{ poem.title }}</h3>
          <div class="write-page__preview-body">
            <p v-for="(line, i) in poem.lines" :key="i" class="write-page__preview-line page-reading-copy">{{ line }}</p>
          </div>
          <div class="write-page__preview-meta">
            <router-link :to="'/authors/' + poem.authorSlug" class="write-page__preview-author">
              {{ poem.author }}
            </router-link>
            <router-link :to="'/post/' + poem.id" class="write-page__preview-link">
              Xem bài · {{ formatDate(poem.publishedAt) }}
            </router-link>
          </div>
          <div v-if="canEdit" class="write-page__preview-actions">
            <button class="write-page__preview-action" type="button" @click="startEditing(poem)">
              {{ editingPostId === poem.id ? "Đang sửa" : "Sửa" }}
            </button>
            <button class="write-page__preview-action write-page__preview-action--danger" type="button" @click="removePost(poem)">
              Xóa
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, onMounted, reactive, ref } from "vue";
import blogStore from "src/stores/blogStore";
import authStore from "src/stores/authStore";

const CATEGORY_OPTIONS = [
  { value: "jp", label: "Haiku Nhật" },
  { value: "vi", label: "Haiku Việt" },
  { value: "global", label: "Haiku thế giới" },
];

export default defineComponent({
  name: "WritingPage",
  setup() {
    onMounted(() => {
      authStore.ensureSession();
      blogStore.loadPosts();
    });

    const imageInput = ref(null);
    const editingPostId = ref("");
    const form = reactive({
      title: "",
      author: "",
      category: "vi",
      summary: "",
      image: "",
      linesInput: "",
    });

    const message = ref("");
    const uploadedImageName = ref("");

    const posts = computed(() => blogStore.state.posts);
    const canEdit = computed(() => authStore.canEdit());
    const categoryOptions = CATEGORY_OPTIONS;

    const resetForm = () => {
      editingPostId.value = "";
      form.title = "";
      form.author = "";
      form.category = "vi";
      form.summary = "";
      form.image = "";
      form.linesInput = "";
      uploadedImageName.value = "";

      if (imageInput.value) {
        imageInput.value.value = "";
      }
    };

    const applyPostToForm = (post) => {
      editingPostId.value = post.id;
      form.title = post.title || "";
      form.author = post.author || "";
      form.category = post.category || "vi";
      form.summary = post.summary || "";
      form.image = post.image || "";
      form.linesInput = Array.isArray(post.lines) ? post.lines.join("\n") : "";
      uploadedImageName.value = post.image ? "Đang dùng ảnh hiện tại" : "";
      message.value = `Đang chỉnh sửa bài của ${post.author}.`;

      if (imageInput.value) {
        imageInput.value.value = "";
      }
    };

    const startEditing = (post) => {
      applyPostToForm(post);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const cancelEditing = () => {
      message.value = "Đã hủy chế độ chỉnh sửa.";
      resetForm();
    };

    const readFileAsDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
        reader.readAsDataURL(file);
      });

    const handleImageUpload = async (event) => {
      const file = event.target?.files?.[0];
      if (!file) {
        uploadedImageName.value = "";
        return;
      }

      if (!file.type.startsWith("image/")) {
        message.value = "Vui lòng chọn một file ảnh hợp lệ.";
        uploadedImageName.value = "";
        event.target.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        message.value = "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 5MB.";
        uploadedImageName.value = "";
        event.target.value = "";
        return;
      }

      try {
        form.image = await readFileAsDataUrl(file);
        uploadedImageName.value = file.name;
        message.value = `Đã tải ảnh "${file.name}".`;
      } catch (err) {
        message.value = "Không đọc được file ảnh. Thử lại.";
        uploadedImageName.value = "";
        event.target.value = "";
      }
    };

    const submitPost = async () => {
      message.value = "";
      const lines = form.linesInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) {
        message.value = "Hãy nhập ít nhất một dòng haiku.";
        return;
      }

      try {
        const payload = {
          title: form.title,
          author: form.author,
          category: form.category,
          summary: form.summary,
          image: form.image,
          lines,
        };

        const post = editingPostId.value
          ? await blogStore.updatePost(editingPostId.value, payload)
          : await blogStore.addPost(payload);

        message.value = editingPostId.value
          ? `Đã cập nhật bài của ${post.author}.`
          : post.title
            ? `Đã đăng "${post.title}" của ${post.author}.`
            : `Đã đăng bài mới của ${post.author}.`;
        resetForm();
      } catch (err) {
        message.value = editingPostId.value
          ? "Không cập nhật được bài. Thử lại sau."
          : "Không đăng được bài. Thử lại sau.";
      }
    };

    const removePost = async (post) => {
      const confirmed = window.confirm(
        post.title
          ? `Xóa bài "${post.title}"?`
          : `Xóa bài của ${post.author}?`
      );
      if (!confirmed) {
        return;
      }

      try {
        await blogStore.deletePost(post.id);
        if (editingPostId.value === post.id) {
          resetForm();
        }
        message.value = post.title
          ? `Đã xóa "${post.title}".`
          : `Đã xóa bài của ${post.author}.`;
      } catch (err) {
        message.value = "Không xóa được bài. Thử lại sau.";
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
      imageInput,
      editingPostId,
      posts,
      canEdit,
      categoryOptions,
      submitPost,
      startEditing,
      cancelEditing,
      removePost,
      message,
      uploadedImageName,
      handleImageUpload,
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
  line-height: 0.96;
  color: var(--color-title);
}

.write-page__lead,
.write-page__status,
.write-page__subcopy {
  margin: 1.25rem 0 0;
  max-width: 46rem;
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

.form-field__hint {
  display: block;
  margin-top: 0.45rem;
  color: var(--color-description);
  font-size: 0.95rem;
  line-height: 1.5;
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

.input--file {
  padding: 0.65rem 0.8rem;
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
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #e6e0db;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.write-form__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.write-form__actions .submit-btn {
  min-width: 11rem;
}

.submit-btn--ghost {
  background: transparent;
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

.write-page__preview--active {
  border-color: rgba(221, 82, 90, 0.45);
  background: rgba(221, 82, 90, 0.06);
}

.write-page__preview-title {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
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
  font-size: var(--page-reading-copy-size);
  line-height: var(--page-reading-copy-line-height);
}

.write-page__preview-link:hover,
.write-page__preview-author:hover {
  color: var(--color-title);
}

.write-page__preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.write-page__preview-action {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  border-radius: 999px;
  padding: 0.55rem 0.95rem;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}

.write-page__preview-action--danger {
  border-color: rgba(221, 82, 90, 0.28);
  color: #f0b9b0;
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
