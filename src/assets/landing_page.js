import { initHoverImageEffects } from "assets/hover_image_effect.js";

function preloadBackgroundImage(url = "") {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function lerp(current, target, ease) {
  return current + (target - current) * ease;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

class NativeParallaxItem {
  constructor(element, index) {
    this.element = element;
    this.index = index;
    this.image = element.querySelector(".content__item-img");
    this.imageWrapper = element.querySelector(".content__item-imgwrap");
    this.title = element.querySelector(".content__item-title");
    this.description = element.querySelector(".content__item-description");
    this.poem = element.querySelector(".content__item-poem");
    const direction = Math.random() > 0.5 ? 1 : -1;
    this.rotationFrom = direction * randomFloat(2.4, 6.8);
    this.titleTravel = randomFloat(110, 220);
    this.secondaryTravel = randomFloat(26, 52);
    this.poemTravel = randomFloat(16, 36);
    this.scaleXFrom = randomFloat(1.02, 1.09);
    this.scaleXTo = randomFloat(0.72, 0.82);
    this.scaleYFrom = randomFloat(0.92, 0.98);
    this.scaleYTo = randomFloat(1.26, 1.4);
    this.depthMultiplier = randomFloat(1.15, 1.5);
    this.overflow = this.resolveOverflow();
    this.ease = 0.14;
    this.current = {
      imageY: 0,
      imageScaleX: 1,
      imageScaleY: 1,
      titleY: 0,
      itemRotation: 0,
      secondaryY: 0,
      poemY: 0,
    };
    this.target = { ...this.current };
  }

  resolveOverflow() {
    if (!this.image) {
      return 0;
    }

    const overflow = Number.parseInt(
      getComputedStyle(this.image).getPropertyValue("--overflow"),
      10
    );

    return Number.isFinite(overflow) ? overflow : 40;
  }

  update(viewportHeight) {
    const rect = this.element.getBoundingClientRect();
    const progress = clamp(
      (viewportHeight - rect.top) / (viewportHeight + rect.height),
      0,
      1
    );
    const centered = progress - 0.5;
    this.target.imageY = mapRange(
      progress,
      0,
      1,
      -this.overflow * this.depthMultiplier,
      this.overflow * this.depthMultiplier
    );
    this.target.imageScaleX = mapRange(progress, 0, 1, this.scaleXFrom, this.scaleXTo);
    this.target.imageScaleY = mapRange(progress, 0, 1, this.scaleYFrom, this.scaleYTo);
    this.target.titleY = mapRange(progress, 0, 1, this.titleTravel, -this.titleTravel * 1.05);
    this.target.itemRotation = mapRange(progress, 0, 1, this.rotationFrom, 0);
    this.target.secondaryY = centered * -this.secondaryTravel;
    this.target.poemY = centered * this.poemTravel;
  }

  renderStep({ immediate = false } = {}) {
    let hasMotion = false;

    Object.keys(this.current).forEach((key) => {
      const nextValue = immediate
        ? this.target[key]
        : lerp(this.current[key], this.target[key], this.ease);

      if (Math.abs(nextValue - this.target[key]) > 0.12) {
        hasMotion = true;
      }

      this.current[key] = nextValue;
    });

    if (this.image) {
      this.image.style.transform = `translate3d(0, ${this.current.imageY}px, 0)`;
    }

    if (this.imageWrapper) {
      this.imageWrapper.style.transform = `scale3d(${this.current.imageScaleX}, ${this.current.imageScaleY}, 1)`;
    }

    if (this.title) {
      this.title.style.transform = `translate3d(0, ${this.current.titleY}px, 0)`;
    }

    if (this.description) {
      this.description.style.transform = `translate3d(0, ${this.current.secondaryY}px, 0)`;
    }

    if (this.poem) {
      this.poem.style.transform = `translate3d(0, ${this.current.poemY}px, 0)`;
    }

    this.element.style.transform = `rotate3d(0, 0, 1, ${this.current.itemRotation}deg)`;
    return hasMotion;
  }

  reset() {
    this.element.style.transform = "";
    this.image?.style.removeProperty("transform");
    this.imageWrapper?.style.removeProperty("transform");
    this.title?.style.removeProperty("transform");
    this.description?.style.removeProperty("transform");
    this.poem?.style.removeProperty("transform");
  }
}

export function initLandingPage() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mainElement = document.querySelector("main");
  const contentElement = document.querySelector(".content");
  const scrollLayer = mainElement?.querySelector("[data-scroll]") || null;

  if (!mainElement || !contentElement) {
    return () => {};
  }

  let destroyed = false;
  let rafId = 0;
  let destroyHoverEffects = null;
  let intersectionObserver = null;
  let visibleItems = new Set();

  const items = [...contentElement.querySelectorAll(".content__item")].map(
    (element, index) => new NativeParallaxItem(element, index)
  );

  const renderVisibleItems = () => {
    rafId = 0;

    if (destroyed) {
      return;
    }

    const viewportHeight = window.innerHeight || 1;
    const targets = visibleItems.size ? [...visibleItems] : items;
    let hasMotion = false;

    targets.forEach((item) => {
      item.update(viewportHeight);
      hasMotion = item.renderStep() || hasMotion;
    });

    if (hasMotion && !destroyed) {
      queueRender();
    }
  };

  const queueRender = () => {
    if (destroyed || rafId) {
      return;
    }

    rafId = window.requestAnimationFrame(renderVisibleItems);
  };

  const handleResize = () => {
    items.forEach((item) => {
      item.overflow = item.resolveOverflow();
    });
    queueRender();
  };

  const setupVisibilityObserver = () => {
    if (typeof IntersectionObserver === "undefined") {
      visibleItems = new Set(items);
      return;
    }

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const item = items.find((candidate) => candidate.element === entry.target);
          if (!item) {
            return;
          }

          if (entry.isIntersecting) {
            visibleItems.add(item);
          } else {
            visibleItems.delete(item);
          }
        });

        queueRender();
      },
      {
        threshold: 0,
        rootMargin: "30% 0px 30% 0px",
      }
    );

    items.forEach((item) => {
      intersectionObserver.observe(item.element);
    });
  };

  const setupHoverEffects = () => {
    const supportsHover = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!supportsHover || prefersReducedMotion) {
      return;
    }

    const wrappers = [...contentElement.querySelectorAll(".grid")].filter(
      (wrapper) => wrapper.querySelector("img")
    );

    if (!wrappers.length) {
      return;
    }

    destroyHoverEffects = initHoverImageEffects({
      container: mainElement,
      foreground: scrollLayer,
      wrappers,
      strength: 0.25,
      imageSelector: "img",
      effectKey: "landing-page",
    });
  };

  const preloadImages = async () => {
    const elements = [...contentElement.querySelectorAll(".content__item-img")];

    await Promise.all(
      elements.map((element) => {
        const backgroundImage = window.getComputedStyle(element).backgroundImage || "";
        const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
        return preloadBackgroundImage(match?.[2] || "");
      })
    );
  };

  preloadImages()
    .catch(() => {})
    .finally(() => {
      if (destroyed) {
        return;
      }

      document.body.classList.remove("loading");
      setupVisibilityObserver();
      setupHoverEffects();
      const viewportHeight = window.innerHeight || 1;
      items.forEach((item) => {
        item.update(viewportHeight);
        item.renderStep({ immediate: true });
      });
    });

  window.addEventListener("scroll", queueRender, { passive: true });
  window.addEventListener("resize", handleResize, { passive: true });

  return () => {
    destroyed = true;

    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    window.removeEventListener("scroll", queueRender);
    window.removeEventListener("resize", handleResize);
    intersectionObserver?.disconnect();
    destroyHoverEffects?.();
    items.forEach((item) => item.reset());
  };
}
