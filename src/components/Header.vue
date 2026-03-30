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
        <router-link to="/haiku-number" class="link"><p>Haiku #</p></router-link>
        <router-link to="/library" class="link"><p>Thư viện</p></router-link>
      </div>
    </nav>
    <div
      class="page__auth"
      :class="{ 'page__auth--authenticated': isAuthenticated }"
    >
      <router-link v-if="isAdmin" to="/admin" class="page__auth-link">Admin</router-link>
      <template v-if="isAuthenticated">
        <router-link to="/profile" class="page__auth-link page__auth-link--profile">
          {{ authDisplayName }}
        </router-link>
        <span class="page__auth-label">{{ authRoleLabel }}</span>
      </template>
      <router-link v-if="!isAuthenticated" to="/login" class="page__auth-link">Đăng nhập</router-link>
      <button v-else class="page__auth-button" type="button" @click="logout">Đăng xuất</button>
      <button
        class="page__theme-toggle"
        :class="themeToggleClass"
        type="button"
        :aria-pressed="isThemeOverridden ? 'true' : 'false'"
        :aria-label="themeToggleAriaLabel"
        @click="toggleTheme"
      >
        <span
          class="page__theme-icon"
          :class="themeIconClass"
          aria-hidden="true"
        ></span>
      </button>
    </div>
  </header>
</template>

<script>
import { defineComponent } from "vue";
import authStore from "src/stores/authStore";
import themeStore from "src/stores/themeStore";

export default defineComponent({
  name: "page-header",
  computed: {
    isAuthenticated() {
      return Boolean(authStore.state.user);
    },
    isAdmin() {
      return authStore.isAdmin();
    },
    authDisplayName() {
      const user = authStore.state.user;
      if (!user) {
        return "Viewer";
      }
      return user.displayName || user.username;
    },
    authRoleLabel() {
      return authStore.state.user?.role || "viewer";
    },
    themeOverride() {
      return themeStore.state.userThemeOverride;
    },
    isThemeOverridden() {
      return this.themeOverride === "dark" || this.themeOverride === "light";
    },
    themeToggleClass() {
      return {
        "page__theme-toggle--active": this.isThemeOverridden,
        "page__theme-toggle--dark": this.themeOverride === "dark",
        "page__theme-toggle--light": this.themeOverride === "light",
      };
    },
    themeIconClass() {
      return {
        "page__theme-icon--moon": this.themeOverride === "dark",
        "page__theme-icon--sun": this.themeOverride === "light",
      };
    },
    themeToggleAriaLabel() {
      if (this.themeOverride === "dark") {
        return "Chuyển sang ép theme sáng";
      }

      if (this.themeOverride === "light") {
        return "Quay về theme tự động theo giờ";
      }

      return "Chuyển sang ép theme tối";
    },
  },
  methods: {
    returnHome() {
      window.location = "/";
    },
    toggleTheme() {
      themeStore.cycleThemeOverride();
    },
    async logout() {
      await authStore.logout();
      this.$router.push("/");
    },
  },
});
</script>
