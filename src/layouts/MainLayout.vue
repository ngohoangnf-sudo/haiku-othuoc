<template>
  <main>
    <div ref="backgroundMount" class="page__background"></div>
    <div data-scroll class="page page--layout-1">
      <header-area />
      <router-view v-slot="{ Component, route: currentRoute }">
        <transition name="page-shell" mode="out-in">
          <component :is="Component" :key="currentRoute.path" />
        </transition>
      </router-view>
    </div>
  </main>
</template>

<script>
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Header from "components/Header.vue";
import authStore from "src/stores/authStore";

export default defineComponent({
  name: "MainLayout",

  components: {
    "header-area": Header,
  },

  setup() {
    const route = useRoute();
    const backgroundMount = ref(null);
    let backgroundEffect = null;
    let backgroundLoader = null;
    let isDisposed = false;

    const ensureBackgroundEffect = async () => {
      if (backgroundEffect || backgroundLoader || !backgroundMount.value) {
        return backgroundEffect;
      }

      backgroundLoader = import("assets/liquid_ink_background.js")
        .then(async ({ initLiquidInkBackground }) => {
          if (isDisposed || !backgroundMount.value) {
            return null;
          }

          const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          backgroundEffect = await initLiquidInkBackground({
            mount: backgroundMount.value,
            prefersReducedMotion,
          });
          syncBackgroundState();
          return backgroundEffect;
        })
        .finally(() => {
          backgroundLoader = null;
        });

      return backgroundLoader;
    };

    const syncBackgroundState = () => {
      const hideOnRoute = route.path === "/light";
      backgroundEffect?.setActive(!hideOnRoute);
      backgroundEffect?.setInteractive(!hideOnRoute);
      backgroundEffect?.setAnimated(false);
    };

    onMounted(() => {
      authStore.ensureSession();
      if (route.path !== "/light") {
        ensureBackgroundEffect();
      }
    });

    watch(
      () => route.path,
      () => {
        if (route.path !== "/light" && !backgroundEffect) {
          ensureBackgroundEffect();
        }
        syncBackgroundState();
      }
    );

    onBeforeUnmount(() => {
      isDisposed = true;
      backgroundEffect?.destroy();
      backgroundEffect = null;
    });

    return {
      backgroundMount,
    };
  },
});
</script>

<style>
.page-shell-enter-active,
.page-shell-leave-active {
  transition:
    opacity 260ms ease,
    transform 260ms ease;
}

.page-shell-enter-from,
.page-shell-leave-to {
  opacity: 0;
  transform: translate3d(0, 0.9rem, 0);
}

@media (prefers-reduced-motion: reduce) {
  .page-shell-enter-active,
  .page-shell-leave-active {
    transition: none;
  }

  .page-shell-enter-from,
  .page-shell-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
