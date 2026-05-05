<template>
  <div class="write-page">
    <teleport to="body">
      <transition name="write-toast">
        <div v-if="toastVisible" class="write-page__toast" role="status" aria-live="polite">
          {{ toastMessage }}
        </div>
      </transition>
    </teleport>

    <section ref="composerSection" class="write-page__composer">
      <div class="write-page__intro">
        <h1 class="write-page__heading page-reading-h2 page-heading-with-rule">Viết & đăng bài</h1>
        <p class="write-page__lead page-reading-copy">
          {{ composerIntroText }}
          <span v-if="!canEdit">
          Bài gửi sẽ nằm trong mục chờ duyệt. Biên tập viên có thể chỉnh sửa trước khi xuất bản.
          </span>
        </p>
        <p v-if="error" class="write-page__status write-page__status--error page-reading-copy">{{ error }}</p>
        <p v-else-if="loading" class="write-page__status page-reading-copy">Đang tải danh sách...</p>
      </div>

      <div class="write-page__editor">
        <div
          ref="composerModeSwitch"
          class="write-page__mode-switch"
          :class="{ 'write-page__mode-switch--quad': canEdit }"
          role="tablist"
          aria-label="Chọn loại nội dung"
        >
          <button
            class="write-page__mode-tab"
            :class="{ 'write-page__mode-tab--active': activeComposer === 'poem' }"
            type="button"
            @click="chooseComposer('poem')"
          >
            <span class="write-page__mode-tab-label">Haiku</span>
          </button>
          <button
            class="write-page__mode-tab"
            :class="{ 'write-page__mode-tab--active': activeComposer === 'essay' }"
            type="button"
            @click="chooseComposer('essay')"
          >
            <span class="write-page__mode-tab-label">Nghiên cứu và bình luận</span>
          </button>
          <button
            v-if="canEdit"
            class="write-page__mode-tab"
            :class="{ 'write-page__mode-tab--active': activeComposer === 'other' }"
            type="button"
            @click="chooseComposer('other')"
          >
            <span class="write-page__mode-tab-label">Khác</span>
          </button>
          <button
            class="write-page__mode-tab"
            :class="{ 'write-page__mode-tab--active': activeComposer === 'submission' }"
            type="button"
            @click="chooseComposer('submission')"
            v-if="canEdit"
          >
            <span class="write-page__mode-tab-label">Duyệt bài</span>
          </button>
        </div>

        <div ref="composerPanelHost" class="write-page__composer-panel-host">
        <form v-show="showPoemComposer" ref="poemComposerPanel" class="write-form" @submit.prevent="submitPoem">
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
              {{ poemSubmitLabel }}
            </button>
            <button
              v-if="showPublishPoemSubmissionButton"
              class="submit-btn"
              type="button"
              @click="publishPoemSubmission()"
            >
              Đăng
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

        <form v-show="showEssayComposer" ref="essayComposerPanel" class="write-form" @submit.prevent="isSubmissionComposer ? submitSubmission() : submitEssay()">
          <div class="write-form__essay-head">
            <label class="form-field">
              <span class="form-field__label">Tiêu đề</span>
              <input v-model="essayForm.title" class="input" placeholder="Tên bài trong mục Nghĩ" />
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
              <span class="form-field__label">Mục</span>
              <ElegantSelect
                v-model="essayForm.kind"
                :options="essayKindOptions"
                aria-label="Phân loại bài trong mục Nghĩ"
              />
            </label>
            <label v-if="canEdit && !isSubmissionComposer" class="form-field">
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
          </div>
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
                @change="handleImageUpload($event, isSubmissionComposer ? 'submission' : 'essay')"
              />
              <div class="upload-field__main">
                <span class="upload-field__title">
                  {{ essayUploadedImageName ? (isSubmissionComposer ? "Ảnh bài gửi đã được tải lên" : "Ảnh bìa đã được tải lên") : essayForm.image ? (isSubmissionComposer ? "Đang dùng ảnh bài gửi hiện tại" : "Đang dùng ảnh bìa hiện tại") : (isSubmissionComposer ? "Chưa chọn ảnh bài gửi" : "Chưa chọn ảnh bìa") }}
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
                  @click="clearImage(isSubmissionComposer ? 'submission' : 'essay')"
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
          <div class="form-field form-field--wide">
            <span class="form-field__label">Nội dung bài</span>
            <RichEssayEditor
              v-model="essayForm.body"
              placeholder="Viết nghiên cứu hoặc bình luận ở đây."
              :upload-image="uploadEssayLikeBodyImage"
              @image-uploaded="handleEssayBodyImageUploaded"
              @error="handleEssayEditorError"
            />
          </div>
          <div class="write-form__actions">
            <button class="submit-btn" type="submit">
              {{ essayLikeSubmitLabel }}
            </button>
            <button
              v-if="showPublishSubmissionButton"
              class="submit-btn"
              type="button"
              @click="publishSubmission()"
            >
              Đăng
            </button>
            <button
              v-if="essayLikeCancelVisible"
              class="submit-btn submit-btn--ghost"
              type="button"
              @click="cancelEssayEditing"
            >
              Hủy chỉnh sửa
            </button>
          </div>
          <p v-if="essayMessage" class="form-feedback page-reading-copy">{{ essayMessage }}</p>
        </form>

        <form v-show="showOtherComposer" ref="otherComposerPanel" class="write-form" @submit.prevent="submitOtherPost">
          <div class="write-form__essay-head">
            <label class="form-field">
              <span class="form-field__label">Tiêu đề</span>
              <input v-model="otherForm.title" class="input" placeholder="Tên bài trong mục Haiku ≠" />
            </label>
            <label class="form-field">
              <span class="form-field__label">Mục</span>
              <ElegantSelect
                v-model="otherForm.category"
                :options="haikuOtherCategoryOptions"
                aria-label="Phân loại bài Haiku ≠"
              />
            </label>
            <label class="form-field">
              <span class="form-field__label">Trạng thái</span>
              <ElegantSelect
                v-model="otherForm.status"
                :options="[
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' },
                ]"
                aria-label="Trạng thái bài Haiku ≠"
              />
            </label>
          </div>
          <label class="form-field form-field--wide">
            <span class="form-field__label">Tóm tắt</span>
            <input v-model="otherForm.summary" class="input" placeholder="Một đoạn ngắn dẫn vào bài" />
          </label>
          <label class="form-field">
            <span class="form-field__label">URL ảnh bìa (tùy chọn)</span>
            <input v-model="otherForm.image" class="input" placeholder="https://... hoặc data URL" />
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
            <div class="upload-field" :class="{ 'upload-field--filled': Boolean(otherForm.image) }">
              <input
                ref="otherImageInput"
                class="upload-field__input"
                type="file"
                accept="image/*"
                @change="handleImageUpload($event, 'other')"
              />
              <div class="upload-field__main">
                <span class="upload-field__title">
                  {{ otherUploadedImageName ? "Ảnh bìa đã được tải lên" : otherForm.image ? "Đang dùng ảnh bìa hiện tại" : "Chưa chọn ảnh bìa" }}
                </span>
                <span v-if="otherUploadedImageName || otherForm.image" class="upload-field__meta">
                  {{ otherUploadedImageName || "Có thể là URL ảnh hoặc ảnh đã lưu trước đó" }}
                </span>
              </div>
              <div class="upload-field__actions">
                <button class="upload-field__button" type="button" @click="openImagePicker('other')">
                  {{ otherForm.image ? "Đổi ảnh" : "Chọn ảnh" }}
                </button>
                <button
                  v-if="otherForm.image"
                  class="upload-field__button upload-field__button--ghost"
                  type="button"
                  @click="clearImage('other')"
                >
                  Bỏ ảnh
                </button>
              </div>
            </div>
          </label>
          <div class="form-field form-field--wide">
            <span class="form-field__label">Nội dung bài</span>
            <RichEssayEditor
              v-model="otherForm.body"
              placeholder="Viết bài Haiku ≠ ở đây. Có thể chèn link hoặc iframe/video."
              :upload-image="uploadOtherBodyImage"
              allow-links
              allow-embeds
              @image-uploaded="handleOtherBodyImageUploaded"
              @error="handleOtherEditorError"
            />
          </div>
          <div class="write-form__actions">
            <button class="submit-btn" type="submit">
              {{ editingOtherSlug ? "Lưu chỉnh sửa" : "Đăng bài Haiku ≠" }}
            </button>
            <button
              v-if="editingOtherSlug"
              class="submit-btn submit-btn--ghost"
              type="button"
              @click="cancelOtherEditing"
            >
              Hủy chỉnh sửa
            </button>
          </div>
          <p v-if="otherMessage" class="form-feedback page-reading-copy">{{ otherMessage }}</p>
        </form>
        </div>
      </div>
    </section>

    <section
      v-if="canEdit ? (activeComposer === 'poem' || activeComposer === 'submission' || showPoemPreviews) : showPoemPreviews"
      ref="poemPreviewSection"
      class="write-page__previews write-page__previews--poems"
    >
      <div class="write-page__previews-head">
        <div class="write-page__previews-head-top">
          <h2 class="write-page__subheading page-reading-h3">{{ poemPreviewHeading }}</h2>
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

      <div v-if="visiblePosts.length" class="write-page__preview-carousel-shell">
        <div
          ref="poemPreviewList"
          :class="['write-page__preview-list', 'write-page__preview-list--poems']"
          @scroll.passive="onPoemPreviewScroll"
        >
          <article
            v-for="poem in visiblePosts"
            :key="`poem-${previewPostsPage}-${poem.id}`"
            class="write-page__preview"
            :class="{ 'write-page__preview--active': editingPostId === poem.id && (activeComposer === 'poem' || isSubmissionPoemReview) }"
          >
            <p v-if="poem.title" class="write-page__preview-title">{{ poem.title }}</p>
            <p v-if="showPoemStatusMeta" class="write-page__essay-meta-line page-reading-copy">
              {{ formatPoemCategory(poem.category) }} · {{ formatPoemStatus(poem.status) }}
            </p>
            <div class="write-page__preview-body">
              <p v-for="(line, i) in poem.lines" :key="i" class="write-page__preview-line page-reading-copy">{{ line }}</p>
            </div>
            <div class="write-page__preview-footer">
              <div class="write-page__preview-meta">
                <router-link :to="'/authors/' + poem.authorSlug" class="write-page__preview-author">
                  {{ poem.author }}
                </router-link>
                <p
                  v-if="canEdit && poem.postedBy"
                  class="write-page__preview-poster page-reading-copy"
                >
                  Đăng bởi {{ poem.postedBy.displayName || poem.postedBy.username }}
                </p>
                <router-link :to="'/post/' + (poem.slug || poem.id)" class="write-page__preview-link">
                  Xem bài · {{ formatDate(poem.publishedAt) }}
                </router-link>
              </div>
              <div v-if="canEdit" class="write-page__preview-actions">
                <button class="write-page__preview-action" type="button" @click="poem.status === 'submitted' ? startEditingSubmittedPost(poem) : startEditingPost(poem)">
                  {{ editingPostId === poem.id && (activeComposer === 'poem' || isSubmissionPoemReview) ? "Đang sửa" : "Sửa" }}
                </button>
                <button
                  v-if="poem.status === 'submitted'"
                  class="write-page__preview-action"
                  type="button"
                  @click="publishPoemSubmission(poem)"
                >
                  Đăng
                </button>
                <button class="write-page__preview-action write-page__preview-action--danger" type="button" @click="removePost(poem)">
                  Xóa
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
      <p
        v-else-if="!previewPostsLoading"
        class="write-page__preview-empty page-reading-copy"
      >
        {{ poemPreviewEmptyMessage }}
      </p>
      <div v-if="showPoemPreviewPagination" class="write-page__pagination">
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="poemPreviewPaginationPrevDisabled"
          @click="handlePostPreviewPrev"
          aria-label="Trang haiku trước"
        >
          &lt;
        </button>
        <p class="write-page__pagination-label page-reading-copy">
          {{ poemPreviewPaginationLabel }}
        </p>
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="poemPreviewPaginationNextDisabled"
          @click="handlePostPreviewNext"
          aria-label="Trang haiku sau"
        >
          &gt;
        </button>
      </div>
    </section>

    <section
      v-if="canEdit ? (activeComposer === 'essay' || activeComposer === 'submission' || showEssayPreviews) : showEssayPreviews"
      ref="essayPreviewSection"
      class="write-page__previews write-page__previews--essays"
    >
      <div class="write-page__previews-head">
        <div class="write-page__previews-head-top">
          <h2 class="write-page__subheading page-reading-h3">{{ essayPreviewHeading }}</h2>
          <div class="write-page__preview-tools">
            <label class="write-page__preview-search">
              <span class="write-page__preview-search-icon" aria-hidden="true">⌕</span>
              <input
                v-model.trim="essayPreviewQuery"
                type="search"
                class="write-page__preview-search-input"
                placeholder="Tìm kiếm"
                aria-label="Tìm nội dung trong mục Nghĩ"
              />
            </label>
            <label class="write-page__preview-filter">
              <span class="write-page__preview-filter-label">Mục</span>
              <ElegantSelect
                v-model="essayPreviewKind"
                class="write-page__preview-filter-select"
                :options="essayPreviewKindOptions"
                aria-label="Lọc nội dung Nghĩ theo mục"
              />
            </label>
            <label v-if="canEdit && !isSubmissionComposer" class="write-page__preview-filter">
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

      <div v-if="visibleEssays.length" class="write-page__preview-carousel-shell">
        <div
          ref="essayPreviewList"
          :class="['write-page__preview-list', 'write-page__preview-list--essays']"
          @scroll.passive="onEssayPreviewScroll"
        >
          <article
            v-for="essay in visibleEssays"
            :key="`essay-${previewEssaysPage}-${essay.id}`"
            class="write-page__preview write-page__preview--essay"
            :class="{ 'write-page__preview--active': editingEssaySlug === essay.slug && (activeComposer === 'essay' || isSubmissionEssayReview) }"
          >
            <p class="write-page__preview-title">{{ essay.title }}</p>
            <p class="write-page__essay-meta-line page-reading-copy">
              {{ formatEssayKind(essay.kind) }} · {{ formatEssayStatus(essay.status) }}
            </p>
            <p class="write-page__essay-summary page-reading-copy">{{ essay.summary || excerptEssay(essay.body) }}</p>
            <p v-if="essay.tags?.length" class="write-page__essay-tags page-reading-copy">
              {{ essay.tags.map((tag) => tag.label).join(" · ") }}
            </p>
            <div class="write-page__preview-footer">
              <div class="write-page__preview-meta">
                <router-link
                  v-if="essay.authorSlug"
                  :to="'/authors/' + essay.authorSlug"
                  class="write-page__preview-author"
                >
                  {{ essay.author }}
                </router-link>
                <span v-else class="write-page__preview-author">{{ essay.author || "Ẩn danh" }}</span>
                <p
                  v-if="canEdit && essay.postedBy"
                  class="write-page__preview-poster page-reading-copy"
                >
                  Đăng bởi {{ essay.postedBy.displayName || essay.postedBy.username }}
                </p>
                <router-link :to="'/essays/' + essay.slug" class="write-page__preview-link">
                  Xem bài · {{ formatDate(essay.publishedAt) }}
                </router-link>
              </div>
              <div v-if="canEdit" class="write-page__preview-actions">
                <button
                  class="write-page__preview-action"
                  type="button"
                  @click="essay.status === 'submitted' ? startEditingSubmission(essay) : startEditingEssay(essay)"
                >
                  {{ editingEssaySlug === essay.slug && (activeComposer === 'essay' || isSubmissionEssayReview) ? "Đang sửa" : "Sửa" }}
                </button>
                <button
                  v-if="essay.status === 'submitted'"
                  class="write-page__preview-action"
                  type="button"
                  @click="publishSubmission(essay)"
                >
                  Đăng
                </button>
                <button class="write-page__preview-action write-page__preview-action--danger" type="button" @click="removeEssay(essay)">
                  Xóa
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
      <p
        v-else-if="!previewEssaysLoading"
        class="write-page__preview-empty page-reading-copy"
      >
        {{ essayPreviewEmptyMessage }}
      </p>
      <div v-if="showEssayPreviewPagination" class="write-page__pagination">
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="essayPreviewPaginationPrevDisabled"
          @click="handleEssayPreviewPrev"
          aria-label="Trang bài luận trước"
        >
          &lt;
        </button>
        <p class="write-page__pagination-label page-reading-copy">
          {{ essayPreviewPaginationLabel }}
        </p>
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="essayPreviewPaginationNextDisabled"
          @click="handleEssayPreviewNext"
          aria-label="Trang bài luận sau"
        >
          &gt;
        </button>
      </div>
    </section>

    <section
      v-if="canEdit && (activeComposer === 'other' || showOtherPreviews)"
      ref="otherPreviewSection"
      class="write-page__previews write-page__previews--other"
    >
      <div class="write-page__previews-head">
        <div class="write-page__previews-head-top">
          <h2 class="write-page__subheading page-reading-h3">Haiku ≠</h2>
          <div class="write-page__preview-tools">
            <label class="write-page__preview-search">
              <span class="write-page__preview-search-icon" aria-hidden="true">⌕</span>
              <input
                v-model.trim="otherPreviewQuery"
                type="search"
                class="write-page__preview-search-input"
                placeholder="Tìm kiếm"
                aria-label="Tìm bài Haiku ≠"
              />
            </label>
            <label class="write-page__preview-filter">
              <span class="write-page__preview-filter-label">Mục</span>
              <ElegantSelect
                v-model="otherPreviewCategory"
                class="write-page__preview-filter-select"
                :options="otherPreviewCategoryOptions"
                aria-label="Lọc Haiku ≠ theo mục"
              />
            </label>
            <label class="write-page__preview-filter">
              <span class="write-page__preview-filter-label">Trạng thái</span>
              <ElegantSelect
                v-model="otherPreviewStatus"
                class="write-page__preview-filter-select"
                :options="otherPreviewStatusOptions"
                aria-label="Lọc Haiku ≠ theo trạng thái"
              />
            </label>
          </div>
        </div>
        <p class="write-page__subcopy page-reading-copy">{{ previewOtherTotal }} bài</p>
      </div>

      <div v-if="visibleOtherPosts.length" class="write-page__preview-carousel-shell">
        <div ref="otherPreviewList" :class="['write-page__preview-list', 'write-page__preview-list--essays']">
          <article
            v-for="post in visibleOtherPosts"
            :key="`other-${previewOtherPage}-${post.id}`"
            class="write-page__preview write-page__preview--essay"
            :class="{ 'write-page__preview--active': editingOtherSlug === post.slug && activeComposer === 'other' }"
          >
            <p class="write-page__preview-title">{{ post.title }}</p>
            <p class="write-page__essay-meta-line page-reading-copy">
              {{ formatOtherCategory(post.category) }} · {{ formatOtherStatus(post.status) }}
            </p>
            <p class="write-page__essay-summary page-reading-copy">{{ post.summary || excerptEssay(post.body) }}</p>
            <div class="write-page__preview-footer">
              <div class="write-page__preview-meta">
                <p
                  v-if="post.postedBy"
                  class="write-page__preview-poster page-reading-copy"
                >
                  Đăng bởi {{ post.postedBy.displayName || post.postedBy.username }}
                </p>
                <router-link :to="'/haiku-khac/' + post.slug" class="write-page__preview-link">
                  Xem bài · {{ formatDate(post.publishedAt) }}
                </router-link>
              </div>
              <div class="write-page__preview-actions">
                <button class="write-page__preview-action" type="button" @click="startEditingOtherPost(post)">
                  {{ editingOtherSlug === post.slug && activeComposer === 'other' ? "Đang sửa" : "Sửa" }}
                </button>
                <button class="write-page__preview-action write-page__preview-action--danger" type="button" @click="removeOtherPost(post)">
                  Xóa
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
      <p
        v-else-if="!previewOtherLoading"
        class="write-page__preview-empty page-reading-copy"
      >
        Không tìm thấy bài Haiku ≠ phù hợp.
      </p>
      <div v-if="showOtherPreviewPagination" class="write-page__pagination">
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="previewOtherPage <= 1"
          @click="changeOtherPreviewPage(previewOtherPage - 1)"
          aria-label="Trang Haiku ≠ trước"
        >
          &lt;
        </button>
        <p class="write-page__pagination-label page-reading-copy">
          {{ otherPreviewPaginationLabel }}
        </p>
        <button
          class="write-page__pagination-btn"
          type="button"
          :disabled="previewOtherPage >= previewOtherTotalPages"
          @click="changeOtherPreviewPage(previewOtherPage + 1)"
          aria-label="Trang Haiku ≠ sau"
        >
          &gt;
        </button>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { gsap } from "gsap";
import ElegantSelect from "components/ElegantSelect.vue";
import RichEssayEditor from "components/RichEssayEditor.vue";
import blogStore from "src/stores/blogStore";
import authStore from "src/stores/authStore";
import { API_BASE } from "src/utils/runtime";
import {
  MOTION_PRESETS,
  animateBlockHeight,
  animateGridEnterByRows,
  animateGridExit,
  animatePanelIn,
  animatePanelOut,
  killMotion,
} from "src/utils/motion";
import {
  excerptEssayContent,
  hasHaikuOtherContent,
  sanitizeEssayHtml,
  sanitizeHaikuOtherHtml,
  stripEssayText,
} from "src/utils/essayContent";
import {
  HAIKU_OTHER_CATEGORIES,
  formatHaikuOtherCategory,
  normalizeHaikuOtherCategory,
} from "src/utils/haikuOther";
import { uploadImageToMediaStore } from "src/utils/mediaUpload";

const CATEGORY_OPTIONS = [
  { value: "jp", label: "Haiku Nhật" },
  { value: "vi", label: "Haiku Việt" },
  { value: "global", label: "Haiku thế giới" },
];

const DRAFT_STORAGE_KEYS = {
  poem: "haiku.write.poemDraft",
  essay: "haiku.write.essayDraft",
  other: "haiku.write.otherDraft",
};

const POEM_PREVIEW_PAGE_SIZE = 12;
const ESSAY_PREVIEW_PAGE_SIZE = 9;
const OTHER_PREVIEW_PAGE_SIZE = 9;
const PREVIEW_PAGE_TRANSITION_MS = MOTION_PRESETS.list.exit.duration;
const PREVIEW_FAST_EXIT_MS = MOTION_PRESETS.list.fastExit.duration;
const PREVIEW_ROW_STAGGER_SEC = MOTION_PRESETS.list.enter.rowStagger;

export default defineComponent({
  name: "WritingPage",
  components: {
    ElegantSelect,
    RichEssayEditor,
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
      loadOtherPreviews();
      restoreDraft("poem");
      restoreDraft("essay");
      restoreDraft("other");
    });

    const activeComposer = ref("poem");
    const poemImageInput = ref(null);
    const essayImageInput = ref(null);
    const otherImageInput = ref(null);
    const composerSection = ref(null);
    const composerModeSwitch = ref(null);
    const poemPreviewSection = ref(null);
    const essayPreviewSection = ref(null);
    const otherPreviewSection = ref(null);
    const poemPreviewList = ref(null);
    const essayPreviewList = ref(null);
    const otherPreviewList = ref(null);
    const composerPanelHost = ref(null);
    const poemComposerPanel = ref(null);
    const essayComposerPanel = ref(null);
    const otherComposerPanel = ref(null);
    const editingPostId = ref("");
    const editingEssaySlug = ref("");
    const editingOtherSlug = ref("");

    const poemForm = reactive({
      title: "",
      author: "",
      category: "vi",
      summary: "",
      image: "",
      status: "published",
      linesInput: "",
    });

    const essayForm = reactive({
      title: "",
      author: "",
      kind: "commentary",
      status: "draft",
      summary: "",
      image: "",
      tagsInput: "",
      body: "",
    });

    const otherForm = reactive({
      title: "",
      category: "multimedia",
      status: "draft",
      summary: "",
      image: "",
      body: "",
    });

    const poemMessage = ref("");
    const essayMessage = ref("");
    const otherMessage = ref("");
    const poemUploadedImageName = ref("");
    const essayUploadedImageName = ref("");
    const otherUploadedImageName = ref("");
    const toastVisible = ref(false);
    const toastMessage = ref("");
    const previewError = ref("");
    const previewPosts = ref([]);
    const previewEssays = ref([]);
    const previewOtherPosts = ref([]);
    const previewPostsPage = ref(1);
    const previewEssaysPage = ref(1);
    const previewOtherPage = ref(1);
    const previewPostsTotal = ref(0);
    const previewEssaysTotal = ref(0);
    const previewOtherTotal = ref(0);
    const previewPostsTotalPages = ref(1);
    const previewEssaysTotalPages = ref(1);
    const previewOtherTotalPages = ref(1);
    const previewPostsLoading = ref(false);
    const previewEssaysLoading = ref(false);
    const previewOtherLoading = ref(false);
    const poemPreviewActiveIndex = ref(0);
    const essayPreviewActiveIndex = ref(0);
    const activeAuthorSuggestions = ref("");
    const poemPreviewQuery = ref("");
    const essayPreviewQuery = ref("");
    const otherPreviewQuery = ref("");
    const poemPreviewCategory = ref("");
    const essayPreviewKind = ref("");
    const otherPreviewCategory = ref("");
    const essayPreviewStatus = ref(authStore.canEdit() ? "editable" : "published");
    const otherPreviewStatus = ref("all");
    const viewportWidth = ref(syncViewportWidth());
    const isPreviewCarouselMobile = computed(() => viewportWidth.value <= 800);
    const poemPreviewTransitionId = ref(0);
    const essayPreviewTransitionId = ref(0);
    const suppressedPreviewScrollCount = ref(0);
    const suppressedPreviewMotionCount = ref(0);
    const composerSwitching = ref(false);
    const submissionReviewType = ref("");
    let toastTimer = null;
    let poemPreviewSearchTimer = null;
    let essayPreviewSearchTimer = null;
    let otherPreviewSearchTimer = null;
    let authorSuggestionsCloseTimer = null;
    let poemPreviewScrollRaf = 0;
    let essayPreviewScrollRaf = 0;

    const posts = computed(() => previewPosts.value);
    const essays = computed(() => previewEssays.value);
    const otherPosts = computed(() => previewOtherPosts.value);
    const visiblePosts = computed(() => previewPosts.value);
    const visibleEssays = computed(() => previewEssays.value);
    const visibleOtherPosts = computed(() => previewOtherPosts.value);
    const showPoemPreviews = computed(
      () => previewPostsTotal.value > 0 || Boolean(poemPreviewQuery.value) || Boolean(poemPreviewCategory.value)
    );
    const isSubmissionComposer = computed(() => !canEdit.value || activeComposer.value === "submission");
    const isSubmissionReviewTab = computed(() => canEdit.value && activeComposer.value === "submission");
    const poemPreviewStatus = computed(() => (isSubmissionReviewTab.value ? "submitted" : "published"));
    const showEssayPreviews = computed(() => {
      const defaultStatus = canEdit.value ? (isSubmissionComposer.value ? "submitted" : "editable") : "published";
      return (
        previewEssaysTotal.value > 0 ||
        Boolean(essayPreviewQuery.value) ||
        Boolean(essayPreviewKind.value) ||
        essayPreviewStatus.value !== defaultStatus
      );
    });
    const showOtherPreviews = computed(
      () =>
        previewOtherTotal.value > 0 ||
        Boolean(otherPreviewQuery.value) ||
        Boolean(otherPreviewCategory.value) ||
        otherPreviewStatus.value !== "all"
    );
    const loading = computed(
      () =>
        previewPostsLoading.value ||
        previewEssaysLoading.value ||
        previewOtherLoading.value ||
        blogStore.state.loading ||
        blogStore.state.essaysLoading
    );
    const error = computed(() => previewError.value || blogStore.state.error || blogStore.state.essaysError || blogStore.state.haikuOtherError);
    const canEdit = computed(() => authStore.canEdit());
    const composerIntroText = computed(() =>
      canEdit.value
        ? "Chọn đăng haiku, nghiên cứu và bình luận, Haiku ≠, hoặc duyệt bài gửi."
        : "Chọn gửi haiku hoặc nghiên cứu và bình luận để ban biên tập xem xét và xuất bản sau."
    );
    const categoryOptions = CATEGORY_OPTIONS;
    const availableAuthors = computed(() => blogStore.getAuthors());
    const isSubmissionPoemReview = computed(
      () => canEdit.value && activeComposer.value === "submission" && submissionReviewType.value === "poem" && Boolean(editingPostId.value)
    );
    const isSubmissionEssayReview = computed(
      () => canEdit.value && activeComposer.value === "submission" && submissionReviewType.value === "essay" && Boolean(editingEssaySlug.value)
    );
    const essayPreviewStatusOptions = computed(() =>
      canEdit.value
        ? [
            { value: "editable", label: "Tất cả" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]
        : [{ value: "published", label: "Published" }]
    );
    const essayPreviewKindOptions = [
      { value: "", label: "Tất cả" },
      { value: "research", label: "Nghiên cứu" },
      { value: "commentary", label: "Bình luận" },
    ];
    const essayKindOptions = [
      { value: "research", label: "Nghiên cứu" },
      { value: "commentary", label: "Bình luận" },
    ];
    const haikuOtherCategoryOptions = HAIKU_OTHER_CATEGORIES.map((item) => ({
      value: item.value,
      label: item.label,
    }));
    const otherPreviewCategoryOptions = [
      { value: "", label: "Tất cả" },
      ...haikuOtherCategoryOptions,
    ];
    const otherPreviewStatusOptions = [
      { value: "all", label: "Tất cả" },
      { value: "published", label: "Published" },
      { value: "draft", label: "Draft" },
    ];
    const poemPreviewPaginationLabel = computed(() =>
      isPreviewCarouselMobile.value
        ? `${formatPageNumber(Math.min(previewPostsTotal.value, poemPreviewActiveIndex.value + 1 || 1))} / ${formatPageNumber(previewPostsTotal.value || 1)}`
        : `${formatPageNumber(previewPostsPage.value)} / ${formatPageNumber(previewPostsTotalPages.value)}`
    );
    const essayPreviewPaginationLabel = computed(() =>
      isPreviewCarouselMobile.value
        ? `${formatPageNumber(Math.min(previewEssaysTotal.value, essayPreviewActiveIndex.value + 1 || 1))} / ${formatPageNumber(previewEssaysTotal.value || 1)}`
        : `${formatPageNumber(previewEssaysPage.value)} / ${formatPageNumber(previewEssaysTotalPages.value)}`
    );
    const otherPreviewPaginationLabel = computed(() =>
      `${formatPageNumber(previewOtherPage.value)} / ${formatPageNumber(previewOtherTotalPages.value)}`
    );
    const essayPreviewHeading = computed(() =>
      isSubmissionReviewTab.value ? "Bài gửi chờ duyệt" : "Nghiên cứu và bình luận"
    );
    const essayPreviewEmptyMessage = computed(() =>
      isSubmissionReviewTab.value
        ? "Chưa có bài gửi chờ duyệt."
        : "Không tìm thấy nội dung phù hợp trong mục Nghĩ."
    );
    const essayLikeSubmitLabel = computed(() => {
      if (isSubmissionComposer.value) {
        return editingEssaySlug.value ? "Lưu bài gửi" : "Gửi bài";
      }
      if (essayForm.status === "submitted") {
        return "Lưu bài chờ duyệt";
      }
      return editingEssaySlug.value ? "Lưu chỉnh sửa" : "Đăng bài Nghĩ";
    });
    const poemSubmitLabel = computed(() => {
      if (!canEdit.value) {
        return editingPostId.value ? "Lưu haiku gửi" : "Gửi haiku";
      }
      if (poemForm.status === "submitted") {
        return "Lưu haiku chờ duyệt";
      }
      return editingPostId.value ? "Lưu chỉnh sửa" : "Đăng haiku";
    });
    const showPublishPoemSubmissionButton = computed(
      () => canEdit.value && editingPostId.value && poemForm.status === "submitted" && (activeComposer.value === "poem" || isSubmissionPoemReview.value)
    );
    const showPoemComposer = computed(() => activeComposer.value === "poem" || isSubmissionPoemReview.value);
    const poemPreviewHeading = computed(() =>
      isSubmissionReviewTab.value ? "Haiku chờ duyệt" : "Haiku đã đăng"
    );
    const poemPreviewEmptyMessage = computed(() =>
      isSubmissionReviewTab.value ? "Chưa có haiku chờ duyệt." : "Không tìm thấy haiku phù hợp."
    );
    const showPoemStatusMeta = computed(() => isSubmissionReviewTab.value);
    const essayLikeCancelVisible = computed(() => Boolean(editingEssaySlug.value));
    const showPublishSubmissionButton = computed(
      () => canEdit.value && Boolean(editingEssaySlug.value) && essayForm.status === "submitted" && (activeComposer.value === "essay" || isSubmissionEssayReview.value)
    );
    const showEssayComposer = computed(
      () => activeComposer.value === "essay" || (!canEdit.value && activeComposer.value !== "poem") || isSubmissionEssayReview.value
    );
    const showOtherComposer = computed(() => canEdit.value && activeComposer.value === "other");
    const showPoemPreviewPagination = computed(() =>
      isPreviewCarouselMobile.value
        ? previewPostsTotal.value > 1
        : previewPostsTotalPages.value > 1
    );
    const showEssayPreviewPagination = computed(() =>
      isPreviewCarouselMobile.value
        ? previewEssaysTotal.value > 1
        : previewEssaysTotalPages.value > 1
    );
    const showOtherPreviewPagination = computed(() => previewOtherTotalPages.value > 1);
    const poemPreviewPaginationPrevDisabled = computed(() =>
      isPreviewCarouselMobile.value
        ? poemPreviewActiveIndex.value <= 0
        : previewPostsPage.value <= 1
    );
    const poemPreviewPaginationNextDisabled = computed(() =>
      isPreviewCarouselMobile.value
        ? poemPreviewActiveIndex.value >= Math.max(0, previewPostsTotal.value - 1)
        : previewPostsPage.value >= previewPostsTotalPages.value
    );
    const essayPreviewPaginationPrevDisabled = computed(() =>
      isPreviewCarouselMobile.value
        ? essayPreviewActiveIndex.value <= 0
        : previewEssaysPage.value <= 1
    );
    const essayPreviewPaginationNextDisabled = computed(() =>
      isPreviewCarouselMobile.value
        ? essayPreviewActiveIndex.value >= Math.max(0, previewEssaysTotal.value - 1)
        : previewEssaysPage.value >= previewEssaysTotalPages.value
    );

    const handleResize = () => {
      viewportWidth.value = syncViewportWidth();
    };

    const getSubmissionReviewPanel = (reviewType = submissionReviewType.value) =>
      reviewType === "poem" ? poemComposerPanel.value : reviewType === "essay" ? essayComposerPanel.value : null;

    const getComposerPanel = (composer = activeComposer.value, reviewType = submissionReviewType.value) => {
      if (composer === "submission") {
        return getSubmissionReviewPanel(reviewType);
      }

      if (composer === "poem") {
        return poemComposerPanel.value;
      }

      if (composer === "essay" || (!canEdit.value && composer !== "poem")) {
        return essayComposerPanel.value;
      }

      if (composer === "other") {
        return otherComposerPanel.value;
      }

      return null;
    };

    const animateComposerSwitch = async (nextComposer) => {
      if (composerSwitching.value) {
        activeComposer.value = nextComposer;
        return;
      }

      const host = composerPanelHost.value;
      const currentPanel = getComposerPanel();
      const nextPanelTarget = getComposerPanel(nextComposer);
      const fromHeight = host?.offsetHeight ?? currentPanel?.offsetHeight ?? 0;

      composerSwitching.value = true;

      try {
        if (nextComposer === "submission") {
          if (currentPanel) {
            await animatePanelOut(currentPanel);
          }

          activeComposer.value = "submission";
          await nextTick();

          if (host && fromHeight > 0) {
            await animateBlockHeight(host, fromHeight, 0, { duration: 0.24 });
          }
          return;
        }

        if (activeComposer.value === "submission" && !submissionReviewType.value) {
          if (nextPanelTarget) {
            killMotion(nextPanelTarget);
            gsap.set(nextPanelTarget, {
              opacity: 0,
              y: MOTION_PRESETS.editorial.panelIn.fromY,
              filter: `blur(${MOTION_PRESETS.editorial.panelIn.blur}px)`,
            });
          }

          activeComposer.value = nextComposer;
          await nextTick();

          const nextPanel = getComposerPanel(nextComposer);
          const toHeight = nextPanel?.offsetHeight ?? host?.scrollHeight ?? 0;

          if (host && toHeight > 0) {
            await animateBlockHeight(host, 0, toHeight, { duration: 0.28 });
          }

          if (nextPanel) {
            await animatePanelIn(nextPanel);
          }
          return;
        }

        if (nextPanelTarget && nextPanelTarget !== currentPanel) {
          killMotion(nextPanelTarget);
          gsap.set(nextPanelTarget, {
            opacity: 0,
            y: MOTION_PRESETS.editorial.panelIn.fromY,
            filter: `blur(${MOTION_PRESETS.editorial.panelIn.blur}px)`,
          });
        }

        if (currentPanel) {
          await animatePanelOut(currentPanel);
        }

        activeComposer.value = nextComposer;
        await nextTick();

        const nextPanel = getComposerPanel(nextComposer);
        const toHeight = host?.scrollHeight ?? nextPanel?.offsetHeight ?? fromHeight;

        if (host && fromHeight > 0 && toHeight > 0 && fromHeight !== toHeight) {
          await animateBlockHeight(host, fromHeight, toHeight, { duration: 0.28 });
        }

        if (nextPanel) {
          await animatePanelIn(nextPanel);
        }
      } finally {
        composerSwitching.value = false;
      }
    };

    const openSubmissionReviewPanel = async (reviewType) => {
      if (!["poem", "essay"].includes(reviewType)) {
        return;
      }

      if (composerSwitching.value) {
        submissionReviewType.value = reviewType;
        activeComposer.value = "submission";
        return;
      }

      const host = composerPanelHost.value;
      const currentPanel = getSubmissionReviewPanel();
      const currentReviewType = submissionReviewType.value;
      const fromHeight = host?.offsetHeight ?? currentPanel?.offsetHeight ?? 0;

      composerSwitching.value = true;

      try {
        if (currentPanel && currentReviewType !== reviewType) {
          await animatePanelOut(currentPanel);
        }

        activeComposer.value = "submission";
        submissionReviewType.value = reviewType;
        await nextTick();

        const nextPanel = getSubmissionReviewPanel(reviewType);
        const toHeight = host?.scrollHeight ?? nextPanel?.offsetHeight ?? fromHeight;

        if (host && Number.isFinite(toHeight) && toHeight > 0 && fromHeight !== toHeight) {
          await animateBlockHeight(host, Math.max(0, fromHeight), toHeight, { duration: 0.28 });
        }

        if (nextPanel && (!currentPanel || currentReviewType !== reviewType || fromHeight === 0)) {
          await animatePanelIn(nextPanel);
        }
      } finally {
        composerSwitching.value = false;
      }
    };

    const chooseComposer = async (nextComposer) => {
      if (activeComposer.value === nextComposer) {
        return;
      }

      if (canEdit.value && activeComposer.value === "submission" && nextComposer !== "submission") {
        suppressedPreviewScrollCount.value = 2;
        suppressedPreviewMotionCount.value = 2;
        submissionReviewType.value = "";
      }

      if (canEdit.value && nextComposer === "submission") {
        suppressedPreviewScrollCount.value = 2;
        suppressedPreviewMotionCount.value = 2;
      }

      await animateComposerSwitch(nextComposer);

      if (canEdit.value && nextComposer === "submission") {
        await nextTick();
        poemPreviewSection.value?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    };

    const scrollToComposer = async () => {
      await nextTick();
      const target = composerModeSwitch.value || composerSection.value;
      target?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
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

    const resetPreviewCarouselPosition = async (type) => {
      await nextTick();
      const list = type === "essay" ? essayPreviewList.value : poemPreviewList.value;
      if (!list) {
        return;
      }

      list.scrollTo({
        left: 0,
        behavior: "auto",
      });
    };

    const resetPreviewData = (type) => {
      if (type === "essay") {
        previewEssays.value = [];
        previewEssaysTotal.value = 0;
        previewEssaysTotalPages.value = 1;
        previewEssaysPage.value = 1;
        essayPreviewActiveIndex.value = 0;
        return;
      }

      if (type === "other") {
        previewOtherPosts.value = [];
        previewOtherTotal.value = 0;
        previewOtherTotalPages.value = 1;
        previewOtherPage.value = 1;
        return;
      }

      previewPosts.value = [];
      previewPostsTotal.value = 0;
      previewPostsTotalPages.value = 1;
      previewPostsPage.value = 1;
      poemPreviewActiveIndex.value = 0;
    };

    async function loadPostPreviews(page = previewPostsPage.value, { append = false } = {}) {
      previewPostsLoading.value = true;
      previewError.value = "";

      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: String(POEM_PREVIEW_PAGE_SIZE),
          status: poemPreviewStatus.value,
        });
        if (poemPreviewQuery.value) {
          query.set("search", poemPreviewQuery.value);
        }
        if (poemPreviewCategory.value) {
          query.set("category", poemPreviewCategory.value);
        }
        const res = await fetch(`${API_BASE}/posts?${query.toString()}`, {
          headers: authStore.getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        previewPosts.value = append ? [...previewPosts.value, ...items] : items;
        previewPostsPage.value = Number(data?.page) || 1;
        previewPostsTotal.value = Number(data?.total) || 0;
        previewPostsTotalPages.value = Math.max(1, Number(data?.totalPages) || 1);
        if (!append) {
          poemPreviewActiveIndex.value = 0;
        }
      } catch (err) {
        console.error("Không tải được preview haiku", err);
        previewError.value = "Không tải được danh sách bài viết từ máy chủ.";
      } finally {
        previewPostsLoading.value = false;
      }
    }

    async function loadEssayPreviews(page = previewEssaysPage.value, { append = false } = {}) {
      previewEssaysLoading.value = true;
      previewError.value = "";

      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: String(ESSAY_PREVIEW_PAGE_SIZE),
          status: essayPreviewStatus.value,
        });
        if (essayPreviewKind.value) {
          query.set("kind", essayPreviewKind.value);
        }
        if (essayPreviewQuery.value) {
          query.set("search", essayPreviewQuery.value);
        }
        const res = await fetch(`${API_BASE}/essays?${query.toString()}`, {
          headers: authStore.getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        previewEssays.value = append ? [...previewEssays.value, ...items] : items;
        previewEssaysPage.value = Number(data?.page) || 1;
        previewEssaysTotal.value = Number(data?.total) || 0;
        previewEssaysTotalPages.value = Math.max(1, Number(data?.totalPages) || 1);
        if (!append) {
          essayPreviewActiveIndex.value = 0;
        }
      } catch (err) {
        console.error("Không tải được preview bài luận", err);
        previewError.value = "Không tải được danh sách bài luận từ máy chủ.";
      } finally {
        previewEssaysLoading.value = false;
      }
    }

    async function loadOtherPreviews(page = previewOtherPage.value) {
      previewOtherLoading.value = true;
      previewError.value = "";

      try {
        const data = await blogStore.fetchPagedHaikuOtherPosts({
          page,
          pageSize: OTHER_PREVIEW_PAGE_SIZE,
          status: otherPreviewStatus.value,
          category: otherPreviewCategory.value,
          search: otherPreviewQuery.value,
        });
        previewOtherPosts.value = data.items;
        previewOtherPage.value = data.page;
        previewOtherTotal.value = data.total;
        previewOtherTotalPages.value = data.totalPages;
      } catch (err) {
        console.error("Không tải được preview Haiku ≠", err);
        previewError.value = "Không tải được danh sách Haiku ≠ từ máy chủ.";
      } finally {
        previewOtherLoading.value = false;
      }
    }

    async function changePostPreviewPage(nextPage) {
      if (isPreviewCarouselMobile.value) {
        await movePreviewItem("poem", nextPage > previewPostsPage.value ? 1 : -1);
        return;
      }
      const targetPage = Math.min(Math.max(1, nextPage), previewPostsTotalPages.value);
      if (targetPage === previewPostsPage.value && previewPosts.value.length) return;
      const targetCount = getExpectedItemCount(
        targetPage,
        previewPostsTotal.value,
        POEM_PREVIEW_PAGE_SIZE,
        previewPostsTotalPages.value
      );
      await transitionPostPreviews(targetPage, targetCount < previewPosts.value.length);
    }

    async function changeEssayPreviewPage(nextPage) {
      if (isPreviewCarouselMobile.value) {
        await movePreviewItem("essay", nextPage > previewEssaysPage.value ? 1 : -1);
        return;
      }
      const targetPage = Math.min(Math.max(1, nextPage), previewEssaysTotalPages.value);
      if (targetPage === previewEssaysPage.value && previewEssays.value.length) return;
      const targetCount = getExpectedItemCount(
        targetPage,
        previewEssaysTotal.value,
        ESSAY_PREVIEW_PAGE_SIZE,
        previewEssaysTotalPages.value
      );
      await transitionEssayPreviews(targetPage, targetCount < previewEssays.value.length);
    }

    async function changeOtherPreviewPage(nextPage) {
      const targetPage = Math.min(Math.max(1, nextPage), previewOtherTotalPages.value);
      if (targetPage === previewOtherPage.value && previewOtherPosts.value.length) return;
      await loadOtherPreviews(targetPage);
      await nextTick();
      otherPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      await animateGridEnterByRows(getPreviewItems("other"), {
        columns: getEssayPreviewColumns(),
        ...MOTION_PRESETS.list.enter,
        rowStagger: PREVIEW_ROW_STAGGER_SEC,
      });
    }

    const getPreviewItems = (type) => {
      const root =
        type === "other"
          ? otherPreviewList.value
          : type === "essay"
            ? essayPreviewList.value
            : poemPreviewList.value;
      return root ? Array.from(root.querySelectorAll(".write-page__preview")) : [];
    };

    const animatePreviewEnter = async (type) => {
      await nextTick();
      const items = getPreviewItems(type);
      const columns = type === "essay" || type === "other" ? getEssayPreviewColumns() : getPoemPreviewColumns();
      await animateGridEnterByRows(items, {
        columns,
        ...MOTION_PRESETS.list.enter,
        rowStagger: PREVIEW_ROW_STAGGER_SEC,
      });
    };

    const transitionPostPreviews = async (targetPage = 1, isFastExit = false) => {
      if (isPreviewCarouselMobile.value) {
        await loadPostPreviews(targetPage, { append: false });
        await resetPreviewCarouselPosition("poem");
        if (suppressedPreviewScrollCount.value > 0) {
          suppressedPreviewScrollCount.value -= 1;
        } else {
          poemPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      if (suppressedPreviewMotionCount.value > 0) {
        suppressedPreviewMotionCount.value -= 1;
        await loadPostPreviews(targetPage);
        await nextTick();
        return;
      }

      const transitionId = poemPreviewTransitionId.value + 1;
      poemPreviewTransitionId.value = transitionId;

      const currentItems = getPreviewItems("poem");
      if (currentItems.length) {
        await animateGridExit(currentItems, {
          ...(isFastExit ? MOTION_PRESETS.list.fastExit : MOTION_PRESETS.list.exit),
        });
      }

      if (poemPreviewTransitionId.value !== transitionId) {
        return;
      }

      await loadPostPreviews(targetPage);
      await nextTick();
      if (suppressedPreviewScrollCount.value > 0) {
        suppressedPreviewScrollCount.value -= 1;
      } else {
        poemPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      if (poemPreviewTransitionId.value !== transitionId) {
        return;
      }

      await animatePreviewEnter("poem");
    };

    const transitionEssayPreviews = async (targetPage = 1, isFastExit = false) => {
      if (isPreviewCarouselMobile.value) {
        await loadEssayPreviews(targetPage, { append: false });
        await resetPreviewCarouselPosition("essay");
        if (suppressedPreviewScrollCount.value > 0) {
          suppressedPreviewScrollCount.value -= 1;
        } else {
          essayPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      if (suppressedPreviewMotionCount.value > 0) {
        suppressedPreviewMotionCount.value -= 1;
        await loadEssayPreviews(targetPage);
        await nextTick();
        return;
      }

      const transitionId = essayPreviewTransitionId.value + 1;
      essayPreviewTransitionId.value = transitionId;

      const currentItems = getPreviewItems("essay");
      if (currentItems.length) {
        await animateGridExit(currentItems, {
          ...(isFastExit ? MOTION_PRESETS.list.fastExit : MOTION_PRESETS.list.exit),
        });
      }

      if (essayPreviewTransitionId.value !== transitionId) {
        return;
      }

      await loadEssayPreviews(targetPage);
      await nextTick();
      if (suppressedPreviewScrollCount.value > 0) {
        suppressedPreviewScrollCount.value -= 1;
      } else {
        essayPreviewSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      if (essayPreviewTransitionId.value !== transitionId) {
        return;
      }

      await animatePreviewEnter("essay");
    };

    const getPreviewScrollStep = (type) => {
      const list = type === "essay" ? essayPreviewList.value : poemPreviewList.value;
      const firstItem = list?.querySelector?.(".write-page__preview");
      if (!list || !firstItem) {
        return 1;
      }

      const gap = Number.parseFloat(window.getComputedStyle(list).columnGap || window.getComputedStyle(list).gap || "0") || 0;
      return firstItem.clientWidth + gap;
    };

    const scrollPreviewToIndex = async (type, index, behavior = "smooth") => {
      await nextTick();
      const list = type === "essay" ? essayPreviewList.value : poemPreviewList.value;
      if (!list) {
        return;
      }

      const step = getPreviewScrollStep(type);
      list.scrollTo({
        left: step * Math.max(0, index),
        behavior,
      });
    };

    const maybeAppendMobilePreviewItems = async (type) => {
      if (!isPreviewCarouselMobile.value) {
        return;
      }

      if (type === "essay") {
        if (
          essayPreviewEssaysAppendingGuard()
        ) {
          return;
        }
      } else if (
        poemPreviewPostsAppendingGuard()
      ) {
        return;
      }

      const activeIndex = type === "essay" ? essayPreviewActiveIndex.value : poemPreviewActiveIndex.value;
      const items = type === "essay" ? previewEssays.value : previewPosts.value;
      const page = type === "essay" ? previewEssaysPage.value : previewPostsPage.value;
      const totalPages = type === "essay" ? previewEssaysTotalPages.value : previewPostsTotalPages.value;

      if (activeIndex < items.length - 2 || page >= totalPages) {
        return;
      }

      if (type === "essay") {
        await loadEssayPreviews(page + 1, { append: true });
      } else {
        await loadPostPreviews(page + 1, { append: true });
      }
    };

    const poemPreviewPostsAppendingGuard = () => previewPostsLoading.value || previewPostsPage.value >= previewPostsTotalPages.value;
    const essayPreviewEssaysAppendingGuard = () => previewEssaysLoading.value || previewEssaysPage.value >= previewEssaysTotalPages.value;

    const syncPreviewCarouselIndex = async (type) => {
      if (!isPreviewCarouselMobile.value) {
        return;
      }

      const list = type === "essay" ? essayPreviewList.value : poemPreviewList.value;
      if (!list) {
        return;
      }

      const step = getPreviewScrollStep(type);
      const nextIndex = Math.max(0, Math.round(list.scrollLeft / step));

      if (type === "essay") {
        essayPreviewActiveIndex.value = nextIndex;
      } else {
        poemPreviewActiveIndex.value = nextIndex;
      }

      await maybeAppendMobilePreviewItems(type);
    };

    const onPoemPreviewScroll = () => {
      if (!isPreviewCarouselMobile.value) {
        return;
      }

      if (poemPreviewScrollRaf) {
        window.cancelAnimationFrame(poemPreviewScrollRaf);
      }

      poemPreviewScrollRaf = window.requestAnimationFrame(() => {
        poemPreviewScrollRaf = 0;
        syncPreviewCarouselIndex("poem");
      });
    };

    const onEssayPreviewScroll = () => {
      if (!isPreviewCarouselMobile.value) {
        return;
      }

      if (essayPreviewScrollRaf) {
        window.cancelAnimationFrame(essayPreviewScrollRaf);
      }

      essayPreviewScrollRaf = window.requestAnimationFrame(() => {
        essayPreviewScrollRaf = 0;
        syncPreviewCarouselIndex("essay");
      });
    };

    const movePreviewItem = async (type, delta) => {
      const activeIndex = type === "essay" ? essayPreviewActiveIndex.value : poemPreviewActiveIndex.value;
      const total = type === "essay" ? previewEssaysTotal.value : previewPostsTotal.value;
      const currentItems = type === "essay" ? previewEssays.value : previewPosts.value;
      const page = type === "essay" ? previewEssaysPage.value : previewPostsPage.value;
      const totalPages = type === "essay" ? previewEssaysTotalPages.value : previewPostsTotalPages.value;
      let targetIndex = Math.max(0, Math.min(total - 1, activeIndex + delta));

      if (targetIndex >= currentItems.length && page < totalPages) {
        if (type === "essay") {
          await loadEssayPreviews(page + 1, { append: true });
        } else {
          await loadPostPreviews(page + 1, { append: true });
        }
      }

      targetIndex = Math.max(
        0,
        Math.min(
          (type === "essay" ? previewEssays.value.length : previewPosts.value.length) - 1,
          targetIndex
        )
      );

      if (type === "essay") {
        essayPreviewActiveIndex.value = targetIndex;
      } else {
        poemPreviewActiveIndex.value = targetIndex;
      }

      await scrollPreviewToIndex(type, targetIndex);
      await maybeAppendMobilePreviewItems(type);
    };

    const handlePostPreviewPrev = () =>
      (isPreviewCarouselMobile.value
        ? movePreviewItem("poem", -1)
        : changePostPreviewPage(previewPostsPage.value - 1));

    const handlePostPreviewNext = () =>
      (isPreviewCarouselMobile.value
        ? movePreviewItem("poem", 1)
        : changePostPreviewPage(previewPostsPage.value + 1));

    const handleEssayPreviewPrev = () =>
      (isPreviewCarouselMobile.value
        ? movePreviewItem("essay", -1)
        : changeEssayPreviewPage(previewEssaysPage.value - 1));

    const handleEssayPreviewNext = () =>
      (isPreviewCarouselMobile.value
        ? movePreviewItem("essay", 1)
        : changeEssayPreviewPage(previewEssaysPage.value + 1));

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
          essayForm.kind = data.kind || "commentary";
          essayForm.status = data.status || "draft";
          essayForm.summary = data.summary || "";
          essayForm.image = data.image || "";
          essayForm.tagsInput = data.tagsInput || "";
          essayForm.body = data.body || "";
          essayUploadedImageName.value = data.uploadedImageName || "";
        } else if (type === "other") {
          otherForm.title = data.title || "";
          otherForm.category = normalizeHaikuOtherCategory(data.category);
          otherForm.status = data.status || "draft";
          otherForm.summary = data.summary || "";
          otherForm.image = data.image || "";
          otherForm.body = sanitizeHaikuOtherHtml(data.body || "");
          otherUploadedImageName.value = data.uploadedImageName || "";
        } else {
          poemForm.title = data.title || "";
          poemForm.author = data.author || "";
          poemForm.category = data.category || "vi";
          poemForm.summary = data.summary || "";
          poemForm.image = data.image || "";
          poemForm.status = data.status || "published";
          poemForm.linesInput = data.linesInput || "";
          poemUploadedImageName.value = data.uploadedImageName || "";
        }
      } catch (_error) {
        // ignore invalid draft payload
      }
    }

    const isEssayLikeType = (type) => type === "essay" || type === "submission";
    const isOtherType = (type) => type === "other";

    const clearFileInput = (type) => {
      const inputRef = isOtherType(type)
        ? otherImageInput.value
        : isEssayLikeType(type)
          ? essayImageInput.value
          : poemImageInput.value;
      if (inputRef) {
        inputRef.value = "";
      }
    };

    const openImagePicker = (type) => {
      const inputRef = isOtherType(type)
        ? otherImageInput.value
        : isEssayLikeType(type)
          ? essayImageInput.value
          : poemImageInput.value;
      inputRef?.click();
    };

    const clearImage = (type) => {
      if (isOtherType(type)) {
        otherForm.image = "";
        otherUploadedImageName.value = "";
        otherMessage.value = "";
        persistDraft("other", {
          ...otherForm,
          uploadedImageName: "",
        });
      } else if (isEssayLikeType(type)) {
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
      poemForm.status = "published";
      poemForm.linesInput = "";
      poemUploadedImageName.value = "";
      clearFileInput("poem");
      clearDraft("poem");
    };

    const resetEssayForm = () => {
      editingEssaySlug.value = "";
      essayForm.title = "";
      essayForm.author = "";
      essayForm.kind = "commentary";
      essayForm.status = "draft";
      essayForm.summary = "";
      essayForm.image = "";
      essayForm.tagsInput = "";
      essayForm.body = "";
      essayUploadedImageName.value = "";
      clearFileInput("essay");
      clearDraft("essay");
    };

    const resetOtherForm = () => {
      editingOtherSlug.value = "";
      otherForm.title = "";
      otherForm.category = "multimedia";
      otherForm.status = "draft";
      otherForm.summary = "";
      otherForm.image = "";
      otherForm.body = "";
      otherUploadedImageName.value = "";
      clearFileInput("other");
      clearDraft("other");
    };

    const applyPostToForm = (post, composer = "poem") => {
      activeComposer.value = composer;
      editingPostId.value = post.id;
      poemForm.title = post.title || "";
      poemForm.author = post.author || "";
      poemForm.category = post.category || "vi";
      poemForm.summary = post.summary || "";
      poemForm.image = post.image || "";
      poemForm.status = post.status || "published";
      poemForm.linesInput = Array.isArray(post.lines) ? post.lines.join("\n") : "";
      poemUploadedImageName.value = post.image ? "Đang dùng ảnh hiện tại" : "";
      clearFileInput("poem");
    };

    const applyEssayToForm = (essay, composer = "essay") => {
      activeComposer.value = composer;
      editingEssaySlug.value = essay.slug;
      essayForm.title = essay.title || "";
      essayForm.author = essay.author || "";
      essayForm.kind = essay.kind || "commentary";
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

    const applyOtherToForm = (post) => {
      activeComposer.value = "other";
      editingOtherSlug.value = post.slug;
      otherForm.title = post.title || "";
      otherForm.category = normalizeHaikuOtherCategory(post.category);
      otherForm.status = post.status || "published";
      otherForm.summary = post.summary || "";
      otherForm.image = post.image || "";
      otherForm.body = sanitizeHaikuOtherHtml(post.body || "");
      otherUploadedImageName.value = post.image ? "Đang dùng ảnh hiện tại" : "";
      clearFileInput("other");
    };

    watch(
      canEdit,
      () => {
        if (canEdit.value) {
          essayPreviewStatus.value = isSubmissionComposer.value ? "submitted" : "editable";
        } else {
          essayPreviewStatus.value = "published";
        }
        loadEssayPreviews(1);
        if (canEdit.value) {
          loadOtherPreviews(1);
        }
      },
      { immediate: true }
    );

    watch(activeComposer, (value) => {
      if (canEdit.value && value === "submission") {
        if (essayPreviewStatus.value !== "submitted") {
          essayPreviewStatus.value = "submitted";
        }
      } else if (canEdit.value && essayPreviewStatus.value === "submitted") {
        essayPreviewStatus.value = "editable";
      }
    });

    watch(poemPreviewStatus, () => {
      resetPreviewData("poem");
      transitionPostPreviews(1);
    });

    watch(poemPreviewCategory, () => {
      transitionPostPreviews(1);
    });

    watch(essayPreviewStatus, () => {
      resetPreviewData("essay");
      transitionEssayPreviews(1);
    });

    watch(essayPreviewKind, () => {
      resetPreviewData("essay");
      transitionEssayPreviews(1);
    });

    watch([otherPreviewCategory, otherPreviewStatus], () => {
      resetPreviewData("other");
      loadOtherPreviews(1);
    });

    watch(poemPreviewQuery, () => {
      if (poemPreviewSearchTimer) {
        window.clearTimeout(poemPreviewSearchTimer);
      }

      poemPreviewSearchTimer = window.setTimeout(() => {
        transitionPostPreviews(1);
        poemPreviewSearchTimer = null;
      }, 180);
    });

    watch(essayPreviewQuery, () => {
      if (essayPreviewSearchTimer) {
        window.clearTimeout(essayPreviewSearchTimer);
      }

      essayPreviewSearchTimer = window.setTimeout(() => {
        transitionEssayPreviews(1);
        essayPreviewSearchTimer = null;
      }, 180);
    });

    watch(otherPreviewQuery, () => {
      if (otherPreviewSearchTimer) {
        window.clearTimeout(otherPreviewSearchTimer);
      }

      otherPreviewSearchTimer = window.setTimeout(() => {
        resetPreviewData("other");
        loadOtherPreviews(1);
        otherPreviewSearchTimer = null;
      }, 180);
    });

    const startEditingPost = (post) => {
      submissionReviewType.value = "";
      applyPostToForm(post, "poem");
      scrollToComposer();
    };

    const startEditingSubmittedPost = async (post) => {
      applyPostToForm(post, "submission");
      await openSubmissionReviewPanel("poem");
      scrollToComposer();
    };

    const startEditingEssay = (essay) => {
      submissionReviewType.value = "";
      applyEssayToForm(essay, "essay");
      scrollToComposer();
    };

    const startEditingSubmission = async (essay) => {
      applyEssayToForm(essay, "submission");
      await openSubmissionReviewPanel("essay");
      scrollToComposer();
    };

    const startEditingOtherPost = (post) => {
      applyOtherToForm(post);
      scrollToComposer();
    };

    const cancelPoemEditing = () => {
      showToast("Đã hủy chế độ chỉnh sửa haiku.");
      poemMessage.value = "";
      resetPoemForm();
      if (activeComposer.value === "submission") {
        submissionReviewType.value = "";
      }
    };

    const cancelEssayEditing = () => {
      showToast(isSubmissionComposer.value ? "Đã hủy chế độ chỉnh sửa bài gửi." : "Đã hủy chế độ chỉnh sửa bài luận.");
      essayMessage.value = "";
      resetEssayForm();
      if (activeComposer.value === "submission") {
        submissionReviewType.value = "";
      }
    };

    const cancelOtherEditing = () => {
      showToast("Đã hủy chế độ chỉnh sửa Haiku ≠.");
      otherMessage.value = "";
      resetOtherForm();
    };

    const setScopedMessage = (type, value) => {
      if (isOtherType(type)) {
        otherMessage.value = value;
      } else if (isEssayLikeType(type)) {
        essayMessage.value = value;
      } else {
        poemMessage.value = value;
      }
    };

    const handleEssayBodyImageUploaded = (fileName) => {
      essayMessage.value = "";
      showToast(`Đã chèn ảnh "${fileName}" vào nội dung.`);
    };

    const handleEssayEditorError = (message) => {
      essayMessage.value = message || "Không chèn được ảnh vào nội dung.";
    };

    const handleOtherBodyImageUploaded = (fileName) => {
      otherMessage.value = "";
      showToast(`Đã chèn ảnh "${fileName}" vào nội dung.`);
    };

    const handleOtherEditorError = (message) => {
      otherMessage.value = message || "Không chèn được media vào nội dung.";
    };

    const uploadMediaFile = async (file, scope, type) => {
      try {
        const uploaded = await uploadImageToMediaStore(file, {
          scope,
        });
        setScopedMessage(type, "");
        return uploaded;
      } catch (error) {
        const fallback =
          type === "submission"
            ? "Không tải được ảnh bài gửi lên kho media."
            : type === "essay"
              ? "Không tải được ảnh bìa lên kho media."
              : type === "other"
                ? "Không tải được ảnh Haiku ≠ lên kho media."
                : "Không tải được ảnh haiku lên kho media.";
        throw new Error(error?.message || fallback);
      }
    };

    const uploadEssayLikeBodyImage = async (file) =>
      uploadImageToMediaStore(file, {
        scope: isSubmissionComposer.value ? "submission-inline" : "essay-inline",
      });

    const uploadOtherBodyImage = async (file) =>
      uploadImageToMediaStore(file, {
        scope: "haiku-other-inline",
      });

    const handleImageUpload = async (event, type) => {
      const file = event.target?.files?.[0];
      if (!file) {
        if (isOtherType(type)) {
          otherUploadedImageName.value = "";
        } else if (isEssayLikeType(type)) {
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
        const uploaded = await uploadMediaFile(
          file,
          type === "submission"
            ? "submission-cover"
            : type === "essay"
              ? "essay-cover"
              : type === "other"
                ? "haiku-other-cover"
                : canEdit.value
                  ? "poem-cover"
                  : "submission-cover",
          type
        );
        if (isOtherType(type)) {
          otherForm.image = uploaded.url;
          otherUploadedImageName.value = file.name;
          otherMessage.value = "";
          persistDraft("other", {
            ...otherForm,
            uploadedImageName: file.name,
          });
        } else if (isEssayLikeType(type)) {
          essayForm.image = uploaded.url;
          essayUploadedImageName.value = file.name;
          essayMessage.value = "";
          persistDraft("essay", {
            ...essayForm,
            uploadedImageName: file.name,
          });
        } else {
          poemForm.image = uploaded.url;
          poemUploadedImageName.value = file.name;
          poemMessage.value = "";
          persistDraft("poem", {
            ...poemForm,
            uploadedImageName: file.name,
          });
        }
        showToast(`Đã tải ảnh "${file.name}" lên kho media.`);
      } catch (error) {
        setScopedMessage(type, error?.message || "Không tải được file ảnh. Thử lại.");
        event.target.value = "";
      }
    };

    const normalizeTagsInput = (value = "") =>
      value
        .split(/[\n,]/)
        .map((tag) => tag.trim())
        .filter(Boolean);

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
        if (editingEssaySlug.value) {
          return;
        }

        persistDraft("essay", {
          ...value,
          uploadedImageName: essayUploadedImageName.value,
        });
      },
      { deep: true }
    );

    watch(
      otherForm,
      (value) => {
        if (editingOtherSlug.value) {
          return;
        }

        persistDraft("other", {
          ...value,
          uploadedImageName: otherUploadedImageName.value,
        });
      },
      { deep: true }
    );

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
          status: canEdit.value ? poemForm.status || "published" : "submitted",
          lines,
        };

        const post = editingPostId.value
          ? await blogStore.updatePost(editingPostId.value, payload)
          : await blogStore.addPost(payload);

        await loadPostPreviews(editingPostId.value ? previewPostsPage.value : 1);
        showToast(
          !canEdit.value
            ? post.title
              ? `Đã gửi "${post.title}" để chờ duyệt.`
              : `Đã gửi haiku của ${post.author} để chờ duyệt.`
            : editingPostId.value
              ? `Đã cập nhật bài của ${post.author}.`
              : post.title
                ? `Đã đăng "${post.title}" của ${post.author}.`
                : `Đã đăng bài mới của ${post.author}.`
        );
        poemMessage.value = canEdit.value ? "" : "Haiku đã được lưu vào mục chờ duyệt.";
        resetPoemForm();
        if (canEdit.value && activeComposer.value === "submission") {
          submissionReviewType.value = "";
        }
      } catch (_err) {
        poemMessage.value = editingPostId.value
          ? "Không cập nhật được bài. Thử lại sau."
          : "Không đăng được bài. Thử lại sau.";
      }
    };

    const buildPoemPayload = (status) => ({
      title: poemForm.title,
      author: poemForm.author,
      category: poemForm.category,
      summary: poemForm.summary,
      image: poemForm.image,
      status,
      lines: poemForm.linesInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    });

    const publishPoemSubmission = async (post = null) => {
      poemMessage.value = "";

      let id = editingPostId.value;
      let payload;

      if (post && post.id !== editingPostId.value) {
        id = post.id;
        payload = {
          title: post.title || "",
          author: post.author || "",
          category: post.category || "vi",
          summary: post.summary || "",
          image: post.image || "",
          lines: Array.isArray(post.lines) ? post.lines : [],
          status: "published",
        };
      } else {
        const lines = poemForm.linesInput
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (!lines.length) {
          poemMessage.value = "Hãy nhập ít nhất một dòng haiku trước khi đăng.";
          return;
        }
        payload = {
          ...buildPoemPayload("published"),
          lines,
        };
      }

      if (!id) {
        poemMessage.value = "Hãy lưu haiku gửi trước khi đăng.";
        return;
      }

      try {
        const published = await blogStore.updatePost(id, payload);
        await loadPostPreviews(previewPostsPage.value);
        showToast(
          published.title
            ? `Đã duyệt và đăng "${published.title}".`
            : `Đã duyệt và đăng haiku của ${published.author}.`
        );
        poemMessage.value = "";
        resetPoemForm();
        submissionReviewType.value = "";
      } catch (_err) {
        poemMessage.value = "Không đăng được haiku gửi. Thử lại sau.";
      }
    };

    const submitEssay = async () => {
      essayMessage.value = "";
      const title = essayForm.title.trim();
      const body = sanitizeEssayHtml(essayForm.body);
      const bodyText = stripEssayText(body);

      if (!title) {
        essayMessage.value = "Hãy nhập tiêu đề cho bài luận.";
        return;
      }

      if (!bodyText) {
        essayMessage.value = "Hãy nhập nội dung bài luận hoặc ghi chép.";
        return;
      }

      try {
        const payload = {
          title,
          author: essayForm.author,
          kind: essayForm.kind,
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
        if (canEdit.value && activeComposer.value === "submission") {
          submissionReviewType.value = "";
        }
      } catch (_err) {
        essayMessage.value = editingEssaySlug.value
          ? "Không cập nhật được bài luận. Thử lại sau."
          : "Không đăng được bài luận. Thử lại sau.";
      }
    };

    const buildEssayPayload = (status) => ({
      title: essayForm.title.trim(),
      author: essayForm.author,
      kind: essayForm.kind,
      summary: essayForm.summary,
      image: essayForm.image,
      body: sanitizeEssayHtml(essayForm.body),
      tags: normalizeTagsInput(essayForm.tagsInput),
      status,
    });

    const validateEssayLikeForm = () => {
      const title = essayForm.title.trim();
      const body = sanitizeEssayHtml(essayForm.body);
      const bodyText = stripEssayText(body);

      if (!title) {
        essayMessage.value = isSubmissionComposer.value
          ? "Hãy nhập tiêu đề cho bài gửi."
          : "Hãy nhập tiêu đề cho bài luận.";
        return null;
      }

      if (!bodyText) {
        essayMessage.value = isSubmissionComposer.value
          ? "Hãy nhập nội dung cho bài gửi."
          : "Hãy nhập nội dung bài luận hoặc ghi chép.";
        return null;
      }

      return body;
    };

    const submitSubmission = async () => {
      essayMessage.value = "";
      const body = validateEssayLikeForm();
      if (!body) {
        return;
      }

      try {
        const payload = {
          ...buildEssayPayload("submitted"),
          body,
        };

        const essay = editingEssaySlug.value
          ? await blogStore.updateEssay(editingEssaySlug.value, payload)
          : await blogStore.addEssay(payload);

        if (canEdit.value) {
          await loadEssayPreviews(editingEssaySlug.value ? previewEssaysPage.value : 1);
        }
        showToast(
          editingEssaySlug.value
            ? `Đã cập nhật bài gửi "${essay.title}".`
            : `Đã gửi "${essay.title}" để chờ duyệt.`
        );
        essayMessage.value = canEdit.value ? "" : "Bài gửi đã được lưu vào mục chờ duyệt.";
        resetEssayForm();
        if (canEdit.value) {
          submissionReviewType.value = "";
        }
        if (!canEdit.value) {
          activeComposer.value = "submission";
        }
      } catch (_err) {
        essayMessage.value = editingEssaySlug.value
          ? "Không cập nhật được bài gửi. Thử lại sau."
          : "Không gửi được bài. Thử lại sau.";
      }
    };

    const publishSubmission = async (essay = null) => {
      essayMessage.value = "";

      let slug = editingEssaySlug.value;
      let payload;

      if (essay && essay.slug !== editingEssaySlug.value) {
        slug = essay.slug;
        payload = {
          title: essay.title?.trim() || "",
          author: essay.author || "",
          kind: essay.kind || "commentary",
          summary: essay.summary || "",
          image: essay.image || "",
          body: sanitizeEssayHtml(essay.body || ""),
          tags: Array.isArray(essay.tags) ? essay.tags.map((tag) => tag.label) : [],
          status: "published",
        };
      } else {
        const body = validateEssayLikeForm();
        if (!body) {
          return;
        }
        payload = {
          ...buildEssayPayload("published"),
          body,
        };
      }

      if (!slug) {
        essayMessage.value = "Hãy lưu bài gửi trước khi đăng.";
        return;
      }

      try {
        const published = await blogStore.updateEssay(slug, payload);
        await loadEssayPreviews(previewEssaysPage.value);
        showToast(`Đã duyệt và đăng "${published.title}".`);
        essayMessage.value = "";
        resetEssayForm();
        activeComposer.value = "submission";
        submissionReviewType.value = "";
      } catch (_err) {
        essayMessage.value = "Không đăng được bài gửi. Thử lại sau.";
      }
    };

    const buildOtherPayload = () => ({
      title: otherForm.title.trim(),
      category: otherForm.category,
      summary: otherForm.summary,
      image: otherForm.image,
      body: sanitizeHaikuOtherHtml(otherForm.body),
      status: otherForm.status,
    });

    const submitOtherPost = async () => {
      otherMessage.value = "";
      const payload = buildOtherPayload();

      if (!payload.title) {
        otherMessage.value = "Hãy nhập tiêu đề cho bài Haiku ≠.";
        return;
      }

      if (!hasHaikuOtherContent(payload.body)) {
        otherMessage.value = "Hãy nhập nội dung hoặc chèn media cho bài Haiku ≠.";
        return;
      }

      try {
        const post = editingOtherSlug.value
          ? await blogStore.updateHaikuOtherPost(editingOtherSlug.value, payload)
          : await blogStore.addHaikuOtherPost(payload);

        await loadOtherPreviews(editingOtherSlug.value ? previewOtherPage.value : 1);
        showToast(editingOtherSlug.value
          ? `Đã cập nhật "${post.title}".`
          : `Đã đăng "${post.title}" vào Haiku ≠.`);
        otherMessage.value = "";
        resetOtherForm();
      } catch (_err) {
        otherMessage.value = editingOtherSlug.value
          ? "Không cập nhật được bài Haiku ≠. Thử lại sau."
          : "Không đăng được bài Haiku ≠. Thử lại sau.";
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

    const removeOtherPost = async (post) => {
      const confirmed = window.confirm(`Xóa bài Haiku ≠ "${post.title}"?`);
      if (!confirmed) {
        return;
      }

      try {
        await blogStore.deleteHaikuOtherPost(post.slug);
        await loadOtherPreviews(previewOtherPage.value);
        if (editingOtherSlug.value === post.slug) {
          resetOtherForm();
        }
        showToast(`Đã xóa "${post.title}".`);
        otherMessage.value = "";
      } catch (_err) {
        otherMessage.value = "Không xóa được bài Haiku ≠. Thử lại sau.";
      }
    };

    const excerptEssay = (value = "") => {
      return excerptEssayContent(value, 180);
    };

    const formatPageNumber = (value) => String(Math.max(1, Number(value) || 1)).padStart(2, "0");

    const formatEssayKind = (value = "") =>
      value === "research" ? "Nghiên cứu" : "Bình luận";

    const formatPoemCategory = (value = "") => {
      if (value === "jp") return "Nhật";
      if (value === "global") return "Thế giới";
      return "Việt";
    };

    const formatPoemStatus = (value = "") =>
      value === "submitted" ? "Chờ duyệt" : "Published";

    const formatEssayStatus = (value = "") => {
      if (value === "draft") return "Draft";
      if (value === "submitted") return "Chờ duyệt";
      return "Published";
    };

    const formatOtherCategory = (value = "") => formatHaikuOtherCategory(value);

    const formatOtherStatus = (value = "") => (value === "draft" ? "Draft" : "Published");

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
      if (otherPreviewSearchTimer) {
        window.clearTimeout(otherPreviewSearchTimer);
      }
      if (toastTimer) {
        window.clearTimeout(toastTimer);
      }
      if (poemPreviewScrollRaf) {
        window.cancelAnimationFrame(poemPreviewScrollRaf);
      }
      if (essayPreviewScrollRaf) {
        window.cancelAnimationFrame(essayPreviewScrollRaf);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleResize);
      }
      killMotion(getPreviewItems("poem"));
      killMotion(getPreviewItems("essay"));
      killMotion(getPreviewItems("other"));
    });

    return {
      activeComposer,
      poemImageInput,
      essayImageInput,
      otherImageInput,
      poemPreviewSection,
      essayPreviewSection,
      otherPreviewSection,
      composerSection,
      composerModeSwitch,
      poemPreviewList,
      essayPreviewList,
      otherPreviewList,
      composerPanelHost,
      poemComposerPanel,
      essayComposerPanel,
      otherComposerPanel,
      editingPostId,
      editingEssaySlug,
      editingOtherSlug,
      poemForm,
      essayForm,
      otherForm,
      poemMessage,
      essayMessage,
      otherMessage,
      poemUploadedImageName,
      essayUploadedImageName,
      otherUploadedImageName,
      toastVisible,
      toastMessage,
      posts,
      essays,
      otherPosts,
      visiblePosts,
      visibleEssays,
      visibleOtherPosts,
      isSubmissionPoemReview,
      isSubmissionEssayReview,
      showPoemPreviews,
      showEssayPreviews,
      showOtherPreviews,
      showPoemPreviewPagination,
      showEssayPreviewPagination,
      showOtherPreviewPagination,
      poemPreviewPaginationLabel,
      essayPreviewPaginationLabel,
      otherPreviewPaginationLabel,
      poemPreviewPaginationPrevDisabled,
      poemPreviewPaginationNextDisabled,
      essayPreviewPaginationPrevDisabled,
      essayPreviewPaginationNextDisabled,
      previewPostsPage,
      previewEssaysPage,
      previewOtherPage,
      previewPostsTotal,
      previewEssaysTotal,
      previewOtherTotal,
      previewPostsTotalPages,
      previewEssaysTotalPages,
      previewOtherTotalPages,
      previewOtherLoading,
      poemAuthorSuggestions,
      essayAuthorSuggestions,
      showPoemAuthorSuggestions,
      showEssayAuthorSuggestions,
      poemPreviewQuery,
      essayPreviewQuery,
      otherPreviewQuery,
      essayPreviewKind,
      otherPreviewCategory,
      otherPreviewStatus,
      poemPreviewCategory,
      essayPreviewStatus,
      essayPreviewKindOptions,
      essayPreviewStatusOptions,
      essayKindOptions,
      haikuOtherCategoryOptions,
      otherPreviewCategoryOptions,
      otherPreviewStatusOptions,
      composerIntroText,
      canEdit,
      categoryOptions,
      loading,
      error,
      chooseComposer,
      changePostPreviewPage,
      changeEssayPreviewPage,
      changeOtherPreviewPage,
      handlePostPreviewPrev,
      handlePostPreviewNext,
      handleEssayPreviewPrev,
      handleEssayPreviewNext,
      onPoemPreviewScroll,
      onEssayPreviewScroll,
      openImagePicker,
      clearImage,
      handleImageUpload,
      submitPoem,
      publishPoemSubmission,
      submitEssay,
      submitSubmission,
      publishSubmission,
      submitOtherPost,
      startEditingPost,
      startEditingSubmittedPost,
      startEditingEssay,
      startEditingSubmission,
      startEditingOtherPost,
      cancelPoemEditing,
      cancelEssayEditing,
      cancelOtherEditing,
      removePost,
      removeEssay,
      removeOtherPost,
      formatDate,
      formatPageNumber,
      formatPoemCategory,
      formatPoemStatus,
      formatEssayKind,
      formatEssayStatus,
      formatOtherCategory,
      formatOtherStatus,
      excerptEssay,
      handleEssayBodyImageUploaded,
      handleEssayEditorError,
      uploadEssayLikeBodyImage,
      handleOtherBodyImageUploaded,
      handleOtherEditorError,
      uploadOtherBodyImage,
      isSubmissionComposer,
      showPoemComposer,
      showEssayComposer,
      showOtherComposer,
      poemSubmitLabel,
      showPublishPoemSubmissionButton,
      poemPreviewHeading,
      poemPreviewEmptyMessage,
      showPoemStatusMeta,
      essayPreviewHeading,
      essayPreviewEmptyMessage,
      essayLikeSubmitLabel,
      essayLikeCancelVisible,
      showPublishSubmissionButton,
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
  scroll-margin-top: 6.5rem;
}

.write-page__intro {
  position: static;
}

.write-page__editor,
.write-page__previews {
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
}

.write-page__composer-panel-host {
  min-width: 0;
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
  scroll-margin-top: 6.5rem;
}

.write-page__mode-switch--quad {
  grid-template-columns: repeat(4, max-content);
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

[data-theme="light"] .write-page__mode-tab--active {
  color: rgb(var(--color-text-rgb) / 0.88);
}

.write-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  align-items: start;
  padding: 1.5rem;
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  background: var(--surface-panel-bg);
  backdrop-filter: blur(10px);
}

.form-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.write-form__essay-head {
  display: grid;
  grid-template-columns:
    minmax(0, 1.45fr)
    minmax(0, 1.15fr)
    minmax(0, 0.9fr)
    minmax(0, 0.9fr);
  gap: 1.25rem;
  grid-column: 1 / -1;
  min-width: 0;
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
  border: 1px solid var(--border-soft);
  background: var(--color-bg, #2f2c2b);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.22),
    0 0 0 1px var(--surface-subtle-bg);
}

.form-field__autocomplete-option {
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
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
  background: var(--surface-input-focus-bg);
  color: var(--color-text);
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
  border: 1px solid var(--border-regular);
  color: var(--color-muted);
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
  border: 1px solid var(--border-soft);
  background: var(--color-bg);
  color: var(--color-muted);
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
  background: var(--surface-input-bg);
  border: 1px solid var(--surface-input-border);
  color: var(--color-text);
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
  border: 1px solid var(--border-soft);
  background: var(--surface-subtle-bg);
}

.upload-field--filled {
  border-color: var(--focus-border);
  background: var(--surface-soft-bg);
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
  color: var(--color-text);
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
  border: 1px solid var(--border-regular);
  background: var(--surface-input-bg);
  color: var(--color-text);
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
  border: 1px solid var(--border-soft);
  background: var(--surface-subtle-bg);
  color: var(--color-muted);
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
  background: var(--surface-strong-bg);
}

.input:focus,
.write-form textarea:focus {
  outline: 1px solid var(--focus-outline);
  border-color: var(--focus-border);
  background: var(--surface-input-focus-bg);
  box-shadow:
    0 0 0 3px var(--focus-ring),
    0 10px 24px rgba(0, 0, 0, 0.12);
}

.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.58rem 0.88rem;
  border: 1px solid rgb(var(--color-text-rgb) / 0.14);
  background: rgb(var(--color-text-rgb) / 0.045);
  color: var(--color-text);
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.1;
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.write-form__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  justify-content: flex-end;
}

.write-form__actions .submit-btn {
  min-width: 8.8rem;
}

.submit-btn--ghost {
  background: transparent;
}

.submit-btn:hover {
  border-color: rgb(var(--color-text-rgb) / 0.22);
  background: rgb(var(--color-text-rgb) / 0.075);
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
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.2);
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.write-page__preview-search-icon {
  color: rgb(var(--color-text-rgb) / 0.58);
  font-size: 0.95rem;
  line-height: 1;
  flex: 0 0 auto;
}

.write-page__preview-search-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.2;
  padding: 0;
  outline: none;
}

.write-page__preview-search-input::placeholder {
  color: rgb(var(--color-text-rgb) / 0.42);
}

.write-page__preview-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgb(var(--color-text-rgb) / 0.2);
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.write-page__preview-filter-label {
  color: rgb(var(--color-text-rgb) / 0.48);
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

[data-theme="light"] .write-page__preview-search,
[data-theme="light"] .write-page__preview-filter {
  padding: 0.48rem 0.7rem;
  padding-bottom: 0.48rem;
  border: 1px solid rgb(var(--color-text-rgb) / 0.14);
  border-radius: 999px;
  background: rgb(var(--color-text-rgb) / 0.035);
}

[data-theme="light"] .write-page__preview-search:hover,
[data-theme="light"] .write-page__preview-search:focus-within,
[data-theme="light"] .write-page__preview-filter:hover,
[data-theme="light"] .write-page__preview-filter:focus-within {
  border-color: rgb(var(--color-text-rgb) / 0.22);
  background: rgb(var(--color-text-rgb) / 0.055);
}

[data-theme="light"] .write-page__preview-filter-select :deep(.elegant-select__trigger) {
  color: var(--color-text);
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

.write-page__preview-carousel-shell {
  position: relative;
  min-width: 0;
}

.write-page__preview-empty {
  margin: 0;
  padding: 0.4rem 0 0.2rem;
  color: rgba(177, 165, 159, 0.7);
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

[data-theme="light"] .write-page__preview {
  border-color: rgb(18 18 18 / 0.14);
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
.write-page__essay-meta-line {
  margin: 0;
  color: var(--color-description);
  font-size: 0.98rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.write-page__essay-meta-line {
  opacity: 0.86;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.74rem;
}

.write-page__essay-tags {
  opacity: 0.76;
}

.write-page__preview-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
}

.write-page__preview-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
  text-align: left;
}

.write-page__preview-author,
.write-page__preview-link {
  color: var(--color-description);
  text-decoration: none;
  font-size: 0.95rem;
  line-height: 1.4;
  white-space: nowrap;
}

.write-page__preview-poster {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.82rem;
  line-height: 1.35;
  white-space: nowrap;
}

.write-page__preview-link:hover,
.write-page__preview-author:hover {
  color: var(--color-title);
}

.write-page__preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
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
  border-color: rgba(221, 82, 90, 0.34);
  color: rgba(221, 82, 90, 0.78);
}

@media (max-width: 1180px) {
  .write-form__essay-head {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .write-page__preview-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .write-page__preview-meta,
  .write-page__preview-actions {
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
  }
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

[data-theme="light"] .write-page__pagination-label {
  color: rgb(18 18 18 / 0.42);
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

[data-theme="light"] .write-page__pagination-btn {
  color: rgb(18 18 18 / 0.42);
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
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    width: 100%;
    gap: 1rem;
  }

  .write-page__mode-switch--quad {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .write-page__mode-tab {
    min-width: 0;
  }

  .write-page__mode-tab-label {
    white-space: nowrap;
  }

  .write-page__preview-list {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 0;
    gap: 0.9rem;
    padding-bottom: 0.35rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .write-page__preview-list::-webkit-scrollbar {
    display: none;
  }

  .write-page__preview-list--poems,
  .write-page__preview-list--essays {
    grid-template-columns: none;
  }

  .write-page__preview {
    flex: 0 0 100%;
    width: 100%;
    min-width: 100%;
    min-height: 0;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  .write-form__essay-head {
    grid-template-columns: 1fr;
    grid-column: 1 / -1;
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
