<template>
  <section class="coming-soon-page">
    <header class="coming-soon-page__hero">
      <h1 class="coming-soon-page__title page-reading-h2 page-heading-with-rule">
        {{ pageTitle }}
      </h1>
      <p class="coming-soon-page__lead page-reading-copy">
        {{ pageMessage }}
      </p>
    </header>
  </section>
</template>

<script>
import { computed, defineComponent } from "vue";
import { useRoute } from "vue-router";

export default defineComponent({
  name: "ComingSoonPage",
  setup() {
    const route = useRoute();

    const pageTitle = computed(() => String(route.meta?.title || "Coming soon"));
    const pageMessage = computed(() =>
      String(route.meta?.message || "Nội dung này đang được hoàn thiện. Coming soon.")
    );

    return {
      pageTitle,
      pageMessage,
    };
  },
});
</script>

<style scoped>
.coming-soon-page {
  width: min(860px, calc(100vw - 4rem));
  margin: 0 auto;
  padding: 7rem 0 6rem;
}

.coming-soon-page__hero {
  display: grid;
  gap: 1.15rem;
  max-width: 40rem;
}

.coming-soon-page__title,
.coming-soon-page__lead {
  margin: 0;
}

.coming-soon-page__lead {
  color: var(--color-muted);
}

@media (max-width: 640px) {
  .coming-soon-page {
    width: min(100vw - 2rem, 860px);
    padding: 5rem 0 4rem;
  }
}
</style>
