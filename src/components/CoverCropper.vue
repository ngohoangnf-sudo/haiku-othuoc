<template>
  <div class="cover-cropper">
    <div
      ref="frame"
      class="cover-cropper__frame"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <img
        v-if="objectUrl"
        ref="image"
        class="cover-cropper__image"
        :src="objectUrl"
        :style="imageStyle"
        alt=""
        draggable="false"
        @load="onImageLoad"
      />
      <div class="cover-cropper__guides" aria-hidden="true"></div>
    </div>

    <div class="cover-cropper__controls">
      <label class="cover-cropper__zoom">
        <span class="cover-cropper__zoom-label">Phóng</span>
        <input
          type="range"
          min="1"
          :max="MAX_ZOOM"
          step="0.01"
          :value="zoom"
          aria-label="Phóng to ảnh bìa"
          @input="setZoom(Number($event.target.value))"
        />
      </label>
      <button type="button" class="cover-cropper__reset" @click="reset">Đặt lại</button>
    </div>

    <p class="cover-cropper__hint">Kéo ảnh để chọn phần hiện trên bìa.</p>
  </div>
</template>

<script>
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";

// Cards show covers in a 3:4 box, so that's the shape we let people frame.
const ASPECT_W = 3;
const ASPECT_H = 4;
const MAX_ZOOM = 4;
// Widest cover we ever write out; the source is never upscaled past its own
// resolution, so small images stay small.
const TARGET_WIDTH = 900;
const JPEG_QUALITY = 0.86;

export default defineComponent({
  name: "CoverCropper",
  props: {
    file: {
      type: File,
      required: true,
    },
  },
  setup(props, { expose }) {
    const frame = ref(null);
    const image = ref(null);
    const objectUrl = ref("");
    const zoom = ref(1);

    let naturalWidth = 0;
    let naturalHeight = 0;
    let frameWidth = 0;
    let frameHeight = 0;
    let offsetX = 0;
    let offsetY = 0;
    let dragPointer = null;
    let dragLastX = 0;
    let dragLastY = 0;
    let resizeObserver = null;

    // Re-rendered position; a counter keeps the computed style reactive while
    // the offsets themselves stay plain numbers we can clamp cheaply on drag.
    const version = ref(0);

    function baseScale() {
      if (!naturalWidth || !naturalHeight || !frameWidth || !frameHeight) return 1;
      return Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
    }

    function currentScale() {
      return baseScale() * zoom.value;
    }

    function clampOffsets() {
      const scale = currentScale();
      const displayWidth = naturalWidth * scale;
      const displayHeight = naturalHeight * scale;
      offsetX = Math.min(0, Math.max(frameWidth - displayWidth, offsetX));
      offsetY = Math.min(0, Math.max(frameHeight - displayHeight, offsetY));
      version.value += 1;
    }

    function centerImage() {
      const scale = currentScale();
      offsetX = (frameWidth - naturalWidth * scale) / 2;
      offsetY = (frameHeight - naturalHeight * scale) / 2;
      clampOffsets();
    }

    const imageStyle = computed(() => {
      version.value;
      const scale = currentScale();
      return {
        width: `${naturalWidth * scale}px`,
        height: `${naturalHeight * scale}px`,
        transform: `translate(${offsetX}px, ${offsetY}px)`,
      };
    });

    function measureFrame() {
      const element = frame.value;
      if (!element) return;
      frameWidth = element.clientWidth;
      frameHeight = element.clientHeight;
    }

    function onImageLoad(event) {
      naturalWidth = event.target.naturalWidth || 0;
      naturalHeight = event.target.naturalHeight || 0;
      measureFrame();
      zoom.value = 1;
      centerImage();
    }

    // Zooming keeps whatever is in the middle of the frame in the middle.
    function setZoom(next) {
      const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
      const previousScale = currentScale();
      if (!previousScale) {
        zoom.value = clamped;
        return;
      }

      const centerImageX = (frameWidth / 2 - offsetX) / previousScale;
      const centerImageY = (frameHeight / 2 - offsetY) / previousScale;

      zoom.value = clamped;
      const scale = currentScale();
      offsetX = frameWidth / 2 - centerImageX * scale;
      offsetY = frameHeight / 2 - centerImageY * scale;
      clampOffsets();
    }

    function onPointerDown(event) {
      if (!naturalWidth) return;
      dragPointer = event.pointerId;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
      if (dragPointer !== event.pointerId) return;
      offsetX += event.clientX - dragLastX;
      offsetY += event.clientY - dragLastY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      clampOffsets();
    }

    function endDrag(event) {
      if (dragPointer !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragPointer = null;
    }

    function reset() {
      zoom.value = 1;
      centerImage();
    }

    function loadFile(file) {
      if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
      objectUrl.value = file ? URL.createObjectURL(file) : "";
      naturalWidth = 0;
      naturalHeight = 0;
    }

    // Draws the framed region at its own resolution, so the upload carries the
    // crop rather than relying on how the card happens to lay the image out.
    async function getCroppedFile() {
      const element = image.value;
      if (!element || !naturalWidth || !frameWidth) return null;

      const scale = currentScale();
      const sourceWidth = Math.min(naturalWidth, frameWidth / scale);
      const sourceHeight = Math.min(naturalHeight, frameHeight / scale);
      const sourceX = Math.min(Math.max(0, -offsetX / scale), naturalWidth - sourceWidth);
      const sourceY = Math.min(Math.max(0, -offsetY / scale), naturalHeight - sourceHeight);

      const outputWidth = Math.max(1, Math.round(Math.min(TARGET_WIDTH, sourceWidth)));
      const outputHeight = Math.max(1, Math.round((outputWidth * ASPECT_H) / ASPECT_W));

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) return null;

      // Flatten onto white; covers are written as JPEG, which has no alpha.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(
        element,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight
      );

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (!blob) return null;

      const name = `${props.file.name.replace(/\.[^.]+$/, "") || "cover"}.jpg`;
      return new File([blob], name, { type: "image/jpeg" });
    }

    watch(
      () => props.file,
      (file) => loadFile(file)
    );

    onMounted(() => {
      loadFile(props.file);
      if (typeof ResizeObserver !== "undefined" && frame.value) {
        resizeObserver = new ResizeObserver(() => {
          const previousWidth = frameWidth;
          measureFrame();
          if (!previousWidth || !naturalWidth) return;
          // Keep the same part of the image framed when the dialog resizes.
          const ratio = frameWidth / previousWidth;
          offsetX *= ratio;
          offsetY *= ratio;
          clampOffsets();
        });
        resizeObserver.observe(frame.value);
      }
    });

    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
    });

    expose({ getCroppedFile });

    return {
      MAX_ZOOM,
      frame,
      image,
      objectUrl,
      zoom,
      imageStyle,
      onImageLoad,
      onPointerDown,
      onPointerMove,
      endDrag,
      setZoom,
      reset,
    };
  },
});
</script>

<style scoped>
.cover-cropper {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
}

.cover-cropper__frame {
  position: relative;
  width: 11rem;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: rgb(var(--color-text-rgb) / 0.06);
  border: 1px solid var(--border-regular);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.cover-cropper__frame:active {
  cursor: grabbing;
}

.cover-cropper__image {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  transform-origin: 0 0;
  pointer-events: none;
}

/* Rule-of-thirds guides, so the framing has something to line up against. */
.cover-cropper__guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.28) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.28) 1px, transparent 1px);
  background-size: 33.333% 100%, 100% 33.333%;
  mix-blend-mode: overlay;
}

.cover-cropper__controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 11rem;
}

.cover-cropper__zoom {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1;
  min-width: 0;
}

.cover-cropper__zoom-label {
  color: var(--color-muted-faint);
  font-size: 0.78rem;
  white-space: nowrap;
}

.cover-cropper__zoom input {
  flex: 1;
  min-width: 0;
  accent-color: var(--color-text);
}

.cover-cropper__reset {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.78rem;
  color: var(--color-muted);
  cursor: pointer;
  white-space: nowrap;
}

.cover-cropper__reset:hover {
  color: var(--color-text);
}

.cover-cropper__hint {
  margin: 0;
  color: var(--color-muted-faint);
  font-size: 0.78rem;
}
</style>
