<template>
  <div class="book-reader">
    <header class="book-reader__header">
      <router-link to="/library" class="book-reader__back">← Thư viện</router-link>
      <div v-if="book" class="book-reader__heading">
        <h1 class="book-reader__title">{{ book.title }}</h1>
        <p v-if="book.authorName" class="book-reader__author">{{ book.authorName }}</p>
      </div>
      <a
        v-if="book"
        :href="book.fileUrl"
        class="book-reader__download"
        target="_blank"
        rel="noopener noreferrer"
        download
      >Tải xuống ({{ book.fileFormat.toUpperCase() }})</a>
    </header>

    <p v-if="error" class="book-reader__status book-reader__status--error page-reading-copy">{{ error }}</p>
    <p v-else-if="loading" class="book-reader__status page-reading-copy">Đang tải sách...</p>

    <template v-if="book && !loading">
      <div v-if="book.fileFormat === 'pdf'" class="book-reader__frame-wrap">
        <iframe :src="book.fileUrl" class="book-reader__frame" :title="book.title"></iframe>
      </div>

      <div v-else-if="book.fileFormat === 'epub'" class="book-reader__epub">
        <p v-if="epubStatus" class="book-reader__status page-reading-copy">{{ epubStatus }}</p>
        <div ref="epubContainer" class="book-reader__epub-view"></div>
        <div v-if="epubReady" class="book-reader__epub-controls">
          <button type="button" class="book-reader__epub-button" @click="epubPrev">← Trang trước</button>
          <button type="button" class="book-reader__epub-button" @click="epubNext">Trang sau →</button>
        </div>
      </div>

      <article v-else-if="book.fileFormat === 'txt'" class="book-reader__text page-reading-copy">
        <pre class="book-reader__text-content">{{ textContent }}</pre>
      </article>

      <div v-else class="book-reader__fallback">
        <p class="page-reading-copy">
          Định dạng {{ book.fileFormat.toUpperCase() }} chưa hỗ trợ đọc trực tiếp trên web.
          Hãy tải file về và mở bằng ứng dụng đọc sách (Kindle, Calibre...).
        </p>
        <a
          :href="book.fileUrl"
          class="book-reader__download book-reader__download--big"
          target="_blank"
          rel="noopener noreferrer"
          download
        >Tải xuống</a>
      </div>
    </template>
  </div>
</template>

<script>
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { API_BASE } from "src/utils/runtime";

const EPUB_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js",
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Không tải được ${src}`)));
    document.head.appendChild(script);
  });
}

export default defineComponent({
  name: "BookReaderPage",
  setup() {
    const route = useRoute();
    const book = ref(null);
    const loading = ref(true);
    const error = ref("");
    const textContent = ref("");
    const epubContainer = ref(null);
    const epubStatus = ref("");
    const epubReady = ref(false);

    let rendition = null;
    let epubBook = null;

    function onKeydown(event) {
      if (!epubReady.value) return;
      if (event.key === "ArrowLeft") epubPrev();
      if (event.key === "ArrowRight") epubNext();
    }

    function epubPrev() {
      rendition?.prev();
    }

    function epubNext() {
      rendition?.next();
    }

    async function loadTxt(fileUrl) {
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error();
        textContent.value = await response.text();
      } catch (_error) {
        error.value = "Không đọc được nội dung file. Hãy thử tải xuống.";
      }
    }

    async function loadEpub(fileUrl) {
      epubStatus.value = "Đang chuẩn bị trình đọc EPUB...";
      try {
        for (const src of EPUB_SCRIPTS) {
          await loadScript(src);
        }

        const ePub = window.ePub;
        if (!ePub) throw new Error("Không khởi tạo được trình đọc EPUB.");

        epubBook = ePub(fileUrl);
        rendition = epubBook.renderTo(epubContainer.value, {
          width: "100%",
          height: "100%",
          spread: "auto",
        });

        await rendition.display();
        rendition.on("keydown", onKeydown);
        epubStatus.value = "";
        epubReady.value = true;
      } catch (err) {
        epubStatus.value = "";
        error.value =
          err?.message && err.message.includes("Không")
            ? err.message
            : "Không mở được file EPUB trên web. Hãy thử tải xuống.";
      }
    }

    onMounted(async () => {
      try {
        const response = await fetch(`${API_BASE}/library/${encodeURIComponent(route.params.id)}`);
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || "Không tìm thấy sách.");
        }

        book.value = await response.json();
        loading.value = false;

        if (book.value.fileFormat === "txt") {
          await loadTxt(book.value.fileUrl);
        } else if (book.value.fileFormat === "epub") {
          await nextTick();
          await loadEpub(book.value.fileUrl);
        }
      } catch (err) {
        loading.value = false;
        error.value = err.message || "Không tải được sách.";
      }

      window.addEventListener("keydown", onKeydown);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown);
      try {
        rendition?.destroy();
        epubBook?.destroy();
      } catch (_error) {
        // ignore cleanup errors
      }
    });

    return {
      book,
      loading,
      error,
      textContent,
      epubContainer,
      epubStatus,
      epubReady,
      epubPrev,
      epubNext,
    };
  },
});
</script>

<style scoped>
.book-reader {
  width: min(1100px, calc(100vw - 3rem));
  margin: 0 auto;
  padding: 5.5rem 0 4rem;
  display: grid;
  gap: 1.5rem;
}

.book-reader__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.75rem 1.75rem;
}

.book-reader__back {
  color: var(--color-muted);
  text-decoration: none;
  font-size: 0.95rem;
  transition: color 220ms ease;
}

.book-reader__back:hover {
  color: var(--color-text);
}

.book-reader__heading {
  display: grid;
  gap: 0.15rem;
  flex: 1;
  min-width: 12rem;
}

.book-reader__title {
  margin: 0;
  font-size: clamp(1.4rem, 2.4vw, 2rem);
  color: var(--color-text);
  line-height: 1.3;
}

.book-reader__author {
  margin: 0;
  font-style: italic;
  color: var(--color-muted);
}

.book-reader__download {
  color: var(--color-muted);
  text-decoration: underline;
  text-underline-offset: 0.35em;
  font-size: 0.92rem;
  transition: color 220ms ease;
}

.book-reader__download:hover {
  color: var(--color-text);
}

.book-reader__status {
  margin: 0;
  color: var(--color-muted-ghost);
}

.book-reader__status--error {
  color: #c89a93;
}

.book-reader__frame-wrap {
  height: min(78vh, 900px);
  border: 1px solid var(--border-regular);
  border-radius: 0.6rem;
  overflow: hidden;
}

.book-reader__frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

.book-reader__epub {
  display: grid;
  gap: 1rem;
}

.book-reader__epub-view {
  height: min(74vh, 860px);
  border: 1px solid var(--border-regular);
  border-radius: 0.6rem;
  background: #fdfcf8;
  overflow: hidden;
}

.book-reader__epub-controls {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
}

.book-reader__epub-button {
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  background: none;
  color: var(--color-muted);
  border: 1px solid rgb(var(--color-text-rgb) / 0.3);
  border-radius: 999px;
  padding: 0.4rem 1.3rem;
  transition: color 220ms ease, border-color 220ms ease;
}

.book-reader__epub-button:hover {
  color: var(--color-text);
  border-color: rgb(var(--color-text-rgb) / 0.6);
}

.book-reader__text {
  max-width: 44rem;
  margin: 0 auto;
}

.book-reader__text-content {
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  color: var(--color-text);
  line-height: var(--page-reading-copy-line-height);
  margin: 0;
}

.book-reader__fallback {
  display: grid;
  gap: 1.25rem;
  justify-items: start;
  max-width: 36rem;
  color: var(--color-muted);
}

.book-reader__download--big {
  font-size: 1.05rem;
}

@media (max-width: 640px) {
  .book-reader {
    width: min(100vw - 1.5rem, 1100px);
    padding: 4.5rem 0 3rem;
  }

  .book-reader__frame-wrap,
  .book-reader__epub-view {
    height: 70vh;
  }
}
</style>
