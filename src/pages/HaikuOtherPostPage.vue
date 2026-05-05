<template>
  <article class="haiku-other-page">
    <div v-if="loading && !post" class="haiku-other-page__state">
      <p class="page-reading-copy">Đang tải Haiku ≠...</p>
    </div>

    <div v-else-if="post" class="haiku-other-page__content">
      <header class="haiku-other-page__hero">
        <p class="haiku-other-page__eyebrow page-reading-copy">{{ formatCategory(post.category) }}</p>
        <h1 class="haiku-other-page__title page-reading-h2 page-heading-with-rule">{{ post.title }}</h1>
        <p v-if="post.summary" class="haiku-other-page__summary page-reading-copy">{{ post.summary }}</p>
        <p class="haiku-other-page__meta page-reading-copy">
          <span v-if="post.publishedAt">{{ formatDate(post.publishedAt) }}</span>
          <span v-if="post.publishedAt && isAdmin && hasViewCount" aria-hidden="true"> · </span>
          <span v-if="isAdmin && hasViewCount">{{ formatViewCount(post.viewCount) }}</span>
        </p>
      </header>

      <section
        ref="bodySection"
        class="haiku-other-page__body page-reading-copy"
        @click="handleBodyClick"
        v-html="bodyHtml"
      ></section>
    </div>

    <div v-else class="haiku-other-page__state">
      <p class="page-reading-copy">Bài Haiku ≠ không tồn tại hoặc chưa được xuất bản.</p>
      <router-link to="/haiku-khac" class="haiku-other-page__back page-reading-copy">Quay lại Haiku ≠</router-link>
    </div>
  </article>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import * as THREE from "three";
import blogStore from "src/stores/blogStore";
import authStore from "src/stores/authStore";
import { API_BASE } from "src/utils/runtime";
import { sanitizeHaikuOtherHtml } from "src/utils/essayContent";
import { formatHaikuOtherCategory } from "src/utils/haikuOther";

function escapeHtmlAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractYouTubeId(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.replace(/^www\./, "");
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      return pathParts[0] || "";
    }

    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
      if (pathParts[0] === "embed" || pathParts[0] === "shorts" || pathParts[0] === "live") {
        return pathParts[1] || "";
      }
      return url.searchParams.get("v") || "";
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function normalizeYouTubeId(value = "") {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : "";
}

function buildYouTubeEmbedSrc(videoId = "", autoplay = false) {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (autoplay) {
    params.set("autoplay", "1");
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

function buildYouTubeCoverHtml({ videoId, title }) {
  const safeId = escapeHtmlAttribute(videoId);
  const safeTitle = escapeHtmlAttribute(title || "YouTube video");
  const thumbnail = `${API_BASE}/youtube-thumbnail/${encodeURIComponent(videoId)}`;

  return `
    <button class="essay-youtube-cover" type="button" data-youtube-play="${safeId}" data-youtube-title="${safeTitle}" data-youtube-thumbnail="${thumbnail}" aria-label="Phát video: ${safeTitle}">
      <img class="essay-youtube-cover__image" src="${thumbnail}" alt="" loading="lazy" />
      <span class="essay-youtube-cover__veil" aria-hidden="true"></span>
      <span class="essay-youtube-cover__mark" aria-hidden="true">
        <svg class="essay-youtube-cover__triangle" viewBox="0 0 44 44" focusable="false">
          <path d="M15 9 L33 22 L15 35 Z" />
        </svg>
      </span>
      <span class="essay-youtube-cover__caption">Play</span>
    </button>
  `;
}

function enhanceYouTubeEmbeds(html = "") {
  if (typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("iframe").forEach((iframe) => {
    const videoId = normalizeYouTubeId(extractYouTubeId(iframe.getAttribute("src") || ""));
    if (!videoId) {
      return;
    }

    const title = iframe.getAttribute("title") || "YouTube video";
    const existingFrame = iframe.closest(".essay-embed-frame");
    const frame = existingFrame || document.createElement("figure");

    frame.classList.add("essay-embed-frame", "essay-embed-frame--youtube");
    frame.setAttribute("data-youtube-frame", videoId);
    frame.innerHTML = buildYouTubeCoverHtml({ videoId, title });

    if (!existingFrame) {
      iframe.replaceWith(frame);
    }
  });

  return template.innerHTML;
}

const RIPPLE_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIPPLE_FRAGMENT_SHADER = `
uniform sampler2D uTexture;
uniform sampler2D uDisplacement;
uniform vec2 winResolution;
varying vec2 vUv;
float PI = 3.141592653589793238;

void main() {
  vec2 vUvScreen = gl_FragCoord.xy / winResolution.xy;

  vec4 displacement = texture2D(uDisplacement, vUvScreen);
  float theta = displacement.r * 2.0 * PI;

  vec2 dir = vec2(sin(theta), cos(theta));
  vec2 uv = vUvScreen + dir * displacement.r * 0.075;
  vec4 color = texture2D(uTexture, uv);

  gl_FragColor = color;
}
`;

function createBrushTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  const imageData = context.createImageData(size, size);
  const data = imageData.data;
  const center = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const grain =
        Math.sin(x * 0.17 + y * 0.11) * 0.08 +
        Math.sin(x * 0.041 - y * 0.073) * 0.11 +
        Math.sin(angle * 9 + distance * 18) * 0.08;
      const feather = Math.max(0, 1 - distance);
      const alpha = Math.max(0, Math.min(1, Math.pow(feather, 1.8) + grain * feather));
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  context.putImageData(imageData, 0, 0);
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.28)");
  gradient.addColorStop(0.36, "rgba(255,255,255,0.16)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.globalCompositeOperation = "screen";
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

class ImageRippleEffect {
  constructor(target, textureUrl) {
    this.target = target;
    this.textureUrl = textureUrl;
    this.max = 100;
    this.currentWave = 0;
    this.prevMouse = { x: 0, y: 0 };
    this.meshes = [];
    this.running = false;
    this.destroyed = false;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 0;
    this.height = 0;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = "essay-youtube-ripple-canvas";
    this.target.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.waveScene = new THREE.Scene();
    this.imageScene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.camera.position.z = 2;
    this.imageCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.imageCamera.position.z = 2;
    this.brushTexture = createBrushTexture();
    this.uniforms = {
      uDisplacement: { value: null },
      uTexture: { value: null },
      winResolution: { value: new THREE.Vector2(1, 1) },
    };

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.animate = this.animate.bind(this);

    this.setup();
  }

  setup() {
    this.resize();
    this.createWaveMeshes();
    this.createImagePlane();
    this.createShaderPlane();
    this.createRenderTargets();
    this.target.addEventListener("mousemove", this.handleMouseMove, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      this.textureUrl,
      (texture) => {
        if (this.destroyed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this.imageMaterial.map = texture;
        this.imageMaterial.needsUpdate = true;
        this.target.classList.add("essay-youtube-cover--ripple-ready");
        this.running = true;
        this.animate();
      },
      undefined,
      () => {
        this.destroy();
      }
    );
  }

  resize() {
    const rect = this.target.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.updateCamera(this.camera);
    this.updateCamera(this.imageCamera);
    this.uniforms.winResolution.value.set(
      this.width * this.pixelRatio,
      this.height * this.pixelRatio
    );
  }

  updateCamera(camera) {
    camera.left = this.width / -2;
    camera.right = this.width / 2;
    camera.top = this.height / 2;
    camera.bottom = this.height / -2;
    camera.updateProjectionMatrix();
  }

  createRenderTargets() {
    this.disposeRenderTargets();
    const width = Math.max(1, Math.round(this.width * this.pixelRatio));
    const height = Math.max(1, Math.round(this.height * this.pixelRatio));
    this.fboBase = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    this.fboTexture = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
  }

  createWaveMeshes() {
    const geometry = new THREE.PlaneGeometry(60, 60, 1, 1);
    for (let i = 0; i < this.max; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        map: this.brushTexture,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.z = Math.random();
      mesh.visible = false;
      this.meshes.push(mesh);
      this.waveScene.add(mesh);
    }
  }

  createImagePlane() {
    this.imageGeometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
    this.imageMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.imageMesh = new THREE.Mesh(this.imageGeometry, this.imageMaterial);
    this.imageScene.add(this.imageMesh);
  }

  createShaderPlane() {
    this.shaderGeometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
    this.shaderMaterial = new THREE.ShaderMaterial({
      vertexShader: RIPPLE_VERTEX_SHADER,
      fragmentShader: RIPPLE_FRAGMENT_SHADER,
      transparent: true,
      uniforms: this.uniforms,
    });
    this.shaderMesh = new THREE.Mesh(this.shaderGeometry, this.shaderMaterial);
    this.scene.add(this.shaderMesh);
  }

  handleResize() {
    if (this.destroyed) {
      return;
    }
    this.resize();
    this.createRenderTargets();
    this.imageMesh.geometry.dispose();
    this.shaderMesh.geometry.dispose();
    this.imageMesh.geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
    this.shaderMesh.geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
  }

  handleMouseMove(event) {
    const rect = this.target.getBoundingClientRect();
    const x = event.clientX - rect.left - this.width / 2;
    const y = -event.clientY + rect.top + this.height / 2;
    this.trackMousePos(x, y);
  }

  setNewWave(x, y, index) {
    const mesh = this.meshes[index];
    if (!mesh) {
      return;
    }
    mesh.position.x = x;
      mesh.position.y = y;
      mesh.visible = true;
      mesh.material.opacity = 0.82;
      mesh.scale.x = 1.35;
      mesh.scale.y = 1.35;
  }

  trackMousePos(x, y) {
    if (Math.abs(x - this.prevMouse.x) > 0.1 || Math.abs(y - this.prevMouse.y) > 0.1) {
      const nextWave = (this.currentWave + 1) % this.max;
      this.currentWave = nextWave;
      this.setNewWave(x, y, nextWave);
    }
    this.prevMouse = { x, y };
  }

  animate() {
    if (!this.running || this.destroyed) {
      return;
    }

    this.meshes.forEach((mesh) => {
      if (!mesh.visible) {
        return;
      }
      mesh.rotation.z += 0.025;
      mesh.material.opacity *= 0.965;
      mesh.scale.x = 0.985 * mesh.scale.x + 0.125;
      mesh.scale.y = 0.985 * mesh.scale.y + 0.125;
      if (mesh.material.opacity < 0.002) {
        mesh.visible = false;
      }
    });

    this.renderer.setRenderTarget(this.fboBase);
    this.renderer.clear();
    this.renderer.render(this.waveScene, this.camera);

    this.renderer.setRenderTarget(this.fboTexture);
    this.renderer.clear();
    this.renderer.render(this.imageScene, this.imageCamera);

    this.uniforms.uTexture.value = this.fboTexture.texture;
    this.uniforms.uDisplacement.value = this.fboBase.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  disposeRenderTargets() {
    this.fboBase?.dispose();
    this.fboTexture?.dispose();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.running = false;
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
    }
    this.target.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("resize", this.handleResize);
    this.target.classList.remove("essay-youtube-cover--ripple-ready");
    this.renderer.domElement.remove();
    this.meshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.brushTexture.dispose();
    this.imageMaterial?.map?.dispose?.();
    this.imageMaterial?.dispose?.();
    this.imageMesh?.geometry?.dispose?.();
    this.shaderMaterial?.dispose?.();
    this.shaderMesh?.geometry?.dispose?.();
    this.disposeRenderTargets();
    this.renderer.dispose();
  }
}

export default defineComponent({
  name: "HaikuOtherPostPage",
  setup() {
    const route = useRoute();
    const bodySection = ref(null);
    const rippleEffects = new Map();
    const post = computed(() =>
      blogStore.state.haikuOtherPosts.find((item) => item.slug === route.params.slug)
    );
    const loading = ref(false);

    const fetchCurrent = async () => {
      loading.value = true;
      try {
        await blogStore.fetchHaikuOtherPostBySlug(route.params.slug, { force: true });
      } finally {
        loading.value = false;
      }
    };

    const bodyHtml = computed(() => enhanceYouTubeEmbeds(sanitizeHaikuOtherHtml(post.value?.body || "")));
    const isAdmin = computed(() => authStore.isAdmin());
    const hasViewCount = computed(() => Number.isFinite(Number(post.value?.viewCount)));

    const destroyRippleEffect = (target) => {
      const effect = rippleEffects.get(target);
      if (!effect) {
        return;
      }
      effect.destroy();
      rippleEffects.delete(target);
    };

    const destroyRippleEffects = () => {
      rippleEffects.forEach((effect) => effect.destroy());
      rippleEffects.clear();
    };

    const initRippleEffects = () => {
      if (typeof window === "undefined" || !bodySection.value) {
        return;
      }

      bodySection.value.querySelectorAll("[data-youtube-thumbnail]").forEach((target) => {
        if (!(target instanceof HTMLElement) || rippleEffects.has(target)) {
          return;
        }

        const thumbnail = target.dataset.youtubeThumbnail || "";
        if (!thumbnail) {
          return;
        }

        rippleEffects.set(target, new ImageRippleEffect(target, thumbnail));
      });
    };

    onMounted(async () => {
      await fetchCurrent();
      await nextTick();
      initRippleEffects();
    });

    watch(
      () => route.params.slug,
      () => fetchCurrent()
    );

    watch(
      bodyHtml,
      async () => {
        destroyRippleEffects();
        await nextTick();
        initRippleEffects();
      },
      { flush: "post" }
    );

    onBeforeUnmount(() => {
      destroyRippleEffects();
    });

    const handleBodyClick = (event) => {
      const playButton = event.target?.closest?.("[data-youtube-play]");
      if (!(playButton instanceof HTMLElement)) {
        return;
      }

      const videoId = normalizeYouTubeId(playButton.dataset.youtubePlay);
      if (!videoId) {
        return;
      }

      const frame = playButton.closest(".essay-embed-frame");
      if (!(frame instanceof HTMLElement)) {
        return;
      }

      destroyRippleEffect(playButton);

      const title = playButton.dataset.youtubeTitle || "YouTube video";
      const iframe = document.createElement("iframe");
      iframe.src = buildYouTubeEmbedSrc(videoId, true);
      iframe.title = title;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-popups allow-presentation");
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;

      frame.innerHTML = "";
      frame.appendChild(iframe);
    };

    const formatDate = (value) => {
      if (!value) return "";
      try {
        return new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(value));
      } catch (_error) {
        return value;
      }
    };
    const formatViewCount = (value = 0) =>
      `${new Intl.NumberFormat("vi-VN").format(Number(value) || 0)} lượt xem`;

    return {
      bodySection,
      post,
      loading,
      bodyHtml,
      isAdmin,
      hasViewCount,
      handleBodyClick,
      formatDate,
      formatViewCount,
      formatCategory: formatHaikuOtherCategory,
    };
  },
});
</script>

<style scoped>
.haiku-other-page {
  width: min(980px, calc(100vw - 5rem));
  margin: 0 auto;
  padding: 3rem 0 8rem;
}

.haiku-other-page__state {
  display: grid;
  gap: 1rem;
  padding-top: 2rem;
}

.haiku-other-page__content {
  display: grid;
  gap: 2.5rem;
}

.haiku-other-page__hero {
  display: grid;
  gap: 1.1rem;
  max-width: 50rem;
}

.haiku-other-page__eyebrow,
.haiku-other-page__summary,
.haiku-other-page__meta,
.haiku-other-page__back {
  margin: 0;
  color: var(--color-muted);
}

.haiku-other-page__eyebrow {
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.haiku-other-page__title {
  margin: 0;
  max-width: 13ch;
}

.haiku-other-page__body {
  display: grid;
  gap: 1.5rem;
  max-width: 44rem;
}

.haiku-other-page__body :deep(p),
.haiku-other-page__body :deep(h2),
.haiku-other-page__body :deep(h3),
.haiku-other-page__body :deep(blockquote),
.haiku-other-page__body :deep(ul),
.haiku-other-page__body :deep(hr),
.haiku-other-page__body :deep(figure) {
  margin: 0;
}

.haiku-other-page__body :deep(p + p),
.haiku-other-page__body :deep(h2 + p),
.haiku-other-page__body :deep(h3 + p),
.haiku-other-page__body :deep(p + h2),
.haiku-other-page__body :deep(p + h3),
.haiku-other-page__body :deep(p + ul),
.haiku-other-page__body :deep(ul + p),
.haiku-other-page__body :deep(blockquote + p),
.haiku-other-page__body :deep(img + p),
.haiku-other-page__body :deep(iframe + p) {
  margin-top: 1.15rem;
}

.haiku-other-page__body :deep(h2),
.haiku-other-page__body :deep(h3) {
  font-family: var(--font-title);
  font-weight: var(--font-weight-title);
  color: var(--color-title);
  line-height: 1.1;
}

.haiku-other-page__body :deep(h2) {
  font-size: 1.8rem;
}

.haiku-other-page__body :deep(h3) {
  font-size: 1.4rem;
}

.haiku-other-page__body :deep(ul) {
  padding-left: 1.3rem;
}

.haiku-other-page__body :deep(blockquote) {
  padding-left: 1rem;
  border-left: 1px solid var(--border-regular);
  color: var(--color-description);
}

.haiku-other-page__body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border-soft);
}

.haiku-other-page__body :deep(a) {
  color: var(--color-title);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

.haiku-other-page__body :deep(img),
.haiku-other-page__body :deep(iframe) {
  display: block;
  width: min(100%, 42rem);
  max-width: 100%;
  margin: 1.2rem 0;
}

.haiku-other-page__body :deep(img) {
  height: auto;
  object-fit: contain;
}

.haiku-other-page__body :deep(.essay-embed-frame) {
  position: relative;
  isolation: isolate;
  display: block;
  width: min(100%, 46rem);
  max-width: 100%;
  margin: 1.6rem 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.haiku-other-page__body :deep(.essay-embed-frame--youtube) {
  padding: 0;
}

.haiku-other-page__body :deep(.essay-youtube-cover) {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0;
  background: #111;
  color: var(--surface-page-bg);
  cursor: pointer;
  overflow: hidden;
  font: inherit;
  text-align: left;
}

.haiku-other-page__body :deep(.essay-youtube-cover__image) {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  margin: 0;
  object-fit: cover;
  filter: saturate(0.84) contrast(1.03) brightness(0.86);
  transform: scale(1.01);
  transition:
    opacity 180ms ease,
    filter 260ms ease,
    transform 420ms ease;
}

.haiku-other-page__body :deep(.essay-youtube-cover--ripple-ready .essay-youtube-cover__image) {
  opacity: 0;
}

.haiku-other-page__body :deep(.essay-youtube-ripple-canvas) {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.haiku-other-page__body :deep(.essay-youtube-cover--ripple-ready .essay-youtube-ripple-canvas) {
  opacity: 1;
}

.haiku-other-page__body :deep(.essay-youtube-cover__veil) {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(115deg, rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.04) 54%),
    radial-gradient(circle at 50% 50%, transparent 0 22%, rgb(0 0 0 / 0.22) 64%);
  opacity: 0.82;
  transition: opacity 260ms ease;
}

.haiku-other-page__body :deep(.essay-youtube-cover__mark) {
  position: absolute;
  z-index: 3;
  left: 50%;
  top: 50%;
  width: clamp(2.15rem, 5.6vw, 3.15rem);
  height: clamp(2.15rem, 5.6vw, 3.15rem);
  transform: translate(-50%, -50%);
  transition: transform 220ms ease;
}

.haiku-other-page__body :deep(.essay-youtube-cover__triangle) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: rgb(255 255 255 / 0.82);
  stroke-width: 1.7;
  stroke-linejoin: round;
  stroke-linecap: round;
  filter:
    drop-shadow(0 0 1px rgb(255 255 255 / 0.18))
    drop-shadow(0 7px 14px rgb(0 0 0 / 0.24));
  transition:
    stroke 220ms ease,
    filter 220ms ease;
}

.haiku-other-page__body :deep(.essay-youtube-cover__caption) {
  position: absolute;
  z-index: 3;
  left: clamp(1rem, 2.4vw, 1.45rem);
  bottom: clamp(0.85rem, 2vw, 1.2rem);
  color: rgb(255 255 255 / 0.62);
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.7;
  transition: opacity 220ms ease;
}

.haiku-other-page__body :deep(.essay-youtube-cover:hover .essay-youtube-cover__veil),
.haiku-other-page__body :deep(.essay-youtube-cover:focus-visible .essay-youtube-cover__veil) {
  opacity: 0.56;
}

.haiku-other-page__body :deep(.essay-youtube-cover:hover .essay-youtube-cover__caption),
.haiku-other-page__body :deep(.essay-youtube-cover:focus-visible .essay-youtube-cover__caption) {
  opacity: 1;
}

.haiku-other-page__body :deep(.essay-youtube-cover:hover .essay-youtube-cover__mark),
.haiku-other-page__body :deep(.essay-youtube-cover:focus-visible .essay-youtube-cover__mark) {
  transform: translate(-50%, -50%) scale(1.04);
}

.haiku-other-page__body :deep(.essay-youtube-cover:hover .essay-youtube-cover__triangle),
.haiku-other-page__body :deep(.essay-youtube-cover:focus-visible .essay-youtube-cover__triangle) {
  stroke: rgb(255 255 255 / 0.96);
  filter:
    drop-shadow(0 0 1px rgb(255 255 255 / 0.24))
    drop-shadow(0 8px 17px rgb(0 0 0 / 0.28));
}

.haiku-other-page__body :deep(.essay-youtube-cover:focus-visible) {
  outline: 1px solid rgb(255 255 255 / 0.7);
  outline-offset: 4px;
}

.haiku-other-page__body :deep(iframe) {
  aspect-ratio: 16 / 9;
  height: auto;
  min-height: 16rem;
  border: 0;
  background: #000;
  box-shadow: none;
}

.haiku-other-page__body :deep(.essay-embed-frame iframe) {
  position: relative;
  z-index: 1;
  width: 100%;
  margin: 0;
  box-shadow: none;
}

@media (max-width: 640px) {
  .haiku-other-page {
    width: min(100vw - 2rem, 980px);
    padding-bottom: 5rem;
  }

  .haiku-other-page__body :deep(.essay-embed-frame) {
    padding: 0;
  }

  .haiku-other-page__body :deep(iframe) {
    min-height: 12rem;
  }
}
</style>
