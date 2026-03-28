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
        <router-link to="/essays" class="link"><p>Nghĩ</p></router-link>
      </div>
      <div class="page__nav-column page__nav-column--secondary" aria-label="Mục đang phát triển">
        <router-link to="/authors" class="link"><p>Tác giả</p></router-link>
        <span class="page__nav-label">Haiku #</span>
        <span class="page__nav-label">Thư viện</span>
      </div>
    </nav>
    <div class="page__auth">
      <router-link v-if="isAdmin" to="/admin" class="page__auth-link">Admin</router-link>
      <span v-if="isAuthenticated" class="page__auth-label">{{ authLabel }}</span>
      <router-link v-if="!isAuthenticated" to="/login" class="page__auth-link">Đăng nhập</router-link>
      <button v-else class="page__auth-button" type="button" @click="logout">Đăng xuất</button>
    </div>
  </header>
</template>

<script>
import { defineComponent } from "vue";
import authStore from "src/stores/authStore";

export default defineComponent({
  name: "page-header",
  computed: {
    isAuthenticated() {
      return Boolean(authStore.state.user);
    },
    isAdmin() {
      return authStore.isAdmin();
    },
    authLabel() {
      const user = authStore.state.user;
      if (!user) {
        return "Viewer";
      }
      return `${user.displayName || user.username} · ${user.role}`;
    },
  },
  methods: {
    returnHome() {
      window.location = "/";
    },
    async logout() {
      await authStore.logout();
      this.$router.push("/");
    },
  },
});
</script>
