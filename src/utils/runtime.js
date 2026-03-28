function normalizeBase(value, fallback) {
  const base = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function encodePathSegments(value = "") {
  return String(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export const API_BASE = normalizeBase(import.meta.env?.VITE_API_BASE, "/api");
export const MEDIA_BASE = normalizeBase(import.meta.env?.VITE_MEDIA_BASE, "/media/local");

export function resolveMediaUrl(image) {
  if (!image) return "";
  if (
    image.startsWith("http://") ||
    image.startsWith("https://") ||
    image.startsWith("data:") ||
    image.startsWith("blob:")
  ) {
    return image;
  }

  return `${MEDIA_BASE}/${encodePathSegments(image)}`;
}
