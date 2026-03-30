<template>
  <div class="content content--offset post-page">
    <div v-if="loading" class="content__item" style="--aspect-ratio: 12/40">
      <div class="content__item-description">
        <p class="page-reading-copy">Đang tải bài viết...</p>
      </div>
    </div>

    <div v-else-if="post" class="content__item post-page__item" style="--aspect-ratio: 700/240">
      <h2
        v-if="post.title"
        class="content__item-title content__item-title--layer page-reading-h2 post-page__title"
      >
        {{ post.title }}
      </h2>
      <div class="content__item-description post-page__description">
        <p v-if="post.summary" class="page-reading-copy">{{ post.summary }}</p>
        <p class="page-reading-copy">{{ formatDate(post.publishedAt) }} • {{ categoryLabel(post.category) }}</p>
      </div>
      <div
        ref="poemEffectWrapper"
        class="content__item-poem content__item-img without-image grid g3 post-page__poem"
      >
        <div class="link w-inline-block -col-or-link">
          <p v-for="(line, i) in post.lines" :key="i" class="nowrap page-reading-copy" :class="i % 2 === 0 ? 'left' : 'right'">{{ line }}</p>
          <img
            v-if="post.image"
            class="post-page__poem-source"
            :src="resolveImage(post.image)"
            alt=""
            aria-hidden="true"
            crossorigin="anonymous"
          />
          <router-link :to="'/authors/' + post.authorSlug"><h5><p class="right staight page-reading-copy">{{ post.author }}</p></h5></router-link>
        </div>
      </div>
    </div>

    <div v-else class="content__item">
      <div class="content__item-description">
        <p class="page-reading-copy">Bài viết không tồn tại hoặc đã bị xóa.</p>
        <router-link to="/read/jp" class="link"><p class="page-reading-copy">Quay lại trang đọc</p></router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import blogStore from "src/stores/blogStore";
import { initHoverImageEffects } from "assets/hover_image_effect.js";
import { resolveMediaUrl } from "src/utils/runtime";

const CATEGORY_LABELS = {
  jp: "Haiku Nhật",
  vi: "Haiku Việt",
  global: "Haiku thế giới",
};

export default defineComponent({
  name: "PostPage",
  setup() {
    const route = useRoute();
    const poemEffectWrapper = ref(null);
    const post = computed(() => blogStore.getPostById(route.params.id));
    const loading = computed(() => blogStore.state.loading);
    let destroyHoverEffects = null;
    let hoverEffectSetupId = 0;
    let hoverSetupFrameId = 0;

    const fetchCurrent = async () => {
      await blogStore.fetchPostById(route.params.id);
    };

    const cleanupHoverEffects = () => {
      if (destroyHoverEffects) {
        destroyHoverEffects();
        destroyHoverEffects = null;
      }
    };

    const cancelScheduledHoverEffectSetup = () => {
      if (hoverSetupFrameId) {
        window.cancelAnimationFrame(hoverSetupFrameId);
        hoverSetupFrameId = 0;
      }
    };

    const scheduleHoverEffectSetup = () => {
      if (typeof window === "undefined") {
        return;
      }

      cancelScheduledHoverEffectSetup();

      hoverSetupFrameId = window.requestAnimationFrame(() => {
        hoverSetupFrameId = window.requestAnimationFrame(() => {
          hoverSetupFrameId = 0;
          setupHoverEffects();
        });
      });
    };

    const setupHoverEffects = async () => {
      cleanupHoverEffects();
      await nextTick();

      const currentPost = post.value;
      const wrapper = poemEffectWrapper.value;
      const setupId = ++hoverEffectSetupId;

      if (!currentPost?.image || !wrapper || typeof window === "undefined") {
        return;
      }

      const supportsHover = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (!supportsHover || prefersReducedMotion || setupId !== hoverEffectSetupId) {
        return;
      }

      const mainElement = document.querySelector("main");
      const scrollLayer = mainElement?.querySelector("[data-scroll]") || null;

      destroyHoverEffects = await initHoverImageEffects({
        container: mainElement || document.body,
        foreground: scrollLayer,
        wrappers: [wrapper],
        strength: 0.22,
        imageSelector: ".post-page__poem-source",
        effectKey: "post-page",
      });
    };

    onMounted(async () => {
      await fetchCurrent();
      scheduleHoverEffectSetup();
    });
    watch(
      () => route.params.id,
      async () => {
        await fetchCurrent();
        scheduleHoverEffectSetup();
      }
    );
    watch(
      () => `${post.value?.id || ""}:${post.value?.image || ""}`,
      () => {
        scheduleHoverEffectSetup();
      },
      { flush: "post" }
    );

    onBeforeUnmount(() => {
      hoverEffectSetupId += 1;
      cancelScheduledHoverEffectSetup();
      cleanupHoverEffects();
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

    const categoryLabel = (value) => CATEGORY_LABELS[value] || "Haiku";

    return { post, formatDate, categoryLabel, resolveImage: resolveMediaUrl, loading, poemEffectWrapper };
  },
});
</script>

<style scoped>
.post-page {
  position: relative;
  z-index: 1;
}

.post-page__item {
  width: 100%;
}

.post-page__title {
  position: relative;
  z-index: 13;
  mix-blend-mode: normal;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}

.post-page__description {
  position: relative;
  z-index: 13;
  mix-blend-mode: normal;
}

.post-page__poem .link {
  position: relative;
  z-index: 12;
  gap: 0.9rem;
  width: 100%;
  align-items: flex-start;
}

.post-page__poem p,
.post-page__poem a,
.post-page__poem h5 {
  position: relative;
  z-index: 13;
  mix-blend-mode: normal;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.2),
    0 0 18px rgba(20, 19, 19, 0.16);
}

.post-page__poem-source {
  display: none;
}

@media screen and (max-width: 40em) {
  .post-page__item {
    min-height: auto;
  }

  .post-page__title {
    font-size: clamp(2rem, 8vw, 2.8rem);
    white-space: normal;
  }

  .post-page__description {
    padding-top: 0.75rem;
  }

  .post-page__poem {
    margin-top: 4.5vh;
    padding-inline: 0;
    padding-bottom: 1rem;
  }

  .post-page__poem p {
    white-space: normal;
  }
}
</style>
