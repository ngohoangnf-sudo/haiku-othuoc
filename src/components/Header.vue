<template>
  <header class="page__header">
    <h1 style="cursor: pointer;" @click="returnHome" class="page__title">
      <span class="page__title-prefix">Haiku |</span>
      <span class="page__title-main">Ô Thước</span>
    </h1>
    <nav class="page__nav">
      <div class="page__nav-column">
        <router-link to="/read/jp" class="link"><p>Đọc</p></router-link>
        <router-link to="/write" class="link"><p>Viết</p></router-link>
        <router-link to="/authors" class="link"><p>Tác giả</p></router-link>
      </div>
      <div class="page__nav-column page__nav-column--secondary" aria-label="Mục đang phát triển">
        <span class="page__nav-label">Nghĩ</span>
        <span class="page__nav-label">Haiku #</span>
        <span class="page__nav-label">Thư viện</span>
      </div>
    </nav>
  </header>
</template>

<script>
import { defineComponent } from "vue";

export default defineComponent({
  name: "page-header",
  methods: {
    returnHome() {
      window.location = "/";
    },
  },
});
</script>
