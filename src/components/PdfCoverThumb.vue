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

// Thumbnails survive navigation within the session, so going back to the
// library doesn't re-download anything.
const cache = new Map();
const queue = [];
let active = 0;

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
  },
  setup(props) {
    const root = ref(null);
    const dataUrl = ref(cache.get(props.src) || "");
    let observer = null;
    let cancelled = false;

    async function generate() {
      if (cancelled || dataUrl.value) return;
      const cached = cache.get(props.src);
      if (cached) {
        dataUrl.value = cached;
        return;
      }

      const result = await schedule(() => renderPdfFirstPage(props.src, THUMB_WIDTH));
      // Cache failures as "" too, so a broken file isn't retried on every scroll.
      cache.set(props.src, result);
      if (!cancelled) dataUrl.value = result;
    }

    onMounted(() => {
      if (dataUrl.value) return;

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
