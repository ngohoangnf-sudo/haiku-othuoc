<template>
  <div class="content reading-page">
    <div class="content__item reading-page__hero" style="--aspect-ratio: 12/60">
      <h2 class="content__item-title content__item-title--layer reading-page__hero-title">Đọc haiku</h2>
      <div class="reading-page__hero-nav">
        <router-link
          to="/read/jp"
          class="reading-page__hero-tab"
          :class="{ 'reading-page__hero-tab--active': category === 'jp' }"
        >
          <span class="reading-page__hero-tab-label">Haiku Nhật</span>
        </router-link>
        <router-link
          to="/read/vi"
          class="reading-page__hero-tab"
          :class="{ 'reading-page__hero-tab--active': category === 'vi' }"
        >
          <span class="reading-page__hero-tab-label">Haiku Việt</span>
        </router-link>
        <router-link
          to="/read/global"
          class="reading-page__hero-tab"
          :class="{ 'reading-page__hero-tab--active': category === 'global' }"
        >
          <span class="reading-page__hero-tab-label">Haiku thế giới</span>
        </router-link>
      </div>
      <p v-if="error" class="reading-page__hero-feedback">{{ error }}</p>
      <p v-else-if="loading" class="reading-page__hero-feedback">Đang tải...</p>
    </div>

    <div
      v-for="(poem, index) in poems"
      :key="`${category}-${poem.id}`"
      ref="poemItems"
      :data-poem-id="poem.id"
      class="content__item reading-page__item"
      :class="[
        index % 2 === 0 ? 'reading-page__item--left' : 'reading-page__item--right',
        poem.image ? 'reading-page__item--with-image' : '',
        isPoemVisible(poem.id) ? 'reading-page__item--visible' : ''
      ]"
      :style="itemGridStyle(index)"
      tabindex="0"
      role="link"
      @click="openPoemDetail(poem, $event)"
      @keydown.enter.prevent="openPoemDetail(poem, $event)"
      @keydown.space.prevent="openPoemDetail(poem, $event)"
    >
      <h3 v-if="poem.title" class="content__item-title content__item-title--layer reading-page__title">{{ poem.title }}</h3>
      <div
        ref="poemEffectWrappers"
        class="content__item-poem content__item-img without-image grid g3 reading-page__poem"
        :class="[
          index % 2 === 0 ? 'reading-page__poem--left' : 'reading-page__poem--right',
          poem.image ? 'reading-page__poem--with-image' : ''
        ]"
      >
        <div class="link w-inline-block -col-or-link">
          <p v-for="(line, i) in poem.lines" :key="i" class="nowrap left">{{ line }}</p>
          <router-link :to="'/authors/' + poem.authorSlug">
            <h5><p class="staight left">{{ poem.author }}</p></h5>
          </router-link>
          <img
            v-if="poem.image"
            class="reading-page__poem-source"
            :src="resolveImage(poem.image)"
            alt=""
            aria-hidden="true"
            crossorigin="anonymous"
          />
        </div>
      </div>
    </div>

    <div
      v-if="hasMorePoems"
      ref="poemLoadMoreTrigger"
      class="reading-page__load-more-trigger"
      aria-hidden="true"
    ></div>

    <div v-if="!loading && !poems.length" class="content__item">
      <div class="content__item-description">
        <p>Chưa có bài nào trong mục này. Hãy đăng một bài mới ở trang Viết.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import blogStore from "src/stores/blogStore";
import { initHoverImageEffects } from "assets/hover_image_effect.js";
import { resolveMediaUrl } from "src/utils/runtime";

export default defineComponent({
  name: "ReadingPage",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const poemItems = ref([]);
    const poemEffectWrappers = ref([]);
    const poemLoadMoreTrigger = ref(null);
    const visiblePoems = ref(new Set());
    const pagedPoems = ref([]);
    const totalPoems = ref(0);
    const poemPage = ref(0);
    const poemTotalPages = ref(1);
    const poemsLoading = ref(false);
    const poemsLoaded = ref(false);
    const pageError = ref("");
    const poemFeedSeed = ref("");
    const POEM_BATCH_SIZE = 9;
    let poemRevealObserver = null;
    let poemLoadMoreObserver = null;
    let destroyHoverEffects = null;
    let hoverEffectSetupId = 0;

    const category = computed(() => {
      const segment = route.path.split("/").filter(Boolean).pop();
      if (segment && ["jp", "vi", "global"].includes(segment)) {
        return segment;
      }
      return "jp";
    });

    const poems = computed(() => pagedPoems.value);
    const loading = computed(() => poemsLoading.value && !poemsLoaded.value);
    const error = computed(() => pageError.value);
    const hasMorePoems = computed(() => poemPage.value < poemTotalPages.value);
    const itemGridStyle = (index) => ({
      "--aspect-ratio": "700/200",
      gridRow: String(index + 2),
    });
    const createPoemFeedSeed = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const poemVisibilityKey = (id) => `${category.value}:${id}`;

    const markPoemVisible = (id) => {
      const key = poemVisibilityKey(id);
      if (visiblePoems.value.has(key)) {
        return;
      }

      const nextVisiblePoems = new Set(visiblePoems.value);
      nextVisiblePoems.add(key);
      visiblePoems.value = nextVisiblePoems;
    };

    const isPoemVisible = (id) => visiblePoems.value.has(poemVisibilityKey(id));

    const shouldIgnorePoemOpen = (event) => {
      const target = event?.target;
      return Boolean(target?.closest?.("a, button, input, textarea, select, label"));
    };

    const openPoemDetail = (poem, event) => {
      if (!poem?.id || shouldIgnorePoemOpen(event)) {
        return;
      }

      router.push(`/post/${poem.id}`);
    };

    const destroyPoemRevealObserver = () => {
      if (poemRevealObserver) {
        poemRevealObserver.disconnect();
        poemRevealObserver = null;
      }
    };

    const destroyPoemLoadMoreObserver = () => {
      if (poemLoadMoreObserver) {
        poemLoadMoreObserver.disconnect();
        poemLoadMoreObserver = null;
      }
    };

    const cleanupHoverEffects = () => {
      if (destroyHoverEffects) {
        destroyHoverEffects();
        destroyHoverEffects = null;
      }
    };

    const setupPoemReveal = async ({ reset = false } = {}) => {
      destroyPoemRevealObserver();

      if (reset) {
        visiblePoems.value = new Set();
      }

      await nextTick();

      const poemElements = poemItems.value.filter(Boolean);
      if (!poemElements.length) {
        return;
      }

      const hiddenPoems = poemElements.filter(
        (element) => !visiblePoems.value.has(poemVisibilityKey(element.dataset.poemId))
      );

      if (!hiddenPoems.length) {
        return;
      }

      if (reset) {
        const [firstPoem, ...remainingPoems] = hiddenPoems;
        requestAnimationFrame(() => {
          markPoemVisible(firstPoem.dataset.poemId);
        });

        if (!remainingPoems.length) {
          return;
        }

        if (typeof IntersectionObserver === "undefined") {
          remainingPoems.forEach((element) => {
            markPoemVisible(element.dataset.poemId);
          });
          return;
        }

        poemRevealObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }

              markPoemVisible(entry.target.dataset.poemId);
              poemRevealObserver?.unobserve(entry.target);
            });
          },
          {
            threshold: 0.08,
            rootMargin: "0px 0px -4% 0px",
          }
        );

        remainingPoems.forEach((element) => {
          poemRevealObserver.observe(element);
        });
        return;
      }

      if (typeof IntersectionObserver === "undefined") {
        hiddenPoems.forEach((element) => {
          markPoemVisible(element.dataset.poemId);
        });
        return;
      }

      poemRevealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            markPoemVisible(entry.target.dataset.poemId);
            poemRevealObserver?.unobserve(entry.target);
          });
        },
        {
          threshold: 0.08,
          rootMargin: "0px 0px -4% 0px",
        }
      );

      hiddenPoems.forEach((element) => {
        poemRevealObserver.observe(element);
      });
    };

    const attachPoemLoadMoreObserver = async () => {
      if (typeof window === "undefined") {
        return;
      }

      await nextTick();
      destroyPoemLoadMoreObserver();

      if (!poemLoadMoreTrigger.value || !hasMorePoems.value) {
        return;
      }

      poemLoadMoreObserver = new IntersectionObserver(
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

      poemLoadMoreObserver.observe(poemLoadMoreTrigger.value);
    };

    const loadPoemsPage = async ({ reset = false } = {}) => {
      if (poemsLoading.value) {
        return;
      }

      const nextPage = reset ? 1 : poemPage.value + 1;
      if (!reset && nextPage > poemTotalPages.value) {
        return;
      }

      poemsLoading.value = true;
      pageError.value = "";

      try {
        const data = await blogStore.fetchPagedPosts({
          category: category.value,
          page: nextPage,
          pageSize: POEM_BATCH_SIZE,
          seed: poemFeedSeed.value,
        });

        pagedPoems.value = reset
          ? data.items
          : [...pagedPoems.value, ...data.items.filter((item) => !pagedPoems.value.some((poem) => poem.id === item.id))];
        totalPoems.value = data.total;
        poemPage.value = data.page;
        poemTotalPages.value = data.totalPages;
        poemsLoaded.value = true;
      } catch (err) {
        console.error("Không tải được thơ theo mục", err);
        pageError.value = "Không tải được danh sách haiku.";
      } finally {
        poemsLoading.value = false;
        await attachPoemLoadMoreObserver();
      }
    };

    const setupHoverEffects = async () => {
      cleanupHoverEffects();
      await nextTick();
      const setupId = ++hoverEffectSetupId;

      const wrappers = poemEffectWrappers.value.filter(
        (wrapper) => wrapper && wrapper.querySelector(".reading-page__poem-source")
      );

      if (!wrappers.length || typeof window === "undefined") {
        return;
      }

      const supportsHover = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (!supportsHover || prefersReducedMotion) {
        return;
      }

      if (setupId !== hoverEffectSetupId) {
        return;
      }

      const mainElement = document.querySelector("main");
      const scrollLayer = mainElement?.querySelector("[data-scroll]") || null;

      destroyHoverEffects = await initHoverImageEffects({
        container: mainElement || document.body,
        foreground: scrollLayer,
        wrappers,
        strength: 0.22,
      });
    };

    watch(
      () => poems.value.map((poem) => poem.id).join(","),
      async (currentIds, previousIds) => {
        if (!currentIds) {
          destroyPoemRevealObserver();
          cleanupHoverEffects();
          return;
        }

        const reset = !previousIds;
        await setupPoemReveal({ reset });
        await setupHoverEffects();
      },
      { flush: "post" }
    );

    watch(
      () => category.value,
      async () => {
        poemFeedSeed.value = createPoemFeedSeed();
        pagedPoems.value = [];
        totalPoems.value = 0;
        poemPage.value = 0;
        poemTotalPages.value = 1;
        poemsLoaded.value = false;
        visiblePoems.value = new Set();
        await loadPoemsPage({ reset: true });
      },
      { immediate: true }
    );

    onMounted(() => {
      attachPoemLoadMoreObserver();
    });

    onBeforeUnmount(() => {
      hoverEffectSetupId += 1;
      destroyPoemRevealObserver();
      destroyPoemLoadMoreObserver();
      cleanupHoverEffects();
    });

    return {
      poems,
      category,
      resolveImage: resolveMediaUrl,
      loading,
      error,
      itemGridStyle,
      poemItems,
      poemEffectWrappers,
      poemLoadMoreTrigger,
      hasMorePoems,
      isPoemVisible,
      openPoemDetail,
    };
  },
});
</script>

<style scoped>
.reading-page {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 8vw;
  row-gap: 11vh;
  margin: 16vh 0 24vh;
  align-items: start;
  position: relative;
  z-index: 1;
}

.reading-page__hero {
  grid-column: 1 / -1;
  width: 100%;
  margin: 0 auto 4vh;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto;
  row-gap: 4.5rem;
  align-items: start;
}

.reading-page__hero-title {
  grid-area: 1 / 1 / 2 / 2;
  font-size: clamp(3.4rem, 7vw, 5.8rem);
  text-align: left;
  align-self: start;
  margin: 0;
  padding: 0;
}

.reading-page__hero-nav {
  grid-area: 2 / 1 / 3 / 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  width: 100%;
}

.reading-page__hero-tab {
  display: block;
  width: 100%;
  padding: 0.85rem 0 1rem;
  color: var(--color-description);
  font-size: 1.15rem;
  font-weight: 400;
  text-align: left;
  transition: color 220ms ease;
}

.reading-page__hero-tab-label {
  position: relative;
  display: inline-block;
  padding-bottom: 0.15rem;
}

.reading-page__hero-tab-label::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(177, 165, 159, 0) 0%,
    currentColor 18%,
    currentColor 82%,
    rgba(177, 165, 159, 0) 100%
  );
  opacity: 0.9;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.reading-page__hero-tab--active {
  color: var(--color-text);
}

.reading-page__hero-tab--active .reading-page__hero-tab-label::after {
  transform: scaleX(1);
}

.reading-page__hero-feedback {
  grid-area: 3 / 1 / 4 / 2;
  color: var(--color-description);
  margin: 0;
  text-align: left;
}

.reading-page__item {
  width: min(100%, 34rem);
  min-height: 72vh;
  margin: 0;
  align-items: center;
  opacity: 0.04;
  transform: translate3d(0, 2.75rem, 0) scale(0.992);
  will-change: opacity, transform;
  transition:
    opacity 1500ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 1500ms cubic-bezier(0.16, 1, 0.3, 1);
}

.reading-page__item {
  cursor: pointer;
}

.reading-page__item:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 0.6rem;
}

.reading-page__item--visible {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
}

.reading-page__item--left {
  grid-column: 1;
  justify-self: start;
}

.reading-page__item--right {
  grid-column: 2;
  justify-self: end;
}

.reading-page__poem {
  width: 100%;
  margin: 12vh auto 0;
  padding: 2rem 1rem 3rem;
  position: relative;
  overflow: visible;
  isolation: isolate;
}

.reading-page__title {
  width: 100%;
  margin-top: 0;
  padding: 0 1rem;
  font-size: clamp(2.2rem, 3.8vw, 3.8rem);
  text-align: left;
  white-space: nowrap;
  position: relative;
  z-index: 13;
  mix-blend-mode: normal;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}

.reading-page__poem.without-image {
  margin-left: auto;
}

.reading-page__poem--left {
  margin-left: 0;
  margin-right: auto;
}

.reading-page__poem--right {
  margin-left: auto;
  margin-right: 0;
}

.reading-page__poem .link {
  position: relative;
  z-index: 12;
  gap: 0.9rem;
  width: 100%;
  align-items: flex-start;
}

.reading-page__poem p {
  width: max-content;
  max-width: calc(100vw - 4rem);
  position: relative;
  z-index: 13;
  mix-blend-mode: normal;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.2),
    0 0 18px rgba(20, 19, 19, 0.16);
  transition:
    color 220ms ease,
    text-shadow 260ms ease;
}

.reading-page__poem a,
.reading-page__poem h5 {
  position: relative;
  z-index: 13;
  mix-blend-mode: normal;
}

.reading-page__poem-source {
  display: none;
}

.reading-page__load-more-trigger {
  grid-column: 1 / -1;
  width: 100%;
  height: 1px;
}

@media screen and (max-width: 40em) {
  .reading-page {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 15vh;
    margin-top: 10vh;
    margin-bottom: 18vh;
  }

  .reading-page__item {
    width: 100%;
    min-height: 86vh;
    align-content: start;
  }

  .reading-page__hero {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    row-gap: 2rem;
    margin-bottom: 1vh;
  }

  .reading-page__hero-title,
  .reading-page__hero-nav,
  .reading-page__hero-feedback {
    grid-area: auto;
  }

  .reading-page__hero-nav {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.3rem;
  }

  .reading-page__hero-tab {
    padding-block: 0.5rem;
    font-size: 1rem;
  }

  .reading-page__item--left,
  .reading-page__item--right {
    grid-column: 1;
    justify-self: stretch;
  }

  .reading-page__poem {
    width: 100%;
    margin-top: 7.5vh;
    padding-inline: 0;
    padding-bottom: 1rem;
    overflow: visible;
  }

  .reading-page__title {
    padding-inline: 0;
    font-size: clamp(1.9rem, 8vw, 2.5rem);
    white-space: normal;
  }

  .reading-page__poem .link {
    width: auto;
    min-width: 0;
    gap: 0.45rem;
  }

  .reading-page__poem p {
    width: max-content;
    max-width: none;
    white-space: nowrap;
    line-height: 1.32;
  }
}
</style>
