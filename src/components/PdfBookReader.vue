<template>
  <section class="pdf-reader" :aria-busy="loading || Boolean(status)">
    <p v-if="loading || status" class="pdf-reader__status page-reading-copy" aria-live="polite">
      {{ status || "Đang chuẩn bị trình đọc PDF..." }}
    </p>

    <div v-if="ready" class="pdf-reader__controls" aria-label="Điều khiển PDF">
      <button
        type="button"
        class="pdf-reader__control"
        :disabled="pageNumber <= 1 || Boolean(status)"
        @click="changePage(-1)"
      >
        ← Trang trước
      </button>

      <span class="pdf-reader__page">{{ pageNumber }} / {{ pageCount }}</span>

      <button
        type="button"
        class="pdf-reader__control"
        :disabled="pageNumber >= pageCount || Boolean(status)"
        @click="changePage(1)"
      >
        Trang sau →
      </button>

      <span class="pdf-reader__separator" aria-hidden="true"></span>

      <button
        type="button"
        class="pdf-reader__control pdf-reader__control--zoom"
        :disabled="zoom <= MIN_ZOOM || Boolean(status)"
        aria-label="Thu nhỏ"
        @click="changeZoom(-ZOOM_STEP)"
      >
        −
      </button>
      <span class="pdf-reader__zoom">{{ Math.round(zoom * 100) }}%</span>
      <button
        type="button"
        class="pdf-reader__control pdf-reader__control--zoom"
        :disabled="zoom >= MAX_ZOOM || Boolean(status)"
        aria-label="Phóng to"
        @click="changeZoom(ZOOM_STEP)"
      >
        +
      </button>
    </div>

    <div v-show="ready && !error" ref="viewport" class="pdf-reader__viewport">
      <canvas
        ref="canvas"
        class="pdf-reader__canvas"
        role="img"
        :aria-label="`${title}, trang ${pageNumber} trên ${pageCount}`"
      ></canvas>
    </div>

    <div v-if="error" class="pdf-reader__fallback">
      <p class="page-reading-copy">{{ error }}</p>
      <a :href="src" target="_blank" rel="noopener noreferrer" class="pdf-reader__open">
        Mở PDF trong trình duyệt
      </a>
    </div>
  </section>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;
const MAX_PIXEL_RATIO = 2;
const MAX_CANVAS_DIMENSION = 4096;
const MAX_CANVAS_PIXELS = 16_000_000;

export default defineComponent({
  name: "PdfBookReader",
  props: {
    src: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "PDF",
    },
  },
  setup(props) {
    const viewport = ref(null);
    const canvas = ref(null);
    const loading = ref(true);
    const status = ref("Đang chuẩn bị trình đọc PDF...");
    const error = ref("");
    const pageNumber = ref(1);
    const pageCount = ref(0);
    const zoom = ref(1);
    const ready = computed(() => pageCount.value > 0);

    let pdfDocument = null;
    let loadingTask = null;
    let renderTask = null;
    let resizeObserver = null;
    let resizeTimer = null;
    let renderSequence = 0;
    let previousWidth = 0;

    function getAvailableWidth() {
      const element = viewport.value;
      if (!element) return 0;

      const styles = window.getComputedStyle(element);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      return Math.max(1, element.clientWidth - horizontalPadding);
    }

    async function renderPage() {
      if (!pdfDocument || !canvas.value || !viewport.value) return;

      const sequence = ++renderSequence;
      renderTask?.cancel();
      status.value = `Đang tải trang ${pageNumber.value}...`;
      error.value = "";
      let page = null;

      try {
        page = await pdfDocument.getPage(pageNumber.value);
        if (sequence !== renderSequence) return;

        const initialViewport = page.getViewport({ scale: 1 });
        const fitScale = getAvailableWidth() / initialViewport.width;
        const pageViewport = page.getViewport({ scale: fitScale * zoom.value });
        const maxDimensionScale =
          MAX_CANVAS_DIMENSION / Math.max(pageViewport.width, pageViewport.height);
        const maxPixelScale = Math.sqrt(
          MAX_CANVAS_PIXELS / (pageViewport.width * pageViewport.height)
        );
        const outputScale = Math.max(
          0.1,
          Math.min(
            window.devicePixelRatio || 1,
            MAX_PIXEL_RATIO,
            maxDimensionScale,
            maxPixelScale
          )
        );
        const context = canvas.value.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("Không khởi tạo được vùng hiển thị PDF.");
        }

        canvas.value.width = Math.max(1, Math.floor(pageViewport.width * outputScale));
        canvas.value.height = Math.max(1, Math.floor(pageViewport.height * outputScale));
        canvas.value.style.width = `${Math.floor(pageViewport.width)}px`;
        canvas.value.style.height = `${Math.floor(pageViewport.height)}px`;

        renderTask = page.render({
          canvasContext: context,
          viewport: pageViewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;

        if (sequence === renderSequence) {
          status.value = "";
        }
      } catch (err) {
        if (err?.name === "RenderingCancelledException" || sequence !== renderSequence) return;
        status.value = "";
        error.value =
          err?.message && err.message.startsWith("Không")
            ? err.message
            : "Không render được PDF. Có thể file hoặc cấu hình CORS của media server chưa hợp lệ.";
      } finally {
        page?.cleanup();
      }
    }

    async function changePage(offset) {
      const nextPage = Math.min(pageCount.value, Math.max(1, pageNumber.value + offset));
      if (nextPage === pageNumber.value) return;

      pageNumber.value = nextPage;
      viewport.value?.scrollTo({ top: 0, left: 0 });
      await renderPage();
    }

    async function changeZoom(offset) {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value + offset));
      if (nextZoom === zoom.value) return;

      zoom.value = nextZoom;
      await renderPage();
    }

    function onKeydown(event) {
      if (!ready.value || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") changePage(-1);
      if (event.key === "ArrowRight") changePage(1);
    }

    function observeWidth() {
      if (!viewport.value || typeof ResizeObserver === "undefined") return;

      resizeObserver = new ResizeObserver(([entry]) => {
        const width = Math.round(entry?.contentRect?.width || 0);
        if (!width || width === previousWidth) return;
        previousWidth = width;

        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => renderPage(), 120);
      });
      resizeObserver.observe(viewport.value);
    }

    async function loadPdf() {
      try {
        const [pdfjs, workerModule] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
        ]);

        pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
        loadingTask = pdfjs.getDocument({ url: props.src });
        pdfDocument = await loadingTask.promise;
        pageCount.value = pdfDocument.numPages;
        loading.value = false;

        await nextTick();
        observeWidth();
        await renderPage();
      } catch (_error) {
        loading.value = false;
        status.value = "";
        error.value =
          "Không tải được PDF trong trình đọc. Hãy thử mở trực tiếp hoặc kiểm tra CORS của media server.";
      }
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown);
      loadPdf();
    });

    onBeforeUnmount(() => {
      renderSequence += 1;
      window.removeEventListener("keydown", onKeydown);
      window.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      renderTask?.cancel();
      if (pdfDocument) {
        pdfDocument.destroy();
      } else {
        loadingTask?.destroy();
      }
    });

    return {
      MIN_ZOOM,
      MAX_ZOOM,
      ZOOM_STEP,
      viewport,
      canvas,
      loading,
      status,
      error,
      pageNumber,
      pageCount,
      zoom,
      ready,
      changePage,
      changeZoom,
    };
  },
});
</script>

<style scoped>
.pdf-reader {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.pdf-reader__status {
  margin: 0;
  color: var(--color-muted-ghost);
}

.pdf-reader__controls {
  position: sticky;
  top: 4.75rem;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 1rem;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 0.55rem 0.9rem;
  background: var(--surface-panel-bg);
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.14);
  backdrop-filter: blur(12px);
}

.pdf-reader__control {
  border: none;
  background: none;
  color: var(--color-muted);
  padding: 0.2rem 0;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.pdf-reader__control:hover:not(:disabled),
.pdf-reader__control:focus-visible {
  color: var(--color-text);
}

.pdf-reader__control:disabled {
  opacity: 0.35;
  cursor: default;
}

.pdf-reader__control--zoom {
  min-width: 1.25rem;
  font-size: 1rem;
}

.pdf-reader__page,
.pdf-reader__zoom {
  color: var(--color-muted-faint);
  font-size: 0.8rem;
  white-space: nowrap;
}

.pdf-reader__separator {
  width: 1px;
  height: 1rem;
  background: rgb(var(--color-text-rgb) / 0.18);
}

.pdf-reader__viewport {
  min-width: 0;
  overflow: auto;
  padding: clamp(0.45rem, 2vw, 1.25rem);
  background: rgb(var(--color-text-rgb) / 0.045);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.pdf-reader__canvas {
  display: block;
  max-width: none;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 0.7rem 2.4rem rgb(0 0 0 / 0.13);
}

.pdf-reader__fallback {
  display: grid;
  gap: 0.75rem;
  justify-items: start;
  color: var(--color-muted);
}

.pdf-reader__fallback p {
  margin: 0;
}

.pdf-reader__open {
  color: var(--color-text);
  text-underline-offset: 0.3em;
}

@media (max-width: 640px) {
  .pdf-reader__controls {
    top: 4.25rem;
    gap: 0.4rem 0.75rem;
    width: 100%;
    padding-inline: 0.45rem;
  }

  .pdf-reader__separator {
    display: none;
  }

  .pdf-reader__viewport {
    margin-inline: -0.75rem;
  }
}
</style>
