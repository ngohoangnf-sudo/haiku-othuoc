<template>
  <div class="rich-editor" :class="{ 'rich-editor--disabled': disabled }">
    <div class="rich-editor__toolbar">
      <button
        v-for="action in toolbarActions"
        :key="action.key"
        class="rich-editor__tool"
        :class="{ 'rich-editor__tool--active': action.active?.() }"
        type="button"
        :disabled="disabled || uploadingImage"
        @click="action.run"
      >
        {{ action.label }}
      </button>
      <button
        class="rich-editor__tool"
        type="button"
        :disabled="disabled || uploadingImage"
        @click="openImagePicker"
      >
        Ảnh
      </button>
    </div>

    <EditorContent :editor="editor" class="rich-editor__content" />

    <input
      ref="imageInput"
      class="rich-editor__image-input"
      type="file"
      accept="image/*"
      @change="handleImageSelected"
    />
  </div>
</template>

<script>
import { computed, defineComponent, onBeforeUnmount, ref, watch } from "vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { normalizeEssayBodyHtml } from "src/utils/essayContent";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export default defineComponent({
  name: "RichEssayEditor",
  components: {
    EditorContent,
  },
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    placeholder: {
      type: String,
      default: "",
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    uploadImage: {
      type: Function,
      default: null,
    },
  },
  emits: ["update:modelValue", "image-uploaded", "error"],
  setup(props, { emit }) {
    const imageInput = ref(null);
    const uploadingImage = ref(false);
    let storedMarksCleanupTimer = null;

    const clearStoredMarksIfSelectionPlain = (view) => {
      const { state } = view;
      const { selection, schema } = state;

      if (!selection.empty) {
        return false;
      }

      const activeMarks = selection.$from.marks();
      const hasFormattingMark = activeMarks.some(
        (mark) =>
          mark.type === schema.marks.bold ||
          mark.type === schema.marks.italic
      );

      if (hasFormattingMark || !state.storedMarks?.length) {
        return false;
      }

      view.dispatch(state.tr.setStoredMarks(null));
      return false;
    };

    const scheduleStoredMarksCleanup = (view) => {
      if (!view || view.isDestroyed) {
        return false;
      }

      if (storedMarksCleanupTimer) {
        window.clearTimeout(storedMarksCleanupTimer);
      }

      storedMarksCleanupTimer = window.setTimeout(() => {
        storedMarksCleanupTimer = null;
        if (!view.isDestroyed) {
          clearStoredMarksIfSelectionPlain(view);
        }
      }, 0);

      return false;
    };

    const focusEditorWithoutPageScroll = (view, event) => {
      if (typeof window === "undefined" || !(event instanceof MouseEvent)) {
        return false;
      }

      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) {
        return false;
      }

      event.preventDefault();

      try {
        view.dom?.focus?.({ preventScroll: true });
      } catch (_error) {
        view.focus();
      }

      const coords = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      if (coords?.pos != null) {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, coords.pos))
        );
      }

      scheduleStoredMarksCleanup(view);
      return true;
    };

    const isMarkVisiblyActive = (instance, markName) => {
      const view = instance?.view;
      const markType = instance?.state?.schema?.marks?.[markName];
      if (!view || !markType) {
        return false;
      }

      const { state } = view;
      const { selection } = state;

      if (selection.empty) {
        return selection.$from.marks().some((mark) => mark.type === markType);
      }

      let hasText = false;
      let allTextMarked = true;
      state.doc.nodesBetween(selection.from, selection.to, (node) => {
        if (!node.isText || !node.text?.trim()) {
          return;
        }

        hasText = true;

        if (!node.marks.some((mark) => mark.type === markType)) {
          allTextMarked = false;
        }
      });

      return hasText && allTextMarked;
    };

    const scrollSelectionWithinEditor = (view) => {
      if (typeof window === "undefined") {
        return false;
      }

      const scrollHost = view.dom?.closest?.(".rich-editor__content");
      if (!(scrollHost instanceof HTMLElement)) {
        return false;
      }

      const selection = view.state.selection;
      const start = view.coordsAtPos(selection.from);
      const end = view.coordsAtPos(selection.to);
      const selectionTop = Math.min(start.top, end.top);
      const selectionBottom = Math.max(start.bottom, end.bottom);
      const hostRect = scrollHost.getBoundingClientRect();
      const margin = 18;

      if (selectionTop < hostRect.top + margin) {
        scrollHost.scrollTop -= hostRect.top + margin - selectionTop;
      } else if (selectionBottom > hostRect.bottom - margin) {
        scrollHost.scrollTop += selectionBottom - (hostRect.bottom - margin);
      }

      return true;
    };

    const editor = useEditor({
      content: normalizeEssayBodyHtml(props.modelValue),
      editable: !props.disabled,
      editorProps: {
        handleScrollToSelection: (view) => scrollSelectionWithinEditor(view),
        handleDOMEvents: {
          focus: (view) => {
            return scheduleStoredMarksCleanup(view);
          },
          mousedown: (view, event) => {
            if (!view.hasFocus()) {
              return focusEditorWithoutPageScroll(view, event);
            }

            return scheduleStoredMarksCleanup(view);
          },
          mouseup: (view) => {
            return scheduleStoredMarksCleanup(view);
          },
        },
      },
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [2, 3],
          },
        }),
        Image.configure({
          inline: false,
          allowBase64: true,
          HTMLAttributes: {
            class: "essay-inline-image",
          },
        }),
        Placeholder.configure({
          placeholder: props.placeholder,
        }),
      ],
      onUpdate: ({ editor: editorInstance }) => {
        emit("update:modelValue", editorInstance.getHTML());
      },
      onSelectionUpdate: ({ editor: editorInstance }) => {
        scheduleStoredMarksCleanup(editorInstance.view);
      },
    });

    watch(
      () => props.modelValue,
      (value) => {
        if (!editor.value) {
          return;
        }

        const normalized = normalizeEssayBodyHtml(value);
        if (normalized === editor.value.getHTML()) {
          return;
        }

        editor.value.commands.setContent(normalized, false);
      }
    );

    watch(
      () => props.disabled,
      (value) => {
        editor.value?.setEditable(!value);
      },
      { immediate: true }
    );

    const toolbarActions = computed(() => {
      const instance = editor.value;
      if (!instance) {
        return [];
      }

      return [
        {
          key: "bold",
          label: "B",
          active: () => isMarkVisiblyActive(instance, "bold"),
          run: () => instance.chain().focus().toggleBold().run(),
        },
        {
          key: "italic",
          label: "I",
          active: () => isMarkVisiblyActive(instance, "italic"),
          run: () => instance.chain().focus().toggleItalic().run(),
        },
        {
          key: "h2",
          label: "H2",
          active: () => instance.isActive("heading", { level: 2 }),
          run: () => instance.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          key: "h3",
          label: "H3",
          active: () => instance.isActive("heading", { level: 3 }),
          run: () => instance.chain().focus().toggleHeading({ level: 3 }).run(),
        },
        {
          key: "bullet",
          label: "•",
          active: () => instance.isActive("bulletList"),
          run: () => instance.chain().focus().toggleBulletList().run(),
        },
        {
          key: "quote",
          label: "❝",
          active: () => instance.isActive("blockquote"),
          run: () => instance.chain().focus().toggleBlockquote().run(),
        },
        {
          key: "rule",
          label: "—",
          active: () => false,
          run: () => instance.chain().focus().setHorizontalRule().run(),
        },
      ];
    });

    const openImagePicker = () => {
      if (!editor.value || props.disabled || uploadingImage.value) {
        return;
      }
      imageInput.value?.click();
    };

    const handleImageSelected = async (event) => {
      const file = event.target?.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        emit("error", "Vui lòng chọn một file ảnh hợp lệ.");
        event.target.value = "";
        return;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        emit("error", "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 5MB.");
        event.target.value = "";
        return;
      }

      try {
        uploadingImage.value = true;
        if (!editor.value) {
          emit("error", "Trình soạn thảo chưa sẵn sàng.");
          return;
        }

        if (typeof props.uploadImage !== "function") {
          emit("error", "Chưa cấu hình upload ảnh cho trình soạn thảo.");
          return;
        }

        const uploadResult = await props.uploadImage(file);
        const src =
          typeof uploadResult === "string" ? uploadResult : String(uploadResult?.url || "").trim();

        if (!src) {
          emit("error", "Không lấy được URL ảnh sau khi upload.");
          return;
        }

        const inserted = editor.value
          .chain()
          .focus()
          .insertContent([
            {
              type: "image",
              attrs: {
                src,
                alt: file.name,
              },
            },
            {
              type: "paragraph",
            },
          ])
          .run();

        if (!inserted) {
          emit("error", "Không chèn được ảnh vào nội dung.");
          return;
        }

        emit("image-uploaded", file.name);
      } catch (error) {
        emit("error", error?.message || "Không tải được ảnh lên. Thử lại.");
      } finally {
        uploadingImage.value = false;
        event.target.value = "";
      }
    };

    onBeforeUnmount(() => {
      if (storedMarksCleanupTimer) {
        window.clearTimeout(storedMarksCleanupTimer);
      }
      editor.value?.destroy();
    });

    return {
      editor,
      imageInput,
      uploadingImage,
      toolbarActions,
      openImagePicker,
      handleImageSelected,
    };
  },
});
</script>

<style scoped>
.rich-editor {
  display: grid;
  gap: 0.85rem;
  min-width: 0;
}

.rich-editor--disabled {
  opacity: 0.72;
}

.rich-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.rich-editor__tool {
  min-width: 2.35rem;
  padding: 0.42rem 0.68rem;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: var(--surface-subtle-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 0.84rem;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.rich-editor__tool:hover,
.rich-editor__tool--active {
  border-color: var(--focus-border);
  background: var(--surface-soft-bg);
}

.rich-editor__tool:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.rich-editor__content {
  min-height: 20rem;
  max-height: min(62vh, 36rem);
  border: 1px solid var(--surface-input-border);
  border-radius: 18px;
  background: var(--surface-input-bg);
  color: var(--color-text);
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  cursor: text;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.rich-editor__content :deep(.tiptap) {
  min-height: 20rem;
  padding: 1.1rem 1.15rem;
  outline: none;
  font-size: 1rem;
  line-height: 1.7;
  cursor: text;
}

.rich-editor__content::-webkit-scrollbar {
  width: 8px;
}

.rich-editor__content::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 999px;
}

.rich-editor__content::-webkit-scrollbar-track {
  background: transparent;
}

.rich-editor__content :deep(.tiptap p) {
  margin: 0;
}

.rich-editor__content :deep(.tiptap p + p),
.rich-editor__content :deep(.tiptap h2 + p),
.rich-editor__content :deep(.tiptap h3 + p),
.rich-editor__content :deep(.tiptap p + h2),
.rich-editor__content :deep(.tiptap p + h3),
.rich-editor__content :deep(.tiptap ul + p),
.rich-editor__content :deep(.tiptap blockquote + p),
.rich-editor__content :deep(.tiptap img + p) {
  margin-top: 1rem;
}

.rich-editor__content :deep(.tiptap h2),
.rich-editor__content :deep(.tiptap h3) {
  margin: 0;
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  color: var(--color-title);
  line-height: 1.1;
}

.rich-editor__content :deep(.tiptap h2) {
  font-size: 1.65rem;
}

.rich-editor__content :deep(.tiptap h3) {
  font-size: 1.3rem;
}

.rich-editor__content :deep(.tiptap ul) {
  margin: 0;
  padding-left: 1.25rem;
}

.rich-editor__content :deep(.tiptap blockquote) {
  margin: 0;
  padding-left: 1rem;
  border-left: 1px solid var(--border-regular);
  color: var(--color-description);
}

.rich-editor__content :deep(.tiptap hr) {
  border: 0;
  border-top: 1px solid var(--border-soft);
  margin: 1.2rem 0;
}

.rich-editor__content :deep(.tiptap img) {
  display: block;
  width: min(100%, 34rem);
  height: auto;
  max-width: 100%;
  border-radius: 14px;
  margin: 1.2rem 0;
  object-fit: contain;
}

.rich-editor__content :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--color-muted-ghost);
  float: left;
  height: 0;
  pointer-events: none;
}

.rich-editor__image-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

[data-theme="light"] .rich-editor__content {
  background: rgb(var(--color-text-rgb) / 0.03);
}
</style>
