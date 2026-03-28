<template>
  <div class="content content--offset">
    <div v-if="loading" class="content__item" style="--aspect-ratio: 12/40">
      <div class="content__item-description">
        <p class="page-reading-copy">Đang tải bài viết...</p>
      </div>
    </div>

    <div v-else-if="post" class="content__item" style="--aspect-ratio: 700/240">
      <h2 v-if="post.title" class="content__item-title content__item-title--layer page-reading-h2">{{ post.title }}</h2>
      <div class="content__item-description">
        <p v-if="post.summary" class="page-reading-copy">{{ post.summary }}</p>
        <p class="page-reading-copy">{{ formatDate(post.publishedAt) }} • {{ categoryLabel(post.category) }}</p>
      </div>
      <div class="content__item-poem content__item-img without-image grid g3">
        <div class="link w-inline-block -col-or-link">
          <p v-for="(line, i) in post.lines" :key="i" class="nowrap page-reading-copy" :class="i % 2 === 0 ? 'left' : 'right'">{{ line }}</p>
          <img v-if="post.image" class="" :src="resolveImage(post.image)" alt="haiku-image" />
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
import { computed, defineComponent, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import blogStore from "src/stores/blogStore";
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
    const post = computed(() => blogStore.getPostById(route.params.id));
    const loading = computed(() => blogStore.state.loading);

    const fetchCurrent = async () => {
      await blogStore.fetchPostById(route.params.id);
    };

    onMounted(fetchCurrent);
    watch(
      () => route.params.id,
      () => fetchCurrent()
    );

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

    return { post, formatDate, categoryLabel, resolveImage: resolveMediaUrl, loading };
  },
});
</script>
