let threeModulePromise = null;

const SKY_KEYFRAMES = [
  {
    hour: 5,
    horizon: [0.30, 0.45, 0.75],
    zenith: [0.884, 0.804, 0.756],
    glow: [1.0, 0.895, 0.77],
  },
  {
    hour: 6,
    horizon: [0.30, 0.45, 0.75],
    zenith: [0.82, 0.845, 0.875],
    glow: [1.0, 0.995, 0.985],
  },
  {
    hour: 9,
    horizon: [0.24, 0.28, 0.36],
    zenith: [0.82, 0.845, 0.875],
    glow: [1.0, 0.995, 0.985],
  },
  {
    hour: 12,
    horizon: [0.24, 0.28, 0.36],
    zenith: [0.884, 0.804, 0.756],
    glow: [1.0, 0.895, 0.77],
  },
  {
    hour: 15,
    horizon: [0.986, 0.942, 0.892],
    zenith: [0.884, 0.804, 0.756],
    glow: [1.0, 0.895, 0.77],
  },
  {
    hour: 17,
    horizon: [0.90, 0.72, 0.62],
    zenith: [0.52, 0.40, 0.38],
    glow: [0.92, 0.50, 0.30],
  },
  {
    hour: 18,
    horizon: [0.90, 0.72, 0.62],
    zenith: [0.52, 0.40, 0.38],
    glow: [0.92, 0.50, 0.30],
  },
  {
    hour: 19,
    horizon: [0.24, 0.28, 0.36],
    zenith: [0.52, 0.40, 0.38],
    glow: [0.92, 0.50, 0.30],
  },
];

function loadThree() {
  if (!threeModulePromise) {
    threeModulePromise = import("three");
  }

  return threeModulePromise;
}

function smoothstep01(value) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped * clamped * (3 - (2 * clamped));
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function lerpVec3(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function resolveSkyPalette(localHour) {
  const normalizedHour = ((localHour % 24) + 24) % 24;

  for (let index = 0; index < SKY_KEYFRAMES.length; index += 1) {
    const current = SKY_KEYFRAMES[index];
    const next = SKY_KEYFRAMES[(index + 1) % SKY_KEYFRAMES.length];
    const startHour = current.hour;
    const rawEndHour = next.hour <= startHour ? next.hour + 24 : next.hour;
    const candidateHour = normalizedHour < startHour ? normalizedHour + 24 : normalizedHour;

    if (candidateHour >= startHour && candidateHour < rawEndHour) {
      const t = smoothstep01((candidateHour - startHour) / (rawEndHour - startHour));

      return {
        horizon: lerpVec3(current.horizon, next.horizon, t),
        zenith: lerpVec3(current.zenith, next.zenith, t),
        glow: lerpVec3(current.glow, next.glow, t),
      };
    }
  }

  const fallback = SKY_KEYFRAMES[0];
  return {
    horizon: fallback.horizon,
    zenith: fallback.zenith,
    glow: fallback.glow,
  };
}

export async function initLightBackground({
  mount,
  prefersReducedMotion = false,
} = {}) {
  if (!mount || typeof window === "undefined") {
    return {
      setActive: () => {},
      setInteractive: () => {},
      setAnimated: () => {},
      setTheme: () => {},
      destroy: () => {},
    };
  }

  const THREE = await loadThree();

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, {
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
    opacity: "1",
    transition: "opacity 260ms ease",
  });
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uTime: { value: 0 },
    uAlpha: { value: 1 },
    uSkyHorizon: { value: new THREE.Color(0.24, 0.28, 0.36) },
    uSkyZenith: { value: new THREE.Color(0.884, 0.804, 0.756) },
    uSkyGlow: { value: new THREE.Color(1, 0.895, 0.77) },
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

      uniform vec2 uResolution;
      uniform float uTime;
      uniform float uAlpha;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyGlow;

      const int NUM_STEPS = 8;
      const int ITER_GEOMETRY = 3;
      const int ITER_FRAGMENT = 5;
      const float PI = 3.14159265359;
      const float SEA_HEIGHT = 0.72;
      const float SEA_CHOPPY = 1.7;
      const float SEA_SPEED = 0.46;
      const float SEA_FREQ = 0.135;
      const vec3 SEA_BASE = vec3(0.86, 0.875, 0.895);
      const vec3 SEA_WATER_COLOR = vec3(0.87, 0.91, 0.965);
      const mat2 OCTAVE_M = mat2(1.6, 1.2, -1.2, 1.6);

      mat3 fromEuler(vec3 ang) {
        vec2 a1 = vec2(sin(ang.x), cos(ang.x));
        vec2 a2 = vec2(sin(ang.y), cos(ang.y));
        vec2 a3 = vec2(sin(ang.z), cos(ang.z));
        mat3 m;
        m[0] = vec3(
          a1.y * a3.y + a1.x * a2.x * a3.x,
          a1.y * a2.x * a3.x + a3.y * a1.x,
          -a2.y * a3.x
        );
        m[1] = vec3(-a2.y * a1.x, a1.y * a2.y, a2.x);
        m[2] = vec3(
          a3.y * a1.x * a2.x + a1.y * a3.x,
          a1.x * a3.x - a1.y * a3.y * a2.x,
          a2.y * a3.y
        );
        return m;
      }

      float hash(vec2 p) {
        float h = dot(p, vec2(127.1, 311.7));
        return fract(sin(h) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);

        return -1.0 + 2.0 * mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float diffuse(vec3 n, vec3 l, float p) {
        return pow(dot(n, l) * 0.4 + 0.6, p);
      }

      float specular(vec3 n, vec3 l, vec3 e, float s) {
        float nrm = (s + 8.0) / (PI * 8.0);
        return pow(max(dot(reflect(e, n), l), 0.0), s) * nrm;
      }

      vec3 getSkyColor(vec3 e) {
        e.y = max(e.y, 0.0);
        vec3 sky;
        sky.x = pow(1.0 - e.y, 1.8);
        sky.y = 1.0 - e.y;
        sky.z = 0.92 + (1.0 - e.y) * 0.12;
        vec3 horizon = uSkyHorizon;
        vec3 zenith = uSkyZenith;
        vec3 glow = uSkyGlow * pow(max(1.0 - e.y, 0.0), 8.0) * 0.14;
        float horizonBand = pow(max(1.0 - e.y, 0.0), 14.0);
        vec3 horizonFlare = uSkyGlow * horizonBand * 0.12;
        return mix(horizon, zenith, clamp(sky, 0.0, 1.0)) + glow + horizonFlare;
      }

      float seaOctave(vec2 uv, float choppy) {
        uv += noise(uv);
        vec2 wv = 1.0 - abs(sin(uv));
        vec2 swv = abs(cos(uv));
        wv = mix(wv, swv, wv);
        return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
      }

      float map(vec3 p) {
        float freq = SEA_FREQ;
        float amp = SEA_HEIGHT;
        float choppy = SEA_CHOPPY;
        float seaTime = uTime * SEA_SPEED;
        vec2 uv = p.xz;
        uv.x *= 0.75;

        float h = 0.0;
        for (int i = 0; i < ITER_GEOMETRY; i++) {
          float d = seaOctave((uv + seaTime) * freq, choppy);
          d += seaOctave((uv - seaTime) * freq, choppy);
          h += d * amp;
          uv *= OCTAVE_M;
          freq *= 1.9;
          amp *= 0.22;
          choppy = mix(choppy, 1.0, 0.2);
        }

        return p.y - h;
      }

      float mapDetailed(vec3 p) {
        float freq = SEA_FREQ;
        float amp = SEA_HEIGHT;
        float choppy = SEA_CHOPPY;
        float seaTime = uTime * SEA_SPEED;
        vec2 uv = p.xz;
        uv.x *= 0.75;

        float h = 0.0;
        for (int i = 0; i < ITER_FRAGMENT; i++) {
          float d = seaOctave((uv + seaTime) * freq, choppy);
          d += seaOctave((uv - seaTime) * freq, choppy);
          h += d * amp;
          uv *= OCTAVE_M;
          freq *= 1.9;
          amp *= 0.22;
          choppy = mix(choppy, 1.0, 0.2);
        }

        return p.y - h;
      }

      vec3 getSeaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist) {
        float fresnel = 1.0 - max(dot(n, -eye), 0.0);
        fresnel = pow(fresnel, 2.6) * 0.88;

        vec3 reflected = getSkyColor(reflect(eye, n * 0.62));
        vec3 refracted = SEA_BASE + diffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.18;
        vec3 color = mix(refracted, reflected, fresnel);

        float atten = max(1.0 - dot(dist, dist) * 0.0012, 0.0);
        float shadowBand = pow(clamp(1.0 - n.y, 0.0, 1.0), 1.4);
        color += SEA_WATER_COLOR * (p.y - SEA_HEIGHT) * 0.22 * atten;
        color += reflected * fresnel * 0.18;
        color += vec3(specular(n, l, eye, 120.0)) * 1.3;
        color -= vec3(0.12, 0.12, 0.12) * shadowBand * 0.2;

        return color;
      }

      vec3 getNormal(vec3 p, float eps) {
        vec3 n;
        n.y = mapDetailed(p);
        n.x = mapDetailed(vec3(p.x + eps, p.y, p.z)) - n.y;
        n.z = mapDetailed(vec3(p.x, p.y, p.z + eps)) - n.y;
        n.y = eps;
        return normalize(n);
      }

      float heightMapTracing(vec3 ori, vec3 dir, out vec3 p) {
        float tm = 0.0;
        float tx = 1000.0;
        float hx = map(ori + dir * tx);
        if (hx > 0.0) {
          p = ori + dir * tx;
          return tx;
        }

        float hm = map(ori + dir * tm);
        float tmid = 0.0;
        for (int i = 0; i < NUM_STEPS; i++) {
          tmid = mix(tm, tx, hm / (hm - hx));
          p = ori + dir * tmid;
          float hmid = map(p);
          if (hmid < 0.0) {
            tx = tmid;
            hx = hmid;
          } else {
            tm = tmid;
            hm = hmid;
          }
        }

        return tmid;
      }

      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= uResolution.x / max(uResolution.y, 1.0);
        float epsNorm = 0.12 / max(uResolution.x, 1.0);

        vec3 ang = vec3(0.012, 0.34, 0.758);
        vec3 ori = vec3(0.0, 3.3, uTime * 0.014);
        vec3 dir = normalize(vec3(uv.xy, -2.0));
        dir.z += length(uv) * 0.0715;
        dir = fromEuler(ang) * normalize(dir);

        vec3 p;
        heightMapTracing(ori, dir, p);
        vec3 dist = p - ori;
        vec3 n = getNormal(p, dot(dist, dist) * epsNorm);
        vec3 light = normalize(vec3(0.1, 1.0, 0.8));

        vec3 color = mix(
          getSkyColor(dir),
          getSeaColor(p, n, light, dir, dist),
          pow(smoothstep(0.04, -0.72, dir.y), 0.18)
        );

        float crest = pow(clamp(1.0 - n.y, 0.0, 1.0), 2.0);
        color += vec3(1.0, 1.0, 0.995) * crest * 0.16;
        color = pow(color, vec3(0.88));
        color += (hash(gl_FragCoord.xy) - 0.5) * 0.008;

        gl_FragColor = vec4(color, uAlpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  let active = true;
  let animated = !prefersReducedMotion;
  let rafId = 0;
  let timeModeIntervalId = 0;
  let lastFrameTime = performance.now();
  const frameInterval = 1000 / 24;

  const updateSkyPalette = () => {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const palette = resolveSkyPalette(hour);
    uniforms.uSkyHorizon.value.setRGB(...palette.horizon);
    uniforms.uSkyZenith.value.setRGB(...palette.zenith);
    uniforms.uSkyGlow.value.setRGB(...palette.glow);
  };

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

  const tick = (now) => {
    if (!active || !animated) {
      rafId = 0;
      return;
    }

    if (now - lastFrameTime >= frameInterval) {
      const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      uniforms.uTime.value += delta;
      renderFrame();
    }

    rafId = window.requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (rafId || !active || !animated) {
      return;
    }

    lastFrameTime = performance.now();
    rafId = window.requestAnimationFrame(tick);
  };

  const handleResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    renderFrame();
  };

  updateSkyPalette();
  window.addEventListener("resize", handleResize, false);
  timeModeIntervalId = window.setInterval(() => {
    updateSkyPalette();
    if (active) {
      renderFrame();
    }
  }, 60000);
  renderFrame();
  startLoop();

  return {
    setActive(nextActive) {
      active = nextActive;
      uniforms.uAlpha.value = nextActive ? 1 : 0;
      renderer.domElement.style.opacity = nextActive ? "1" : "0";

      if (nextActive) {
        renderFrame();
        startLoop();
        return;
      }

      stopLoop();
    },
    setInteractive() {},
    setAnimated(nextAnimated) {
      animated = !!nextAnimated && !prefersReducedMotion;

      if (animated) {
        renderFrame();
        startLoop();
        return;
      }

      stopLoop();
      renderFrame();
    },
    setTheme() {},
    destroy() {
      stopLoop();
      if (timeModeIntervalId) {
        window.clearInterval(timeModeIntervalId);
        timeModeIntervalId = 0;
      }
      window.removeEventListener("resize", handleResize, false);
      material.dispose();
      mesh.geometry.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
