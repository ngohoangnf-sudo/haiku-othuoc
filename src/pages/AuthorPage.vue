<template>
  <div class="content">
    <div class="content__item" style="--aspect-ratio: 12/60">
      <h2 class="content__item-title content__item-title--layer">{{ authorName }}</h2>
      <div class="content__item-description">
        <p>Trang tác giả với {{ poems.length }} bài haiku.</p>
        <p v-if="error">{{ error }}</p>
        <p v-else-if="loading">Đang tải...</p>
        <p v-if="authors.length">Tác giả khác: 
          <router-link
            v-for="item in authors"
            :key="item.authorSlug"
            :to="'/authors/' + item.authorSlug"
            class="link"
          >
            <span :style="{ marginRight: '0.75rem' }">{{ item.author }}</span>
          </router-link>
        </p>
      </div>
    </div>

    <div v-for="(poem, index) in poems" :key="poem.id" class="content__item" style="--aspect-ratio: 700/200">
      <h3 class="content__item-title content__item-title--layer">{{ poem.title || "Haiku" }}</h3>
      <div class="content__item-poem without-image grid g3">
        <div class="link w-inline-block -col-or-link">
          <p v-for="(line, i) in poem.lines" :key="i" class="nowrap" :class="index % 2 === 0 ? 'left' : 'right'">{{ line }}</p>
          <router-link :to="'/post/' + poem.id" class="link"><p class="left">Xem bài · {{ formatDate(poem.publishedAt) }}</p></router-link>
        </div>
      </div>
    </div>

    <div v-if="!loading && !poems.length" class="content__item">
      <div class="content__item-description">
        <p>Chưa có bài viết cho tác giả này.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, onMounted } from "vue";
import { useRoute } from "vue-router";
import blogStore from "src/stores/blogStore";

export default defineComponent({
  name: "AuthorPage",
  setup() {
    const route = useRoute();

    onMounted(() => {
      blogStore.loadPosts();
      blogStore.loadAuthors();
    });

    const fallbackSlug =
      blogStore.state.posts[0]?.authorSlug || "basho";

    const slug = computed(() => route.params.slug || fallbackSlug);
    const poems = computed(() =>
      blogStore.getPostsByAuthorSlug(slug.value)
    );
    const authorName = computed(
      () => poems.value[0]?.author || "Tác giả"
    );

    const authors = computed(() => blogStore.getAuthors());

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

    const loading = computed(() => blogStore.state.loading);
    const error = computed(() => blogStore.state.error);

    return { poems, authorName, authors, formatDate, loading, error };
  },
});
</script>
