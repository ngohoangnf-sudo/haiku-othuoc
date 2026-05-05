<template>
  <div class="haiku-other-index">
    <section class="haiku-other-index__hero">
      <h1 class="haiku-other-index__title page-reading-h2 page-heading-with-rule">Haiku ≠</h1>
      <p class="haiku-other-index__lead page-reading-copy">
        Những hình thái khác của haiku: dự án, đọc lệch, và thử nghiệm cùng AI.
      </p>
      <div class="haiku-other-index__category-switch" role="tablist" aria-label="Chọn mục Haiku ≠">
        <button
          v-for="item in categoryOptions"
          :key="item.value"
          class="haiku-other-index__category-tab"
          :class="{ 'haiku-other-index__category-tab--active': selectedCategory === item.value }"
          type="button"
          @click="selectedCategory = item.value"
        >
          <span class="haiku-other-index__category-tab-label">{{ item.label }}</span>
        </button>
      </div>
      <p class="haiku-other-index__category-description page-reading-copy">
        {{ selectedCategoryDescription }}
      </p>
      <div class="haiku-other-index__controls">
        <label class="haiku-other-index__search">
          <span class="haiku-other-index__search-icon" aria-hidden="true">⌕</span>
          <input
            v-model.trim="query"
            type="search"
            class="haiku-other-index__search-input"
            placeholder="Tìm kiếm"
            aria-label="Tìm bài Haiku ≠"
          />
        </label>
      </div>
      <p v-if="error" class="haiku-other-index__status haiku-other-index__status--error page-reading-copy">{{ error }}</p>
      <p v-else-if="loading && !loaded" class="haiku-other-index__status page-reading-copy">Đang tải Haiku ≠...</p>
      <p v-else class="haiku-other-index__status page-reading-copy">{{ total }} bài phù hợp.</p>
    </section>

    <section v-if="posts.length" class="haiku-other-index__list">
      <article v-for="post in posts" :key="post.id" ref="postCards" class="haiku-other-card">
        <router-link :to="`/haiku-khac/${post.slug}`" class="haiku-other-card__inner">
          <div v-if="post.image" class="haiku-other-card__cover">
            <img :src="resolveImage(post.image)" :alt="post.title" crossorigin="anonymous" />
          </div>
          <div class="haiku-other-card__body">
            <div class="haiku-other-card__meta">
              <span>{{ formatCategory(post.category) }}</span>
              <span v-if="post.publishedAt" aria-hidden="true">•</span>
              <span v-if="post.publishedAt">{{ formatDate(post.publishedAt) }}</span>
            </div>
            <h2 class="haiku-other-card__title">{{ post.title }}</h2>
            <p class="haiku-other-card__summary">{{ post.summary || excerpt(post.body) }}</p>
          </div>
        </router-link>
      </article>
      <div
        v-if="hasMore"
        ref="loadMoreTrigger"
        class="haiku-other-index__sentinel"
        aria-hidden="true"
      ></div>
    </section>

    <section v-else-if="!loading" class="haiku-other-index__empty">
      <p class="page-reading-copy">
        {{ query ? "Không tìm thấy bài phù hợp." : "Chưa có bài nào được xuất bản trong mục này." }}
      </p>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import blogStore from "src/stores/blogStore";
import { resolveMediaUrl } from "src/utils/runtime";
import { excerptEssayContent } from "src/utils/essayContent";
import {
  HAIKU_OTHER_CATEGORIES,
  formatHaikuOtherCategory,
  normalizeHaikuOtherCategory,
} from "src/utils/haikuOther";
import {
  MOTION_PRESETS,
  animateGridEnterByRows,
  animateGridExit,
  killMotion,
} from "src/utils/motion";

export default defineComponent({
  name: "HaikuOtherPage",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const PAGE_SIZE = 6;
    const selectedCategory = ref(normalizeHaikuOtherCategory(route.query.category));
    const query = ref("");
    const posts = ref([]);
    const total = ref(0);
    const page = ref(0);
    const totalPages = ref(1);
    const loaded = ref(false);
    const loading = ref(false);
    const error = ref("");
    const postCards = ref([]);
    const loadMoreTrigger = ref(null);
    let observer = null;
    let searchTimer = null;
    let requestId = 0;

    const categoryOptions = HAIKU_OTHER_CATEGORIES;
    const selectedCategoryDescription = computed(
      () => categoryOptions.find((item) => item.value === selectedCategory.value)?.description || ""
    );
    const hasMore = computed(() => page.value < totalPages.value);

    const detachObserver = () => {
      observer?.disconnect();
      observer = null;
    };

    const attachObserver = async () => {
      if (typeof window === "undefined") {
        return;
      }

      await nextTick();
      detachObserver();

      if (!loadMoreTrigger.value || !hasMore.value) {
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            loadPostsPage();
          }
        },
        {
          rootMargin: "0px 0px 18% 0px",
          threshold: 0.05,
        }
      );
      observer.observe(loadMoreTrigger.value);
    };

    const getPostNodes = () => postCards.value || [];

    const animateBatch = async (startIndex = 0) => {
      await nextTick();
      await animateGridEnterByRows(getPostNodes().slice(startIndex), {
        columns: 1,
        ...MOTION_PRESETS.list.enter,
        rowStagger: 0.14,
        fromY: 14,
      });
    };

    const loadPostsPage = async ({ reset = false, animate = true } = {}) => {
      if (loading.value) {
        return;
      }

      const nextPage = reset ? 1 : page.value + 1;
      if (!reset && nextPage > totalPages.value) {
        return;
      }

      loading.value = true;
      error.value = "";
      const currentRequest = ++requestId;
      const startIndex = reset ? 0 : posts.value.length;

      try {
        const data = await blogStore.fetchPagedHaikuOtherPosts({
          page: nextPage,
          pageSize: PAGE_SIZE,
          category: selectedCategory.value,
          status: "published",
          search: query.value.trim(),
        });

        if (currentRequest !== requestId) {
          return;
        }

        posts.value = reset
          ? data.items
          : [...posts.value, ...data.items.filter((item) => !posts.value.some((post) => post.id === item.id))];
        total.value = data.total;
        page.value = data.page;
        totalPages.value = data.totalPages;
        loaded.value = true;

        if (animate) {
          await animateBatch(startIndex);
        }
      } catch (err) {
        if (currentRequest !== requestId) {
          return;
        }
        console.error("Không tải được Haiku ≠", err);
        error.value = "Không tải được Haiku ≠ từ máy chủ.";
      } finally {
        if (currentRequest === requestId) {
          loading.value = false;
          attachObserver();
        }
      }
    };

    const resetPosts = async () => {
      const nodes = getPostNodes();
      if (nodes.length) {
        await animateGridExit(nodes, {
          ...MOTION_PRESETS.list.exit,
          duration: 0.32,
          y: 8,
        });
      }
      posts.value = [];
      page.value = 0;
      total.value = 0;
      totalPages.value = 1;
      await loadPostsPage({ reset: true });
    };

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

    const excerpt = (value = "") => excerptEssayContent(value, 180);

    onMounted(() => loadPostsPage({ reset: true }));

    watch(selectedCategory, async () => {
      const normalized = normalizeHaikuOtherCategory(selectedCategory.value);
      if (route.query.category !== normalized) {
        router.replace({
          query: {
            ...route.query,
            category: normalized,
          },
        });
      }
      await resetPosts();
    });

    watch(
      () => route.query.category,
      (value) => {
        const normalized = normalizeHaikuOtherCategory(value);
        if (selectedCategory.value !== normalized) {
          selectedCategory.value = normalized;
        }
      }
    );

    watch(query, () => {
      if (searchTimer) {
        window.clearTimeout(searchTimer);
      }

      searchTimer = window.setTimeout(() => {
        resetPosts();
        searchTimer = null;
      }, 220);
    });

    onBeforeUnmount(() => {
      detachObserver();
      killMotion(getPostNodes());
      if (searchTimer) {
        window.clearTimeout(searchTimer);
      }
    });

    return {
      posts,
      total,
      loaded,
      loading,
      error,
      query,
      postCards,
      loadMoreTrigger,
      hasMore,
      selectedCategory,
      selectedCategoryDescription,
      categoryOptions,
      excerpt,
      formatDate,
      formatCategory: formatHaikuOtherCategory,
      resolveImage: resolveMediaUrl,
    };
  },
});
</script>

<style scoped>
.haiku-other-index {
  width: min(1120px, calc(100vw - 5rem));
  margin: 0 auto;
  padding: 7rem 0 8rem;
}

.haiku-other-index__hero {
  display: grid;
  gap: 1.15rem;
  margin-bottom: 4rem;
  max-width: 56rem;
}

.haiku-other-index__title,
.haiku-other-index__lead,
.haiku-other-index__category-description,
.haiku-other-index__status {
  margin: 0;
}

.haiku-other-index__title {
  max-width: 12ch;
}

.haiku-other-index__lead,
.haiku-other-index__category-description,
.haiku-other-index__status {
  max-width: 44rem;
  color: var(--color-muted);
}

.haiku-other-index__category-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem 1.4rem;
}

.haiku-other-index__category-tab {
  display: block;
  padding: 0.15rem 0 0.6rem;
  border: 0;
  background: transparent;
  color: var(--color-description);
  cursor: pointer;
  font: inherit;
  font-size: 1.05rem;
  text-align: left;
  transition: color 220ms ease;
}

.haiku-other-index__category-tab-label {
  position: relative;
  display: inline-block;
  padding-bottom: 0.12rem;
}

.haiku-other-index__category-tab-label::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--color-text-rgb) / 0), currentColor 18%, currentColor 82%, rgb(var(--color-text-rgb) / 0));
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.haiku-other-index__category-tab--active {
  color: var(--color-text);
}

.haiku-other-index__category-tab--active .haiku-other-index__category-tab-label::after {
  transform: scaleX(1);
}

.haiku-other-index__controls {
  max-width: 32rem;
}

.haiku-other-index__search {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.24);
}

.haiku-other-index__search-icon {
  color: var(--color-muted-faint);
  font-size: 0.95rem;
  line-height: 1;
}

.haiku-other-index__search-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.96rem;
  line-height: 1.2;
  outline: none;
}

.haiku-other-index__search-input::placeholder {
  color: var(--color-muted-ghost);
}

.haiku-other-index__status--error {
  color: #c89a93;
}

.haiku-other-index__list {
  display: grid;
  gap: 2.4rem;
}

.haiku-other-index__sentinel {
  width: 100%;
  height: 1px;
}

.haiku-other-card {
  position: relative;
}

.haiku-other-card::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1.2rem;
  height: 1px;
  background: var(--divider-gradient-soft);
}

.haiku-other-card__inner {
  display: grid;
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
  gap: 1.75rem;
  color: inherit;
}

.haiku-other-card__cover {
  aspect-ratio: 4 / 4.8;
  overflow: hidden;
  background: rgb(0 0 0 / 0.14);
}

.haiku-other-card__cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.78) contrast(1.03);
}

.haiku-other-card__body {
  display: grid;
  align-content: start;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.15rem 0 0.25rem;
}

.haiku-other-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  color: var(--color-muted-faint);
  font-size: 0.8rem;
  line-height: 1.3;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.haiku-other-card__title {
  margin: 0;
  font-size: clamp(1.7rem, 1.45rem + 0.8vw, 2.4rem);
  line-height: 0.98;
  letter-spacing: 0;
  max-width: 14ch;
}

.haiku-other-card__summary {
  margin: 0;
  font-size: 1.04rem;
  line-height: 1.65;
  color: rgb(var(--color-text-rgb) / 0.88);
  max-width: 38rem;
}

.haiku-other-index__empty {
  padding-top: 1rem;
}

@media (max-width: 900px) {
  .haiku-other-card__inner {
    grid-template-columns: 1fr;
    gap: 1.15rem;
  }

  .haiku-other-card__cover {
    max-width: 24rem;
  }
}

@media (max-width: 640px) {
  .haiku-other-index {
    width: min(100vw - 2rem, 1120px);
    padding: 5rem 0;
  }

  .haiku-other-index__hero {
    margin-bottom: 3rem;
  }

  .haiku-other-card__title {
    max-width: none;
  }
}
</style>
