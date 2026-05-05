<template>
  <article class="haiku-other-page">
    <div v-if="loading && !post" class="haiku-other-page__state">
      <p class="page-reading-copy">Đang tải Haiku ≠...</p>
    </div>

    <div v-else-if="post" class="haiku-other-page__content">
      <header class="haiku-other-page__hero">
        <p class="haiku-other-page__eyebrow page-reading-copy">{{ formatCategory(post.category) }}</p>
        <h1 class="haiku-other-page__title page-reading-h2 page-heading-with-rule">{{ post.title }}</h1>
        <p v-if="post.summary" class="haiku-other-page__summary page-reading-copy">{{ post.summary }}</p>
        <p v-if="post.publishedAt" class="haiku-other-page__meta page-reading-copy">{{ formatDate(post.publishedAt) }}</p>
      </header>

      <figure v-if="post.image" class="haiku-other-page__cover">
        <img :src="resolveImage(post.image)" :alt="post.title" crossorigin="anonymous" />
      </figure>

      <section class="haiku-other-page__body page-reading-copy" v-html="bodyHtml"></section>
    </div>

    <div v-else class="haiku-other-page__state">
      <p class="page-reading-copy">Bài Haiku ≠ không tồn tại hoặc chưa được xuất bản.</p>
      <router-link to="/haiku-khac" class="haiku-other-page__back page-reading-copy">Quay lại Haiku ≠</router-link>
    </div>
  </article>
</template>

<script>
import { computed, defineComponent, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import blogStore from "src/stores/blogStore";
import { resolveMediaUrl } from "src/utils/runtime";
import { sanitizeHaikuOtherHtml } from "src/utils/essayContent";
import { formatHaikuOtherCategory } from "src/utils/haikuOther";

export default defineComponent({
  name: "HaikuOtherPostPage",
  setup() {
    const route = useRoute();
    const post = computed(() =>
      blogStore.state.haikuOtherPosts.find((item) => item.slug === route.params.slug)
    );
    const loading = ref(false);

    const fetchCurrent = async () => {
      loading.value = true;
      try {
        await blogStore.fetchHaikuOtherPostBySlug(route.params.slug);
      } finally {
        loading.value = false;
      }
    };

    onMounted(fetchCurrent);
    watch(
      () => route.params.slug,
      () => fetchCurrent()
    );

    const bodyHtml = computed(() => sanitizeHaikuOtherHtml(post.value?.body || ""));

    const formatDate = (value) => {
      if (!value) return "";
      try {
        return new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(value));
      } catch (_error) {
        return value;
      }
    };

    return {
      post,
      loading,
      bodyHtml,
      formatDate,
      formatCategory: formatHaikuOtherCategory,
      resolveImage: resolveMediaUrl,
    };
  },
});
</script>

<style scoped>
.haiku-other-page {
  width: min(980px, calc(100vw - 5rem));
  margin: 0 auto;
  padding: 3rem 0 8rem;
}

.haiku-other-page__state {
  display: grid;
  gap: 1rem;
  padding-top: 2rem;
}

.haiku-other-page__content {
  display: grid;
  gap: 2.5rem;
}

.haiku-other-page__hero {
  display: grid;
  gap: 1.1rem;
  max-width: 50rem;
}

.haiku-other-page__eyebrow,
.haiku-other-page__summary,
.haiku-other-page__meta,
.haiku-other-page__back {
  margin: 0;
  color: var(--color-muted);
}

.haiku-other-page__eyebrow {
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.haiku-other-page__title {
  margin: 0;
  max-width: 13ch;
}

.haiku-other-page__cover {
  margin: 0;
  background: var(--surface-subtle-bg);
}

.haiku-other-page__cover img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  filter: saturate(0.82) contrast(1.04);
}

.haiku-other-page__body {
  display: grid;
  gap: 1.5rem;
  max-width: 44rem;
}

.haiku-other-page__body :deep(p),
.haiku-other-page__body :deep(h2),
.haiku-other-page__body :deep(h3),
.haiku-other-page__body :deep(blockquote),
.haiku-other-page__body :deep(ul),
.haiku-other-page__body :deep(hr),
.haiku-other-page__body :deep(figure) {
  margin: 0;
}

.haiku-other-page__body :deep(p + p),
.haiku-other-page__body :deep(h2 + p),
.haiku-other-page__body :deep(h3 + p),
.haiku-other-page__body :deep(p + h2),
.haiku-other-page__body :deep(p + h3),
.haiku-other-page__body :deep(p + ul),
.haiku-other-page__body :deep(ul + p),
.haiku-other-page__body :deep(blockquote + p),
.haiku-other-page__body :deep(img + p),
.haiku-other-page__body :deep(iframe + p) {
  margin-top: 1.15rem;
}

.haiku-other-page__body :deep(h2),
.haiku-other-page__body :deep(h3) {
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  color: var(--color-title);
  line-height: 1.1;
}

.haiku-other-page__body :deep(h2) {
  font-size: 1.8rem;
}

.haiku-other-page__body :deep(h3) {
  font-size: 1.4rem;
}

.haiku-other-page__body :deep(ul) {
  padding-left: 1.3rem;
}

.haiku-other-page__body :deep(blockquote) {
  padding-left: 1rem;
  border-left: 1px solid var(--border-regular);
  color: var(--color-description);
}

.haiku-other-page__body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border-soft);
}

.haiku-other-page__body :deep(a) {
  color: var(--color-title);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

.haiku-other-page__body :deep(img),
.haiku-other-page__body :deep(iframe) {
  display: block;
  width: min(100%, 42rem);
  max-width: 100%;
  margin: 1.2rem 0;
}

.haiku-other-page__body :deep(img) {
  height: auto;
  object-fit: contain;
}

.haiku-other-page__body :deep(.essay-embed-frame) {
  display: block;
  width: min(100%, 46rem);
  max-width: 100%;
  margin: 1.6rem 0;
  padding: clamp(0.45rem, 1.3vw, 0.85rem);
  border: 1px solid rgb(var(--color-title-rgb) / 0.12);
  background:
    radial-gradient(circle at 12% 8%, rgb(var(--color-title-rgb) / 0.1), transparent 34%),
    linear-gradient(145deg, rgb(var(--color-title-rgb) / 0.06), transparent 48%),
    var(--surface-subtle-bg);
  box-shadow: 0 22px 54px rgb(0 0 0 / 0.13);
}

.haiku-other-page__body :deep(iframe) {
  aspect-ratio: 16 / 9;
  height: auto;
  min-height: 16rem;
  border: 0;
  background: #000;
  box-shadow:
    0 0 0 1px rgb(var(--color-title-rgb) / 0.12),
    0 18px 38px rgb(0 0 0 / 0.13);
}

.haiku-other-page__body :deep(.essay-embed-frame iframe) {
  width: 100%;
  margin: 0;
  box-shadow: none;
}

@media (max-width: 640px) {
  .haiku-other-page {
    width: min(100vw - 2rem, 980px);
    padding-bottom: 5rem;
  }

  .haiku-other-page__body :deep(.essay-embed-frame) {
    padding: 0.35rem;
  }

  .haiku-other-page__body :deep(iframe) {
    min-height: 12rem;
  }
}
</style>
