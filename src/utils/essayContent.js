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

function normalizeRichEmbedAttributes(html = "") {
  if (typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (/^\s*javascript:/i.test(href)) {
      link.removeAttribute("href");
      return;
    }

    if (/^https?:\/\//i.test(href)) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  });

  template.content.querySelectorAll("iframe").forEach((iframe) => {
    const src = iframe.getAttribute("src") || "";
    let safeSrc = "";

    try {
      const url = new URL(src);
      if (url.protocol === "http:" || url.protocol === "https:") {
        safeSrc = url.toString();
      }
    } catch (_error) {
      safeSrc = "";
    }

    if (!safeSrc) {
      iframe.remove();
      return;
    }

    [...iframe.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) || attribute.name === "srcdoc") {
        iframe.removeAttribute(attribute.name);
      }
    });

    iframe.setAttribute("src", safeSrc);
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    iframe.setAttribute(
      "sandbox",
      "allow-same-origin allow-scripts allow-popups allow-presentation"
    );
    iframe.setAttribute(
      "allow",
      iframe.getAttribute("allow") ||
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    iframe.setAttribute("allowfullscreen", "");
  });

  return template.innerHTML;
}

export function sanitizeHaikuOtherHtml(value = "") {
  const html = DOMPurify.sanitize(normalizeEssayBodyHtml(value), {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "loading",
      "rel",
      "referrerpolicy",
      "sandbox",
      "src",
      "target",
    ],
    FORBID_ATTR: ["srcdoc"],
  });

  return normalizeRichEmbedAttributes(html);
}

export function stripEssayText(value = "") {
  return sanitizeEssayHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHaikuOtherText(value = "") {
  return sanitizeHaikuOtherHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasHaikuOtherContent(value = "") {
  const html = sanitizeHaikuOtherHtml(value);
  return Boolean(stripHaikuOtherText(html) || /<(iframe|img)\b/i.test(html));
}

export function excerptEssayContent(value = "", maxLength = 180) {
  const normalized = stripEssayText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
