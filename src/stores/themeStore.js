import { reactive } from "vue";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const SOLAR_CACHE_KEY = "haiku.solarTheme.cache.v1";
const USER_THEME_OVERRIDE_KEY = "haiku.userThemeOverride.v1";
const DEFAULT_VIETNAM_LOCATION = {
  latitude: 21.0285,
  longitude: 105.8542,
  label: "Hà Nội, Việt Nam",
  source: "fallback",
};

const state = reactive({
  theme: "dark",
  appliedTheme: "dark",
  ready: false,
  sunriseAt: "",
  sunsetAt: "",
  locationLabel: DEFAULT_VIETNAM_LOCATION.label,
  locationSource: DEFAULT_VIETNAM_LOCATION.source,
  userThemeOverride: null,
});

let initPromise = null;
let refreshTimer = 0;
let routeThemeOverride = null;

function applyDocumentTheme(theme) {
  state.appliedTheme = theme;

  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  if (document.body) {
    document.body.dataset.theme = theme;
  }
}

function syncAppliedTheme() {
  applyDocumentTheme(state.userThemeOverride || routeThemeOverride || state.theme);
}

function loadUserThemeOverride() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(USER_THEME_OVERRIDE_KEY);
    if (raw === "dark" || raw === "light") {
      return raw;
    }
  } catch (_error) {
    // Ignore storage failures.
  }

  return null;
}

function saveUserThemeOverride(theme) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!theme) {
      window.localStorage.removeItem(USER_THEME_OVERRIDE_KEY);
      return;
    }

    window.localStorage.setItem(USER_THEME_OVERRIDE_KEY, theme);
  } catch (_error) {
    // Ignore storage failures.
  }
}

function loadSolarCache() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SOLAR_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.dateKey ||
      !parsed.sunriseAt ||
      !parsed.sunsetAt ||
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch (_error) {
    return null;
  }
}

function saveSolarCache(payload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SOLAR_CACHE_KEY, JSON.stringify(payload));
  } catch (_error) {
    // Ignore storage failures.
  }
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function coordinatesMatch(a, b) {
  return roundCoordinate(a.latitude) === roundCoordinate(b.latitude) &&
    roundCoordinate(a.longitude) === roundCoordinate(b.longitude);
}

function scheduleRefresh(sunriseAt, sunsetAt) {
  if (typeof window === "undefined") {
    return;
  }

  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  const now = Date.now();
  const sunrise = sunriseAt ? new Date(sunriseAt).getTime() : 0;
  const sunset = sunsetAt ? new Date(sunsetAt).getTime() : 0;
  const tomorrow = new Date();
  tomorrow.setHours(24, 5, 0, 0);

  let nextUpdateAt = tomorrow.getTime();

  if (sunrise && now < sunrise) {
    nextUpdateAt = sunrise + 1000;
  } else if (sunset && now < sunset) {
    nextUpdateAt = sunset + 1000;
  }

  const delay = Math.max(60_000, nextUpdateAt - now);
  refreshTimer = window.setTimeout(() => {
    refreshTheme().catch((error) => {
      console.error("Không cập nhật được solar theme", error);
    });
  }, delay);
}

function deriveThemeFromSolar(sunriseAt, sunsetAt, now = new Date()) {
  const sunrise = sunriseAt ? new Date(sunriseAt).getTime() : 0;
  const sunset = sunsetAt ? new Date(sunsetAt).getTime() : 0;
  const current = now.getTime();

  if (!sunrise || !sunset) {
    const hour = now.getHours();
    return hour >= 6 && hour < 18
      ? "light"
      : "dark";
  }

  return current >= sunrise && current < sunset ? "light" : "dark";
}

async function resolveLocation() {
  const cached = loadSolarCache();
  if (cached?.locationSource === "device") {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      label: cached.locationLabel || "Vị trí thiết bị",
      source: "device",
    };
  }

  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return { ...DEFAULT_VIETNAM_LOCATION };
  }

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state !== "granted" || !navigator.geolocation) {
      return { ...DEFAULT_VIETNAM_LOCATION };
    }

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 3500,
        maximumAge: 6 * 60 * 60 * 1000,
      });
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      label: "Vị trí thiết bị",
      source: "device",
    };
  } catch (_error) {
    return { ...DEFAULT_VIETNAM_LOCATION };
  }
}

async function fetchSolarTimes(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "1",
  });

  const response = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const sunriseAt = data?.daily?.sunrise?.[0] || "";
  const sunsetAt = data?.daily?.sunset?.[0] || "";

  if (!sunriseAt || !sunsetAt) {
    throw new Error("Thiếu dữ liệu sunrise/sunset");
  }

  return {
    sunriseAt,
    sunsetAt,
    timezone: data?.timezone || "Asia/Ho_Chi_Minh",
  };
}

function hydrateCachedTheme() {
  const cached = loadSolarCache();
  state.userThemeOverride = loadUserThemeOverride();

  if (!cached) {
    syncAppliedTheme();
    return;
  }

  state.sunriseAt = cached.sunriseAt;
  state.sunsetAt = cached.sunsetAt;
  state.locationLabel = cached.locationLabel || DEFAULT_VIETNAM_LOCATION.label;
  state.locationSource = cached.locationSource || DEFAULT_VIETNAM_LOCATION.source;
  state.theme = deriveThemeFromSolar(cached.sunriseAt, cached.sunsetAt);
  syncAppliedTheme();
}

async function refreshTheme() {
  const location = await resolveLocation();
  const cached = loadSolarCache();
  const dateKey = getDateKey();

  let solar;
  if (cached?.dateKey === dateKey && coordinatesMatch(cached, location)) {
    solar = {
      sunriseAt: cached.sunriseAt,
      sunsetAt: cached.sunsetAt,
    };
  } else {
    solar = await fetchSolarTimes(location);
    saveSolarCache({
      dateKey,
      latitude: location.latitude,
      longitude: location.longitude,
      locationLabel: location.label,
      locationSource: location.source,
      sunriseAt: solar.sunriseAt,
      sunsetAt: solar.sunsetAt,
    });
  }

  state.sunriseAt = solar.sunriseAt;
  state.sunsetAt = solar.sunsetAt;
  state.locationLabel = location.label;
  state.locationSource = location.source;
  state.theme = deriveThemeFromSolar(solar.sunriseAt, solar.sunsetAt);
  state.ready = true;
  syncAppliedTheme();
  scheduleRefresh(solar.sunriseAt, solar.sunsetAt);
}

function ensureInitialized() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!state.ready) {
    hydrateCachedTheme();
  }

  if (!initPromise) {
    initPromise = refreshTheme().catch((error) => {
      console.error("Không khởi tạo được solar theme", error);
      state.ready = true;
      syncAppliedTheme();
    });
  }

  return initPromise;
}

function setRouteThemeOverride(theme = null) {
  routeThemeOverride = theme;
  syncAppliedTheme();
}

function setUserThemeOverride(theme = null) {
  state.userThemeOverride = theme;
  saveUserThemeOverride(theme);
  syncAppliedTheme();
}

function cycleThemeOverride() {
  if (state.userThemeOverride === null) {
    setUserThemeOverride("dark");
    return;
  }

  if (state.userThemeOverride === "dark") {
    setUserThemeOverride("light");
    return;
  }

  setUserThemeOverride(null);
}

function setThemeOverride(theme = null) {
  routeThemeOverride = theme;
  syncAppliedTheme();
}

function destroy() {
  if (typeof window !== "undefined" && refreshTimer) {
    window.clearTimeout(refreshTimer);
  }
  refreshTimer = 0;
  initPromise = null;
}

export default {
  state,
  hydrateCachedTheme,
  ensureInitialized,
  refreshTheme,
  setRouteThemeOverride,
  setUserThemeOverride,
  cycleThemeOverride,
  setThemeOverride,
  destroy,
};
