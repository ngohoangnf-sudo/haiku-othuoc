import DOMPurify from "dompurify";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeHtml(value = "") {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

export function normalizeEssayBodyHtml(value = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  if (looksLikeHtml(source)) {
    return source;
  }

  return source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) =>
      `<p>${paragraph
        .split(/\r?\n/)
        .map((line) => escapeHtml(line))
        .join("<br />")}</p>`
    )
    .join("");
}

export function sanitizeEssayHtml(value = "") {
  return DOMPurify.sanitize(normalizeEssayBodyHtml(value), {
    USE_PROFILES: { html: true },
  });
}

export function stripEssayText(value = "") {
  return sanitizeEssayHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptEssayContent(value = "", maxLength = 180) {
  const normalized = stripEssayText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
