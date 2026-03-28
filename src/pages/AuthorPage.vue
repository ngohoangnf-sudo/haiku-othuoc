<template>
  <div class="author-page">
    <section class="author-page__hero">
      <div class="author-page__hero-copy">
        <div class="author-page__hero-top">
          <p class="author-page__eyebrow page-reading-copy">Tác giả</p>
          <div class="author-page__title-block">
            <h1 class="author-page__title page-reading-h2">{{ authorName }}</h1>
            <span class="author-page__title-rule" aria-hidden="true"></span>
          </div>
        </div>
        <div class="author-page__hero-bottom">
          <p class="author-page__lead page-reading-copy">
            {{ totalPoems }} bài haiku trong thư mục tác giả
          </p>
          <p v-if="error" class="author-page__status author-page__status--error page-reading-copy">
            {{ error }}
          </p>
          <p v-else-if="loading" class="author-page__status page-reading-copy">Đang tải...</p>
        </div>
      </div>

      <div v-if="otherAuthors.length" class="author-page__authors">
        <div class="author-page__authors-top">
          <div class="author-page__authors-header">
            <p class="author-page__authors-label author-page__eyebrow page-reading-copy">Tác giả khác</p>
            <label
              class="author-page__authors-search"
              :class="{ 'author-page__authors-search--expanded': authorSearchExpanded }"
            >
              <span class="author-page__authors-search-trigger" aria-hidden="true">⌕</span>
              <input
                ref="authorSearchInput"
                v-model.trim="authorQuery"
                type="search"
                class="author-page__authors-input"
                placeholder="Tìm kiếm"
                aria-label="Tìm tác giả"
                @focus="expandAuthorSearch"
                @blur="collapseAuthorSearch"
              />
            </label>
          </div>
          <div v-if="filteredOtherAuthors.length" class="author-page__authors-list">
              <router-link
                v-for="item in pagedOtherAuthors"
                :key="item.authorSlug"
                :to="'/authors/' + item.authorSlug"
                class="author-page__author-link"
              >
                {{ item.author }}
              </router-link>
          </div>
          <p v-else class="author-page__authors-empty page-reading-copy">Không tìm thấy tác giả phù hợp.</p>
        </div>
        <div class="author-page__authors-bottom">
          <div v-if="otherAuthorsTotalPages > 1" class="author-page__authors-pagination">
            <button
              type="button"
              class="author-page__authors-page-button"
              :disabled="otherAuthorsPage <= 1"
              @click="changeOtherAuthorsPage(otherAuthorsPage - 1)"
            >
              &lt;
            </button>
            <p class="author-page__authors-page-label page-reading-copy">
              {{ formatPageNumber(otherAuthorsPage) }} / {{ formatPageNumber(otherAuthorsTotalPages) }}
            </p>
            <button
              type="button"
              class="author-page__authors-page-button"
              :disabled="otherAuthorsPage >= otherAuthorsTotalPages"
              @click="changeOtherAuthorsPage(otherAuthorsPage + 1)"
            >
              &gt;
            </button>
          </div>
          <div v-else class="author-page__authors-pagination-spacer" aria-hidden="true"></div>
        </div>
      </div>
    </section>

    <section v-if="poems.length" class="author-page__poems-wrap">
      <transition-group tag="div" name="author-page__poem" class="author-page__poems">
        <article
          v-for="(poem, index) in poems"
          :key="poem.id"
          class="author-page__poem"
          :style="{ '--poem-delay': poemRowDelay(index) }"
        >
          <p v-if="poem.title" class="author-page__poem-title">{{ poem.title }}</p>
          <div class="author-page__poem-body">
            <p
              v-for="(line, index) in poem.lines"
              :key="index"
              class="author-page__poem-line page-reading-copy"
            >
              {{ line }}
            </p>
          </div>
          <div class="author-page__poem-meta">
            <p class="author-page__poem-date page-reading-copy">{{ formatDate(poem.publishedAt) }}</p>
            <router-link :to="'/post/' + poem.id" class="author-page__poem-link">
              Xem bài
            </router-link>
          </div>
        </article>
      </transition-group>
      <div
        v-if="hasMorePoems"
        ref="poemLoadMoreTrigger"
        class="author-page__poems-sentinel"
        aria-hidden="true"
      ></div>
    </section>

    <section v-else-if="!loading" class="author-page__empty">
      <p class="page-reading-copy">Chưa có bài viết cho tác giả này.</p>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import blogStore from "src/stores/blogStore";

export default defineComponent({
  name: "AuthorPage",
  setup() {
    const route = useRoute();
    const authorQuery = ref("");
    const otherAuthorsPage = ref(1);
    const authorSearchExpanded = ref(false);
    const authorSearchInput = ref(null);
    const poemLoadMoreTrigger = ref(null);
    const pagedPoems = ref([]);
    const totalPoems = ref(0);
    const poemPage = ref(0);
    const poemTotalPages = ref(1);
    const poemsLoading = ref(false);
    const poemsLoaded = ref(false);
    const pageError = ref("");
    const authorPoemSeed = ref("");
    const poemRevealStartIndex = ref(0);
    const viewportWidth = ref(typeof window === "undefined" ? 1440 : window.innerWidth);
    const OTHER_AUTHORS_PAGE_SIZE = 12;
    const POEM_BATCH_SIZE = 9;
    let poemObserver = null;
    const syncViewportWidth = () => {
      if (typeof window !== "undefined") {
        viewportWidth.value = window.innerWidth;
      }
    };

    onMounted(() => {
      blogStore.loadAuthors();
      syncViewportWidth();
      window.addEventListener("resize", syncViewportWidth, { passive: true });
      attachPoemObserver();
    });

    const fallbackSlug = computed(() => blogStore.state.authors[0]?.authorSlug || "basho");
    const slug = computed(() => route.params.slug || fallbackSlug.value);
    const poems = computed(() => pagedPoems.value);
    const hasMorePoems = computed(() => poemPage.value < poemTotalPages.value);
    const authorRecord = computed(() =>
      blogStore.state.authors.find((item) => item.authorSlug === slug.value)
    );
    const authorName = computed(() => poems.value[0]?.author || authorRecord.value?.author || "Tác giả");
    const authors = computed(() => blogStore.getAuthors());
    const otherAuthors = computed(() =>
      authors.value.filter((item) => item.authorSlug !== slug.value)
    );
    const filteredOtherAuthors = computed(() => {
      if (!authorQuery.value) return otherAuthors.value;
      const query = authorQuery.value.toLocaleLowerCase("vi-VN");
      return otherAuthors.value.filter((item) =>
        item.author.toLocaleLowerCase("vi-VN").includes(query)
      );
    });
    const otherAuthorsTotalPages = computed(() =>
      Math.max(1, Math.ceil(filteredOtherAuthors.value.length / OTHER_AUTHORS_PAGE_SIZE))
    );
    const pagedOtherAuthors = computed(() => {
      const start = (otherAuthorsPage.value - 1) * OTHER_AUTHORS_PAGE_SIZE;
      return filteredOtherAuthors.value.slice(start, start + OTHER_AUTHORS_PAGE_SIZE);
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
      } catch (_error) {
        return value;
      }
    };
    const formatPageNumber = (value) => String(Math.max(1, Number(value) || 1)).padStart(2, "0");
    const createAuthorPoemSeed = () =>
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const changeOtherAuthorsPage = (page) => {
      otherAuthorsPage.value = Math.min(Math.max(1, page), otherAuthorsTotalPages.value);
    };
    const expandAuthorSearch = async () => {
      authorSearchExpanded.value = true;
      await nextTick();
      authorSearchInput.value?.focus();
    };
    const collapseAuthorSearch = () => {
      if (!authorQuery.value) {
        authorSearchExpanded.value = false;
      }
    };
    const currentPoemColumns = computed(() => {
      if (viewportWidth.value <= 928) return 1;
      if (viewportWidth.value <= 1152) return 2;
      return 3;
    });
    const poemRowDelay = (index) => {
      if (index < poemRevealStartIndex.value) {
        return "0ms";
      }
      const relativeIndex = index - poemRevealStartIndex.value;
      const row = Math.floor(relativeIndex / currentPoemColumns.value);
      return `${row * 170}ms`;
    };
    const loadPoemsPage = async ({ reset = false } = {}) => {
      if (poemsLoading.value || !slug.value) {
        return;
      }

      const nextPage = reset ? 1 : poemPage.value + 1;
      if (!reset && nextPage > poemTotalPages.value) {
        return;
      }

      poemsLoading.value = true;
      pageError.value = "";

      if (reset) {
        poemRevealStartIndex.value = 0;
      } else {
        poemRevealStartIndex.value = pagedPoems.value.length;
      }

      try {
        const data = await blogStore.fetchPagedPosts({
          authorSlug: slug.value,
          page: nextPage,
          pageSize: POEM_BATCH_SIZE,
          seed: authorPoemSeed.value,
        });

        pagedPoems.value = reset
          ? data.items
          : [...pagedPoems.value, ...data.items.filter((item) => !pagedPoems.value.some((poem) => poem.id === item.id))];
        totalPoems.value = data.total;
        poemPage.value = data.page;
        poemTotalPages.value = data.totalPages;
        poemsLoaded.value = true;
      } catch (err) {
        console.error("Không tải được bài của tác giả", err);
        pageError.value = "Không tải được danh sách bài viết của tác giả.";
      } finally {
        poemsLoading.value = false;
        attachPoemObserver();
      }
    };
    const detachPoemObserver = () => {
      if (poemObserver) {
        poemObserver.disconnect();
        poemObserver = null;
      }
    };
    const attachPoemObserver = async () => {
      if (typeof window === "undefined") {
        return;
      }

      await nextTick();
      detachPoemObserver();

      if (!poemLoadMoreTrigger.value || !hasMorePoems.value) {
        return;
      }

      poemObserver = new window.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }
          loadPoemsPage();
        },
        {
          rootMargin: "0px 0px 18% 0px",
          threshold: 0.05,
        }
      );

      poemObserver.observe(poemLoadMoreTrigger.value);
    };

    const loading = computed(() => poemsLoading.value && !poemsLoaded.value);
    const error = computed(() => pageError.value);

    watch(authorQuery, () => {
      otherAuthorsPage.value = 1;
    });

    watch(
      () => slug.value,
      async () => {
        authorQuery.value = "";
        otherAuthorsPage.value = 1;
        authorSearchExpanded.value = false;
        authorPoemSeed.value = createAuthorPoemSeed();
        pagedPoems.value = [];
        totalPoems.value = 0;
        poemPage.value = 0;
        poemTotalPages.value = 1;
        poemsLoaded.value = false;
        poemRevealStartIndex.value = 0;
        await loadPoemsPage({ reset: true });
      },
      { immediate: true }
    );

    watch(otherAuthorsTotalPages, (value) => {
      if (otherAuthorsPage.value > value) {
        otherAuthorsPage.value = value;
      }
    });

    onBeforeUnmount(() => {
      detachPoemObserver();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", syncViewportWidth);
      }
    });

    return {
      poems,
      hasMorePoems,
      poemRowDelay,
      authorName,
      otherAuthors,
      authorQuery,
      authorSearchExpanded,
      authorSearchInput,
      poemLoadMoreTrigger,
      filteredOtherAuthors,
      pagedOtherAuthors,
      otherAuthorsPage,
      otherAuthorsTotalPages,
      formatDate,
      formatPageNumber,
      changeOtherAuthorsPage,
      expandAuthorSearch,
      collapseAuthorSearch,
      loading,
      error,
      totalPoems,
    };
  },
});
</script>

<style scoped>
.author-page {
  grid-area: grid;
  width: 100%;
  margin: 0;
  padding: 7rem 0 5rem;
  display: grid;
  gap: 4.75rem;
}

.author-page__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
  gap: 2.5rem 3rem;
  align-items: stretch;
}

.author-page__hero-copy {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 1.25rem;
  align-self: stretch;
}

.author-page__hero-top,
.author-page__hero-bottom {
  display: grid;
  align-content: start;
  gap: 0.8rem;
}

.author-page__eyebrow {
  margin: 0;
  color: rgba(177, 165, 159, 0.68);
  font-size: 0.86rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.author-page__title-block {
  display: grid;
  gap: 1rem;
}

.author-page__title,
.author-page__lead,
.author-page__status,
.author-page__authors-label {
  margin: 0;
}

.author-page__title {
  max-width: 12ch;
  line-height: 0.94;
  text-wrap: balance;
}

.author-page__title-rule {
  display: block;
  width: min(100%, 7.5rem);
  height: 1px;
  background: linear-gradient(90deg, rgba(177, 165, 159, 0.34), rgba(177, 165, 159, 0));
}

.author-page__lead,
.author-page__status {
  color: var(--color-description);
}

.author-page__status--error {
  color: #f0b9b0;
}

.author-page__authors {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  row-gap: 0.3rem;
  align-self: stretch;
}

.author-page__authors-top,
.author-page__authors-bottom {
  display: grid;
  align-content: start;
}

.author-page__authors-top {
  grid-template-rows: auto minmax(5.1rem, auto);
  row-gap: 1.2rem;
}

.author-page__authors-bottom {
  align-content: end;
  min-height: 1.6rem;
  padding-bottom: 0.35rem;
}

.author-page__authors-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
}

.author-page__authors-search {
  position: relative;
  display: block;
  padding-bottom: 0.18rem;
}

.author-page__authors-search::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0;
  height: 1px;
  background: linear-gradient(90deg, rgba(177, 165, 159, 0.42), rgba(177, 165, 159, 0.12));
  transition: width 180ms ease, background 180ms ease;
}

.author-page__authors-search-trigger {
  position: absolute;
  top: 50%;
  left: 0.1rem;
  transform: translateY(-50%);
  color: rgba(177, 165, 159, 0.58);
  font-size: 0.95rem;
  line-height: 1;
  pointer-events: none;
  transition: color 180ms ease;
}

.author-page__authors-input {
  width: 3rem;
  min-height: 2rem;
  padding: 0.2rem 0 0.2rem 1.45rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #b1a59f;
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.3;
  outline: none;
  transition:
    width 180ms ease;
}

.author-page__authors-search--expanded .author-page__authors-input {
  width: 8.2rem;
}

.author-page__authors-search--expanded::after {
  width: 100%;
}

.author-page__authors-search--expanded .author-page__authors-search-trigger {
  color: rgba(177, 165, 159, 0.82);
}

.author-page__authors-input::placeholder {
  color: rgba(177, 165, 159, 0.58);
  opacity: 0;
  transition: opacity 120ms ease;
}

.author-page__authors-search--expanded .author-page__authors-input::placeholder {
  opacity: 1;
}

.author-page__authors-input:focus {
  color: var(--color-title);
}

.author-page__authors-list {
  display: flex;
  flex-wrap: wrap;
  column-gap: 1.5rem;
  row-gap: 0.5rem;
  align-content: flex-start;
  min-height: 5.1rem;
  max-height: 5.1rem;
  overflow: hidden;
}

.author-page__author-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0;
  color: rgba(177, 165, 159, 0.82);
  font-family: var(--font-title);
  font-size: 1rem;
  line-height: 1.15;
  letter-spacing: -0.01em;
  transition:
    color 180ms ease,
    opacity 180ms ease,
    transform 180ms ease;
  will-change: transform;
}

.author-page__author-link::before {
  content: "";
  display: block;
  width: 0.8rem;
  height: 1px;
  background: linear-gradient(90deg, rgba(177, 165, 159, 0.38), rgba(177, 165, 159, 0.12));
  transform-origin: left center;
  transition: background 180ms ease;
}

.author-page__author-link:hover {
  color: var(--color-title);
  opacity: 1;
  transform: translateX(0.08rem);
}

.author-page__author-link:hover::before {
  background: linear-gradient(90deg, rgba(177, 165, 159, 0.62), rgba(177, 165, 159, 0.16));
}

.author-page__authors-empty {
  margin: 0;
  color: var(--color-description);
}

.author-page__authors-page-button {
  min-width: 1.6rem;
  padding: 0;
  border: none;
  background: transparent;
  color: #b1a59f;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 180ms ease,
    opacity 180ms ease;
}

.author-page__authors-page-button:hover:not(:disabled) {
  color: var(--color-title);
}

.author-page__authors-page-button:disabled {
  opacity: 0.26;
  cursor: default;
}

.author-page__authors-pagination {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  justify-self: start;
}

.author-page__authors-pagination-spacer {
  min-height: 1.15rem;
}

.author-page__authors-page-label {
  margin: 0;
  color: rgba(177, 165, 159, 0.74);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.author-page__poems {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  row-gap: 3.45rem;
  column-gap: 4rem;
}

.author-page__poems-wrap {
  margin-top: 2.4rem;
}

.author-page__poems-sentinel {
  width: 100%;
  height: 1px;
}

.author-page__poem-enter-active {
  transition:
    opacity 420ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--poem-delay, 0ms);
}

.author-page__poem-enter-from {
  opacity: 0;
  transform: translateY(0.9rem);
}

.author-page__poem-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.author-page__poem {
  min-width: 0;
  min-height: 15.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0 0.15rem 0.2rem;
}

.author-page__poem-title {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  font-size: clamp(1.35rem, 1.45vw, 1.95rem);
  line-height: 1.04;
  letter-spacing: -0.02em;
  color: var(--color-title);
  overflow-wrap: anywhere;
}

.author-page__poem-body {
  display: grid;
  gap: 0.42rem;
}

.author-page__poem-line {
  margin: 0;
  color: var(--color-description);
  font-style: italic;
  font-size: 1rem;
  line-height: 1.42;
  overflow-wrap: anywhere;
}

.author-page__poem-meta {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(255, 255, 255, 0.045);
}

.author-page__poem-date {
  margin: 0;
  color: rgba(177, 165, 159, 0.64);
  font-size: 0.84rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.author-page__poem-link {
  color: #b1a59f;
  font-size: 0.88rem;
  line-height: 1.3;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color 180ms ease;
}

.author-page__poem-link:hover {
  color: var(--color-title);
}

.author-page__empty {
  padding: 1.25rem 0;
}

.author-page__empty p {
  margin: 0;
  color: var(--color-description);
}

@media (max-width: 72em) {
  .author-page__hero {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .author-page__hero-copy,
  .author-page__authors {
    grid-template-rows: auto;
    gap: 1rem;
  }

  .author-page__poems {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 58em) {
  .author-page__poems {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 50em) {
  .author-page {
    padding: 5rem 0 3rem;
    gap: 3.25rem;
  }

  .author-page__authors-header {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .author-page__authors-search {
    justify-self: start;
  }

  .author-page__poem {
    min-height: 0;
    padding: 1.1rem 1rem;
  }

  .author-page__authors {
    gap: 0.75rem;
  }
}
</style>
