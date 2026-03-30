<template>
  <div class="essay-index">
    <section class="essay-index__hero">
      <h1 class="essay-index__title page-reading-h2 page-heading-with-rule">Nghĩ</h1>
      <p class="essay-index__lead page-reading-copy">Nghiên cứu & bình luận</p>
      <div class="essay-index__kind-switch" role="tablist" aria-label="Chọn mục của trang Nghĩ">
        <button
          class="essay-index__kind-tab"
          :class="{ 'essay-index__kind-tab--active': selectedKind === 'research' }"
          type="button"
          @click="selectedKind = 'research'"
        >
          <span class="essay-index__kind-tab-label">Nghiên cứu</span>
        </button>
        <button
          class="essay-index__kind-tab"
          :class="{ 'essay-index__kind-tab--active': selectedKind === 'commentary' }"
          type="button"
          @click="selectedKind = 'commentary'"
        >
          <span class="essay-index__kind-tab-label">Bình luận</span>
        </button>
      </div>
      <div class="essay-index__controls">
        <label class="essay-index__search">
          <span class="essay-index__search-icon" aria-hidden="true">⌕</span>
          <input
            v-model.trim="essayQuery"
            type="search"
            class="essay-index__search-input"
            placeholder="Tìm kiếm"
            aria-label="Tìm bài luận"
          />
        </label>
        <label class="essay-index__filter">
          <span class="essay-index__filter-label">Tag</span>
          <ElegantSelect
            v-model="selectedTagSlug"
            class="essay-index__filter-select"
            :options="tagOptions"
            aria-label="Lọc theo tag"
          />
        </label>
      </div>
      <p v-if="error" class="essay-index__status essay-index__status--error page-reading-copy">{{ error }}</p>
      <p v-else-if="loading && !essaysLoaded" class="essay-index__status page-reading-copy">Đang tải bài luận...</p>
      <p v-else class="essay-index__status page-reading-copy">{{ totalEssays }} bài phù hợp.</p>
    </section>

    <div ref="essayContentRegion" class="essay-index__content-region">
      <section v-if="essays.length" class="essay-index__list">
        <article v-for="essay in essays" :key="essay.id" ref="essayCards" class="essay-card">
          <router-link :to="`/essays/${essay.slug}`" class="essay-card__inner">
            <div v-if="essay.image" class="essay-card__cover">
              <img :src="resolveImage(essay.image)" :alt="essay.title" />
            </div>
            <div class="essay-card__body">
              <div class="essay-card__meta">
                <span>{{ formatKind(essay.kind) }}</span>
                <span aria-hidden="true">•</span>
                <span v-if="essay.author">{{ essay.author }}</span>
                <span v-if="essay.author && essay.publishedAt" aria-hidden="true">•</span>
                <span v-if="essay.publishedAt">{{ formatDate(essay.publishedAt) }}</span>
              </div>
              <h2 class="essay-card__title">{{ essay.title }}</h2>
              <p class="essay-card__summary">{{ essay.summary || excerpt(essay.body) }}</p>
              <div v-if="essay.tags?.length" class="essay-card__tags">
                <span v-for="tag in essay.tags" :key="tag.slug" class="essay-card__tag">
                  {{ tag.label }}
                </span>
              </div>
            </div>
          </router-link>
        </article>
        <div
          v-if="hasMoreEssays"
          ref="essayLoadMoreTrigger"
          class="essay-index__sentinel"
          aria-hidden="true"
        ></div>
      </section>

      <section v-else-if="!loading" class="essay-index__empty">
        <p class="page-reading-copy">
          {{ hasFilters ? "Không tìm thấy bài luận phù hợp." : "Chưa có bài luận nào được xuất bản." }}
        </p>
      </section>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ElegantSelect from "components/ElegantSelect.vue";
import blogStore from "src/stores/blogStore";
import { resolveMediaUrl } from "src/utils/runtime";
import {
  MOTION_PRESETS,
  animateBlockHeight,
  animateGridEnterByRows,
  animateGridExit,
  killMotion,
} from "src/utils/motion";
import { excerptEssayContent } from "src/utils/essayContent";

export default defineComponent({
  name: "EssaysPage",
  components: {
    ElegantSelect,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const PAGE_SIZE = 5;
    const normalizeKind = (value = "") => (value === "commentary" ? "commentary" : "research");
    const selectedKind = ref(normalizeKind(route.query.kind));
    const essayQuery = ref("");
    const selectedTagSlug = ref("");
    const essays = ref([]);
    const totalEssays = ref(0);
    const essayPage = ref(0);
    const essayTotalPages = ref(1);
    const essaysLoaded = ref(false);
    const loading = ref(false);
    const error = ref("");
    const essayCards = ref([]);
    const essayLoadMoreTrigger = ref(null);
    const essayContentRegion = ref(null);
    const hasMoreEssays = computed(() => essayPage.value < essayTotalPages.value);
    const hasFilters = computed(() => Boolean(essayQuery.value.trim() || selectedTagSlug.value));
    let essayLoadMoreObserver = null;
    let essaySearchTimer = null;
    let essayRequestId = 0;
    let pendingEssayReset = false;
    let essayBatchStartIndex = 0;

    const detachEssayLoadMoreObserver = () => {
      if (essayLoadMoreObserver) {
        essayLoadMoreObserver.disconnect();
        essayLoadMoreObserver = null;
      }
    };

    const attachEssayLoadMoreObserver = async () => {
      if (typeof window === "undefined") {
        return;
      }

      await nextTick();
      detachEssayLoadMoreObserver();

      if (!essayLoadMoreTrigger.value || !hasMoreEssays.value) {
        return;
      }

      essayLoadMoreObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          loadEssaysPage();
        },
        {
          rootMargin: "0px 0px 18% 0px",
          threshold: 0.05,
        }
      );

      essayLoadMoreObserver.observe(essayLoadMoreTrigger.value);
    };

    const getEssayNodes = () => essayCards.value || [];

    const animateEssayBatch = async (startIndex = 0) => {
      await nextTick();
      const nodes = getEssayNodes().slice(startIndex);
      await animateGridEnterByRows(nodes, {
        columns: 1,
        ...MOTION_PRESETS.list.enter,
        rowStagger: 0.14,
        fromY: 14,
      });
    };

    const animateEssayReset = async () => {
      const nodes = getEssayNodes();
      if (!nodes.length) {
        return;
      }

      await animateGridExit(nodes, {
        ...MOTION_PRESETS.list.exit,
        duration: 0.38,
        y: 8,
      });
    };

    const hideEssayNodesForEnter = () => {
      const nodes = getEssayNodes();
      nodes.forEach((node) => {
        node.style.opacity = "0";
        node.style.transform = "translateY(14px)";
      });
    };

    const animateEssayCollectionSwap = async (task) => {
      const region = essayContentRegion.value;
      const fromHeight = region?.offsetHeight || 0;

      if (fromHeight > 0 && region) {
        region.style.height = `${fromHeight}px`;
        region.style.overflow = "hidden";
      }

      await task();
      await nextTick();

      hideEssayNodesForEnter();

      const toHeight = region?.scrollHeight || 0;
      if (region && fromHeight > 0 && toHeight > 0) {
        await animateBlockHeight(region, fromHeight, toHeight, { duration: 0.5 });
      } else if (region) {
        region.style.removeProperty("height");
        region.style.removeProperty("overflow");
      }

      await animateEssayBatch(0);
    };

    const loadEssaysPage = async ({ reset = false, animate = true } = {}) => {
      if (loading.value) {
        if (reset) {
          pendingEssayReset = true;
        }
        return;
      }

      const nextPage = reset ? 1 : essayPage.value + 1;
      if (!reset && nextPage > essayTotalPages.value) {
        return;
      }

      loading.value = true;
      error.value = "";
      const requestId = ++essayRequestId;
      essayBatchStartIndex = reset ? 0 : essays.value.length;

      try {
        const data = await blogStore.fetchPagedEssays({
          page: nextPage,
          pageSize: PAGE_SIZE,
          kind: selectedKind.value,
          status: "published",
          search: essayQuery.value.trim(),
          tagSlug: selectedTagSlug.value,
        });

        if (requestId !== essayRequestId) {
          return;
        }

        essays.value = reset
          ? data.items
          : [...essays.value, ...data.items.filter((item) => !essays.value.some((essay) => essay.id === item.id))];
        totalEssays.value = data.total;
        essayPage.value = data.page;
        essayTotalPages.value = data.totalPages;
        essaysLoaded.value = true;
        if (animate) {
          await animateEssayBatch(essayBatchStartIndex);
        }
      } catch (err) {
        if (requestId !== essayRequestId) {
          return;
        }
        console.error("Không tải được bài luận", err);
        error.value = "Không tải được bài luận từ máy chủ.";
      } finally {
        if (requestId === essayRequestId) {
          loading.value = false;
          if (pendingEssayReset) {
            pendingEssayReset = false;
            loadEssaysPage({ reset: true });
            return;
          }
          await attachEssayLoadMoreObserver();
        }
      }
    };

    onMounted(async () => {
      await blogStore.loadEssayTags({ kind: selectedKind.value });
      await loadEssaysPage({ reset: true });
    });

    const tagOptions = computed(() => [
      { value: "", label: "Tất cả" },
      ...blogStore.state.essayTags.map((tag) => ({ value: tag.slug, label: tag.label })),
    ]);

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

    const excerpt = (value = "") => {
      return excerptEssayContent(value, 180);
    };

    watch(selectedTagSlug, () => {
      animateEssayCollectionSwap(async () => {
        await animateEssayReset();
        await loadEssaysPage({ reset: true, animate: false });
      });
    });

    watch(selectedKind, async () => {
      const normalizedKind = normalizeKind(selectedKind.value);
      if (route.query.kind !== normalizedKind) {
        router.replace({
          query: {
            ...route.query,
            kind: normalizedKind,
          },
        });
      }
      await blogStore.loadEssayTags({ kind: selectedKind.value });
      if (selectedTagSlug.value) {
        selectedTagSlug.value = "";
        return;
      }
      animateEssayCollectionSwap(async () => {
        await animateEssayReset();
        await loadEssaysPage({ reset: true, animate: false });
      });
    });

    watch(
      () => route.query.kind,
      (value) => {
        const normalizedKind = normalizeKind(value);
        if (selectedKind.value !== normalizedKind) {
          selectedKind.value = normalizedKind;
        }
      }
    );

    watch(essayQuery, () => {
      if (essaySearchTimer) {
        clearTimeout(essaySearchTimer);
      }

      essaySearchTimer = window.setTimeout(() => {
        animateEssayCollectionSwap(async () => {
          await animateEssayReset();
          await loadEssaysPage({ reset: true, animate: false });
        });
      }, 220);
    });

    onBeforeUnmount(() => {
      detachEssayLoadMoreObserver();
      killMotion(getEssayNodes());
      if (essaySearchTimer) {
        clearTimeout(essaySearchTimer);
      }
    });

    return {
      essays,
      loading,
      error,
      essayCards,
      essaysLoaded,
      totalEssays,
      hasFilters,
      hasMoreEssays,
      essayContentRegion,
      essayLoadMoreTrigger,
      essayQuery,
      selectedKind,
      selectedTagSlug,
      tagOptions,
      excerpt,
      formatDate,
      formatKind,
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

.essay-index__kind-switch {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  gap: 1rem;
  width: fit-content;
}

.essay-index__kind-tab {
  display: block;
  width: auto;
  padding: 0.15rem 0 0.65rem;
  border: 0;
  background: transparent;
  color: var(--color-description);
  cursor: pointer;
  font: inherit;
  font-size: 1.05rem;
  text-align: left;
  transition: color 220ms ease;
}

.essay-index__kind-tab-label {
  position: relative;
  display: inline-block;
  padding-bottom: 0.12rem;
}

.essay-index__kind-tab-label::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgb(var(--color-text-rgb) / 0) 0%,
    currentColor 18%,
    currentColor 82%,
    rgb(var(--color-text-rgb) / 0) 100%
  );
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.essay-index__kind-tab--active {
  color: var(--color-text);
}

.essay-index__kind-tab--active .essay-index__kind-tab-label::after {
  transform: scaleX(1);
}

.essay-index__title {
  margin: 0;
  max-width: 12ch;
}

.essay-index__lead,
.essay-index__status {
  margin: 0;
  max-width: 44rem;
  color: var(--color-muted);
}

.essay-index__controls {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(11rem, auto));
  gap: 1rem 1.25rem;
  align-items: end;
  max-width: 52rem;
}

.essay-index__search {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.24);
}

.essay-index__search-icon {
  color: var(--color-muted-faint);
  font-size: 0.95rem;
  line-height: 1;
  flex: 0 0 auto;
}

.essay-index__search-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.96rem;
  line-height: 1.2;
  padding: 0;
  outline: none;
}

.essay-index__search-input::placeholder {
  color: var(--color-muted-ghost);
}

.essay-index__filter {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.24);
}

.essay-index__filter-label {
  color: rgb(var(--color-text-rgb) / 0.52);
  font-size: 0.74rem;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.essay-index__filter-select {
  min-width: 0;
}

.essay-index__filter-select :deep(.elegant-select__trigger) {
  min-height: auto;
  padding: 0 1.4rem 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 0.92rem;
}

.essay-index__filter-select :deep(.elegant-select__menu-wrap) {
  left: auto;
  right: 0;
  min-width: 10rem;
}

.essay-index__status--error {
  color: #c89a93;
}

.essay-index__list {
  display: grid;
  gap: 2.4rem;
}

.essay-index__sentinel {
  width: 100%;
  height: 1px;
}

.essay-card {
  position: relative;
}

.essay-card::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1.2rem;
  height: 1px;
  background: var(--divider-gradient-soft);
}

.essay-card__inner {
  display: grid;
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
  gap: 1.75rem;
  padding: 0;
  color: inherit;
}

.essay-card__cover {
  aspect-ratio: 4 / 4.8;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.14);
}

.essay-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: saturate(0.78) contrast(1.03);
}

.essay-card__body {
  display: grid;
  align-content: start;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.15rem 0 0.25rem;
}

.essay-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  color: var(--color-muted-faint);
  font-size: 0.8rem;
  line-height: 1.3;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.essay-card__title {
  margin: 0;
  font-size: clamp(1.7rem, 1.45rem + 0.8vw, 2.4rem);
  line-height: 0.98;
  letter-spacing: -0.03em;
  max-width: 14ch;
}

.essay-card__summary {
  margin: 0;
  font-size: 1.04rem;
  line-height: 1.65;
  color: rgb(var(--color-text-rgb) / 0.88);
  max-width: 38rem;
}

.essay-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 0.9rem;
  padding-top: 0.2rem;
}

.essay-card__tag {
  margin: 0;
  color: rgb(var(--color-text-rgb) / 0.62);
  font-size: 0.84rem;
  line-height: 1.35;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.essay-index__empty {
  padding-top: 1rem;
}

@media (max-width: 900px) {
  .essay-index__controls {
    grid-template-columns: minmax(0, 1fr);
  }

  .essay-card__inner {
    grid-template-columns: 1fr;
    gap: 1.15rem;
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

  .essay-index__list {
    gap: 2rem;
  }

  .essay-card::after {
    bottom: -1rem;
  }

  .essay-card__title {
    max-width: none;
  }
}
</style>
