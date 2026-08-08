<template>
  <section class="pdf-reader" :aria-busy="loading || Boolean(status)">
    <p v-if="loading || status" class="pdf-reader__status page-reading-copy" aria-live="polite">
      {{ status || "Đang chuẩn bị trình đọc PDF..." }}
    </p>

    <div v-if="ready && !error" class="pdf-reader__controls" aria-label="Điều khiển PDF">
      <span class="pdf-reader__page">Trang {{ currentPage }} / {{ pageCount }}</span>

      <span class="pdf-reader__separator" aria-hidden="true"></span>

      <button
        type="button"
        class="pdf-reader__control pdf-reader__control--zoom"
        :disabled="zoom <= MIN_ZOOM"
        aria-label="Thu nhỏ"
        @click="changeZoom(-ZOOM_STEP)"
      >
        −
      </button>
      <span class="pdf-reader__zoom">{{ Math.round(zoom * 100) }}%</span>
      <button
        type="button"
        class="pdf-reader__control pdf-reader__control--zoom"
        :disabled="zoom >= MAX_ZOOM"
        aria-label="Phóng to"
        @click="changeZoom(ZOOM_STEP)"
      >
        +
      </button>
      <button
        v-if="zoom !== 1"
        type="button"
        class="pdf-reader__control pdf-reader__control--reset"
        @click="resetZoom"
      >
        Vừa khung
      </button>
    </div>

    <div v-show="ready && !error" ref="scroller" class="pdf-reader__scroller">
      <div ref="pagesEl" class="pdf-reader__pages"></div>
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
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const MAX_PAGE_WIDTH = 860; // css px – comfortable reading column on desktop
const MAX_PIXEL_RATIO = 2;
const MAX_CANVAS_PIXELS = 16_000_000;
// Render / keep pages within this vertical distance of the viewport.
const RENDER_MARGIN = "1400px";

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
    const scroller = ref(null);
    const pagesEl = ref(null);
    const loading = ref(true);
    const status = ref("Đang chuẩn bị trình đọc PDF...");
    const error = ref("");
    const ready = ref(false);
    const pageCount = ref(0);
    const currentPage = ref(1);
    const zoom = ref(1);

    let pdfjs = null;
    let pdfDocument = null;
    let loadingTask = null;
    let renderObserver = null;
    let resizeObserver = null;
    let resizeTimer = null;
    let scrollFrame = 0;

    // Per-page bookkeeping. states[i] -> descriptor for page i + 1.
    const states = [];
    const pageCache = new Map();

    function getPage(num) {
      let promise = pageCache.get(num);
      if (!promise) {
        promise = pdfDocument.getPage(num);
        pageCache.set(num, promise);
      }
      return promise;
    }

    function getAvailableWidth() {
      const element = pagesEl.value;
      if (!element || !element.clientWidth) return 0;
      const styles = window.getComputedStyle(element);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      return Math.max(1, element.clientWidth - horizontalPadding);
    }

    function getBaseFitWidth() {
      // Fall back to a sane width if the container hasn't been laid out yet
      // (width 0). The ResizeObserver re-renders once the real width is known.
      const available = getAvailableWidth() || MAX_PAGE_WIDTH;
      return Math.min(available, MAX_PAGE_WIDTH);
    }

    // Size (and set the css scale on) a page wrapper so it reserves the
    // correct space before its canvas is rendered.
    function layoutPage(state) {
      const displayWidth = getBaseFitWidth() * zoom.value;
      const cssScale = displayWidth / state.baseW;
      state.displayWidth = displayWidth;
      state.el.style.width = `${Math.floor(displayWidth)}px`;
      state.el.style.height = `${Math.round(displayWidth * (state.baseH / state.baseW))}px`;
      state.el.style.setProperty("--scale-factor", String(cssScale));
      return cssScale;
    }

    function computeOutputScale(viewport) {
      const maxPixelScale = Math.sqrt(
        MAX_CANVAS_PIXELS / (viewport.width * viewport.height)
      );
      return Math.max(
        0.1,
        Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, maxPixelScale)
      );
    }

    async function renderPage(state) {
      if (state.rendered || state.rendering || !pdfDocument) return;
      state.rendering = true;
      const seq = ++state.seq;

      try {
        const page = await getPage(state.num);
        if (seq !== state.seq) return;

        // Correct the reserved size once we know the real page dimensions.
        const base = page.getViewport({ scale: 1 });
        state.baseW = base.width;
        state.baseH = base.height;
        const cssScale = layoutPage(state);

        const viewport = page.getViewport({ scale: cssScale });
        const outputScale = computeOutputScale(viewport);

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page__canvas";
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("no-2d-context");

        state.renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await state.renderTask.promise;
        if (seq !== state.seq) return;

        // Selectable text overlay, positioned on top of the canvas.
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        const textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        });
        await textLayer.render();
        if (seq !== state.seq) {
          textLayer.cancel?.();
          return;
        }

        state.el.replaceChildren(canvas, textDiv);
        state.canvas = canvas;
        state.textLayer = textLayer;
        state.rendered = true;
      } catch (err) {
        if (err?.name === "RenderingCancelledException" || seq !== state.seq) return;
        // Leave the placeholder in place; a single failed page shouldn't break the book.
      } finally {
        state.rendering = false;
      }
    }

    function teardownPage(state) {
      state.seq += 1;
      state.rendering = false;
      try {
        state.renderTask?.cancel();
      } catch (_error) {
        // ignore
      }
      state.renderTask = null;
      try {
        state.textLayer?.cancel?.();
      } catch (_error) {
        // ignore
      }
      state.textLayer = null;
      if (state.canvas) {
        state.canvas.width = 0;
        state.canvas.height = 0;
        state.canvas = null;
      }
      state.el.replaceChildren();
      state.rendered = false;
    }

    function updateCurrentPage() {
      const target = window.innerHeight / 2;
      let best = currentPage.value;
      let bestDistance = Infinity;
      for (const state of states) {
        const rect = state.el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = state.num;
        }
      }
      if (best !== currentPage.value) currentPage.value = best;
    }

    function onScroll() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        updateCurrentPage();
      });
    }

    function onKeydown(event) {
      if (!ready.value || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = Math.min(pageCount.value, Math.max(1, currentPage.value + delta));
        const state = states[next - 1];
        if (state) {
          event.preventDefault();
          state.el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }

    function relayoutAll() {
      const anchor = currentPage.value;
      for (const state of states) {
        // Re-render at the new scale for crispness.
        teardownPage(state);
        layoutPage(state);
        renderObserver?.observe(state.el);
      }
      // Keep the reader anchored to the page the user was on.
      nextTick(() => {
        states[anchor - 1]?.el.scrollIntoView({ block: "start" });
      });
    }

    async function changeZoom(offset) {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((zoom.value + offset).toFixed(2))));
      if (next === zoom.value) return;
      zoom.value = next;
      relayoutAll();
    }

    function resetZoom() {
      if (zoom.value === 1) return;
      zoom.value = 1;
      relayoutAll();
    }

    function buildPages(firstBase) {
      const fragment = document.createDocumentFragment();
      for (let num = 1; num <= pageCount.value; num += 1) {
        const el = document.createElement("div");
        el.className = "pdf-page";
        el.dataset.page = String(num);
        const state = {
          num,
          el,
          baseW: firstBase.width,
          baseH: firstBase.height,
          displayWidth: 0,
          canvas: null,
          textLayer: null,
          renderTask: null,
          rendered: false,
          rendering: false,
          seq: 0,
        };
        layoutPage(state);
        states.push(state);
        fragment.appendChild(el);
      }
      pagesEl.value.appendChild(fragment);
    }

    function observePages() {
      renderObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const num = Number(entry.target.dataset.page);
            const state = states[num - 1];
            if (!state) continue;
            if (entry.isIntersecting) {
              renderPage(state);
            } else {
              teardownPage(state);
            }
          }
        },
        { root: null, rootMargin: `${RENDER_MARGIN} 0px`, threshold: 0 }
      );
      for (const state of states) renderObserver.observe(state.el);
    }

    function observeResize() {
      if (typeof ResizeObserver === "undefined") return;
      let previousWidth = getAvailableWidth();
      resizeObserver = new ResizeObserver(() => {
        const width = getAvailableWidth();
        if (Math.abs(width - previousWidth) < 1) return;
        previousWidth = width;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => relayoutAll(), 150);
      });
      resizeObserver.observe(pagesEl.value);
    }

    async function loadPdf() {
      try {
        const [pdfModule, workerModule] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs = pdfModule;
        pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

        loadingTask = pdfjs.getDocument({ url: props.src });
        pdfDocument = await loadingTask.promise;
        pageCount.value = pdfDocument.numPages;

        const firstPage = await getPage(1);
        const firstBase = firstPage.getViewport({ scale: 1 });

        loading.value = false;
        status.value = "";
        ready.value = true;

        await nextTick();
        buildPages(firstBase);
        observePages();
        observeResize();
        updateCurrentPage();
      } catch (_error) {
        loading.value = false;
        status.value = "";
        ready.value = false;
        error.value =
          "Không tải được PDF trong trình đọc. Hãy thử mở trực tiếp hoặc kiểm tra CORS của media server.";
      }
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown);
      window.addEventListener("scroll", onScroll, { passive: true });
      loadPdf();
    });

    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(resizeTimer);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      renderObserver?.disconnect();
      resizeObserver?.disconnect();
      for (const state of states) teardownPage(state);
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
      scroller,
      pagesEl,
      loading,
      status,
      error,
      ready,
      pageCount,
      currentPage,
      zoom,
      changeZoom,
      resetZoom,
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
  z-index: 3;
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

.pdf-reader__control--reset {
  font-size: 0.8rem;
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

.pdf-reader__scroller {
  min-width: 0;
  overflow-x: auto;
  overflow-y: visible;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.pdf-reader__pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  padding: clamp(0.45rem, 2vw, 1.25rem) 0;
  width: 100%;
  min-width: min-content;
}

/* Page wrapper + pdf.js text-layer support. Elements below are created
   imperatively, so :deep is required for the scoped styles to reach them. */
.pdf-reader__pages :deep(.pdf-page) {
  --user-unit: 1;
  --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
  --scale-round-x: 1px;
  --scale-round-y: 1px;
  position: relative;
  flex: 0 0 auto;
  background: #fff;
  box-shadow: 0 0.7rem 2.4rem rgb(0 0 0 / 0.13);
}

.pdf-reader__pages :deep(.pdf-page__canvas) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.pdf-reader__pages :deep(.textLayer) {
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 1;
}

.pdf-reader__pages :deep(.textLayer :is(span, br)) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}

.pdf-reader__pages :deep(.textLayer > :not(.markedContent)),
.pdf-reader__pages :deep(.textLayer .markedContent span:not(.markedContent)) {
  z-index: 1;
}

.pdf-reader__pages :deep(.textLayer span.markedContent) {
  top: 0;
  height: 0;
}

.pdf-reader__pages :deep(.textLayer span[role="img"]) {
  user-select: none;
  cursor: default;
}

.pdf-reader__pages :deep(.textLayer ::selection) {
  background: rgb(90 130 210 / 0.35);
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

  .pdf-reader__pages {
    gap: 0.75rem;
  }
}
</style>
