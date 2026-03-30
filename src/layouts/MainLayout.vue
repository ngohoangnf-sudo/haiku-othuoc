<template>
  <main>
    <div ref="backgroundMount" class="page__background"></div>
    <div class="page__scrollbar" aria-hidden="true">
      <div ref="scrollbarThumb" class="page__scrollbar-thumb"></div>
    </div>
    <div data-scroll class="page page--layout-1">
      <header-area />
      <router-view v-slot="{ Component, route: currentRoute }">
        <transition
          mode="out-in"
          @enter="handleRouteEnter"
          @leave="handleRouteLeave"
        >
          <component :is="Component" :key="currentRoute.path" />
        </transition>
      </router-view>
    </div>
  </main>
</template>

<script>
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { gsap } from "gsap";
import Header from "components/Header.vue";
import authStore from "src/stores/authStore";
import themeStore from "src/stores/themeStore";
import { MOTION_PRESETS, animatePanelIn, animatePanelOut, killMotion } from "src/utils/motion";

export default defineComponent({
  name: "MainLayout",

  components: {
    "header-area": Header,
  },

  setup() {
    const LIGHT_BACKGROUND_VARIANT = "full";
    // "none" | "full" | "lite"

    const route = useRoute();
    const backgroundMount = ref(null);
    const scrollbarThumb = ref(null);
    let backgroundEffect = null;
    let backgroundLoader = null;
    let backgroundKind = "";
    let isDisposed = false;
    let scrollbarResizeObserver = null;
    let scrollbarRafId = 0;
    let scrollbarYTo = null;
    let scrollbarHeightTo = null;
    themeStore.hydrateCachedTheme();

    const isWritingRoute = () => route.path.startsWith("/write");

    const getLightBackgroundKind = () => {
      if (LIGHT_BACKGROUND_VARIANT === "none") {
        return "none";
      }

      if (LIGHT_BACKGROUND_VARIANT === "lite") {
        return "light-lite";
      }

      return "light";
    };

    const getBackgroundKind = () =>
      themeStore.state.appliedTheme === "light" ? getLightBackgroundKind() : "liquid";

    const loadBackgroundModule = (kind) => {
      if (kind === "light") {
        return import("assets/light_background.js");
      }

      if (kind === "light-lite") {
        return import("assets/light_background_lite.js");
      }

      if (kind === "liquid") {
        return import("assets/liquid_ink_background.js");
      }

      return null;
    };

    const getBackgroundInitializer = (kind, module) => {
      if (kind === "light") {
        return module.initLightBackground;
      }

      if (kind === "light-lite") {
        return module.initLightBackgroundLite;
      }

      return module.initLiquidInkBackground;
    };

    const destroyBackgroundEffect = () => {
      backgroundEffect?.destroy();
      backgroundEffect = null;
      backgroundKind = "";
    };

    const ensureBackgroundEffect = async () => {
      if (!backgroundMount.value) {
        return backgroundEffect;
      }

      const requestedKind = getBackgroundKind();

      if (requestedKind === "none") {
        destroyBackgroundEffect();
        backgroundKind = "none";
        return null;
      }

      if (backgroundEffect && backgroundKind === requestedKind) {
        return backgroundEffect;
      }

      if (backgroundLoader) {
        return backgroundLoader;
      }

      destroyBackgroundEffect();

      backgroundLoader = loadBackgroundModule(requestedKind)
        .then(async (module) => {
          if (isDisposed || !backgroundMount.value) {
            return null;
          }

          const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          const initBackground = getBackgroundInitializer(requestedKind, module);
          const effect = await initBackground({
            mount: backgroundMount.value,
            prefersReducedMotion,
          });

          if (isDisposed) {
            effect?.destroy?.();
            return null;
          }

          if (requestedKind !== getBackgroundKind()) {
            effect?.destroy?.();
            if (!isDisposed) {
              window.requestAnimationFrame(() => {
                ensureBackgroundEffect();
              });
            }
            return null;
          }

          backgroundEffect = effect;
          backgroundKind = requestedKind;
          syncBackgroundState();
          return effect;
        })
        .finally(() => {
          backgroundLoader = null;
        });

      return backgroundLoader;
    };

    const syncBackgroundState = () => {
      themeStore.setRouteThemeOverride(null);

      const currentTheme = themeStore.state.appliedTheme;
      const showBackground = true;
      const shouldAnimate = currentTheme === "light" && !isWritingRoute();

      backgroundEffect?.setActive(showBackground);
      backgroundEffect?.setInteractive(showBackground);
      backgroundEffect?.setAnimated(showBackground && shouldAnimate);
      backgroundEffect?.setTheme(currentTheme);
    };

    const prefersReducedMotion = () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const syncScrollbar = ({ immediate = false } = {}) => {
      const thumb = scrollbarThumb.value;
      if (!thumb || typeof window === "undefined") {
        return;
      }

      const doc = document.documentElement;
      const viewportHeight = window.innerHeight;
      const contentHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
      const trackPadding = 20;
      const trackHeight = Math.max(0, viewportHeight - trackPadding);
      const maxScroll = Math.max(1, contentHeight - viewportHeight);
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
      const thumbHeight = trackHeight * progress;
      const hidden = contentHeight <= viewportHeight + 8;

      thumb.parentElement?.classList.toggle("page__scrollbar--hidden", hidden);

      if (immediate || !scrollbarYTo || !scrollbarHeightTo) {
        gsap.set(thumb, {
          y: 0,
          height: thumbHeight,
        });
        return;
      }

      scrollbarYTo(0);
      scrollbarHeightTo(thumbHeight);
    };

    const queueScrollbarSync = (immediate = false) => {
      if (typeof window === "undefined") {
        return;
      }

      if (scrollbarRafId) {
        window.cancelAnimationFrame(scrollbarRafId);
      }

      scrollbarRafId = window.requestAnimationFrame(() => {
        scrollbarRafId = 0;
        syncScrollbar({ immediate });
      });
    };

    const setupScrollbar = () => {
      if (typeof window === "undefined" || !scrollbarThumb.value) {
        return;
      }

      scrollbarYTo = gsap.quickTo(scrollbarThumb.value, "y", {
        duration: 0.28,
        ease: "power3.out",
      });
      scrollbarHeightTo = gsap.quickTo(scrollbarThumb.value, "height", {
        duration: 0.5,
        ease: "power3.out",
      });

      const handleScroll = () => queueScrollbarSync();
      const handleResize = () => queueScrollbarSync(true);

      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleResize, { passive: true });

      scrollbarResizeObserver = new ResizeObserver(() => {
        queueScrollbarSync();
      });
      scrollbarResizeObserver.observe(document.documentElement);
      if (document.body) {
        scrollbarResizeObserver.observe(document.body);
      }

      queueScrollbarSync(true);

      return () => {
        window.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
        scrollbarResizeObserver?.disconnect();
        scrollbarResizeObserver = null;
        if (scrollbarRafId) {
          window.cancelAnimationFrame(scrollbarRafId);
          scrollbarRafId = 0;
        }
        scrollbarYTo = null;
        scrollbarHeightTo = null;
      };
    };

    let teardownScrollbar = null;

    const handleRouteEnter = async (element, done) => {
      if (prefersReducedMotion()) {
        done();
        return;
      }

      await animatePanelIn(element, {
        ...MOTION_PRESETS.editorial.enter,
      });
      done();
    };

    const handleRouteLeave = async (element, done) => {
      if (prefersReducedMotion()) {
        done();
        return;
      }

      killMotion(element);
      await animatePanelOut(element, {
        ...MOTION_PRESETS.editorial.exit,
      });
      done();
    };

    onMounted(() => {
      authStore.ensureSession();
      themeStore.ensureInitialized();
      ensureBackgroundEffect();
      syncBackgroundState();
      teardownScrollbar = setupScrollbar();
    });

    watch(
      [() => route.path, () => themeStore.state.appliedTheme],
      () => {
        if (!backgroundEffect || backgroundKind !== getBackgroundKind()) {
          ensureBackgroundEffect();
        }
        syncBackgroundState();
        queueScrollbarSync();
      }
    );

    onBeforeUnmount(() => {
      isDisposed = true;
      themeStore.setRouteThemeOverride(null);
      destroyBackgroundEffect();
      teardownScrollbar?.();
    });

    return {
      backgroundMount,
      scrollbarThumb,
      handleRouteEnter,
      handleRouteLeave,
    };
  },
});
</script>
