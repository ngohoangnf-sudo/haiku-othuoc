<template>
  <div ref="root" class="elegant-select" :class="{ 'elegant-select--open': open }">
    <button
      type="button"
      class="elegant-select__trigger"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-haspopup="'listbox'"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown.down.prevent="openMenu"
      @keydown.up.prevent="openMenu"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
      @keydown.esc.prevent="close"
    >
      <span class="elegant-select__value">{{ selectedLabel }}</span>
      <span class="elegant-select__caret" aria-hidden="true"></span>
    </button>

    <transition name="elegant-select__menu">
      <div v-if="open" class="elegant-select__menu-wrap">
        <ul class="elegant-select__menu" role="listbox" :aria-label="ariaLabel">
          <li v-for="option in normalizedOptions" :key="option.value">
            <button
              type="button"
              class="elegant-select__option"
              :class="{ 'elegant-select__option--active': option.value === normalizedValue }"
              @click="selectOption(option.value)"
            >
              {{ option.label }}
            </button>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<script>
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue";

export default defineComponent({
  name: "ElegantSelect",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    options: {
      type: Array,
      default: () => [],
    },
    ariaLabel: {
      type: String,
      default: "Chọn một giá trị",
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const root = ref(null);
    const open = ref(false);

    const normalizedOptions = computed(() =>
      props.options.map((option) =>
        typeof option === "string"
          ? { value: option, label: option }
          : { value: String(option.value ?? ""), label: option.label ?? String(option.value ?? "") }
      )
    );

    const normalizedValue = computed(() => String(props.modelValue ?? ""));
    const selectedLabel = computed(
      () =>
        normalizedOptions.value.find((option) => option.value === normalizedValue.value)?.label ||
        normalizedOptions.value[0]?.label ||
        ""
    );

    const close = () => {
      open.value = false;
    };

    const openMenu = () => {
      open.value = true;
    };

    const toggle = () => {
      open.value = !open.value;
    };

    const selectOption = (value) => {
      emit("update:modelValue", value);
      close();
    };

    const handleDocumentPointerDown = (event) => {
      if (!root.value?.contains(event.target)) {
        close();
      }
    };

    onMounted(() => {
      document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    });

    onBeforeUnmount(() => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    });

    return {
      root,
      open,
      normalizedOptions,
      normalizedValue,
      selectedLabel,
      close,
      openMenu,
      toggle,
      selectOption,
    };
  },
});
</script>

<style scoped>
.elegant-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.elegant-select__trigger {
  width: 100%;
  min-height: 3.45rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--surface-input-border);
  border-radius: 8px;
  background: var(--surface-input-bg);
  color: var(--color-text);
  padding: 0.75rem 1rem;
  text-align: left;
  font: inherit;
  font-size: 1rem;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease;
}

.elegant-select__trigger:focus-visible,
.elegant-select--open .elegant-select__trigger {
  outline: none;
  border-color: var(--focus-border);
  background: var(--surface-input-focus-bg);
  box-shadow:
    0 0 0 3px var(--focus-ring),
    0 10px 24px rgba(0, 0, 0, 0.12);
}

.elegant-select__value {
  min-width: 0;
}

.elegant-select__caret {
  flex: 0 0 auto;
  width: 0.52rem;
  height: 0.52rem;
  border-right: 1px solid var(--color-muted-soft);
  border-bottom: 1px solid var(--color-muted-soft);
  transform: rotate(45deg) translateY(-0.08rem);
  transition: transform 180ms ease;
}

.elegant-select--open .elegant-select__caret {
  transform: rotate(-135deg) translateY(-0.02rem);
}

.elegant-select__menu-wrap {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 12;
}

.elegant-select__menu {
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  border-radius: 14px;
  border: 1px solid var(--border-soft);
  background: var(--color-bg, #2f2c2b);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.22),
    0 0 0 1px var(--surface-subtle-bg);
}

.elegant-select__option {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  border-radius: 10px;
  padding: 0.72rem 0.8rem;
  text-align: left;
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.elegant-select__option:hover,
.elegant-select__option--active {
  background: var(--surface-input-focus-bg);
  color: var(--color-text);
}

.elegant-select__menu-enter-active,
.elegant-select__menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.elegant-select__menu-enter-from,
.elegant-select__menu-leave-to {
  opacity: 0;
  transform: translate3d(0, 0.35rem, 0);
}
</style>
