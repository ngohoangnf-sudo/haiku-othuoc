<template>
  <main>
    <div ref="backgroundMount" class="page__background"></div>
    <div data-scroll class="page page--layout-1">
      <header-area />
      <router-view />
    </div>
  </main>
</template>

<script>
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Header from "components/Header.vue";
import { initLiquidInkBackground } from "assets/liquid_ink_background.js";

export default defineComponent({
  name: "MainLayout",

  components: {
    "header-area": Header,
  },

  setup() {
    const route = useRoute();
    const backgroundMount = ref(null);
    let backgroundEffect = null;

    const syncBackgroundState = () => {
      const hideOnRoute = route.path === "/" || route.path === "/light";
      backgroundEffect?.setActive(!hideOnRoute);
    };

    onMounted(() => {
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      backgroundEffect = initLiquidInkBackground({
        mount: backgroundMount.value,
        prefersReducedMotion,
      });
      syncBackgroundState();
    });

    watch(
      () => route.path,
      () => {
        syncBackgroundState();
      }
    );

    onBeforeUnmount(() => {
      backgroundEffect?.destroy();
      backgroundEffect = null;
    });

    return {
      backgroundMount,
    };
  },
});
</script>
