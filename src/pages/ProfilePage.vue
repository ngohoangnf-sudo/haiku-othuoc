<template>
  <div class="profile-page">
    <section class="profile-page__hero">
      <h1 class="profile-page__title page-reading-h2 page-heading-with-rule">Hồ sơ cá nhân</h1>
      <p class="profile-page__lead page-reading-copy">
        Cập nhật tên hiển thị, mật khẩu và xem lại các hoạt động gần đây của bạn.
      </p>
      <p v-if="statusMessage" class="profile-page__status page-reading-copy">{{ statusMessage }}</p>
      <p
        v-if="errorMessage"
        class="profile-page__status profile-page__status--error page-reading-copy"
      >
        {{ errorMessage }}
      </p>
    </section>

    <section class="profile-page__section">
      <div class="profile-page__section-head">
        <h2 class="page-reading-h3">Thông tin tài khoản</h2>
      </div>

      <form class="profile-form" @submit.prevent="submitProfile">
        <div class="profile-form__grid">
          <label class="profile-form__field">
            <span class="profile-form__label">Tên đăng nhập</span>
            <input :value="currentUser?.username || ''" class="profile-form__input" disabled />
          </label>

          <label class="profile-form__field">
            <span class="profile-form__label">Vai trò</span>
            <input :value="currentUser?.role || ''" class="profile-form__input" disabled />
          </label>

          <label class="profile-form__field profile-form__field--wide">
            <span class="profile-form__label">Tên hiển thị</span>
            <input v-model="form.displayName" class="profile-form__input" />
          </label>

          <label class="profile-form__field">
            <span class="profile-form__label">Mật khẩu mới</span>
            <input
              v-model="form.password"
              class="profile-form__input"
              type="password"
              autocomplete="new-password"
              placeholder="Ít nhất 8 ký tự"
            />
          </label>

          <label class="profile-form__field">
            <span class="profile-form__label">Nhập lại mật khẩu</span>
            <input
              v-model="form.passwordConfirm"
              class="profile-form__input"
              type="password"
              autocomplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
            />
          </label>
        </div>

        <div class="profile-form__actions">
          <button class="profile-form__submit" type="submit" :disabled="saving">
            {{ saving ? "Đang lưu..." : "Lưu thay đổi" }}
          </button>
        </div>
      </form>
    </section>

    <section class="profile-page__section">
      <div class="profile-page__section-head">
        <h2 class="page-reading-h3">Hoạt động của bạn</h2>
        <p class="page-reading-copy">{{ selfActivity.length }} bản ghi gần nhất.</p>
      </div>

      <div v-if="selfActivityLoading" class="profile-page__empty page-reading-copy">
        Đang tải nhật ký...
      </div>
      <div v-else-if="!selfActivity.length" class="profile-page__empty page-reading-copy">
        Chưa có hoạt động nào được ghi nhận.
      </div>
      <div v-else class="profile-activity-list">
        <article v-for="entry in selfActivity" :key="entry.id" class="profile-activity-item">
          <p class="profile-activity-item__headline page-reading-copy">
            <strong>{{ describeAction(entry) }}</strong>
          </p>
          <p class="profile-activity-item__meta page-reading-copy">
            <span>{{ formatDateTime(entry.createdAt) }}</span>
            <span v-if="entry.resourceId" aria-hidden="true">•</span>
            <span v-if="entry.resourceId">{{ entry.resourceId }}</span>
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, onMounted, reactive, ref, watch } from "vue";
import authStore from "src/stores/authStore";

export default defineComponent({
  name: "ProfilePage",
  setup() {
    const saving = ref(false);
    const statusMessage = ref("");
    const errorMessage = ref("");
    const form = reactive({
      displayName: "",
      password: "",
      passwordConfirm: "",
    });

    const currentUser = computed(() => authStore.state.user);
    const selfActivity = computed(() => authStore.state.selfActivity);
    const selfActivityLoading = computed(() => authStore.state.selfActivityLoading);

    const syncForm = () => {
      form.displayName = currentUser.value?.displayName || currentUser.value?.username || "";
      form.password = "";
      form.passwordConfirm = "";
    };

    watch(currentUser, syncForm, { immediate: true });

    onMounted(async () => {
      try {
        await authStore.ensureSession();
        await Promise.all([authStore.loadProfile(true), authStore.loadSelfActivity(true)]);
        syncForm();
      } catch (error) {
        errorMessage.value = error.message || "Không tải được hồ sơ cá nhân.";
      }
    });

    const submitProfile = async () => {
      statusMessage.value = "";
      errorMessage.value = "";

      const payload = {};
      const trimmedDisplayName = form.displayName.trim();
      const currentDisplayName = currentUser.value?.displayName || currentUser.value?.username || "";

      if (!trimmedDisplayName) {
        errorMessage.value = "Tên hiển thị không được để trống.";
        return;
      }

      if (trimmedDisplayName !== currentDisplayName) {
        payload.displayName = trimmedDisplayName;
      }

      if (form.password || form.passwordConfirm) {
        if (form.password.length < 8) {
          errorMessage.value = "Mật khẩu mới cần ít nhất 8 ký tự.";
          return;
        }

        if (form.password !== form.passwordConfirm) {
          errorMessage.value = "Mật khẩu nhập lại không khớp.";
          return;
        }

        payload.password = form.password;
      }

      if (!Object.keys(payload).length) {
        errorMessage.value = "Chưa có thay đổi nào để lưu.";
        return;
      }

      saving.value = true;

      try {
        await authStore.updateProfile(payload);
        await authStore.loadSelfActivity(true);
        syncForm();
        statusMessage.value = "Đã cập nhật hồ sơ cá nhân.";
      } catch (error) {
        errorMessage.value = error.message || "Không cập nhật được hồ sơ cá nhân.";
      } finally {
        saving.value = false;
      }
    };

    const formatDateTime = (value) => {
      if (!value) return "";
      try {
        return new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value));
      } catch (_error) {
        return value;
      }
    };

    const describeAction = (entry) => {
      const actionMap = {
        "auth.login": "Đăng nhập",
        "auth.logout": "Đăng xuất",
        "post.create": "Tạo bài thơ",
        "post.update": "Cập nhật bài thơ",
        "post.delete": "Xóa bài thơ",
        "essay.create": "Tạo bài luận",
        "essay.update": "Cập nhật bài luận",
        "essay.delete": "Xóa bài luận",
        "user.profile.update": "Cập nhật hồ sơ cá nhân",
      };

      return actionMap[entry.action] || entry.action;
    };

    return {
      currentUser,
      form,
      saving,
      statusMessage,
      errorMessage,
      selfActivity,
      selfActivityLoading,
      submitProfile,
      formatDateTime,
      describeAction,
    };
  },
});
</script>

<style scoped>
.profile-page {
  width: min(1040px, calc(100vw - 4rem));
  margin: 0 auto;
  padding: 7rem 0 5rem;
  display: grid;
  gap: 3rem;
}

.profile-page__hero,
.profile-page__section {
  display: grid;
  gap: 1rem;
}

.profile-page__title,
.profile-page__lead,
.profile-page__status,
.profile-page__section-head h2,
.profile-page__section-head p {
  margin: 0;
}

.profile-page__lead,
.profile-page__empty,
.profile-page__section-head p {
  color: var(--color-muted);
}

.profile-page__status {
  color: var(--color-muted);
}

.profile-page__status--error {
  color: #f0b9b0;
}

.profile-form {
  display: grid;
  gap: 1.2rem;
  max-width: 48rem;
  padding: 1.6rem;
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  background: var(--surface-panel-bg);
}

.profile-form__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-form__field {
  display: grid;
  gap: 0.55rem;
}

.profile-form__field--wide {
  grid-column: 1 / -1;
}

.profile-form__label {
  color: var(--color-muted-soft);
}

.profile-form__input {
  width: 100%;
  background: var(--surface-input-bg);
  border: 1px solid var(--surface-input-border);
  color: var(--color-text);
  padding: 0.85rem 1rem;
  border-radius: 8px;
  font: inherit;
}

.profile-form__input:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.profile-form__input:focus {
  outline: 1px solid var(--focus-outline);
  border-color: var(--focus-border);
  background: var(--surface-input-focus-bg);
  box-shadow:
    0 0 0 3px var(--focus-ring),
    0 10px 24px rgba(0, 0, 0, 0.12);
}

.profile-form__actions {
  display: flex;
  justify-content: flex-start;
}

.profile-form__submit {
  min-width: 11rem;
  padding: 0.8rem 1rem;
  border: 1px solid var(--surface-button-border);
  background: var(--surface-button-bg);
  color: var(--color-text);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.profile-form__submit:disabled {
  opacity: 0.7;
  cursor: progress;
}

.profile-activity-list {
  display: grid;
  gap: 0.9rem;
  max-width: 48rem;
}

.profile-activity-item {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border-soft);
}

.profile-activity-item__headline,
.profile-activity-item__meta {
  margin: 0;
}

.profile-activity-item__meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--color-muted);
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .profile-page {
    width: min(100vw - 2rem, 1040px);
    padding: 5rem 0 4rem;
  }

  .profile-form {
    padding: 1.2rem;
  }

  .profile-form__grid {
    grid-template-columns: 1fr;
  }

  .profile-form__field--wide {
    grid-column: auto;
  }
}
</style>
