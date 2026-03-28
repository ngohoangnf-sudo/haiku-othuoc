<template>
  <div class="write-page">
    <teleport to="body">
      <transition name="write-toast">
        <div v-if="toastVisible" class="write-page__toast" role="status" aria-live="polite">
          {{ toastMessage }}
        </div>
      </transition>
    </teleport>

    <section class="write-page__composer">
      <div class="write-page__intro">
        <h1 class="write-page__heading page-reading-h2 page-heading-with-rule">Viết & đăng bài</h1>
        <p class="write-page__lead page-reading-copy">
          Chọn đăng haiku hoặc bài luận/ghi chép.
        </p>
        <p v-if="!canEdit" class="write-page__status page-reading-copy">
          Bạn đang ở quyền Viewer. Hãy <router-link to="/login">đăng nhập</router-link> bằng tài khoản Editor hoặc Admin để đăng và chỉnh sửa nội dung.
        </p>
        <p v-if="error" class="write-page__status write-page__status--error page-reading-copy">{{ error }}</p>
        <p v-else-if="loading" class="write-page__status page-reading-copy">Đang tải danh sách...</p>
      </div>

      <div v-if="canEdit" class="write-page__editor">
        <div class="write-page__mode-switch" role="tablist" aria-label="Chọn loại nội dung">
          <button
            class="write-page__mode-tab"
            :class="{ 'write-page__mode-tab--active': activeComposer === 'poem' }"
            type="button"
            @click="activeComposer = 'poem'"
          >
            <span class="write-page__mode-tab-label">Haiku</span>
          </button>
          <button
            class="write-page__mode-tab"
            :class="{ 'write-page__mode-tab--active': activeComposer === 'essay' }"
            type="button"
            @click="activeComposer = 'essay'"
          >
            <span class="write-page__mode-tab-label">Bài luận / ghi chép</span>
          </button>
        </div>

        <form v-if="activeComposer === 'poem'" class="write-form" @submit.prevent="submitPoem">
          <label class="form-field">
            <span class="form-field__label">Tiêu đề</span>
            <input v-model="poemForm.title" class="input" placeholder="Tiêu đề bài" />
          </label>
          <label class="form-field">
            <span class="form-field__label">Tác giả</span>
            <div class="form-field__autocomplete">
              <input
                v-model="poemForm.author"
                class="input"
                placeholder="Tên tác giả"
                autocomplete="off"
                @focus="openAuthorSuggestions('poem')"
                @blur="scheduleAuthorSuggestionsClose('poem')"
              />
              <div
                v-if="showPoemAuthorSuggestions"
                class="form-field__autocomplete-menu"
              >
                <button
                  v-for="item in poemAuthorSuggestions"
                  :key="`poem-author-${item.authorSlug}`"
                  type="button"
                  class="form-field__autocomplete-option"
                  @mousedown.prevent="selectSuggestedAuthor('poem', item.author)"
                >
                  {{ item.author }}
                </button>
              </div>
            </div>
          </label>
          <label class="form-field">
            <span class="form-field__label">Phân loại</span>
            <ElegantSelect
              v-model="poemForm.category"
              :options="categoryOptions"
              aria-label="Phân loại haiku"
            />
          </label>
          <label class="form-field">
            <span class="form-field__label">Tóm tắt</span>
            <input v-model="poemForm.summary" class="input" placeholder="1-2 câu mô tả ngắn" />
          </label>
          <label class="form-field">
            <span class="form-field__label">URL ảnh (tùy chọn)</span>
            <input v-model="poemForm.image" class="input" placeholder="https://... hoặc data URL" />
          </label>
          <label class="form-field">
            <span class="form-field__label form-field__label--with-tooltip">
              <span>Tải ảnh trực tiếp (tùy chọn)</span>
              <span class="form-field__tooltip-wrap">
                <span class="form-field__tooltip-trigger" aria-hidden="true">?</span>
                <span class="form-field__tooltip">
                  Chấp nhận PNG, JPG, WEBP dưới 5MB. Nếu đã có URL ảnh hoặc ảnh cũ, bạn vẫn có thể giữ nguyên.
                </span>
              </span>
            </span>
            <div class="upload-field" :class="{ 'upload-field--filled': Boolean(poemForm.image) }">
              <input
                ref="poemImageInput"
                class="upload-field__input"
                type="file"
                accept="image/*"
                @change="handleImageUpload($event, 'poem')"
              />
              <div class="upload-field__main">
                <span class="upload-field__title">
                  {{ poemUploadedImageName ? "Ảnh đã được tải lên" : poemForm.image ? "Đang dùng ảnh hiện tại" : "Chưa chọn ảnh" }}
                </span>
                <span v-if="poemUploadedImageName || poemForm.image" class="upload-field__meta">
                  {{ poemUploadedImageName || "Có thể là URL ảnh hoặc ảnh đã lưu trước đó" }}
                </span>
              </div>
              <div class="upload-field__actions">
                <button class="upload-field__button" type="button" @click="openImagePicker('poem')">
                  {{ poemForm.image ? "Đổi ảnh" : "Chọn ảnh" }}
                </button>
                <button
                  v-if="poemForm.image"
                  class="upload-field__button upload-field__button--ghost"
                  type="button"
                  @click="clearImage('poem')"
                >
                  Bỏ ảnh
                </button>
              </div>
            </div>
          </label>
          <label class="form-field form-field--wide">
            <span class="form-field__label">Nội dung</span>
            <textarea
              v-model="poemForm.linesInput"
              class="input"
              rows="4"
              placeholder="Bỏ lên chiếc quạt nhỏ
Từ Phú Sĩ gửi đi ngọn gió
Một chút quà Edo"
            ></textarea>
          </label>
          <div class="write-form__actions">
            <button class="submit-btn" type="submit">
              {{ editingPostId ? "Lưu chỉnh sửa" : "Đăng haiku" }}
            </button>
            <button
              v-if="editingPostId"
              class="submit-btn submit-btn--ghost"
              type="button"
              @click="cancelPoemEditing"
            >
              Hủy chỉnh sửa
            </button>
          </div>
          <p v-if="poemMessage" class="form-feedback page-reading-copy">{{ poemMessage }}</p>
        </form>

        <form v-else class="write-form" @submit.prevent="submitEssay">
          <label class="form-field">
            <span class="form-field__label">Tiêu đề</span>
            <input v-model="essayForm.title" class="input" placeholder="Tên bài luận / ghi chép" />
          </label>
          <label class="form-field">
            <span class="form-field__label">Tác giả</span>
            <div class="form-field__autocomplete">
              <input
                v-model="essayForm.author"
                class="input"
                placeholder="Tên tác giả"
                autocomplete="off"
                @focus="openAuthorSuggestions('essay')"
                @blur="scheduleAuthorSuggestionsClose('essay')"
              />
              <div
                v-if="showEssayAuthorSuggestions"
                class="form-field__autocomplete-menu"
              >
                <button
                  v-for="item in essayAuthorSuggestions"
                  :key="`essay-author-${item.authorSlug}`"
                  type="button"
                  class="form-field__autocomplete-option"
                  @mousedown.prevent="selectSuggestedAuthor('essay', item.author)"
                >
                  {{ item.author }}
                </button>
              </div>
            </div>
          </label>
          <label class="form-field">
            <span class="form-field__label">Trạng thái</span>
            <ElegantSelect
              v-model="essayForm.status"
              :options="[
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
              ]"
              aria-label="Trạng thái bài luận"
            />
          </label>
          <label class="form-field form-field--wide">
            <span class="form-field__label">Tóm tắt</span>
            <input v-model="essayForm.summary" class="input" placeholder="Một đoạn ngắn dẫn vào bài" />
          </label>
          <label class="form-field">
            <span class="form-field__label">URL ảnh bìa (tùy chọn)</span>
            <input v-model="essayForm.image" class="input" placeholder="https://... hoặc data URL" />
          </label>
          <label class="form-field">
            <span class="form-field__label form-field__label--with-tooltip">
              <span>Tải ảnh trực tiếp (tùy chọn)</span>
              <span class="form-field__tooltip-wrap">
                <span class="form-field__tooltip-trigger" aria-hidden="true">?</span>
                <span class="form-field__tooltip">
                  Chấp nhận PNG, JPG, WEBP dưới 5MB. Nếu đã có URL ảnh hoặc ảnh cũ, bạn vẫn có thể giữ nguyên.
                </span>
              </span>
            </span>
            <div class="upload-field" :class="{ 'upload-field--filled': Boolean(essayForm.image) }">
              <input
                ref="essayImageInput"
                class="upload-field__input"
                type="file"
                accept="image/*"
                @change="handleImageUpload($event, 'essay')"
              />
              <div class="upload-field__main">
                <span class="upload-field__title">
                  {{ essayUploadedImageName ? "Ảnh bìa đã được tải lên" : essayForm.image ? "Đang dùng ảnh bìa hiện tại" : "Chưa chọn ảnh bìa" }}
                </span>
                <span v-if="essayUploadedImageName || essayForm.image" class="upload-field__meta">
                  {{ essayUploadedImageName || "Có thể là URL ảnh hoặc ảnh đã lưu trước đó" }}
                </span>
              </div>
              <div class="upload-field__actions">
                <button class="upload-field__button" type="button" @click="openImagePicker('essay')">
                  {{ essayForm.image ? "Đổi ảnh" : "Chọn ảnh" }}
                </button>
                <button
                  v-if="essayForm.image"
                  class="upload-field__button upload-field__button--ghost"
                  type="button"
                  @click="clearImage('essay')"
                >
                  Bỏ ảnh
                </button>
              </div>
            </div>
          </label>
          <label class="form-field">
            <span class="form-field__label">Tags</span>
            <input v-model="essayForm.tagsInput" class="input" placeholder="Thi pháp, Đọc haiku, Ghi chép..." />
          </label>
          <label class="form-field form-field--wide">
            <span class="form-field__label">Nội dung bài</span>
            <textarea
              v-model="essayForm.body"
              class="input write-form__textarea--essay"
              rows="10"
              placeholder="Viết bài luận hoặc ghi chép ở đây.

Mỗi đoạn cách nhau bằng một dòng trống."
            ></textarea>
          </label>
          <div class="write-form__markdown-preview form-field--wide">
            <div class="write-form__markdown-head">
              <span class="form-field__label">Preview markdown</span>
              <span class="form-field__hint">Hỗ trợ nhẹ: `#`, `##`, `**bold**`, `*italic*`, ``code`` và link markdown.</span>
            </div>
            <div
              class="write-form__markdown-body page-reading-copy"
              v-html="essayMarkdownPreview"
            ></div>
          </div>
          <div class="write-form__actions">
            <button class="submit-btn" type="submit">
              {{ editingEssaySlug ? "Lưu chỉnh sửa" : "Đăng bài luận" }}
            </button>
            <button
              v-if="editingEssaySlug"
              class="submit-btn submit-btn--ghost"
              type="button"
              @click="cancelEssayEditing"
            >
              Hủy chỉnh sửa
            </button>
          </div>
          <p v-if="essayMessage" class="form-feedback page-reading-copy">{{ essayMessage }}</p>
        </form>
      </div>
    </section>

    <section
      v-if="showPoemPreviews"
      ref="poemPreviewSection"
      class="write-page__previews write-page__previews--poems"
    >
      <div class="write-page__previews-head">
        <div class="write-page__previews-head-top">
          <h2 class="write-page__subheading page-reading-h3">Haiku đã đăng</h2>
          <div class="write-page__preview-tools">
            <label class="write-page__preview-search">
              <span class="write-page__preview-search-icon" aria-hidden="true">⌕</span>
              <input
                v-model.trim="poemPreviewQuery"
                type="search"
                class="write-page__preview-search-input"
                placeholder="Tìm kiếm"
                aria-label="Tìm haiku đã đăng"
              />
            </label>
            <label class="write-page__preview-filter">
              <span class="write-page__preview-filter-label">Mục</span>
              <ElegantSelect
                v-model="poemPreviewCategory"
                class="write-page__preview-filter-select"
                :options="[
                  { value: '', label: 'Tất cả' },
                  { value: 'jp', label: 'Nhật' },
                  { value: 'vi', label: 'Việt' },
                  { value: 'global', label: 'Thế giới' },
                ]"
                aria-label="Lọc haiku theo mục"
              />
            </label>
          </div>
        </div>
        <p class="write-page__subcopy page-reading-copy">{{ previewPostsTotal }} bài</p>
      </div>

      <transition-group
        v-if="visiblePosts.length"
        name="write-page__preview-card"
        tag="div"
        :class="['write-page__preview-list', 'write-page__preview-list--poems']"
        :style="{ '--preview-exit-duration': `${poemExitDurationMs}ms` }"
      >
          <article
            v-for="(poem, index) in visiblePosts"
            :key="`poem-${previewPostsPage}-${poem.id}`"
            class="write-page__preview"
            :class="{ 'write-page__preview--active': editingPostId === poem.id && activeComposer === 'poem' }"
            :style="{ '--preview-delay': previewRowDelay(index, 'poem') }"
          >
            <p v-if="poem.title" class="write-page__preview-title">{{ poem.title }}</p>
            <div class="write-page__preview-body">
              <p v-for="(line, i) in poem.lines" :key="i" class="write-page__preview-line page-reading-copy">{{ line }}</p>
            </div>
            <div class="write-page__preview-meta">
              <router-link :to="'/authors/' + poem.authorSlug" class="write-page__preview-author">
                {{ poem.author }}
              </router-link>
              <router-link :to="'/post/' + poem.id" class="write-page__preview-link">
                Xem bài · {{ formatDate(poem.publishedAt) }}
              </router-link>
            </div>
            <div v-if="canEdit" class="write-page__preview-actions">
              <button class="write-page__preview-action" type="button" @click="startEditingPost(poem)">
                {{ editingPostId === poem.id && activeComposer === 'poem' ? "Đang sửa" : "Sửa" }}
              </button>
              <button class="write-page__preview-action write-page__preview-action--danger" type="button" @click="removePost(poem)">
                Xóa
              </button>
            </div>
          </article>
      </transition-group>
      <p
        v-else-if="!previewPostsLoading"
        class="write-page__preview-empty page-reading-copy"
      >
        Không tìm thấy haiku phù hợp.
      </p>
      <div v-if="previewPostsTotalPages > 1" class="write-page__pagination">
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="previewPostsPage <= 1"
          @click="changePostPreviewPage(previewPostsPage - 1)"
          aria-label="Trang haiku trước"
        >
          &lt;
        </button>
        <p class="write-page__pagination-label page-reading-copy">
          {{ formatPageNumber(previewPostsPage) }} / {{ formatPageNumber(previewPostsTotalPages) }}
        </p>
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="previewPostsPage >= previewPostsTotalPages"
          @click="changePostPreviewPage(previewPostsPage + 1)"
          aria-label="Trang haiku sau"
        >
          &gt;
        </button>
      </div>
    </section>

    <section
      v-if="showEssayPreviews"
      ref="essayPreviewSection"
      class="write-page__previews write-page__previews--essays"
    >
      <div class="write-page__previews-head">
        <div class="write-page__previews-head-top">
          <h2 class="write-page__subheading page-reading-h3">Bài luận & ghi chép</h2>
          <div class="write-page__preview-tools">
            <label class="write-page__preview-search">
              <span class="write-page__preview-search-icon" aria-hidden="true">⌕</span>
              <input
                v-model.trim="essayPreviewQuery"
                type="search"
                class="write-page__preview-search-input"
                placeholder="Tìm kiếm"
                aria-label="Tìm bài luận và ghi chép"
              />
            </label>
            <label class="write-page__preview-filter">
              <span class="write-page__preview-filter-label">Trạng thái</span>
              <ElegantSelect
                v-model="essayPreviewStatus"
                class="write-page__preview-filter-select"
                :options="essayPreviewStatusOptions"
                aria-label="Lọc bài luận theo trạng thái"
              />
            </label>
          </div>
        </div>
        <p class="write-page__subcopy page-reading-copy">{{ previewEssaysTotal }} bài</p>
      </div>

      <transition-group
        v-if="visibleEssays.length"
        name="write-page__preview-card"
        tag="div"
        :class="['write-page__preview-list', 'write-page__preview-list--essays']"
        :style="{ '--preview-exit-duration': `${essayExitDurationMs}ms` }"
      >
          <article
            v-for="(essay, index) in visibleEssays"
            :key="`essay-${previewEssaysPage}-${essay.id}`"
            class="write-page__preview write-page__preview--essay"
            :class="{ 'write-page__preview--active': editingEssaySlug === essay.slug && activeComposer === 'essay' }"
            :style="{ '--preview-delay': previewRowDelay(index, 'essay') }"
          >
            <p class="write-page__preview-title">{{ essay.title }}</p>
            <p class="write-page__essay-status page-reading-copy">{{ essay.status === "draft" ? "Draft" : "Published" }}</p>
            <p class="write-page__essay-summary page-reading-copy">{{ essay.summary || excerptEssay(essay.body) }}</p>
            <p v-if="essay.tags?.length" class="write-page__essay-tags page-reading-copy">
              {{ essay.tags.map((tag) => tag.label).join(" · ") }}
            </p>
            <div class="write-page__preview-meta">
              <router-link
                v-if="essay.authorSlug"
                :to="'/authors/' + essay.authorSlug"
                class="write-page__preview-author"
              >
                {{ essay.author }}
              </router-link>
              <span v-else class="write-page__preview-author">{{ essay.author || "Ẩn danh" }}</span>
              <router-link :to="'/essays/' + essay.slug" class="write-page__preview-link">
                Xem bài · {{ formatDate(essay.publishedAt) }}
              </router-link>
            </div>
            <div v-if="canEdit" class="write-page__preview-actions">
              <button class="write-page__preview-action" type="button" @click="startEditingEssay(essay)">
                {{ editingEssaySlug === essay.slug && activeComposer === 'essay' ? "Đang sửa" : "Sửa" }}
              </button>
              <button class="write-page__preview-action write-page__preview-action--danger" type="button" @click="removeEssay(essay)">
                Xóa
              </button>
            </div>
          </article>
      </transition-group>
      <p
        v-else-if="!previewEssaysLoading"
        class="write-page__preview-empty page-reading-copy"
      >
        Không tìm thấy bài luận hoặc ghi chép phù hợp.
      </p>
      <div v-if="previewEssaysTotalPages > 1" class="write-page__pagination">
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="previewEssaysPage <= 1"
          @click="changeEssayPreviewPage(previewEssaysPage - 1)"
          aria-label="Trang bài luận trước"
        >
          &lt;
        </button>
        <p class="write-page__pagination-label page-reading-copy">
          {{ formatPageNumber(previewEssaysPage) }} / {{ formatPageNumber(previewEssaysTotalPages) }}
        </p>
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="previewEssaysPage >= previewEssaysTotalPages"
          @click="changeEssayPreviewPage(previewEssaysPage + 1)"
          aria-label="Trang bài luận sau"
        >
          &gt;
        </button>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import ElegantSelect from "components/ElegantSelect.vue";
import blogStore from "src/stores/blogStore";
import authStore from "src/stores/authStore";
import { API_BASE } from "src/utils/runtime";

const CATEGORY_OPTIONS = [
  { value: "jp", label: "Haiku Nhật" },
  { value: "vi", label: "Haiku Việt" },
  { value: "global", label: "Haiku thế giới" },
];

const DRAFT_STORAGE_KEYS = {
  poem: "haiku.write.poemDraft",
  essay: "haiku.write.essayDraft",
};

const POEM_PREVIEW_PAGE_SIZE = 12;
const ESSAY_PREVIEW_PAGE_SIZE = 9;
const PREVIEW_PAGE_TRANSITION_MS = 360;
const PREVIEW_FAST_EXIT_MS = 220;
const PREVIEW_ROW_STAGGER_MS = 360;

export default defineComponent({
  name: "WritingPage",
  components: {
    ElegantSelect,
  },
  setup() {
    const syncViewportWidth = () => {
      if (typeof window === "undefined") {
        return 1440;
      }
      return window.innerWidth;
    };

    onMounted(() => {
      authStore.ensureSession();
      blogStore.loadAuthors();
      viewportWidth.value = syncViewportWidth();
      window.addEventListener("resize", handleResize, { passive: true });
      loadPostPreviews();
      restoreDraft("poem");
      restoreDraft("essay");
    });

    const activeComposer = ref("poem");
    const poemImageInput = ref(null);
    const essayImageInput = ref(null);
    const poemPreviewSection = ref(null);
    const essayPreviewSection = ref(null);
    const editingPostId = ref("");
    const editingEssaySlug = ref("");

    const poemForm = reactive({
      title: "",
      author: "",
      category: "vi",
      summary: "",
      image: "",
      linesInput: "",
    });

    const essayForm = reactive({
      title: "",
      author: "",
      status: "draft",
      summary: "",
      image: "",
      tagsInput: "",
      body: "",
    });

    const poemMessage = ref("");
    const essayMessage = ref("");
    const poemUploadedImageName = ref("");
    const essayUploadedImageName = ref("");
    const toastVisible = ref(false);
    const toastMessage = ref("");
    const previewError = ref("");
    const previewPosts = ref([]);
    const previewEssays = ref([]);
    const previewPostsPage = ref(1);
    const previewEssaysPage = ref(1);
    const previewPostsTotal = ref(0);
    const previewEssaysTotal = ref(0);
    const previewPostsTotalPages = ref(1);
    const previewEssaysTotalPages = ref(1);
    const previewPostsLoading = ref(false);
    const previewEssaysLoading = ref(false);
    const activeAuthorSuggestions = ref("");
    const poemPreviewQuery = ref("");
    const essayPreviewQuery = ref("");
    const poemPreviewCategory = ref("");
    const essayPreviewStatus = ref(authStore.canEdit() ? "all" : "published");
    const poemCardsVisible = ref(true);
    const essayCardsVisible = ref(true);
    const poemExitDurationMs = ref(PREVIEW_PAGE_TRANSITION_MS);
    const essayExitDurationMs = ref(PREVIEW_PAGE_TRANSITION_MS);
    const viewportWidth = ref(syncViewportWidth());
    let toastTimer = null;
    let poemPreviewSearchTimer = null;
    let essayPreviewSearchTimer = null;
    let authorSuggestionsCloseTimer = null;

    const posts = computed(() => previewPosts.value);
    const essays = computed(() => previewEssays.value);
    const visiblePosts = computed(() => (poemCardsVisible.value ? previewPosts.value : []));
    const visibleEssays = computed(() => (essayCardsVisible.value ? previewEssays.value : []));
    const showPoemPreviews = computed(
      () => previewPostsTotal.value > 0 || Boolean(poemPreviewQuery.value) || Boolean(poemPreviewCategory.value)
    );
    const showEssayPreviews = computed(() => {
      const defaultStatus = canEdit.value ? "all" : "published";
      return (
        previewEssaysTotal.value > 0 ||
        Boolean(essayPreviewQuery.value) ||
        essayPreviewStatus.value !== defaultStatus
      );
    });
    const loading = computed(
      () =>
        previewPostsLoading.value ||
        previewEssaysLoading.value ||
        blogStore.state.loading ||
        blogStore.state.essaysLoading
    );
    const error = computed(() => previewError.value || blogStore.state.error || blogStore.state.essaysError);
    const canEdit = computed(() => authStore.canEdit());
    const categoryOptions = CATEGORY_OPTIONS;
    const availableAuthors = computed(() => blogStore.getAuthors());
    const essayPreviewStatusOptions = computed(() =>
      canEdit.value
        ? [
            { value: "all", label: "Tất cả" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]
        : [{ value: "published", label: "Published" }]
    );

    const handleResize = () => {
      viewportWidth.value = syncViewportWidth();
    };

    const getPoemPreviewColumns = () => {
      if (viewportWidth.value <= 800) return 1;
      if (viewportWidth.value <= 1088) return 2;
      if (viewportWidth.value <= 1344) return 3;
      return 4;
    };

    const getEssayPreviewColumns = () => {
      if (viewportWidth.value <= 800) return 1;
      if (viewportWidth.value <= 1088) return 2;
      return 3;
    };

    const previewRowDelay = (index, type) => {
      const columns = type === "essay" ? getEssayPreviewColumns() : getPoemPreviewColumns();
      const rowIndex = Math.floor(index / Math.max(1, columns));
      return `${Math.min(rowIndex, 3) * PREVIEW_ROW_STAGGER_MS}ms`;
    };

    const getExpectedItemCount = (page, total, pageSize, totalPages) => {
      if (page < totalPages) {
        return pageSize;
      }

      const remainder = total - ((page - 1) * pageSize);
      return Math.max(0, remainder);
    };

    const buildAuthorSuggestions = (value = "") => {
      const normalized = value.trim().toLocaleLowerCase("vi-VN");
      const source = availableAuthors.value;

      if (!normalized) {
        return source.slice(0, 8);
      }

      return source
        .filter((item) => item.author.toLocaleLowerCase("vi-VN").includes(normalized))
        .slice(0, 8);
    };

    const poemAuthorSuggestions = computed(() => buildAuthorSuggestions(poemForm.author));
    const essayAuthorSuggestions = computed(() => buildAuthorSuggestions(essayForm.author));
    const showPoemAuthorSuggestions = computed(
      () => activeAuthorSuggestions.value === "poem" && poemAuthorSuggestions.value.length > 0
    );
    const showEssayAuthorSuggestions = computed(
      () => activeAuthorSuggestions.value === "essay" && essayAuthorSuggestions.value.length > 0
    );

    const clearAuthorSuggestionsCloseTimer = () => {
      if (authorSuggestionsCloseTimer) {
        window.clearTimeout(authorSuggestionsCloseTimer);
        authorSuggestionsCloseTimer = null;
      }
    };

    const openAuthorSuggestions = (type) => {
      clearAuthorSuggestionsCloseTimer();
      activeAuthorSuggestions.value = type;
    };

    const scheduleAuthorSuggestionsClose = (type) => {
      clearAuthorSuggestionsCloseTimer();
      authorSuggestionsCloseTimer = window.setTimeout(() => {
        if (activeAuthorSuggestions.value === type) {
          activeAuthorSuggestions.value = "";
        }
        authorSuggestionsCloseTimer = null;
      }, 120);
    };

    const selectSuggestedAuthor = (type, author) => {
      if (type === "essay") {
        essayForm.author = author;
      } else {
        poemForm.author = author;
      }
      clearAuthorSuggestionsCloseTimer();
      activeAuthorSuggestions.value = "";
    };

    async function loadPostPreviews(page = previewPostsPage.value) {
      previewPostsLoading.value = true;
      previewError.value = "";

      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: String(POEM_PREVIEW_PAGE_SIZE),
        });
        if (poemPreviewQuery.value) {
          query.set("search", poemPreviewQuery.value);
        }
        if (poemPreviewCategory.value) {
          query.set("category", poemPreviewCategory.value);
        }
        const res = await fetch(`${API_BASE}/posts?${query.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        previewPosts.value = Array.isArray(data?.items) ? data.items : [];
        previewPostsPage.value = Number(data?.page) || 1;
        previewPostsTotal.value = Number(data?.total) || 0;
        previewPostsTotalPages.value = Math.max(1, Number(data?.totalPages) || 1);
      } catch (err) {
        console.error("Không tải được preview haiku", err);
        previewError.value = "Không tải được danh sách bài viết từ máy chủ.";
      } finally {
        previewPostsLoading.value = false;
      }
    }

    async function loadEssayPreviews(page = previewEssaysPage.value) {
      previewEssaysLoading.value = true;
      previewError.value = "";

      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: String(ESSAY_PREVIEW_PAGE_SIZE),
          status: essayPreviewStatus.value,
        });
        if (essayPreviewQuery.value) {
          query.set("search", essayPreviewQuery.value);
        }
        const res = await fetch(`${API_BASE}/essays?${query.toString()}`, {
          headers: authStore.getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        previewEssays.value = Array.isArray(data?.items) ? data.items : [];
        previewEssaysPage.value = Number(data?.page) || 1;
        previewEssaysTotal.value = Number(data?.total) || 0;
        previewEssaysTotalPages.value = Math.max(1, Number(data?.totalPages) || 1);
      } catch (err) {
        console.error("Không tải được preview bài luận", err);
        previewError.value = "Không tải được danh sách bài luận từ máy chủ.";
      } finally {
        previewEssaysLoading.value = false;
      }
    }

    async function changePostPreviewPage(nextPage) {
      const targetPage = Math.min(Math.max(1, nextPage), previewPostsTotalPages.value);
      if (targetPage === previewPostsPage.value && previewPosts.value.length) return;
      const targetCount = getExpectedItemCount(
        targetPage,
        previewPostsTotal.value,
        POEM_PREVIEW_PAGE_SIZE,
        previewPostsTotalPages.value
      );
      poemExitDurationMs.value =
        targetCount < previewPosts.value.length ? PREVIEW_FAST_EXIT_MS : PREVIEW_PAGE_TRANSITION_MS;
      poemCardsVisible.value = false;
      await wait(poemExitDurationMs.value);
      await loadPostPreviews(targetPage);
      await nextTick();
      poemPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      await nextTick();
      poemCardsVisible.value = true;
    }

    async function changeEssayPreviewPage(nextPage) {
      const targetPage = Math.min(Math.max(1, nextPage), previewEssaysTotalPages.value);
      if (targetPage === previewEssaysPage.value && previewEssays.value.length) return;
      const targetCount = getExpectedItemCount(
        targetPage,
        previewEssaysTotal.value,
        ESSAY_PREVIEW_PAGE_SIZE,
        previewEssaysTotalPages.value
      );
      essayExitDurationMs.value =
        targetCount < previewEssays.value.length ? PREVIEW_FAST_EXIT_MS : PREVIEW_PAGE_TRANSITION_MS;
      essayCardsVisible.value = false;
      await wait(essayExitDurationMs.value);
      await loadEssayPreviews(targetPage);
      await nextTick();
      essayPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      await nextTick();
      essayCardsVisible.value = true;
    }

    function wait(duration = 0) {
      return new Promise((resolve) => window.setTimeout(resolve, duration));
    }

    function persistDraft(type, payload) {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEYS[type], JSON.stringify(payload));
      } catch (_error) {
        // ignore localStorage failure
      }
    }

    function showToast(message = "") {
      if (!message) {
        return;
      }

      toastMessage.value = message;
      toastVisible.value = true;

      if (toastTimer) {
        window.clearTimeout(toastTimer);
      }

      toastTimer = window.setTimeout(() => {
        toastVisible.value = false;
        toastMessage.value = "";
        toastTimer = null;
      }, 1600);
    }

    function clearDraft(type) {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEYS[type]);
      } catch (_error) {
        // ignore localStorage failure
      }
    }

    function restoreDraft(type) {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const saved = window.localStorage.getItem(DRAFT_STORAGE_KEYS[type]);
        if (!saved) {
          return;
        }

        const data = JSON.parse(saved);
        if (type === "essay") {
          essayForm.title = data.title || "";
          essayForm.author = data.author || "";
          essayForm.status = data.status || "draft";
          essayForm.summary = data.summary || "";
          essayForm.image = data.image || "";
          essayForm.tagsInput = data.tagsInput || "";
          essayForm.body = data.body || "";
          essayUploadedImageName.value = data.uploadedImageName || "";
        } else {
          poemForm.title = data.title || "";
          poemForm.author = data.author || "";
          poemForm.category = data.category || "vi";
          poemForm.summary = data.summary || "";
          poemForm.image = data.image || "";
          poemForm.linesInput = data.linesInput || "";
          poemUploadedImageName.value = data.uploadedImageName || "";
        }
      } catch (_error) {
        // ignore invalid draft payload
      }
    }

    const clearFileInput = (type) => {
      const inputRef = type === "essay" ? essayImageInput.value : poemImageInput.value;
      if (inputRef) {
        inputRef.value = "";
      }
    };

    const openImagePicker = (type) => {
      const inputRef = type === "essay" ? essayImageInput.value : poemImageInput.value;
      inputRef?.click();
    };

    const clearImage = (type) => {
      if (type === "essay") {
        essayForm.image = "";
        essayUploadedImageName.value = "";
        essayMessage.value = "";
        persistDraft("essay", {
          ...essayForm,
          uploadedImageName: "",
        });
      } else {
        poemForm.image = "";
        poemUploadedImageName.value = "";
        poemMessage.value = "";
        persistDraft("poem", {
          ...poemForm,
          uploadedImageName: "",
        });
      }

      clearFileInput(type);
      showToast("Đã gỡ ảnh khỏi bản nháp.");
    };

    const resetPoemForm = () => {
      editingPostId.value = "";
      poemForm.title = "";
      poemForm.author = "";
      poemForm.category = "vi";
      poemForm.summary = "";
      poemForm.image = "";
      poemForm.linesInput = "";
      poemUploadedImageName.value = "";
      clearFileInput("poem");
      clearDraft("poem");
    };

    const resetEssayForm = () => {
      editingEssaySlug.value = "";
      essayForm.title = "";
      essayForm.author = "";
      essayForm.status = "draft";
      essayForm.summary = "";
      essayForm.image = "";
      essayForm.tagsInput = "";
      essayForm.body = "";
      essayUploadedImageName.value = "";
      clearFileInput("essay");
      clearDraft("essay");
    };

    const applyPostToForm = (post) => {
      activeComposer.value = "poem";
      editingPostId.value = post.id;
      poemForm.title = post.title || "";
      poemForm.author = post.author || "";
      poemForm.category = post.category || "vi";
      poemForm.summary = post.summary || "";
      poemForm.image = post.image || "";
      poemForm.linesInput = Array.isArray(post.lines) ? post.lines.join("\n") : "";
      poemUploadedImageName.value = post.image ? "Đang dùng ảnh hiện tại" : "";
      clearFileInput("poem");
    };

    const applyEssayToForm = (essay) => {
      activeComposer.value = "essay";
      editingEssaySlug.value = essay.slug;
      essayForm.title = essay.title || "";
      essayForm.author = essay.author || "";
      essayForm.status = essay.status || "published";
      essayForm.summary = essay.summary || "";
      essayForm.image = essay.image || "";
      essayForm.tagsInput = Array.isArray(essay.tags)
        ? essay.tags.map((tag) => tag.label).join(", ")
        : "";
      essayForm.body = essay.body || "";
      essayUploadedImageName.value = essay.image ? "Đang dùng ảnh hiện tại" : "";
      clearFileInput("essay");
    };

    watch(
      canEdit,
      () => {
        essayPreviewStatus.value = canEdit.value ? "all" : "published";
        loadEssayPreviews(1);
      },
      { immediate: true }
    );

    watch(poemPreviewCategory, () => {
      loadPostPreviews(1);
    });

    watch(essayPreviewStatus, () => {
      loadEssayPreviews(1);
    });

    watch(poemPreviewQuery, () => {
      if (poemPreviewSearchTimer) {
        window.clearTimeout(poemPreviewSearchTimer);
      }

      poemPreviewSearchTimer = window.setTimeout(() => {
        loadPostPreviews(1);
        poemPreviewSearchTimer = null;
      }, 180);
    });

    watch(essayPreviewQuery, () => {
      if (essayPreviewSearchTimer) {
        window.clearTimeout(essayPreviewSearchTimer);
      }

      essayPreviewSearchTimer = window.setTimeout(() => {
        loadEssayPreviews(1);
        essayPreviewSearchTimer = null;
      }, 180);
    });

    const startEditingPost = (post) => {
      applyPostToForm(post);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const startEditingEssay = (essay) => {
      applyEssayToForm(essay);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const cancelPoemEditing = () => {
      showToast("Đã hủy chế độ chỉnh sửa haiku.");
      poemMessage.value = "";
      resetPoemForm();
    };

    const cancelEssayEditing = () => {
      showToast("Đã hủy chế độ chỉnh sửa bài luận.");
      essayMessage.value = "";
      resetEssayForm();
    };

    const readFileAsDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
        reader.readAsDataURL(file);
      });

    const setScopedMessage = (type, value) => {
      if (type === "essay") {
        essayMessage.value = value;
      } else {
        poemMessage.value = value;
      }
    };

    const handleImageUpload = async (event, type) => {
      const file = event.target?.files?.[0];
      if (!file) {
        if (type === "essay") {
          essayUploadedImageName.value = "";
        } else {
          poemUploadedImageName.value = "";
        }
        return;
      }

      if (!file.type.startsWith("image/")) {
        setScopedMessage(type, "Vui lòng chọn một file ảnh hợp lệ.");
        event.target.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setScopedMessage(type, "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 5MB.");
        event.target.value = "";
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        if (type === "essay") {
          essayForm.image = dataUrl;
          essayUploadedImageName.value = file.name;
          essayMessage.value = "";
          persistDraft("essay", {
            ...essayForm,
            uploadedImageName: file.name,
          });
        } else {
          poemForm.image = dataUrl;
          poemUploadedImageName.value = file.name;
          poemMessage.value = "";
          persistDraft("poem", {
            ...poemForm,
            uploadedImageName: file.name,
          });
        }
        showToast(`Đã tải ảnh "${file.name}".`);
      } catch (_err) {
        setScopedMessage(type, "Không đọc được file ảnh. Thử lại.");
        event.target.value = "";
      }
    };

    const normalizeTagsInput = (value = "") =>
      value
        .split(/[\n,]/)
        .map((tag) => tag.trim())
        .filter(Boolean);

    const escapeHtml = (value = "") =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const renderInlineMarkdown = (value = "") =>
      escapeHtml(value)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    const renderMarkdownPreview = (value = "") => {
      const trimmed = value.trim();
      if (!trimmed) {
        return "<p>Chưa có nội dung preview.</p>";
      }

      return trimmed
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const lines = block.split("\n").map((line) => line.trimRight());
          if (lines.length === 1 && /^##\s+/.test(lines[0])) {
            return `<h3>${renderInlineMarkdown(lines[0].replace(/^##\s+/, ""))}</h3>`;
          }
          if (lines.length === 1 && /^#\s+/.test(lines[0])) {
            return `<h2>${renderInlineMarkdown(lines[0].replace(/^#\s+/, ""))}</h2>`;
          }
          return `<p>${lines.map((line) => renderInlineMarkdown(line)).join("<br />")}</p>`;
        })
        .join("");
    };

    watch(
      poemForm,
      (value) => {
        if (!canEdit.value || editingPostId.value) {
          return;
        }

        persistDraft("poem", {
          ...value,
          uploadedImageName: poemUploadedImageName.value,
        });
      },
      { deep: true }
    );

    watch(
      essayForm,
      (value) => {
        if (!canEdit.value || editingEssaySlug.value) {
          return;
        }

        persistDraft("essay", {
          ...value,
          uploadedImageName: essayUploadedImageName.value,
        });
      },
      { deep: true }
    );

    const essayMarkdownPreview = computed(() => renderMarkdownPreview(essayForm.body));

    const submitPoem = async () => {
      poemMessage.value = "";
      const lines = poemForm.linesInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) {
        poemMessage.value = "Hãy nhập ít nhất một dòng haiku.";
        return;
      }

      try {
        const payload = {
          title: poemForm.title,
          author: poemForm.author,
          category: poemForm.category,
          summary: poemForm.summary,
          image: poemForm.image,
          lines,
        };

        const post = editingPostId.value
          ? await blogStore.updatePost(editingPostId.value, payload)
          : await blogStore.addPost(payload);

        await loadPostPreviews(editingPostId.value ? previewPostsPage.value : 1);
        showToast(editingPostId.value
          ? `Đã cập nhật bài của ${post.author}.`
          : post.title
            ? `Đã đăng "${post.title}" của ${post.author}.`
            : `Đã đăng bài mới của ${post.author}.`);
        poemMessage.value = "";
        resetPoemForm();
      } catch (_err) {
        poemMessage.value = editingPostId.value
          ? "Không cập nhật được bài. Thử lại sau."
          : "Không đăng được bài. Thử lại sau.";
      }
    };

    const submitEssay = async () => {
      essayMessage.value = "";
      const title = essayForm.title.trim();
      const body = essayForm.body.trim();

      if (!title) {
        essayMessage.value = "Hãy nhập tiêu đề cho bài luận.";
        return;
      }

      if (!body) {
        essayMessage.value = "Hãy nhập nội dung bài luận hoặc ghi chép.";
        return;
      }

      try {
        const payload = {
          title,
          author: essayForm.author,
          summary: essayForm.summary,
          image: essayForm.image,
          body,
          tags: normalizeTagsInput(essayForm.tagsInput),
          status: essayForm.status,
        };

        const essay = editingEssaySlug.value
          ? await blogStore.updateEssay(editingEssaySlug.value, payload)
          : await blogStore.addEssay(payload);

        await loadEssayPreviews(editingEssaySlug.value ? previewEssaysPage.value : 1);
        showToast(editingEssaySlug.value
          ? `Đã cập nhật "${essay.title}".`
          : `Đã đăng "${essay.title}" vào mục Nghĩ.`);
        essayMessage.value = "";
        resetEssayForm();
      } catch (_err) {
        essayMessage.value = editingEssaySlug.value
          ? "Không cập nhật được bài luận. Thử lại sau."
          : "Không đăng được bài luận. Thử lại sau.";
      }
    };

    const removePost = async (post) => {
      const confirmed = window.confirm(
        post.title ? `Xóa bài "${post.title}"?` : `Xóa bài của ${post.author}?`
      );
      if (!confirmed) {
        return;
      }

      try {
        await blogStore.deletePost(post.id);
        await loadPostPreviews(previewPostsPage.value);
        if (editingPostId.value === post.id) {
          resetPoemForm();
        }
        showToast(post.title
          ? `Đã xóa "${post.title}".`
          : `Đã xóa bài của ${post.author}.`);
        poemMessage.value = "";
      } catch (_err) {
        poemMessage.value = "Không xóa được bài. Thử lại sau.";
      }
    };

    const removeEssay = async (essay) => {
      const confirmed = window.confirm(`Xóa bài luận "${essay.title}"?`);
      if (!confirmed) {
        return;
      }

      try {
        await blogStore.deleteEssay(essay.slug);
        await loadEssayPreviews(previewEssaysPage.value);
        if (editingEssaySlug.value === essay.slug) {
          resetEssayForm();
        }
        showToast(`Đã xóa "${essay.title}".`);
        essayMessage.value = "";
      } catch (_err) {
        essayMessage.value = "Không xóa được bài luận. Thử lại sau.";
      }
    };

    const excerptEssay = (value = "") => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (normalized.length <= 180) {
        return normalized;
      }
      return `${normalized.slice(0, 177)}...`;
    };

    const formatPageNumber = (value) => String(Math.max(1, Number(value) || 1)).padStart(2, "0");

    const formatDate = (value) => {
      if (!value) return "";
      try {
        const date = new Date(value);
        return new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(date);
      } catch (_err) {
        return value;
      }
    };

    onBeforeUnmount(() => {
      clearAuthorSuggestionsCloseTimer();
      if (poemPreviewSearchTimer) {
        window.clearTimeout(poemPreviewSearchTimer);
      }
      if (essayPreviewSearchTimer) {
        window.clearTimeout(essayPreviewSearchTimer);
      }
      if (toastTimer) {
        window.clearTimeout(toastTimer);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleResize);
      }
    });

    return {
      activeComposer,
      poemImageInput,
      essayImageInput,
      poemPreviewSection,
      essayPreviewSection,
      editingPostId,
      editingEssaySlug,
      poemForm,
      essayForm,
      poemMessage,
      essayMessage,
      poemUploadedImageName,
      essayUploadedImageName,
      toastVisible,
      toastMessage,
      posts,
      essays,
      visiblePosts,
      visibleEssays,
      showPoemPreviews,
      showEssayPreviews,
      previewPostsPage,
      previewEssaysPage,
      previewPostsTotal,
      previewEssaysTotal,
      previewPostsTotalPages,
      previewEssaysTotalPages,
      poemAuthorSuggestions,
      essayAuthorSuggestions,
      showPoemAuthorSuggestions,
      showEssayAuthorSuggestions,
      poemPreviewQuery,
      essayPreviewQuery,
      poemPreviewCategory,
      essayPreviewStatus,
      essayPreviewStatusOptions,
      poemExitDurationMs,
      essayExitDurationMs,
      previewRowDelay,
      canEdit,
      categoryOptions,
      loading,
      error,
      changePostPreviewPage,
      changeEssayPreviewPage,
      openImagePicker,
      clearImage,
      handleImageUpload,
      submitPoem,
      submitEssay,
      startEditingPost,
      startEditingEssay,
      cancelPoemEditing,
      cancelEssayEditing,
      removePost,
      removeEssay,
      formatDate,
      formatPageNumber,
      excerptEssay,
      essayMarkdownPreview,
      openAuthorSuggestions,
      scheduleAuthorSuggestionsClose,
      selectSuggestedAuthor,
    };
  },
});
</script>

<style scoped>
.write-page {
  grid-area: grid;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 7rem 0 5rem;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5rem;
}

.write-page__toast {
  position: fixed;
  top: 1.1rem;
  right: 1.1rem;
  z-index: 1200;
  min-width: 0;
  max-width: min(18rem, calc(100vw - 2rem));
  padding: 0.55rem 0.85rem;
  border: 1px solid rgba(177, 165, 159, 0.12);
  border-radius: 999px;
  background: rgba(14, 14, 14, 0.86);
  color: rgba(230, 224, 219, 0.88);
  font-size: 0.9rem;
  line-height: 1.35;
  letter-spacing: -0.01em;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.22),
    0 0 0 1px rgba(255, 255, 255, 0.015);
  backdrop-filter: blur(14px);
}

.write-toast-enter-active,
.write-toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.write-toast-enter-from,
.write-toast-leave-to {
  opacity: 0;
  transform: translate3d(0, -0.4rem, 0);
}

.write-page__composer,
.write-page__editor,
.write-page__previews {
  display: grid;
  gap: 2rem;
  min-width: 0;
}

.write-page__composer {
  width: 100%;
  max-width: 1040px;
}

.write-page__intro {
  position: static;
}

.write-page__editor,
.write-page__previews {
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
}

.write-page__heading {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  line-height: 0.96;
  color: var(--color-title);
}

.write-page__lead,
.write-page__status,
.write-page__subcopy {
  margin: 1.25rem 0 0;
  max-width: 46rem;
  color: var(--color-description);
}

.write-page__status--error {
  color: #f0b9b0;
}

.write-page__mode-switch {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  gap: 2.1rem;
  width: fit-content;
  justify-content: start;
}

.write-page__mode-tab {
  display: block;
  width: auto;
  padding: 0.85rem 0 1rem;
  border: 0;
  background: transparent;
  color: var(--color-description);
  cursor: pointer;
  font: inherit;
  font-size: 1.15rem;
  font-weight: 400;
  text-align: left;
  transition: color 220ms ease;
}

.write-page__mode-tab-label {
  position: relative;
  display: inline-block;
  padding-bottom: 0.15rem;
}

.write-page__mode-tab-label::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(177, 165, 159, 0) 0%,
    currentColor 18%,
    currentColor 82%,
    rgba(177, 165, 159, 0) 100%
  );
  opacity: 0.9;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.write-page__mode-tab--active {
  color: #b1a59f;
}

.write-page__mode-tab--active .write-page__mode-tab-label::after {
  transform: scaleX(1);
}

.write-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  align-items: start;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02)),
    rgba(27, 25, 25, 0.38);
  backdrop-filter: blur(10px);
}

.form-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.form-field__autocomplete {
  position: relative;
}

.form-field__autocomplete-menu {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 10;
  display: grid;
  gap: 0.25rem;
  padding: 0.35rem;
  border-radius: 14px;
  border: 1px solid rgba(177, 165, 159, 0.1);
  background: var(--color-bg, #2f2c2b);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.22),
    0 0 0 1px rgba(255, 255, 255, 0.015);
}

.form-field__autocomplete-option {
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #b1a59f;
  padding: 0.72rem 0.8rem;
  text-align: left;
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.form-field__autocomplete-option:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e6e0db;
}

.form-field:not(.form-field--wide) {
  justify-content: start;
}

.form-field__label {
  display: block;
  margin-bottom: 0.55rem;
  font-size: 0.95rem;
  letter-spacing: 0.01em;
  color: var(--color-description);
}

.form-field__label--with-tooltip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.form-field__tooltip-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.form-field__tooltip-trigger {
  width: 1.15rem;
  height: 1.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(177, 165, 159, 0.82);
  font-size: 0.72rem;
  line-height: 1;
  cursor: help;
}

.form-field__tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.6rem);
  transform: translateX(-50%) translateY(0.2rem);
  min-width: 14rem;
  max-width: 18rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 18, 18, 0.96);
  color: rgba(230, 224, 219, 0.88);
  font-size: 0.8rem;
  line-height: 1.45;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  z-index: 5;
}

.form-field__tooltip-wrap:hover .form-field__tooltip,
.form-field__tooltip-wrap:focus-within .form-field__tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.form-field__hint {
  display: block;
  margin-top: 0.45rem;
  color: var(--color-description);
  font-size: 0.95rem;
  line-height: 1.5;
}

.form-field--wide {
  grid-column: 1 / -1;
}

.input,
.write-form textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #b1a59f;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
}

.write-form .form-field:not(.form-field--wide) > .input,
.write-form .form-field:not(.form-field--wide) > :deep(.elegant-select),
.write-form .form-field:not(.form-field--wide) > .upload-field {
  min-height: 3.45rem;
}

.write-form .form-field:not(.form-field--wide) > .input,
.write-form .form-field:not(.form-field--wide) > :deep(.elegant-select) {
  display: flex;
  align-items: center;
}

.upload-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.7rem 0.9rem;
  min-height: 3.45rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
    rgba(255, 255, 255, 0.02);
}

.upload-field--filled {
  border-color: rgba(177, 165, 159, 0.22);
  background:
    linear-gradient(180deg, rgba(177, 165, 159, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(255, 255, 255, 0.02);
}

.upload-field__input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.upload-field__main {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  flex-wrap: wrap;
  min-width: 0;
}

.upload-field__title,
.upload-field__meta {
  display: block;
}

.upload-field__title {
  color: #b1a59f;
  font-size: 0.92rem;
  line-height: 1.3;
}

.upload-field__meta {
  color: var(--color-description);
  font-size: 0.76rem;
  line-height: 1.3;
}

.upload-field__actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.upload-field__button {
  padding: 0.42rem 0.72rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #b1a59f;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
}

.upload-field__button--ghost {
  background: transparent;
  color: rgba(240, 185, 176, 0.92);
  border-color: rgba(221, 82, 90, 0.24);
}

.write-form textarea {
  min-height: 11rem;
  resize: vertical;
}

.write-form__textarea--essay {
  min-height: 18rem;
}

.write-form__markdown-preview {
  display: grid;
  gap: 0.9rem;
}

.write-form__markdown-head {
  display: grid;
  gap: 0.3rem;
}

.write-form__markdown-body {
  min-height: 10rem;
  padding: 1rem 1.15rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(230, 224, 219, 0.92);
}

.write-form__markdown-body :deep(p),
.write-form__markdown-body :deep(h2),
.write-form__markdown-body :deep(h3) {
  margin: 0;
}

.write-form__markdown-body :deep(p + p),
.write-form__markdown-body :deep(h2 + p),
.write-form__markdown-body :deep(h3 + p),
.write-form__markdown-body :deep(p + h2),
.write-form__markdown-body :deep(p + h3) {
  margin-top: 1rem;
}

.write-form__markdown-body :deep(h2),
.write-form__markdown-body :deep(h3) {
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  line-height: 0.98;
  color: var(--color-title);
}

.write-form__markdown-body :deep(code) {
  padding: 0.08rem 0.35rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.input:focus,
.write-form textarea:focus {
  outline: 1px solid rgba(177, 165, 159, 0.42);
  border-color: rgba(177, 165, 159, 0.28);
  background: rgba(255, 255, 255, 0.055);
  box-shadow:
    0 0 0 3px rgba(177, 165, 159, 0.08),
    0 10px 24px rgba(0, 0, 0, 0.12);
}

.submit-btn {
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #b1a59f;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.write-form__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.write-form__actions .submit-btn {
  min-width: 11rem;
}

.submit-btn--ghost {
  background: transparent;
}

.submit-btn:hover {
  background: rgba(221, 82, 90, 0.1);
}

.form-feedback {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-description);
}

.write-page__previews-head {
  display: grid;
  gap: 0.35rem;
}

.write-page__previews-head-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem 1.5rem;
  align-items: end;
}

.write-page__preview-tools {
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.write-page__preview-search {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 12.5rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgba(177, 165, 159, 0.24);
}

.write-page__preview-search-icon {
  color: rgba(177, 165, 159, 0.6);
  font-size: 0.95rem;
  line-height: 1;
  flex: 0 0 auto;
}

.write-page__preview-search-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #b1a59f;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.2;
  padding: 0;
  outline: none;
}

.write-page__preview-search-input::placeholder {
  color: rgba(177, 165, 159, 0.45);
}

.write-page__preview-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgba(177, 165, 159, 0.24);
}

.write-page__preview-filter-label {
  color: rgba(177, 165, 159, 0.52);
  font-size: 0.74rem;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.write-page__preview-filter-select {
  min-width: 5.6rem;
}

.write-page__preview-filter-select :deep(.elegant-select__trigger) {
  min-height: auto;
  padding: 0 1.4rem 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 0.92rem;
}

.write-page__preview-filter-select :deep(.elegant-select__menu-wrap) {
  left: auto;
  right: 0;
  min-width: 9rem;
}

.write-form :deep(.elegant-select__trigger) {
  font-size: 1rem;
}

.write-page__subheading {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  color: var(--color-title);
}

.write-page__subcopy {
  margin-top: 0;
}

.write-page__preview-list {
  display: grid;
  width: 100%;
  gap: 1.5rem;
  align-items: stretch;
  min-width: 0;
}

.write-page__preview-empty {
  margin: 0;
  padding: 0.4rem 0 0.2rem;
  color: rgba(177, 165, 159, 0.7);
}

.write-page__preview-card-enter-active {
  transition:
    opacity 420ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--preview-delay, 0ms);
}

.write-page__preview-card-leave-active {
  transition:
    opacity var(--preview-exit-duration, 360ms) cubic-bezier(0.22, 1, 0.36, 1),
    transform var(--preview-exit-duration, 360ms) cubic-bezier(0.22, 1, 0.36, 1);
}

.write-page__preview-card-enter-from,
.write-page__preview-card-leave-to {
  opacity: 0;
  transform: translate3d(0, 0.6rem, 0);
}

.write-page__preview-list--poems {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.write-page__preview-list--essays {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.write-page__preview {
  min-height: 20rem;
  min-width: 0;
  max-width: 100%;
  padding: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.write-page__preview--essay {
  min-height: 18rem;
}

.write-page__preview--active {
  border-color: rgba(221, 82, 90, 0.45);
  background: rgba(221, 82, 90, 0.06);
}

.write-page__preview-title {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  font-size: clamp(1.55rem, 2vw, 2.15rem);
  line-height: 1.02;
  letter-spacing: -0.02em;
  color: var(--color-title);
  overflow-wrap: anywhere;
}

.write-page__preview-body {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}

.write-page__preview-line {
  margin: 0;
  color: var(--color-description);
  font-style: italic;
  font-size: 1.02rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.write-page__essay-summary,
.write-page__essay-tags,
.write-page__essay-status {
  margin: 0;
  color: var(--color-description);
  font-size: 0.98rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.write-page__essay-status {
  opacity: 0.86;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.74rem;
}

.write-page__essay-tags {
  opacity: 0.76;
}

.write-page__preview-meta {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  min-width: 0;
}

.write-page__preview-author,
.write-page__preview-link {
  color: var(--color-description);
  text-decoration: none;
  font-size: 0.95rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.write-page__preview-link:hover,
.write-page__preview-author:hover {
  color: var(--color-title);
}

.write-page__preview-actions {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.write-page__preview-action {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  border-radius: 999px;
  padding: 0.5rem 0.85rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1;
}

.write-page__preview-action--danger {
  border-color: rgba(221, 82, 90, 0.28);
  color: #f0b9b0;
}

.write-page__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  padding-top: 0.2rem;
}

.write-page__pagination-label {
  margin: 0;
  color: rgba(177, 165, 159, 0.58);
  font-size: 0.84rem;
  letter-spacing: 0.12em;
}

.write-page__pagination-btn {
  border: 0;
  background: transparent;
  color: rgba(230, 224, 219, 0.74);
  border-radius: 0;
  min-width: 1.2rem;
  padding: 0.1rem 0.05rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.86rem;
  line-height: 1.2;
  letter-spacing: 0.08em;
  transition:
    color 180ms ease,
    opacity 180ms ease;
}

.write-page__pagination-btn:hover:not(:disabled) {
  color: var(--color-title);
}

.write-page__pagination-btn:disabled {
  opacity: 0.22;
  cursor: default;
}

@media screen and (max-width: 84em) {
  .write-page__preview-list--poems {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media screen and (max-width: 68em) {
  .write-page__preview-list--poems {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .write-page__preview-list--essays {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media screen and (max-width: 50em) {
  .write-page__previews-head-top {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .write-page__preview-tools {
    justify-content: flex-start;
  }

  .write-page__preview-search {
    min-width: min(100%, 15rem);
  }

  .write-page {
    padding: 5rem 0 3rem;
    gap: 3rem;
  }

  .write-page__toast {
    top: 1rem;
    right: 1rem;
    left: 1rem;
    min-width: 0;
    max-width: none;
  }

  .write-form,
  .write-page__preview {
    padding: 1rem;
  }

  .write-page__mode-switch {
    grid-template-columns: 1fr;
  }

  .write-page__preview-list--poems,
  .write-page__preview-list--essays {
    grid-template-columns: 1fr;
  }

  .write-page__pagination {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .upload-field {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .upload-field__actions {
    justify-content: flex-start;
  }
}

</style>
