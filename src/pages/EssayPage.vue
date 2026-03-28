<template>
  <article class="essay-page">
    <div v-if="loading && !essay" class="essay-page__state">
      <p class="page-reading-copy">Đang tải bài luận...</p>
    </div>

    <div v-else-if="essay" class="essay-page__content">
      <header class="essay-page__hero">
        <p v-if="essay.tags?.length" class="essay-page__eyebrow page-reading-copy">
          {{ essay.tags.map((tag) => tag.label).join(" · ") }}
        </p>
        <h1 class="essay-page__title page-reading-h2">{{ essay.title }}</h1>
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

      <section class="essay-page__body">
        <p
          v-for="(paragraph, index) in bodyParagraphs"
          :key="`${essay.id}-${index}`"
          class="essay-page__paragraph page-reading-copy"
        >
          {{ paragraph }}
        </p>
      </section>
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

    const bodyParagraphs = computed(() => {
      if (!essay.value?.body) return [];
      return essay.value.body
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    });

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

    return {
      essay,
      loading,
      bodyParagraphs,
      formatDate,
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
  color: rgba(177, 165, 159, 0.82);
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
  background: rgba(0, 0, 0, 0.2);
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

.essay-page__paragraph {
  margin: 0;
  color: rgba(177, 165, 159, 0.92);
  white-space: pre-line;
}

@media (max-width: 640px) {
  .essay-page {
    width: min(100vw - 2rem, 980px);
    padding-bottom: 5rem;
  }
}
</style>
