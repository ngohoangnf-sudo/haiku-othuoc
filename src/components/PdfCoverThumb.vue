<template>
  <span ref="root" class="pdf-cover-thumb">
    <img v-if="dataUrl" :src="dataUrl" :alt="alt" />
    <slot v-else />
  </span>
</template>

<script>
import { defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { renderPdfFirstPage } from "src/utils/pdfjs";

// Width of the generated thumbnail in css pixels; cards never show a cover
// wider than this, so anything larger is wasted bytes.
const THUMB_WIDTH = 420;
// Only a couple of PDFs are fetched at a time so a library page full of
// cover-less books doesn't open a request per card at once.
const MAX_CONCURRENT = 2;
// Building a cover costs a full download of the book (about twice its size in
// practice), so skip it for anything big and leave the format badge instead.
// Those books want a real cover uploaded rather than one derived per visitor.
const MAX_SOURCE_BYTES = 3 * 1024 * 1024;
const STORAGE_PREFIX = "pdf-cover:";

const cache = new Map();
const queue = [];
let active = 0;

// Covers are kept per browser, not just per session, so a return visit never
// re-downloads a book it has already rendered.
function readStored(src) {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + src) || "";
  } catch (_error) {
    return "";
  }
}

function writeStored(src, value) {
  if (!value) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + src, value);
  } catch (_error) {
    // Out of quota or storage disabled — the in-memory cache still applies.
  }
}

function runNext() {
  if (active >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  active += 1;
  job().finally(() => {
    active -= 1;
    runNext();
  });
}

function schedule(job) {
  return new Promise((resolve) => {
    queue.push(() => job().then(resolve, () => resolve("")));
    runNext();
  });
}

export default defineComponent({
  name: "PdfCoverThumb",
  props: {
    src: {
      type: String,
      required: true,
    },
    alt: {
      type: String,
      default: "",
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    const root = ref(null);
    const tooLarge = props.sizeBytes > MAX_SOURCE_BYTES;
    const dataUrl = ref(tooLarge ? "" : cache.get(props.src) ?? readStored(props.src));
    let observer = null;
    let cancelled = false;

    async function generate() {
      if (cancelled || dataUrl.value) return;
      const cached = cache.get(props.src);
      if (cached !== undefined) {
        dataUrl.value = cached;
        return;
      }

      const result = await schedule(() => renderPdfFirstPage(props.src, THUMB_WIDTH));
      // Cache failures as "" too, so a broken file isn't retried on every scroll.
      cache.set(props.src, result);
      writeStored(props.src, result);
      if (!cancelled) dataUrl.value = result;
    }

    onMounted(() => {
      if (tooLarge || dataUrl.value) return;

      // Fall back to rendering immediately if we can't observe visibility.
      if (typeof IntersectionObserver === "undefined" || !root.value) {
        generate();
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          observer = null;
          generate();
        },
        { rootMargin: "300px 0px" }
      );
      observer.observe(root.value);
    });

    onBeforeUnmount(() => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
    });

    return { root, dataUrl };
  },
});
</script>

<style scoped>
.pdf-cover-thumb {
  position: absolute;
  inset: 0;
  display: block;
}

.pdf-cover-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
