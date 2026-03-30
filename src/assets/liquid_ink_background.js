let threeModulePromise = null;

function loadThree() {
  if (!threeModulePromise) {
    threeModulePromise = import("three");
  }

  return threeModulePromise;
}

export async function initLiquidInkBackground({
  mount,
  prefersReducedMotion = false,
} = {}) {
  const pixelRatioCap = 1;
  const targetFps = 24;
  const frameInterval = 1000 / targetFps;

  if (!mount || typeof window === "undefined" || prefersReducedMotion) {
    return {
      setActive: () => {},
      setInteractive: () => {},
      setAnimated: () => {},
      destroy: () => {},
    };
  }

  const THREE = await loadThree();

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, {
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
  });
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uPointerShift: { value: new THREE.Vector2(0, 0) },
    uAlpha: { value: 1 },
    uThemeMix: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uPointer;
      uniform vec2 uPointerShift;
      uniform float uAlpha;
      uniform float uThemeMix;

      mat2 rotate2D(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat2(c, -s, s, c);
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;

        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p = rotate2D(0.42) * p * 2.02;
          amplitude *= 0.5;
        }

        return value;
      }

      float ridge(vec2 p) {
        float n = fbm(p);
        return 1.0 - abs((n * 2.0) - 1.0);
      }

      vec2 warp(vec2 p, float timeOffset) {
        vec2 q = vec2(
          fbm(p + vec2(0.0, uTime * 0.028 + timeOffset)),
          fbm(p + vec2(4.6, -uTime * 0.022 - timeOffset))
        );

        vec2 r = vec2(
          fbm(p + (2.0 * q) + vec2(1.7, 9.2) + uTime * 0.018),
          fbm(p + (2.0 * q) + vec2(8.3, 2.8) - uTime * 0.016)
        );

        return r;
      }

      float contourLine(float value, float width) {
        float line = abs(fract(value) - 0.5) * 2.0;
        return 1.0 - smoothstep(width, width + 0.08, line);
      }

      float paperHeightField(vec2 pos) {
        vec2 paperPoint = rotate2D(-0.18) * pos * vec2(1.0, 1.12);
        vec2 paperFlow = warp(paperPoint * 0.32, 0.64);
        vec2 paperField = paperPoint + paperFlow * 0.08;

        float drift = fbm(
          paperField * 0.42 + vec2(uTime * 0.0011, -uTime * 0.0009)
        );
        float wrinkleA =
          sin(paperField.y * 6.2 + sin(paperField.x * 1.18 + paperFlow.x * 0.42) * 0.92) * 0.5 + 0.5;
        float wrinkleB =
          sin(paperField.y * 3.7 - 0.7 + sin(paperField.x * 0.84 - paperFlow.y * 0.3) * 0.66) * 0.5 + 0.5;
        float body = smoothstep(0.08, 0.94, wrinkleA * 0.72 + wrinkleB * 0.28);

        return body * 0.86 + drift * 0.14;
      }

      void main() {
        vec2 uv = vUv;
        vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
        vec2 centered = (uv - 0.5) * aspect;

        vec2 pointer = (uPointer - 0.5) * aspect;
        float pointerDistance = distance(centered, pointer);
        float pointerFalloff = exp(-4.0 * pointerDistance);
        vec2 wake = uPointerShift * pointerFalloff * mix(0.5, 0.34, uThemeMix);

        vec2 p = centered * 2.4;
        p += wake;

        vec2 primaryFlow = warp(p, 0.0);
        vec2 secondaryFlow = warp((rotate2D(0.24) * p) * 1.12, 2.7);
        vec2 fluid = mix(primaryFlow, secondaryFlow, 0.42);

        vec2 advection = fluid * 1.1 + wake * 0.38;
        float inkBody = fbm(p + advection + vec2(uTime * 0.012, -uTime * 0.009));
        float inkShadow = fbm((p * 1.45) - fluid * 1.2 - vec2(uTime * 0.01, uTime * 0.006));
        float tendrils = ridge((p * 1.85) + fluid * 1.45 - wake * 0.45 - vec2(uTime * 0.006, -uTime * 0.005));

        float bloom = smoothstep(0.2, 0.94, inkBody * 0.72 + inkShadow * 0.35);
        float filaments = smoothstep(0.3, 0.9, tendrils);

        vec2 paperPoint = rotate2D(-0.18) * centered * vec2(1.0, 1.12);
        vec2 paperFlow = warp(paperPoint * 0.32, 0.64);
        vec2 paperField = paperPoint + paperFlow * 0.08;

        float paperDrift = fbm(
          paperField * 0.42 + vec2(uTime * 0.0011, -uTime * 0.0009)
        );
        float paperTexture = fbm(
          paperField * 0.82 + vec2(uTime * 0.0022, -uTime * 0.0018)
        );
        float paperFiber = ridge(
          paperField * 4.4 + vec2(uTime * 0.004, -uTime * 0.003)
        );

        float paperWrinkleA =
          sin(paperField.y * 6.2 + sin(paperField.x * 1.18 + paperFlow.x * 0.42) * 0.92) * 0.5 + 0.5;
        float paperWrinkleB =
          sin(paperField.y * 3.7 - 0.7 + sin(paperField.x * 0.84 - paperFlow.y * 0.3) * 0.66) * 0.5 + 0.5;
        float paperBody = smoothstep(0.08, 0.94, paperWrinkleA * 0.72 + paperWrinkleB * 0.28);
        float paperRidge =
          contourLine((paperField.y + paperDrift * 0.08) * 6.2 + paperTexture * 0.28, 0.24) * 0.08;
        float paperHeight = paperHeightField(centered);
        float paperHeightDx = paperHeightField(centered + vec2(0.02, 0.0)) - paperHeight;
        float paperHeightDy = paperHeightField(centered + vec2(0.0, 0.02)) - paperHeight;
        vec3 paperNormal = normalize(vec3(-paperHeightDx * 7.2, -paperHeightDy * 7.2, 1.0));
        vec3 paperLightDir = normalize(vec3(-0.34, 0.48, 0.8));
        float paperLight = clamp(dot(paperNormal, paperLightDir), 0.0, 1.0);
        float paperOcclusion = clamp((1.0 - paperLight) * 0.54, 0.0, 1.0);

        float paperShimmer = smoothstep(
          0.24,
          0.94,
          0.5 + 0.5 * (paperTexture * 0.44 + paperWrinkleA * 0.2)
        );
        float paperFiberCoarse =
          hash(floor((paperField + vec2(9.2, 4.7)) * 220.0)) - 0.5;
        float paperFiberFine =
          hash(floor((rotate2D(0.34) * paperField + vec2(3.1, 7.2)) * 460.0)) - 0.5;
        float paperGrain =
          paperFiberCoarse * 0.52 +
          paperFiberFine * 0.48;

        vec3 deep = mix(
          vec3(0.11, 0.105, 0.115),
          vec3(0.93, 0.93, 0.928),
          uThemeMix
        );
        vec3 mist = mix(
          vec3(0.22, 0.205, 0.2),
          vec3(0.82, 0.82, 0.818),
          uThemeMix
        );
        vec3 glow = mix(
          vec3(0.33, 0.305, 0.285),
          vec3(0.69, 0.69, 0.688),
          uThemeMix
        );
        vec3 shadowTint = mix(
          vec3(0.03, 0.028, 0.028),
          vec3(0.09, 0.09, 0.088),
          uThemeMix
        );
        vec3 paperBaseColor = vec3(0.982, 0.979, 0.972);
        vec3 paperMidColor = vec3(0.942, 0.935, 0.922);
        vec3 paperShadowColor = vec3(0.868, 0.854, 0.828);
        vec3 paperHighlightColor = vec3(0.995, 0.994, 0.988);

        vec3 liquidColor = mix(deep, mist, bloom * 0.4);
        liquidColor += glow * filaments * 0.12;
        liquidColor -= shadowTint * smoothstep(0.28, 0.92, inkShadow);

        vec3 paperColor = mix(
          paperBaseColor,
          paperMidColor,
          clamp(paperHeight * 0.68 + paperTexture * 0.12, 0.0, 1.0)
        );
        paperColor = mix(
          paperColor,
          paperShadowColor,
          clamp(paperOcclusion * 0.7 + (1.0 - paperHeight) * 0.04, 0.0, 1.0)
        );
        paperColor *= mix(0.92, 1.03, paperLight);
        paperColor += paperHighlightColor * paperRidge * 0.14;
        paperColor += paperHighlightColor * paperShimmer * 0.025;
        paperColor += paperHighlightColor * clamp(paperLight - 0.62, 0.0, 1.0) * 0.045;
        paperColor -= vec3(0.07, 0.064, 0.054) * paperOcclusion * 0.18;
        paperColor -= vec3(0.028, 0.025, 0.02) * paperFiber * 0.032;
        paperColor += vec3(paperGrain) * (0.03 + paperHeight * 0.007);

        vec3 color = mix(liquidColor, paperColor, uThemeMix);

        float vignette = mix(
          smoothstep(1.35, 0.18, length(centered)),
          smoothstep(1.95, -0.18, length(centered)) * 0.998 + 0.002,
          uThemeMix
        );
        float grain = (hash(gl_FragCoord.xy + uTime * 17.0) - 0.5) * mix(0.035, 0.012, uThemeMix);

        color *= vignette;
        color += grain;

        gl_FragColor = vec4(color, mix(0.86, 0.48, uThemeMix) * uAlpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  let active = true;
  let interactive = true;
  let animated = true;
  let destroyed = false;
  let pointerListenersAttached = false;
  let rafId = 0;
  let lastTick = performance.now();
  let lastFrameTime = performance.now();
  const pointerTarget = new THREE.Vector2(0.5, 0.5);
  let themeTarget = 0;
  const settleThreshold = 0.0015;
  const alphaThreshold = 0.01;
  const themeThreshold = 0.002;

  const renderFrame = () => {
    renderer.render(scene, camera);
  };

  const stopLoop = () => {
    if (!rafId) {
      return;
    }

    window.cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const startLoop = () => {
    if (rafId || destroyed) {
      return;
    }

    const now = performance.now();
    lastTick = now;
    lastFrameTime = now;
    rafId = window.requestAnimationFrame(tick);
  };

  const tick = (now) => {
    if (destroyed) {
      return;
    }

    const elapsedSinceFrame = now - lastFrameTime;
    if (elapsedSinceFrame < frameInterval) {
      rafId = window.requestAnimationFrame(tick);
      return;
    }

    const delta = Math.min((now - lastTick) / 1000, 0.033);
    lastTick = now;
    lastFrameTime = now;

    if (animated) {
      uniforms.uTime.value += delta;
    }

    uniforms.uPointer.value.lerp(pointerTarget, 0.065);

    const pointerDelta = pointerTarget.clone().sub(uniforms.uPointer.value);
    uniforms.uPointerShift.value.lerp(pointerDelta.multiplyScalar(12), 0.05);

    const targetAlpha = active ? 1 : 0;
    uniforms.uAlpha.value += (targetAlpha - uniforms.uAlpha.value) * 0.06;
    uniforms.uThemeMix.value += (themeTarget - uniforms.uThemeMix.value) * 0.07;

    renderFrame();

    if (animated) {
      rafId = window.requestAnimationFrame(tick);
      return;
    }

    const shouldContinue =
      pointerTarget.distanceTo(uniforms.uPointer.value) > settleThreshold ||
      uniforms.uPointerShift.value.length() > settleThreshold ||
      Math.abs(targetAlpha - uniforms.uAlpha.value) > alphaThreshold ||
      Math.abs(themeTarget - uniforms.uThemeMix.value) > themeThreshold;

    if (shouldContinue) {
      rafId = window.requestAnimationFrame(tick);
      return;
    }

    rafId = 0;
  };

  const handleResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    if (animated) {
      return;
    }

    renderFrame();
  };

  const handlePointerMove = (event) => {
    pointerTarget.set(
      event.clientX / Math.max(window.innerWidth, 1),
      1 - event.clientY / Math.max(window.innerHeight, 1)
    );

    if (!animated) {
      startLoop();
    }
  };

  const handlePointerLeave = () => {
    pointerTarget.set(0.5, 0.5);

    if (!animated) {
      startLoop();
    }
  };

  window.addEventListener("resize", handleResize, false);

  const addPointerListeners = () => {
    if (pointerListenersAttached) {
      return;
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave, false);
    pointerListenersAttached = true;
  };

  const removePointerListeners = () => {
    if (!pointerListenersAttached) {
      return;
    }

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerleave", handlePointerLeave, false);
    pointerListenersAttached = false;
  };

  addPointerListeners();
  startLoop();

  return {
    setActive(nextActive) {
      active = nextActive;
      startLoop();
    },
    setInteractive(nextInteractive) {
      interactive = nextInteractive;

      if (interactive) {
        addPointerListeners();
        return;
      }

      removePointerListeners();
      pointerTarget.set(0.5, 0.5);
      startLoop();
    },
    setAnimated(nextAnimated) {
      animated = nextAnimated;

      if (animated) {
        startLoop();
        return;
      }

      stopLoop();
      startLoop();
    },
    setTheme(nextTheme) {
      themeTarget = nextTheme === "light" ? 1 : 0;
      startLoop();
    },
    destroy() {
      destroyed = true;
      window.removeEventListener("resize", handleResize, false);
      removePointerListeners();

      stopLoop();

      material.dispose();
      mesh.geometry.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
