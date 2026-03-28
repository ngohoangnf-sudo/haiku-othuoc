import * as THREE from "three";

export function initHoverImageEffects({
  container = document.querySelector("main"),
  foreground = container?.querySelector?.("[data-scroll]") || null,
  wrappers = [],
  strength = 0.22,
} = {}) {
  const tween = globalThis.TweenLite;
  const ease = globalThis.Power4;
  const items = wrappers
    .filter(Boolean)
    .map((wrapper) => ({
      wrapper,
      img: wrapper.querySelector(".reading-page__poem-source"),
    }))
    .filter((item) => item.img);

  if (
    !items.length ||
    typeof window === "undefined" ||
    !tween ||
    !ease
  ) {
    return () => {};
  }

  class FloatingStretchEffect {
    constructor() {
      this.items = items;
      this.container = container || document.body;
      this.foreground = foreground;
      this.textures = new Map();
      this.loadingTextures = new Map();
      this.textureLoader = new THREE.TextureLoader();
      this.pointer = new THREE.Vector2();
      this.target = new THREE.Vector3();
      this.currentItem = null;
      this.isVisible = false;
      this.destroyed = false;
      this.frameId = 0;
      this.needsRender = false;
      this.setup();
      this.bindEvents();
    }

    setup() {
      this.initialContainerStyles = {
        position: this.container.style.position,
        zIndex: this.container.style.zIndex,
        isolation: this.container.style.isolation,
      };
      this.container.style.position = this.container.style.position || "relative";
      this.container.style.zIndex = this.container.style.zIndex || "0";
      this.container.style.isolation = "isolate";

      if (this.foreground) {
        this.initialForegroundStyles = {
          position: this.foreground.style.position,
          zIndex: this.foreground.style.zIndex,
        };
        this.foreground.style.position = this.foreground.style.position || "relative";
        this.foreground.style.zIndex = this.foreground.style.zIndex || "1";
      }

      this.container
        .querySelectorAll('[data-hover-image-effect="reading-page"]')
        .forEach((element) => element.remove());

      this.host = document.createElement("div");
      this.host.dataset.hoverImageEffect = "reading-page";
      Object.assign(this.host.style, {
        position: "sticky",
        top: "0",
        left: "0",
        width: "100%",
        height: "100vh",
        marginBottom: "-100vh",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: "0",
      });

      if (this.foreground?.parentNode === this.container) {
        this.container.insertBefore(this.host, this.foreground);
      } else {
        this.container.prepend(this.host);
      }

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.1));
      const viewport = this.getViewportRect();
      this.renderer.setSize(viewport.width, viewport.height);
      this.renderer.domElement.dataset.hoverImageEffectCanvas = "reading-page";
      Object.assign(this.renderer.domElement.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        zIndex: "0",
      });
      this.host.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(
        40,
        viewport.width / viewport.height,
        0.1,
        100
      );
      this.camera.position.set(0, 0, 9);

      this.geometry = new THREE.PlaneGeometry(1, 1, 32, 32);
      this.uniforms = {
        uTexture: { value: null },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uAlpha: { value: 0 },
      };

      this.material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: `
          uniform vec2 uOffset;
          varying vec2 vUv;

          vec3 deformationCurve(vec3 position, vec2 uv, vec2 offset) {
            float M_PI = 3.1415926535897932384626433832795;
            position.x = position.x + (sin(uv.y * M_PI) * offset.x);
            position.y = position.y + (sin(uv.x * M_PI) * offset.y);
            return position;
          }

          void main() {
            vUv = uv + (uOffset * 2.);
            vec3 newPosition = deformationCurve(position, uv, uOffset);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform float uAlpha;
          varying vec2 vUv;

          vec2 scaleUV(vec2 uv, float scale) {
            float center = 0.5;
            return ((uv - center) * scale) + center;
          }

          void main() {
            vec3 color = texture2D(uTexture, scaleUV(vUv, 0.8)).rgb;
            gl_FragColor = vec4(color, uAlpha);
          }
        `,
        transparent: true,
      });

      this.plane = new THREE.Mesh(this.geometry, this.material);
      this.plane.visible = false;
      this.scene.add(this.plane);
    }

    bindEvents() {
      this.handleResize = this.onResize.bind(this);
      window.addEventListener("resize", this.handleResize, false);

      this.enterHandlers = [];
      this.leaveHandlers = [];
      this.moveHandlers = [];

      this.items.forEach((item) => {
        const enter = (event) => this.onEnter(item, event);
        const leave = () => this.onLeave(item);
        const move = (event) => this.onMove(item, event);

        this.enterHandlers.push([item.wrapper, enter]);
        this.leaveHandlers.push([item.wrapper, leave]);
        this.moveHandlers.push([item.wrapper, move]);

        item.wrapper.addEventListener("mouseenter", enter, false);
        item.wrapper.addEventListener("mouseleave", leave, false);
        item.wrapper.addEventListener("mousemove", move, false);
      });
    }

    requestRender() {
      this.needsRender = true;
      if (this.frameId || this.destroyed) {
        return;
      }

      const renderFrame = () => {
        this.frameId = 0;

        if (this.destroyed) {
          return;
        }

        const shouldRender =
          this.needsRender || this.isVisible || this.uniforms.uAlpha.value > 0.001;

        if (!shouldRender) {
          return;
        }

        this.needsRender = false;
        this.renderer.render(this.scene, this.camera);

        if (this.needsRender || this.isVisible || this.uniforms.uAlpha.value > 0.001) {
          this.frameId = window.requestAnimationFrame(renderFrame);
        }
      };

      this.frameId = window.requestAnimationFrame(renderFrame);
    }

    ensureTexture(item, onReady) {
      const cachedTexture = this.textures.get(item.wrapper);
      if (cachedTexture) {
        onReady(cachedTexture);
        return;
      }

      const pendingTexture = this.loadingTextures.get(item.wrapper);
      if (pendingTexture) {
        pendingTexture.then(onReady).catch(() => {});
        return;
      }

      const texturePromise = new Promise((resolve, reject) => {
        this.textureLoader.load(
          item.img.currentSrc || item.img.src,
          (texture) => {
            this.textures.set(item.wrapper, texture);
            this.loadingTextures.delete(item.wrapper);
            resolve(texture);
          },
          undefined,
          () => {
            this.loadingTextures.delete(item.wrapper);
            reject(new Error("Failed to load hover texture"));
          }
        );
      });

      this.loadingTextures.set(item.wrapper, texturePromise);
      texturePromise.then(onReady).catch(() => {});
    }

    onResize() {
      const viewport = this.getViewportRect();
      this.camera.aspect = viewport.width / viewport.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(viewport.width, viewport.height);
      this.updatePlaneScale();
      this.requestRender();
    }

    getViewportRect() {
      const rect = this.host?.getBoundingClientRect?.();
      return {
        width: rect?.width || window.innerWidth || 1,
        height: rect?.height || window.innerHeight || 1,
        left: rect?.left || 0,
        top: rect?.top || 0,
      };
    }

    getViewSize() {
      const distance = this.camera.position.z;
      const vFov = (this.camera.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * this.camera.aspect;
      return { width, height };
    }

    updatePlaneScale() {
      if (!this.currentItem || !this.uniforms.uTexture.value) {
        return;
      }

      const rect = this.currentItem.wrapper.getBoundingClientRect();
      const viewport = this.getViewportRect();
      const textureImage = this.uniforms.uTexture.value.image;
      const imageRatio =
        (textureImage?.width || this.currentItem.img.naturalWidth || 1) /
        (textureImage?.height || this.currentItem.img.naturalHeight || 1);

      const viewSize = this.getViewSize();
      const baseWidth = (rect.width / viewport.width) * viewSize.width;
      const baseHeight = (rect.height / viewport.height) * viewSize.height;
      const targetArea = baseWidth * baseHeight * 1.9;
      const maxWidth = baseWidth * 1.5;
      const maxHeight = baseHeight * 1.4;

      let width = Math.sqrt(targetArea * imageRatio);
      let height = width / imageRatio;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / imageRatio;
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = height * imageRatio;
      }

      this.plane.scale.set(width, height, 1);
    }

    onEnter(item, event) {
      this.currentItem = item;
      this.isVisible = true;

      this.ensureTexture(item, (texture) => {
        if (this.destroyed || !this.currentItem || this.currentItem.wrapper !== item.wrapper) {
          return;
        }

        this.uniforms.uTexture.value = texture;
        this.updatePlaneScale();
        this.plane.visible = true;
        this.onMove(item, event);

        tween.killTweensOf(this.uniforms.uAlpha);
        tween.to(this.uniforms.uAlpha, 0.9, {
          value: 0.92,
          ease: ease.easeOut,
          onUpdate: () => this.requestRender(),
        });

        this.requestRender();
      });
    }

    onLeave(item) {
      if (!this.currentItem || this.currentItem.wrapper !== item.wrapper) {
        return;
      }

      this.isVisible = false;
      this.currentItem = null;
      tween.killTweensOf(this.uniforms.uAlpha);
      tween.to(this.uniforms.uAlpha, 0.5, {
        value: 0,
        ease: ease.easeOut,
        onUpdate: () => this.requestRender(),
        onComplete: () => {
          if (!this.isVisible) {
            this.plane.visible = false;
          }
        },
      });
      this.requestRender();
    }

    onMove(item, event) {
      if (!this.isVisible || !this.currentItem || this.currentItem.wrapper !== item.wrapper) {
        return;
      }

      const viewport = this.getViewportRect();
      this.pointer.x = ((event.clientX - viewport.left) / viewport.width) * 2 - 1;
      this.pointer.y = -(((event.clientY - viewport.top) / viewport.height) * 2 - 1);

      const viewSize = this.getViewSize();
      const x = this.pointer.x.map(-1, 1, -viewSize.width / 2, viewSize.width / 2);
      const y = this.pointer.y.map(-1, 1, -viewSize.height / 2, viewSize.height / 2);

      this.target.set(x, y, 0);
      tween.killTweensOf(this.plane.position);
      tween.to(this.plane.position, 1, {
        x,
        y,
        ease: ease.easeOut,
        onUpdate: () => {
          const offset = this.plane.position
            .clone()
            .sub(this.target)
            .multiplyScalar(-strength);
          this.uniforms.uOffset.value = offset;
          this.requestRender();
        },
      });
    }

    destroy() {
      this.destroyed = true;
      window.removeEventListener("resize", this.handleResize, false);

      this.enterHandlers.forEach(([element, handler]) => {
        element.removeEventListener("mouseenter", handler, false);
      });
      this.leaveHandlers.forEach(([element, handler]) => {
        element.removeEventListener("mouseleave", handler, false);
      });
      this.moveHandlers.forEach(([element, handler]) => {
        element.removeEventListener("mousemove", handler, false);
      });

      if (this.frameId) {
        window.cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }

      tween.killTweensOf(this.plane.position);
      tween.killTweensOf(this.uniforms.uAlpha);

      this.geometry.dispose();
      this.material.dispose();
      this.textures.forEach((texture) => texture.dispose?.());
      this.renderer.dispose();

      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }

      if (this.host?.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }

      this.container.style.position = this.initialContainerStyles.position;
      this.container.style.zIndex = this.initialContainerStyles.zIndex;
      this.container.style.isolation = this.initialContainerStyles.isolation;

      if (this.foreground && this.initialForegroundStyles) {
        this.foreground.style.position = this.initialForegroundStyles.position;
        this.foreground.style.zIndex = this.initialForegroundStyles.zIndex;
      }
    }
  }

  const effect = new FloatingStretchEffect();
  return () => effect.destroy();
}
