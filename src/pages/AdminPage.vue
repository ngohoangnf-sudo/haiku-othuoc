<template>
  <div class="admin-page">
    <section class="admin-page__hero">
      <h1 class="admin-page__title page-reading-h2 page-heading-with-rule">Admin</h1>
      <p class="admin-page__lead page-reading-copy">
        Quản lý tài khoản Editor/Admin và theo dõi hoạt động gần đây trong hệ thống.
      </p>
      <p v-if="statusMessage" class="admin-page__status page-reading-copy">{{ statusMessage }}</p>
      <p v-if="errorMessage" class="admin-page__status admin-page__status--error page-reading-copy">
        {{ errorMessage }}
      </p>
    </section>

    <section class="admin-page__section">
      <div class="admin-page__section-head">
        <h2 class="page-reading-h3">Tạo tài khoản</h2>
      </div>

      <form class="admin-form" @submit.prevent="submitNewUser">
        <label class="admin-form__field">
          <span class="admin-form__label">Tên đăng nhập</span>
          <input v-model="newUser.username" class="admin-form__input" />
        </label>

        <label class="admin-form__field">
          <span class="admin-form__label">Tên hiển thị</span>
          <input v-model="newUser.displayName" class="admin-form__input" />
        </label>

        <label class="admin-form__field">
          <span class="admin-form__label">Vai trò</span>
          <select v-model="newUser.role" class="admin-form__input">
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <label class="admin-form__field">
          <span class="admin-form__label">Mật khẩu</span>
          <input v-model="newUser.password" class="admin-form__input" type="password" />
        </label>

        <div class="admin-form__actions">
          <button class="admin-form__submit" type="submit" :disabled="creatingUser">
            {{ creatingUser ? "Đang tạo..." : "Tạo tài khoản" }}
          </button>
        </div>
      </form>
    </section>

    <section class="admin-page__section">
      <div class="admin-page__section-head">
        <h2 class="page-reading-h3">Tài khoản</h2>
        <p class="page-reading-copy">{{ users.length }} tài khoản có quyền chỉnh sửa.</p>
      </div>

      <div v-if="usersLoading" class="admin-page__empty page-reading-copy">Đang tải tài khoản...</div>
      <div v-else class="admin-page__user-list">
        <article v-for="user in users" :key="user.id" class="admin-user-card">
          <div class="admin-user-card__meta">
            <h3 class="admin-user-card__title">{{ user.displayName || user.username }}</h3>
            <p class="admin-user-card__subcopy page-reading-copy">
              <span>@{{ user.username }}</span>
              <span aria-hidden="true">•</span>
              <span>{{ user.role }}</span>
              <span aria-hidden="true">•</span>
              <span>{{ user.status }}</span>
            </p>
          </div>

          <div class="admin-user-card__grid">
            <label class="admin-form__field">
              <span class="admin-form__label">Tên hiển thị</span>
              <input v-model="draftUsers[user.id].displayName" class="admin-form__input" />
            </label>

            <label class="admin-form__field">
              <span class="admin-form__label">Vai trò</span>
              <select v-model="draftUsers[user.id].role" class="admin-form__input">
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <label class="admin-form__field">
              <span class="admin-form__label">Trạng thái</span>
              <select v-model="draftUsers[user.id].status" class="admin-form__input">
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </label>

            <label class="admin-form__field">
              <span class="admin-form__label">Mật khẩu mới</span>
              <input
                v-model="draftUsers[user.id].password"
                class="admin-form__input"
                type="password"
                placeholder="Để trống nếu giữ nguyên"
              />
            </label>
          </div>

          <div class="admin-user-card__footer">
            <p class="page-reading-copy">
              Lần đăng nhập gần nhất: {{ formatDateTime(user.lastLoginAt) || "chưa có" }}
            </p>
            <button class="admin-form__submit" type="button" @click="saveUser(user)" :disabled="savingUserId === user.id">
              {{ savingUserId === user.id ? "Đang lưu..." : "Lưu thay đổi" }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="admin-page__section">
      <div class="admin-page__section-head">
        <h2 class="page-reading-h3">Hoạt động gần đây</h2>
      </div>

      <div v-if="activityLoading" class="admin-page__empty page-reading-copy">Đang tải nhật ký...</div>
      <div v-else-if="!activity.length" class="admin-page__empty page-reading-copy">
        Chưa có hoạt động nào được ghi nhận.
      </div>
      <div v-else class="activity-list">
        <article v-for="entry in activity" :key="entry.id" class="activity-item">
          <p class="activity-item__headline page-reading-copy">
            <strong>{{ entry.actor?.displayName || entry.actor?.username || "System" }}</strong>
            <span>{{ describeAction(entry) }}</span>
          </p>
          <p class="activity-item__meta page-reading-copy">
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
  name: "AdminPage",
  setup() {
    const statusMessage = ref("");
    const errorMessage = ref("");
    const creatingUser = ref(false);
    const savingUserId = ref("");
    const draftUsers = reactive({});
    const newUser = reactive({
      username: "",
      displayName: "",
      role: "editor",
      password: "",
    });

    const users = computed(() => authStore.state.users);
    const usersLoading = computed(() => authStore.state.usersLoading);
    const activity = computed(() => authStore.state.activity);
    const activityLoading = computed(() => authStore.state.activityLoading);

    const syncDrafts = () => {
      users.value.forEach((user) => {
        draftUsers[user.id] = {
          displayName: user.displayName || "",
          role: user.role,
          status: user.status,
          password: "",
        };
      });
    };

    onMounted(async () => {
      try {
        await Promise.all([authStore.loadUsers(true), authStore.loadActivity(true)]);
        syncDrafts();
      } catch (error) {
        errorMessage.value = error.message || "Không tải được dữ liệu quản trị.";
      }
    });

    watch(users, syncDrafts, { deep: true, immediate: true });

    const submitNewUser = async () => {
      statusMessage.value = "";
      errorMessage.value = "";
      creatingUser.value = true;

      try {
        await authStore.createUser({
          username: newUser.username,
          displayName: newUser.displayName,
          role: newUser.role,
          password: newUser.password,
        });
        await authStore.loadActivity(true);
        syncDrafts();
        statusMessage.value = `Đã tạo tài khoản ${newUser.username}.`;
        newUser.username = "";
        newUser.displayName = "";
        newUser.role = "editor";
        newUser.password = "";
      } catch (error) {
        errorMessage.value = error.message || "Không tạo được tài khoản.";
      } finally {
        creatingUser.value = false;
      }
    };

    const saveUser = async (user) => {
      statusMessage.value = "";
      errorMessage.value = "";
      savingUserId.value = user.id;

      try {
        const draft = draftUsers[user.id];
        await authStore.updateUser(user.id, {
          displayName: draft.displayName,
          role: draft.role,
          status: draft.status,
          password: draft.password || undefined,
        });
        await authStore.loadActivity(true);
        draft.password = "";
        statusMessage.value = `Đã cập nhật tài khoản ${user.username}.`;
      } catch (error) {
        errorMessage.value = error.message || "Không cập nhật được tài khoản.";
      } finally {
        savingUserId.value = "";
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
        "auth.login": "đăng nhập",
        "auth.logout": "đăng xuất",
        "post.create": "tạo bài thơ",
        "post.update": "cập nhật bài thơ",
        "post.delete": "xóa bài thơ",
        "essay.create": "tạo bài luận",
        "essay.update": "cập nhật bài luận",
        "essay.delete": "xóa bài luận",
        "admin.user.create": "tạo tài khoản",
        "admin.user.update": "cập nhật tài khoản",
        "admin.bootstrap": "khởi tạo tài khoản admin mặc định",
      };

      return actionMap[entry.action] || entry.action;
    };

    return {
      users,
      usersLoading,
      activity,
      activityLoading,
      draftUsers,
      newUser,
      creatingUser,
      savingUserId,
      statusMessage,
      errorMessage,
      submitNewUser,
      saveUser,
      formatDateTime,
      describeAction,
    };
  },
});
</script>

<style scoped>
.admin-page {
  width: min(1120px, calc(100vw - 4rem));
  margin: 0 auto;
  padding: 7rem 0 5rem;
  display: grid;
  gap: 3rem;
}

.admin-page__hero,
.admin-page__section {
  display: grid;
  gap: 1rem;
}

.admin-page__title,
.admin-page__lead,
.admin-page__status,
.admin-page__section-head h2,
.admin-page__section-head p {
  margin: 0;
}

.admin-page__lead,
.admin-page__status,
.admin-page__empty {
  color: var(--color-muted);
}

.admin-page__status--error {
  color: #f0b9b0;
}

.admin-form,
.admin-user-card,
.activity-item {
  padding: 1.5rem;
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  background: var(--surface-panel-bg);
}

.admin-form,
.admin-user-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.admin-form__field {
  display: grid;
  gap: 0.55rem;
}

.admin-form__label {
  color: var(--color-muted-soft);
}

.admin-form__input {
  width: 100%;
  background: var(--surface-input-bg);
  border: 1px solid var(--surface-input-border);
  color: var(--color-text);
  padding: 0.8rem 1rem;
  border-radius: 8px;
  font: inherit;
}

.admin-form__input:focus {
  outline: 1px solid var(--focus-outline);
  border-color: var(--focus-border);
  background: var(--surface-input-focus-bg);
  box-shadow:
    0 0 0 3px var(--focus-ring),
    0 10px 24px rgba(0, 0, 0, 0.12);
}

.admin-form__actions,
.admin-user-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.admin-form__actions {
  grid-column: 1 / -1;
  padding-top: 0.5rem;
}

.admin-form__submit {
  min-width: 11rem;
  padding: 0.8rem 1rem;
  border: 1px solid var(--surface-button-border);
  background: var(--surface-button-bg);
  color: var(--color-text);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.admin-page__user-list,
.activity-list {
  display: grid;
  gap: 1rem;
}

.admin-user-card {
  display: grid;
  gap: 1.25rem;
}

.admin-user-card__title,
.admin-user-card__subcopy,
.activity-item__headline,
.activity-item__meta {
  margin: 0;
}

.admin-user-card__subcopy,
.activity-item__meta {
  color: var(--color-muted-soft);
}

.admin-user-card__subcopy,
.activity-item__headline,
.activity-item__meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .admin-page {
    width: min(100vw - 2rem, 1120px);
    padding: 5rem 0 4rem;
  }
}
</style>
