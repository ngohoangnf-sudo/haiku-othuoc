<template>
  <div class="essay-index">
    <section class="essay-index__hero">
      <h1 class="essay-index__title page-reading-h2">Nghĩ</h1>
      <p class="essay-index__lead page-reading-copy">Bài luận & ghi chép</p>
      <p v-if="error" class="essay-index__status essay-index__status--error page-reading-copy">{{ error }}</p>
      <p v-else-if="loading" class="essay-index__status page-reading-copy">Đang tải bài luận...</p>
      <p v-else class="essay-index__status page-reading-copy">{{ essays.length }} bài đang được xuất bản.</p>
    </section>

    <section v-if="essays.length" class="essay-index__list">
      <article v-for="essay in essays" :key="essay.id" class="essay-card">
        <router-link :to="`/essays/${essay.slug}`" class="essay-card__inner">
          <div v-if="essay.image" class="essay-card__cover">
            <img :src="resolveImage(essay.image)" :alt="essay.title" />
          </div>
          <div class="essay-card__body">
            <div class="essay-card__meta page-reading-copy">
              <span v-if="essay.author">{{ essay.author }}</span>
              <span v-if="essay.author && essay.publishedAt" aria-hidden="true">•</span>
              <span v-if="essay.publishedAt">{{ formatDate(essay.publishedAt) }}</span>
            </div>
            <h2 class="essay-card__title page-reading-h3">{{ essay.title }}</h2>
            <p class="essay-card__summary page-reading-copy">{{ essay.summary || excerpt(essay.body) }}</p>
            <div v-if="essay.tags?.length" class="essay-card__tags">
              <span v-for="tag in essay.tags" :key="tag.slug" class="essay-card__tag page-reading-copy">
                {{ tag.label }}
              </span>
            </div>
          </div>
        </router-link>
      </article>
    </section>

    <section v-else-if="!loading" class="essay-index__empty">
      <p class="page-reading-copy">Chưa có bài luận nào được xuất bản.</p>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, onMounted } from "vue";
import blogStore from "src/stores/blogStore";
import { resolveMediaUrl } from "src/utils/runtime";

export default defineComponent({
  name: "EssaysPage",
  setup() {
    onMounted(() => {
      blogStore.loadEssays();
    });

    const essays = computed(() => blogStore.state.essays);
    const loading = computed(() => blogStore.state.essaysLoading);
    const error = computed(() => blogStore.state.essaysError);

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

    const excerpt = (value = "") => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (normalized.length <= 180) return normalized;
      return `${normalized.slice(0, 177)}...`;
    };

    return {
      essays,
      loading,
      error,
      excerpt,
      formatDate,
      resolveImage: resolveMediaUrl,
    };
  },
});
</script>

<style scoped>
.essay-index {
  width: min(1120px, calc(100vw - 5rem));
  margin: 0 auto;
  padding: 7rem 0 8rem;
}

.essay-index__hero {
  display: grid;
  gap: 1.25rem;
  margin-bottom: 4rem;
  max-width: 52rem;
}

.essay-index__title {
  margin: 0;
  max-width: 12ch;
}

.essay-index__lead,
.essay-index__status {
  margin: 0;
  max-width: 44rem;
  color: rgba(177, 165, 159, 0.84);
}

.essay-index__status--error {
  color: #c89a93;
}

.essay-index__list {
  display: grid;
  gap: 2rem;
}

.essay-card {
  border: 1px solid rgba(177, 165, 159, 0.18);
  background: rgba(18, 18, 18, 0.16);
}

.essay-card__inner {
  display: grid;
  grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
  gap: 1.5rem;
  padding: 1.5rem;
  color: inherit;
}

.essay-card__cover {
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}

.essay-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: saturate(0.82) contrast(1.05);
}

.essay-card__body {
  display: grid;
  align-content: start;
  gap: 1rem;
  min-width: 0;
}

.essay-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  color: rgba(177, 165, 159, 0.74);
}

.essay-card__title {
  margin: 0;
  line-height: 0.98;
}

.essay-card__summary {
  margin: 0;
  color: rgba(177, 165, 159, 0.88);
}

.essay-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.essay-card__tag {
  margin: 0;
  opacity: 0.72;
}

.essay-index__empty {
  padding-top: 1rem;
}

@media (max-width: 900px) {
  .essay-card__inner {
    grid-template-columns: 1fr;
  }

  .essay-card__cover {
    max-width: 24rem;
  }
}

@media (max-width: 640px) {
  .essay-index {
    width: min(100vw - 2rem, 1120px);
    padding: 5rem 0 5rem;
  }

  .essay-index__hero {
    margin-bottom: 3rem;
  }

  .essay-card__inner {
    padding: 1.25rem;
  }
}
</style>
