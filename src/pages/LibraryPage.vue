<template>
  <div class="library-page">
    <section class="library-page__hero">
      <h1 class="library-page__title page-reading-h2 page-heading-with-rule">Thư viện</h1>
      <p class="library-page__lead page-reading-copy">
        Kho ebook về haiku và những vùng lân cận.
      </p>

      <div class="library-page__controls">
        <label class="library-page__search">
          <span class="library-page__search-icon" aria-hidden="true">⌕</span>
          <input
            v-model.trim="query"
            type="search"
            class="library-page__search-input"
            placeholder="Tìm theo tên sách, tác giả"
            aria-label="Tìm sách trong thư viện"
          />
        </label>

        <div class="library-page__format-switch" role="tablist" aria-label="Lọc theo định dạng">
          <button
            v-for="item in formatOptions"
            :key="item.value"
            type="button"
            class="library-page__format-tab"
            :class="{ 'library-page__format-tab--active': selectedFormat === item.value }"
            @click="selectedFormat = item.value"
          >
            {{ item.label }}
          </button>
        </div>

        <button v-if="canManage" type="button" class="library-page__upload-button" @click="openUploadDialog">
          + Thêm ebook
        </button>
      </div>

      <p v-if="error" class="library-page__status library-page__status--error page-reading-copy">{{ error }}</p>
      <p v-else-if="loading && !loaded" class="library-page__status page-reading-copy">Đang tải thư viện...</p>
      <p v-else class="library-page__status page-reading-copy">{{ total }} cuốn sách.</p>
    </section>

    <section v-if="books.length" class="library-page__list">
      <article v-for="book in books" :key="book.id" class="library-book-card">
        <router-link :to="`/library/${book.id}`" class="library-book-card__main">
          <div class="library-book-card__meta">
            <span class="library-book-card__format">{{ book.fileFormat.toUpperCase() }}</span>
            <span v-if="book.sizeBytes" aria-hidden="true">•</span>
            <span v-if="book.sizeBytes">{{ formatSize(book.sizeBytes) }}</span>
            <span v-if="book.createdAt" aria-hidden="true">•</span>
            <span v-if="book.createdAt">{{ formatDate(book.createdAt) }}</span>
          </div>
          <h2 class="library-book-card__title">{{ book.title }}</h2>
          <p v-if="book.authorName" class="library-book-card__author">{{ book.authorName }}</p>
          <p v-if="book.description" class="library-book-card__description">{{ book.description }}</p>
        </router-link>
        <div class="library-book-card__actions">
          <router-link :to="`/library/${book.id}`" class="library-book-card__action">Đọc</router-link>
          <a
            :href="book.fileUrl"
            class="library-book-card__action"
            target="_blank"
            rel="noopener noreferrer"
            download
          >Tải xuống</a>
          <button
            v-if="canManage"
            type="button"
            class="library-book-card__action"
            @click="openEditDialog(book)"
          >
            Sửa
          </button>
          <button
            v-if="canManage"
            type="button"
            class="library-book-card__action library-book-card__action--danger"
            :disabled="deletingId === book.id"
            @click="removeBook(book)"
          >
            {{ deletingId === book.id ? "Đang xóa..." : "Xóa" }}
          </button>
        </div>
      </article>
    </section>

    <section v-else-if="!loading" class="library-page__empty">
      <p class="page-reading-copy">
        {{ query || selectedFormat ? "Không tìm thấy sách phù hợp." : "Thư viện chưa có cuốn sách nào." }}
      </p>
    </section>

    <div class="library-page__pagination" v-if="totalPages > 1">
      <button type="button" class="library-page__page-button" :disabled="page <= 1" @click="goToPage(page - 1)">
        ← Trước
      </button>
      <span class="library-page__page-label">{{ page }} / {{ totalPages }}</span>
      <button
        type="button"
        class="library-page__page-button"
        :disabled="page >= totalPages"
        @click="goToPage(page + 1)"
      >
        Sau →
      </button>
    </div>

    <div
      v-if="uploadDialogOpen"
      class="library-upload"
      role="dialog"
      aria-modal="true"
      :aria-label="editingBook ? 'Chỉnh sửa ebook' : 'Thêm ebook'"
    >
      <div class="library-upload__backdrop" @click="closeUploadDialog"></div>
      <form class="library-upload__panel" @submit.prevent="submitUpload">
        <h2 class="library-upload__title">{{ editingBook ? "Chỉnh sửa ebook" : "Thêm ebook" }}</h2>

        <label class="library-upload__field">
          <span class="library-upload__label">
            {{ editingBook ? "Thay file ebook" : "File ebook" }} ({{ supportedFormatsLabel }})
          </span>
          <input
            ref="fileInput"
            type="file"
            class="library-upload__file"
            :accept="acceptExtensions"
            @change="onFileChange"
          />
          <span v-if="editingBook" class="library-upload__hint">
            Để trống nếu muốn giữ file hiện tại: {{ editingBook.originalName || editingBook.fileFormat.toUpperCase() }}
          </span>
        </label>

        <label class="library-upload__field">
          <span class="library-upload__label">Tên sách *</span>
          <input v-model.trim="uploadForm.title" type="text" class="library-upload__input" required />
        </label>

        <label class="library-upload__field">
          <span class="library-upload__label">Tác giả</span>
          <input v-model.trim="uploadForm.authorName" type="text" class="library-upload__input" />
        </label>

        <label class="library-upload__field">
          <span class="library-upload__label">Mô tả</span>
          <textarea v-model.trim="uploadForm.description" class="library-upload__input library-upload__textarea" rows="3"></textarea>
        </label>

        <p v-if="uploadError" class="library-page__status library-page__status--error">{{ uploadError }}</p>

        <div class="library-upload__actions">
          <button type="button" class="library-upload__button" @click="closeUploadDialog" :disabled="uploading">
            Hủy
          </button>
          <button type="submit" class="library-upload__button library-upload__button--primary" :disabled="uploading">
            {{ uploading ? "Đang lưu..." : editingBook ? "Lưu thay đổi" : "Tải lên" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, onMounted, reactive, ref, watch } from "vue";
import authStore from "src/stores/authStore";
import { API_BASE } from "src/utils/runtime";
import { uploadEbookToLibrary } from "src/utils/mediaUpload";

const FORMAT_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "pdf", label: "PDF" },
  { value: "epub", label: "EPUB" },
  { value: "mobi", label: "MOBI" },
  { value: "azw3", label: "AZW3" },
  { value: "txt", label: "TXT" },
];

export default defineComponent({
  name: "LibraryPage",
  setup() {
    const PAGE_SIZE = 12;
    const books = ref([]);
    const total = ref(0);
    const page = ref(1);
    const totalPages = ref(1);
    const loading = ref(false);
    const loaded = ref(false);
    const error = ref("");
    const query = ref("");
    const selectedFormat = ref("");
    const deletingId = ref("");

    const uploadDialogOpen = ref(false);
    const uploading = ref(false);
    const uploadError = ref("");
    const editingBook = ref(null);
    const fileInput = ref(null);
    const uploadForm = reactive({
      title: "",
      authorName: "",
      description: "",
      file: null,
    });

    let searchTimer = null;
    let requestId = 0;

    const canManage = computed(() => authStore.canEdit());
    const supportedFormatsLabel = "PDF, EPUB, MOBI, AZW3, TXT";
    const acceptExtensions = ".pdf,.epub,.mobi,.azw3,.txt";

    async function loadBooks(targetPage = 1) {
      const currentRequest = ++requestId;
      loading.value = true;
      error.value = "";

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (query.value) params.set("search", query.value);
        if (selectedFormat.value) params.set("format", selectedFormat.value);

        const response = await fetch(`${API_BASE}/library?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Không tải được danh sách sách.");
        }

        const data = await response.json();
        if (currentRequest !== requestId) return;

        books.value = Array.isArray(data.items) ? data.items : [];
        total.value = Number(data.total) || 0;
        page.value = Number(data.page) || 1;
        totalPages.value = Number(data.totalPages) || 1;
        loaded.value = true;
      } catch (err) {
        if (currentRequest !== requestId) return;
        error.value = err.message || "Không tải được thư viện.";
      } finally {
        if (currentRequest === requestId) {
          loading.value = false;
        }
      }
    }

    function goToPage(targetPage) {
      loadBooks(targetPage);
    }

    function openUploadDialog() {
      uploadError.value = "";
      editingBook.value = null;
      uploadForm.title = "";
      uploadForm.authorName = "";
      uploadForm.description = "";
      uploadForm.file = null;
      uploadDialogOpen.value = true;
    }

    function openEditDialog(book) {
      uploadError.value = "";
      editingBook.value = book;
      uploadForm.title = book.title || "";
      uploadForm.authorName = book.authorName || "";
      uploadForm.description = book.description || "";
      uploadForm.file = null;
      uploadDialogOpen.value = true;
    }

    function closeUploadDialog() {
      if (uploading.value) return;
      uploadDialogOpen.value = false;
      editingBook.value = null;
    }

    function onFileChange(event) {
      const file = event.target?.files?.[0] || null;
      uploadForm.file = file;
      if (file && !uploadForm.title) {
        uploadForm.title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      }
    }

    async function submitUpload() {
      if (!editingBook.value && !uploadForm.file) {
        uploadError.value = "Hãy chọn một file ebook.";
        return;
      }
      if (!uploadForm.title) {
        uploadError.value = "Hãy nhập tên sách.";
        return;
      }

      uploading.value = true;
      uploadError.value = "";

      try {
        const uploaded = uploadForm.file ? await uploadEbookToLibrary(uploadForm.file) : null;
        const bookId = editingBook.value?.id || "";

        const response = await fetch(
          bookId ? `${API_BASE}/library/${encodeURIComponent(bookId)}` : `${API_BASE}/library`,
          {
            method: bookId ? "PUT" : "POST",
            headers: authStore.getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              title: uploadForm.title,
              authorName: uploadForm.authorName,
              description: uploadForm.description,
              ...(uploaded
                ? {
                    fileUrl: uploaded.url,
                    fileKey: uploaded.key,
                    originalName: uploaded.fileName,
                    mimeType: uploaded.mimeType,
                    sizeBytes: uploaded.sizeBytes,
                  }
                : {}),
            }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || "Không lưu được thay đổi trong thư viện.");
        }

        uploadDialogOpen.value = false;
        editingBook.value = null;
        await loadBooks(bookId ? page.value : 1);
      } catch (err) {
        uploadError.value = err.message || "Không lưu được ebook.";
      } finally {
        uploading.value = false;
      }
    }

    async function removeBook(book) {
      if (!window.confirm(`Xóa "${book.title}" khỏi thư viện? Hành động này không thể hoàn tác.`)) {
        return;
      }

      deletingId.value = book.id;
      error.value = "";

      try {
        const response = await fetch(`${API_BASE}/library/${encodeURIComponent(book.id)}`, {
          method: "DELETE",
          headers: authStore.getAuthHeaders(),
        });

        if (!response.ok && response.status !== 204) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || "Không xóa được sách.");
        }

        await loadBooks(page.value);
      } catch (err) {
        error.value = err.message || "Không xóa được sách.";
      } finally {
        deletingId.value = "";
      }
    }

    function formatSize(bytes) {
      const size = Number(bytes) || 0;
      if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
      if (size >= 1024) return `${Math.round(size / 1024)} KB`;
      return `${size} B`;
    }

    function formatDate(value) {
      try {
        return new Date(value).toLocaleDateString("vi-VN");
      } catch (_error) {
        return "";
      }
    }

    watch([query, selectedFormat], () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadBooks(1), 250);
    });

    onMounted(async () => {
      await authStore.ensureSession();
      loadBooks(1);
    });

    return {
      books,
      total,
      page,
      totalPages,
      loading,
      loaded,
      error,
      query,
      selectedFormat,
      deletingId,
      formatOptions: FORMAT_OPTIONS,
      canManage,
      supportedFormatsLabel,
      acceptExtensions,
      uploadDialogOpen,
      uploading,
      uploadError,
      editingBook,
      uploadForm,
      fileInput,
      openUploadDialog,
      openEditDialog,
      closeUploadDialog,
      onFileChange,
      submitUpload,
      removeBook,
      goToPage,
      formatSize,
      formatDate,
    };
  },
});
</script>

<style scoped>
.library-page {
  width: min(1040px, calc(100vw - 4rem));
  margin: 0 auto;
  padding: 6rem 0 5rem;
}

.library-page__hero {
  display: grid;
  gap: 1.1rem;
  max-width: 46rem;
}

.library-page__title,
.library-page__lead,
.library-page__status {
  margin: 0;
}

.library-page__lead {
  color: var(--color-muted);
}

.library-page__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 1.5rem;
  margin-top: 0.5rem;
}

.library-page__search {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.24);
  padding-bottom: 0.35rem;
  min-width: 16rem;
}

.library-page__search-icon {
  color: var(--color-muted-faint);
}

.library-page__search-input {
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.9rem;
  width: 100%;
}

.library-page__format-switch {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
}

.library-page__format-tab {
  background: none;
  border: none;
  padding: 0.15rem 0;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  color: var(--color-muted);
  transition: color 220ms ease;
}

.library-page__format-tab:hover,
.library-page__format-tab:focus-visible {
  color: var(--color-text);
}

.library-page__format-tab--active {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 0.4em;
}

.library-page__upload-button {
  background: none;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--color-text);
  border: 1px solid rgb(var(--color-text-rgb) / 0.35);
  border-radius: 999px;
  padding: 0.35rem 1.1rem;
  transition: border-color 220ms ease, background-color 220ms ease;
}

.library-page__upload-button:hover,
.library-page__upload-button:focus-visible {
  border-color: rgb(var(--color-text-rgb) / 0.7);
  background: rgb(var(--color-text-rgb) / 0.06);
}

.library-page__status {
  color: var(--color-muted-ghost);
}

.library-page__status--error {
  color: #c89a93;
}

.library-page__list {
  margin-top: 3rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 1.5rem;
}

.library-book-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgb(var(--color-text-rgb) / 0.14);
  border-radius: 0.75rem;
  padding: 1.35rem 1.35rem 1rem;
  transition: border-color 220ms ease, transform 220ms ease;
}

.library-book-card:hover {
  border-color: rgb(var(--color-text-rgb) / 0.32);
  transform: translateY(-2px);
}

.library-book-card__main {
  text-decoration: none;
  color: inherit;
  flex: 1;
  display: grid;
  gap: 0.5rem;
  align-content: start;
}

.library-book-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--color-muted-faint);
}

.library-book-card__format {
  font-weight: 600;
  color: var(--color-muted);
}

.library-book-card__title {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.4;
  color: var(--color-text);
}

.library-book-card__author {
  margin: 0;
  font-style: italic;
  color: var(--color-muted);
  font-size: 0.95rem;
}

.library-book-card__description {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.library-book-card__actions {
  display: flex;
  gap: 1.1rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgb(var(--color-text-rgb) / 0.1);
}

.library-book-card__action {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  color: var(--color-muted);
  text-decoration: none;
  transition: color 220ms ease;
}

.library-book-card__action:hover,
.library-book-card__action:focus-visible {
  color: var(--color-text);
}

.library-book-card__action--danger:hover,
.library-book-card__action--danger:focus-visible {
  color: #c89a93;
}

.library-page__empty {
  margin-top: 3rem;
  color: var(--color-muted);
}

.library-page__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  margin-top: 2.5rem;
}

.library-page__page-button {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  color: var(--color-muted);
  transition: color 220ms ease;
}

.library-page__page-button:disabled {
  opacity: 0.35;
  cursor: default;
}

.library-page__page-button:not(:disabled):hover {
  color: var(--color-text);
}

.library-page__page-label {
  color: var(--color-muted-faint);
  font-size: 0.9rem;
}

.library-upload {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.library-upload__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(3px);
}

.library-upload__panel {
  position: relative;
  width: min(28rem, 100%);
  background: var(--color-bg);
  border: 1px solid var(--border-regular);
  border-radius: 0.9rem;
  padding: 1.75rem;
  display: grid;
  gap: 1.1rem;
  max-height: calc(100vh - 3rem);
  overflow-y: auto;
}

.library-upload__title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--color-text);
}

.library-upload__field {
  display: grid;
  gap: 0.4rem;
}

.library-upload__label {
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  color: var(--color-muted);
}

.library-upload__input {
  font: inherit;
  font-size: 0.9rem;
  color: var(--color-text);
  background: transparent;
  border: 1px solid rgb(var(--color-text-rgb) / 0.24);
  border-radius: 0.5rem;
  padding: 0.5rem 0.7rem;
  outline: none;
}

.library-upload__input:focus-visible {
  border-color: rgb(var(--color-text-rgb) / 0.5);
}

.library-upload__textarea {
  resize: vertical;
}

.library-upload__file {
  color: var(--color-muted);
  font-size: 0.82rem;
}

.library-upload__hint {
  color: var(--color-muted-faint);
  font-size: 0.78rem;
  line-height: 1.4;
}

.library-upload__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.library-upload__button {
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  background: none;
  color: var(--color-muted);
  border: 1px solid rgb(var(--color-text-rgb) / 0.3);
  border-radius: 999px;
  padding: 0.4rem 1.2rem;
  transition: color 220ms ease, border-color 220ms ease;
}

.library-upload__button:hover:not(:disabled) {
  color: var(--color-text);
  border-color: rgb(var(--color-text-rgb) / 0.6);
}

.library-upload__button--primary {
  color: var(--color-text);
  border-color: rgb(var(--color-text-rgb) / 0.55);
}

.library-upload__button:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 640px) {
  .library-page {
    width: min(100vw - 2rem, 1040px);
    padding: 4.5rem 0 3.5rem;
  }

  .library-page__list {
    grid-template-columns: 1fr;
  }
}
</style>
