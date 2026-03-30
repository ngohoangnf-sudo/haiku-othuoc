<template>
  <article class="essay-page">
    <div v-if="loading && !essay" class="essay-page__state">
      <p class="page-reading-copy">Đang tải bài luận...</p>
    </div>

    <div v-else-if="essay" class="essay-page__content">
      <header class="essay-page__hero">
        <p v-if="essay.tags?.length" class="essay-page__eyebrow page-reading-copy">
          {{ [formatKind(essay.kind), ...essay.tags.map((tag) => tag.label)].join(" · ") }}
        </p>
        <p v-else class="essay-page__eyebrow page-reading-copy">{{ formatKind(essay.kind) }}</p>
        <h1 class="essay-page__title page-reading-h2 page-heading-with-rule">{{ essay.title }}</h1>
        <p v-if="essay.summary" class="essay-page__summary page-reading-copy">{{ essay.summary }}</p>
        <div class="essay-page__meta page-reading-copy">
          <router-link
            v-if="essay.authorSlug"
            :to="`/authors/${essay.authorSlug}`"
            class="essay-page__author"
          >
            {{ essay.author }}
          </router-link>
          <span v-else-if="essay.author">{{ essay.author }}</span>
          <span v-if="essay.author && essay.publishedAt" aria-hidden="true">•</span>
          <span v-if="essay.publishedAt">{{ formatDate(essay.publishedAt) }}</span>
        </div>
      </header>

      <figure v-if="essay.image" class="essay-page__cover">
        <img :src="resolveImage(essay.image)" :alt="essay.title" />
      </figure>

      <section class="essay-page__body page-reading-copy" v-html="bodyHtml"></section>
    </div>

    <div v-else class="essay-page__state">
      <p class="page-reading-copy">Bài luận không tồn tại hoặc chưa được xuất bản.</p>
      <router-link to="/essays" class="essay-page__back page-reading-copy">Quay lại mục Nghĩ</router-link>
    </div>
  </article>
</template>

<script>
import { computed, defineComponent, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import blogStore from "src/stores/blogStore";
import { resolveMediaUrl } from "src/utils/runtime";
import { sanitizeEssayHtml } from "src/utils/essayContent";

export default defineComponent({
  name: "EssayPage",
  setup() {
    const route = useRoute();
    const essay = computed(() => blogStore.getEssayBySlug(route.params.slug));
    const loading = computed(() => blogStore.state.essaysLoading);

    const fetchCurrent = async () => {
      await blogStore.fetchEssayBySlug(route.params.slug);
    };

    onMounted(fetchCurrent);
    watch(
      () => route.params.slug,
      () => fetchCurrent()
    );

    const bodyHtml = computed(() => sanitizeEssayHtml(essay.value?.body || ""));

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

    const formatKind = (value = "") => (value === "research" ? "Nghiên cứu" : "Bình luận");

    return {
      essay,
      loading,
      bodyHtml,
      formatDate,
      formatKind,
      resolveImage: resolveMediaUrl,
    };
  },
});
</script>

<style scoped>
.essay-page {
  width: min(980px, calc(100vw - 5rem));
  margin: 0 auto;
  padding: 3rem 0 8rem;
}

.essay-page__state {
  display: grid;
  gap: 1rem;
  padding-top: 2rem;
}

.essay-page__content {
  display: grid;
  gap: 2.5rem;
}

.essay-page__hero {
  display: grid;
  gap: 1.1rem;
  max-width: 50rem;
}

.essay-page__eyebrow,
.essay-page__summary,
.essay-page__meta,
.essay-page__back {
  margin: 0;
  color: var(--color-muted);
}

.essay-page__title {
  margin: 0;
  max-width: 13ch;
}

.essay-page__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.essay-page__author {
  color: inherit;
}

.essay-page__cover {
  margin: 0;
  overflow: hidden;
  background: var(--surface-subtle-bg);
}

.essay-page__cover img {
  display: block;
  width: 100%;
  max-height: 38rem;
  object-fit: cover;
  filter: saturate(0.82) contrast(1.04);
}

.essay-page__body {
  display: grid;
  gap: 1.5rem;
  max-width: 44rem;
}

.essay-page__body :deep(p),
.essay-page__body :deep(h2),
.essay-page__body :deep(h3),
.essay-page__body :deep(blockquote),
.essay-page__body :deep(ul),
.essay-page__body :deep(hr),
.essay-page__body :deep(figure) {
  margin: 0;
}

.essay-page__body :deep(p + p),
.essay-page__body :deep(h2 + p),
.essay-page__body :deep(h3 + p),
.essay-page__body :deep(p + h2),
.essay-page__body :deep(p + h3),
.essay-page__body :deep(p + ul),
.essay-page__body :deep(ul + p),
.essay-page__body :deep(blockquote + p),
.essay-page__body :deep(img + p) {
  margin-top: 1.15rem;
}

.essay-page__body :deep(h2),
.essay-page__body :deep(h3) {
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  color: var(--color-title);
  line-height: 1.1;
}

.essay-page__body :deep(h2) {
  font-size: 1.8rem;
}

.essay-page__body :deep(h3) {
  font-size: 1.4rem;
}

.essay-page__body :deep(ul) {
  padding-left: 1.3rem;
}

.essay-page__body :deep(blockquote) {
  padding-left: 1rem;
  border-left: 1px solid var(--border-regular);
  color: var(--color-description);
}

.essay-page__body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border-soft);
}

.essay-page__body :deep(img) {
  display: block;
  width: min(100%, 42rem);
  margin: 1.2rem 0;
  border-radius: 16px;
}

@media (max-width: 640px) {
  .essay-page {
    width: min(100vw - 2rem, 980px);
    padding-bottom: 5rem;
  }
}
</style>
