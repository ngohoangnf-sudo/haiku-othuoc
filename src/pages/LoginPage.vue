<template>
  <div class="login-page">
    <section class="login-page__hero">
      <h1 class="login-page__title page-reading-h2">Đăng nhập</h1>
      <p class="login-page__lead page-reading-copy">
        Viewer có thể đọc tự do. Editor và Admin đăng nhập để chỉnh sửa nội dung hoặc quản trị hệ thống.
      </p>
    </section>

    <form class="login-form" @submit.prevent="submitLogin">
      <label class="login-form__field">
        <span class="login-form__label">Tên đăng nhập</span>
        <input v-model="username" class="login-form__input" autocomplete="username" />
      </label>

      <label class="login-form__field">
        <span class="login-form__label">Mật khẩu</span>
        <input
          v-model="password"
          class="login-form__input"
          type="password"
          autocomplete="current-password"
        />
      </label>

      <div class="login-form__actions">
        <button class="login-form__submit" type="submit" :disabled="loading">
          {{ loading ? "Đang đăng nhập..." : "Đăng nhập" }}
        </button>
      </div>

      <p v-if="error" class="login-form__feedback login-form__feedback--error page-reading-copy">
        {{ error }}
      </p>
      <p v-else class="login-form__feedback page-reading-copy">
        Tài khoản admin mặc định ở local: <code>admin</code> / <code>admin123456</code> nếu bạn chưa đổi trong env.
      </p>
    </form>
  </div>
</template>

<script>
import { defineComponent, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import authStore from "src/stores/authStore";

export default defineComponent({
  name: "LoginPage",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const username = ref("");
    const password = ref("");
    const error = ref("");
    const loading = ref(false);

    const submitLogin = async () => {
      error.value = "";
      loading.value = true;

      try {
        const user = await authStore.login(username.value, password.value);
        const redirect =
          typeof route.query.redirect === "string" && route.query.redirect
            ? route.query.redirect
            : user?.role === "admin"
              ? "/admin"
              : "/write";
        router.push(redirect);
      } catch (err) {
        error.value = err.message || "Không đăng nhập được.";
      } finally {
        loading.value = false;
      }
    };

    return {
      username,
      password,
      error,
      loading,
      submitLogin,
    };
  },
});
</script>

<style scoped>
.login-page {
  width: min(760px, calc(100vw - 4rem));
  margin: 0 auto;
  padding: 7rem 0 5rem;
  display: grid;
  gap: 2rem;
}

.login-page__hero {
  display: grid;
  gap: 1rem;
}

.login-page__title,
.login-page__lead {
  margin: 0;
}

.login-page__lead {
  max-width: 42rem;
  color: rgba(177, 165, 159, 0.84);
}

.login-form {
  display: grid;
  gap: 1rem;
  max-width: 34rem;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02)),
    rgba(27, 25, 25, 0.38);
}

.login-form__field {
  display: grid;
  gap: 0.55rem;
}

.login-form__label {
  color: rgba(177, 165, 159, 0.74);
}

.login-form__input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e6e0db;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  font: inherit;
}

.login-form__input:focus {
  outline: 2px solid rgba(221, 82, 90, 0.6);
}

.login-form__actions {
  padding-top: 0.5rem;
}

.login-form__submit {
  min-width: 11rem;
  padding: 0.8rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #e6e0db;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.login-form__feedback {
  margin: 0;
  color: rgba(177, 165, 159, 0.82);
}

.login-form__feedback--error {
  color: #f0b9b0;
}

code {
  font-size: 0.95em;
}

@media (max-width: 640px) {
  .login-page {
    width: min(100vw - 2rem, 760px);
    padding: 5rem 0 4rem;
  }
}
</style>
