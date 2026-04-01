const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { loadEnvFile } = require("./loadEnv");
const {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} = require("./auth");

loadEnvFile();

const db = require("./db");

const PORT = process.env.PORT || 4000;
const mediaRoutePrefix = normalizeRoutePrefix(process.env.MEDIA_ROUTE_PREFIX || "/media");
const localMediaRoot = path.resolve(__dirname, "..", "src", "assets");
const SESSION_TTL_MS = resolveSessionTtlMs(process.env.SESSION_TTL_DAYS);
const isProduction = process.env.NODE_ENV === "production";
const ENABLE_CONTENT_SEED = resolveBooleanEnv(
  process.env.ENABLE_CONTENT_SEED,
  !isProduction
);
const LEGACY_CONTENT_USERNAME = process.env.LEGACY_CONTENT_USERNAME || "ngohoang";
const S3_UPLOAD_BUCKET = String(process.env.S3_UPLOAD_BUCKET || "").trim();
const S3_UPLOAD_REGION = String(process.env.S3_UPLOAD_REGION || process.env.AWS_REGION || "").trim();
const S3_UPLOAD_PREFIX = normalizeObjectKeyPrefix(process.env.S3_UPLOAD_PREFIX || "haiku-image");
const MEDIA_PUBLIC_BASE = normalizeBaseUrl(process.env.MEDIA_PUBLIC_BASE || "");
const MEDIA_UPLOAD_MAX_BYTES = resolveMediaUploadMaxBytes(process.env.MEDIA_UPLOAD_MAX_MB);
const MEDIA_UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DEFAULT_BOOTSTRAP_ADMIN = {
  username: process.env.BOOTSTRAP_ADMIN_USERNAME || "admin",
  password:
    process.env.BOOTSTRAP_ADMIN_PASSWORD || (isProduction ? "" : "admin123456"),
  displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || "Administrator",
};
let s3UploadClient = null;
const corsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const app = express();

app.set("trust proxy", true);
app.use(
  cors(
    corsOrigins.length
      ? {
          origin: corsOrigins,
          credentials: true,
        }
      : undefined
  )
);
app.use(express.json({ limit: "8mb" }));
app.use(authenticateRequest);
app.use(
  `${mediaRoutePrefix}/local`,
  (req, res, next) => {
    res.setHeader("X-Haiku-Media-Route", "local-file");
    const assetPath = decodeURIComponent(req.path || "").replace(/^\/+/, "");

    if (!assetPath) {
      return res.status(404).json({ message: "Không tìm thấy ảnh" });
    }

    const candidates = resolveLocalMediaCandidates(assetPath);

    const tryNext = (index = 0) => {
      const candidatePath = candidates[index];
      if (!candidatePath) {
        return res.status(404).json({ message: "Không tìm thấy ảnh" });
      }

      const rootPrefix = `${localMediaRoot}${path.sep}`;
      if (candidatePath !== localMediaRoot && !candidatePath.startsWith(rootPrefix)) {
        return res.status(403).json({ message: "Đường dẫn ảnh không hợp lệ" });
      }

      res.sendFile(candidatePath, (err) => {
        if (!err) {
          return;
        }

        if (err.code === "ENOENT" || err.statusCode === 404) {
          if (res.headersSent) {
            return;
          }
          tryNext(index + 1);
          return;
        }

        next(err);
      });
    };

    tryNext();
  }
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/auth/session", (req, res) => {
  if (!req.auth.user) {
    return res.json({
      authenticated: false,
      role: "viewer",
      user: null,
    });
  }

  res.json({
    authenticated: true,
    role: req.auth.user.role,
    user: sanitizeUser(req.auth.user),
  });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!username || !password) {
      return res.status(400).json({ message: "Tên đăng nhập và mật khẩu là bắt buộc" });
    }

    const user = await db.getUserByUsername(username);
    const passwordValid = user?.passwordHash ? verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordValid) {
      return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "Tài khoản hiện đang bị vô hiệu hóa" });
    }

    const now = new Date().toISOString();
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);

    await db.createSession({
      id: `session-${randomUUID()}`,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      createdAt: now,
      userAgent: getUserAgent(req),
      ipAddress: getRequestIp(req),
    });
    await db.updateUser(user.id, {
      lastLoginAt: now,
      updatedAt: now,
    });
    await logActivity(req, {
      actorUserId: user.id,
      action: "auth.login",
      resourceType: "session",
      resourceId: tokenHash,
      details: { username: user.username, role: user.role },
    });

    res.json({
      token,
      user: sanitizeUser({
        ...user,
        lastLoginAt: now,
      }),
    });
  } catch (err) {
    console.error("Lỗi đăng nhập", err);
    res.status(500).json({ message: "Không đăng nhập được" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    if (!req.auth.tokenHash) {
      return res.status(204).end();
    }

    await db.revokeSessionByTokenHash(req.auth.tokenHash);
    if (req.auth.user) {
      await logActivity(req, {
        actorUserId: req.auth.user.id,
        action: "auth.logout",
        resourceType: "session",
        resourceId: req.auth.tokenHash,
        details: { username: req.auth.user.username, role: req.auth.user.role },
      });
    }

    res.status(204).end();
  } catch (err) {
    console.error("Lỗi đăng xuất", err);
    res.status(500).json({ message: "Không đăng xuất được" });
  }
});

app.get("/api/me", requireEditor, async (req, res) => {
  try {
    const user = await db.getUserById(req.auth.user.id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    res.json(sanitizeUser(user));
  } catch (err) {
    console.error("Lỗi lấy hồ sơ cá nhân", err);
    res.status(500).json({ message: "Không lấy được thông tin cá nhân" });
  }
});

app.patch("/api/me", requireEditor, async (req, res) => {
  try {
    const existing = await db.getUserById(req.auth.user.id);
    if (!existing) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    const updates = {};
    if (typeof req.body?.displayName === "string") {
      const displayName = req.body.displayName.trim();
      if (!displayName) {
        return res.status(400).json({ message: "Tên hiển thị không được để trống" });
      }
      updates.displayName = displayName;
    }

    if (typeof req.body?.password === "string" && req.body.password) {
      if (req.body.password.length < 8) {
        return res.status(400).json({ message: "Mật khẩu cần ít nhất 8 ký tự" });
      }
      updates.passwordHash = hashPassword(req.body.password);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "Không có thay đổi nào để cập nhật" });
    }

    const updated = await db.updateUser(existing.id, updates);
    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "user.profile.update",
      resourceType: "user",
      resourceId: existing.id,
      details: {
        changed: Object.keys(updates).filter((key) => key !== "passwordHash"),
        passwordChanged: Boolean(updates.passwordHash),
      },
    });

    res.json(sanitizeUser(updated));
  } catch (err) {
    console.error("Lỗi cập nhật hồ sơ cá nhân", err);
    res.status(500).json({ message: "Không cập nhật được thông tin cá nhân" });
  }
});

app.get("/api/me/activity", requireEditor, async (req, res) => {
  try {
    const activity = await db.getActivityLogs(req.query.limit, req.auth.user.id);
    res.json(activity);
  } catch (err) {
    console.error("Lỗi lấy nhật ký cá nhân", err);
    res.status(500).json({ message: "Không lấy được nhật ký hoạt động của bạn" });
  }
});

app.post("/api/media/presign", async (req, res) => {
  try {
    if (!S3_UPLOAD_BUCKET || !S3_UPLOAD_REGION || !MEDIA_PUBLIC_BASE) {
      return res.status(503).json({
        message: "Media upload chưa được cấu hình trên máy chủ.",
      });
    }

    const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
    const contentType = typeof req.body?.contentType === "string" ? req.body.contentType.trim() : "";
    const scope = normalizeMediaUploadScope(req.body?.scope);
    const size = Number(req.body?.size || 0);
    const canManageContent = ["editor", "admin"].includes(req.auth.role);
    const isSubmissionScope = scope.startsWith("submissions/");

    if (!canManageContent && !isSubmissionScope) {
      return res.status(req.auth.user ? 403 : 401).json({
        message: req.auth.user
          ? "Bạn không có quyền upload media cho nội dung này."
          : "Cần đăng nhập Editor/Admin để upload media cho nội dung này.",
      });
    }

    if (!fileName || !contentType) {
      return res.status(400).json({ message: "Thiếu thông tin file upload." });
    }

    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ message: "Chỉ hỗ trợ upload file ảnh." });
    }

    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ message: "Kích thước file không hợp lệ." });
    }

    if (size > MEDIA_UPLOAD_MAX_BYTES) {
      return res.status(400).json({
        message: `Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn ${Math.round(MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`,
      });
    }

    const upload = await createPresignedMediaUpload({
      fileName,
      contentType,
      scope,
      actorUserId: req.auth.user?.id || null,
    });

    res.json(upload);
  } catch (err) {
    console.error("Lỗi tạo presigned media upload", err);
    res.status(500).json({ message: "Không tạo được link upload ảnh." });
  }
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  try {
    const users = await db.getUsers();
    res.json(users);
  } catch (err) {
    console.error("Lỗi lấy users", err);
    res.status(500).json({ message: "Không lấy được danh sách tài khoản" });
  }
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const displayName =
      typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
    const role = typeof req.body?.role === "string" ? req.body.role.trim() : "editor";

    if (!username || !password) {
      return res.status(400).json({ message: "Tên đăng nhập và mật khẩu là bắt buộc" });
    }

    if (!["admin", "editor"].includes(role)) {
      return res.status(400).json({ message: "Role không hợp lệ" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Mật khẩu cần ít nhất 8 ký tự" });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Tên đăng nhập đã tồn tại" });
    }

    const created = await db.createUser({
      id: `user-${randomUUID()}`,
      username,
      displayName: displayName || username,
      passwordHash: hashPassword(password),
      role,
      status: "active",
    });

    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "admin.user.create",
      resourceType: "user",
      resourceId: created.id,
      details: { username: created.username, role: created.role },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("Lỗi tạo user", err);
    res.status(500).json({ message: "Không tạo được tài khoản" });
  }
});

app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const existing = await db.getUserById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    const updates = {};
    if (typeof req.body?.displayName === "string") {
      updates.displayName = req.body.displayName.trim() || existing.displayName;
    }
    if (typeof req.body?.role === "string") {
      if (!["admin", "editor"].includes(req.body.role.trim())) {
        return res.status(400).json({ message: "Role không hợp lệ" });
      }
      updates.role = req.body.role.trim();
    }
    if (typeof req.body?.status === "string") {
      if (!["active", "disabled"].includes(req.body.status.trim())) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      updates.status = req.body.status.trim();
    }
    if (typeof req.body?.password === "string" && req.body.password) {
      if (req.body.password.length < 8) {
        return res.status(400).json({ message: "Mật khẩu cần ít nhất 8 ký tự" });
      }
      updates.passwordHash = hashPassword(req.body.password);
    }

    const updated = await db.updateUser(existing.id, updates);
    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "admin.user.update",
      resourceType: "user",
      resourceId: existing.id,
      details: {
        changed: Object.keys(updates).filter((key) => key !== "passwordHash"),
        role: updated?.role,
        status: updated?.status,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("Lỗi cập nhật user", err);
    res.status(500).json({ message: "Không cập nhật được tài khoản" });
  }
});

app.get("/api/admin/activity", requireAdmin, async (req, res) => {
  try {
    const activity = await db.getActivityLogs(req.query.limit);
    res.json(activity);
  } catch (err) {
    console.error("Lỗi lấy activity", err);
    res.status(500).json({ message: "Không lấy được nhật ký hoạt động" });
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    const requestedStatus = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const canManagePosts = ["editor", "admin"].includes(req.auth.role);
    const resolvedStatus =
      canManagePosts && requestedStatus === "all"
        ? null
        : requestedStatus && requestedStatus !== "all"
          ? requestedStatus
          : "published";
    const filters = {
      category: req.query.category,
      authorSlug: req.query.authorSlug,
      search: req.query.search,
      status: resolvedStatus,
    };
    const hasPagination =
      req.query.page !== undefined || req.query.pageSize !== undefined;

    if (hasPagination) {
      const pagedPosts = await db.getPagedPosts(filters, {
        page: req.query.page,
        pageSize: req.query.pageSize,
        seed: req.query.seed,
      });
      return res.json(pagedPosts);
    }

    const posts = await db.getAllPosts(filters);
    res.json(posts);
  } catch (err) {
    console.error("Lỗi lấy posts", err);
    res.status(500).json({ message: "Không lấy được danh sách bài viết" });
  }
});

app.get("/api/posts/random", async (_req, res) => {
  try {
    const post = await db.getRandomPostWithImage();
    if (!post) {
      return res.status(404).json({ message: "Không tìm thấy bài có ảnh" });
    }
    res.json(post);
  } catch (err) {
    console.error("Lỗi lấy bài ngẫu nhiên có ảnh", err);
    res.status(500).json({ message: "Không lấy được bài ngẫu nhiên" });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const post = await db.getPostById(req.params.id, {
      status: ["editor", "admin"].includes(req.auth.role) ? null : "published",
    });
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài" });
    res.json(post);
  } catch (err) {
    console.error("Lỗi lấy post", err);
    res.status(500).json({ message: "Không lấy được bài viết" });
  }
});

app.post("/api/posts", async (req, res) => {
  try {
    const input = req.body || {};
    const lines = Array.isArray(input.lines)
      ? input.lines.filter((l) => l && String(l).trim())
      : [];
    const canManagePosts = ["editor", "admin"].includes(req.auth.role);

    if (!lines.length) {
      return res.status(400).json({ message: "Cần ít nhất một dòng haiku" });
    }

    const now = new Date().toISOString();
    const status = canManagePosts
      ? normalizePoemStatus(input.status, "published")
      : "submitted";
    const post = {
      id: input.id || randomUUID(),
      title: typeof input.title === "string" ? input.title.trim() : "",
      author: input.author || "Vô danh",
      authorSlug: input.authorSlug || slugify(input.author || "vo-danh"),
      createdByUserId: canManagePosts ? req.auth.user.id : null,
      category: input.category || "vi",
      lines,
      summary: input.summary || "",
      image: input.image || "",
      status,
      publishedAt: status === "published" ? input.publishedAt || now.split("T")[0] : null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await db.insertPost(post);
    await logActivity(req, {
      actorUserId: req.auth.user?.id || null,
      action: canManagePosts ? "post.create" : "poem.submission.create",
      resourceType: "poem",
      resourceId: created.id,
      details: { title: created.title, category: created.category, status: created.status },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Lỗi tạo post", err);
    res.status(500).json({ message: "Không tạo được bài viết" });
  }
});

app.put("/api/posts/:id", requireEditor, async (req, res) => {
  try {
    const existing = await db.getPostById(req.params.id, { status: null });
    if (!existing) {
      return res.status(404).json({ message: "Không tìm thấy bài viết để cập nhật" });
    }

    const input = req.body || {};
    const lines = Array.isArray(input.lines)
      ? input.lines.filter((l) => l && String(l).trim())
      : existing.lines;
    const nextStatus = normalizePoemStatus(input.status, existing.status);

    if (!lines.length) {
      return res.status(400).json({ message: "Cần ít nhất một dòng haiku" });
    }

    const updated = await db.updatePost({
      ...existing,
      id: existing.id,
      title: typeof input.title === "string" ? input.title.trim() : existing.title,
      author: typeof input.author === "string" && input.author.trim() ? input.author.trim() : existing.author,
      authorSlug:
        input.authorSlug ||
        slugify(
          typeof input.author === "string" && input.author.trim()
            ? input.author
            : existing.author
        ),
      category: input.category || existing.category,
      lines,
      summary: typeof input.summary === "string" ? input.summary : existing.summary,
      image: typeof input.image === "string" ? input.image : existing.image,
      status: nextStatus,
      publishedAt:
        nextStatus === "published"
          ? input.publishedAt || existing.publishedAt || new Date().toISOString().split("T")[0]
          : null,
      updatedAt: new Date().toISOString(),
    });

    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "post.update",
      resourceType: "poem",
      resourceId: updated.id,
      details: { title: updated.title, category: updated.category },
    });
    res.json(updated);
  } catch (err) {
    console.error("Lỗi cập nhật post", err);
    res.status(500).json({ message: "Không cập nhật được bài viết" });
  }
});

app.delete("/api/posts/:id", requireEditor, async (req, res) => {
  try {
    const existing = await db.getPostById(req.params.id, { status: null });
    const deleted = await db.deletePost(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy bài viết để xóa" });
    }

    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "post.delete",
      resourceType: "poem",
      resourceId: req.params.id,
      details: { title: existing?.title || "", category: existing?.category || "" },
    });
    res.status(204).end();
  } catch (err) {
    console.error("Lỗi xóa post", err);
    res.status(500).json({ message: "Không xóa được bài viết" });
  }
});

app.get("/api/authors", async (_req, res) => {
  try {
    const authors = await db.getAuthors();
    res.json(authors);
  } catch (err) {
    console.error("Lỗi lấy authors", err);
    res.status(500).json({ message: "Không lấy được danh sách tác giả" });
  }
});

app.get("/api/essays", async (req, res) => {
  try {
    const requestedStatus = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const canManageEssays = ["editor", "admin"].includes(req.auth.role);
    const resolvedStatus =
      canManageEssays
        ? requestedStatus === "all"
          ? null
          : requestedStatus || "editable"
        : requestedStatus && requestedStatus !== "all"
          ? requestedStatus
          : "published";

    const filters = {
      authorSlug: req.query.authorSlug,
      kind: req.query.kind,
      tagSlug: req.query.tagSlug,
      status: resolvedStatus,
      search: req.query.search,
    };
    const hasPagination =
      req.query.page !== undefined || req.query.pageSize !== undefined;

    if (hasPagination) {
      const pagedEssays = await db.getPagedEssays(filters, {
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      return res.json(pagedEssays);
    }

    const essays = await db.getAllEssays(filters);
    res.json(essays);
  } catch (err) {
    console.error("Lỗi lấy essays", err);
    res.status(500).json({ message: "Không lấy được danh sách bài luận" });
  }
});

app.get("/api/essay-tags", async (req, res) => {
  try {
    const requestedStatus = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const canManageEssays = ["editor", "admin"].includes(req.auth.role);
    const resolvedStatus =
      canManageEssays
        ? requestedStatus === "all"
          ? null
          : requestedStatus || "editable"
        : requestedStatus && requestedStatus !== "all"
          ? requestedStatus
          : "published";

    const tags = await db.getEssayTags({
      kind: req.query.kind,
      status: resolvedStatus,
    });
    res.json(tags);
  } catch (err) {
    console.error("Lỗi lấy essay tags", err);
    res.status(500).json({ message: "Không lấy được danh sách tag bài luận" });
  }
});

app.get("/api/essays/:slug", async (req, res) => {
  try {
    const essay = await db.getEssayBySlug(req.params.slug, {
      status: ["editor", "admin"].includes(req.auth.role) ? null : "published",
    });
    if (!essay) {
      return res.status(404).json({ message: "Không tìm thấy bài luận" });
    }
    res.json(essay);
  } catch (err) {
    console.error("Lỗi lấy essay", err);
    res.status(500).json({ message: "Không lấy được bài luận" });
  }
});

app.post("/api/essays", async (req, res) => {
  try {
    const input = req.body || {};
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const canManageEssays = ["editor", "admin"].includes(req.auth.role);

    if (!title) {
      return res.status(400).json({ message: "Tiêu đề bài luận là bắt buộc" });
    }

    if (!body) {
      return res.status(400).json({ message: "Nội dung bài luận là bắt buộc" });
    }

    const now = new Date().toISOString();
    const status = canManageEssays
      ? normalizeEssayStatus(input.status, "published")
      : "submitted";
    const essay = {
      id: input.id || randomUUID(),
      slug: uniqueEssaySlug(title, input.slug),
      title,
      author: typeof input.author === "string" ? input.author.trim() : "",
      authorSlug: resolveAuthorSlug(input.authorSlug, input.author),
      createdByUserId: canManageEssays ? req.auth.user.id : null,
      kind: input.kind === "research" ? "research" : "commentary",
      summary: typeof input.summary === "string" ? input.summary.trim() : "",
      body,
      image: typeof input.image === "string" ? input.image.trim() : "",
      tags: normalizeEssayTags(input.tags),
      status,
      publishedAt: status === "published" ? input.publishedAt || now : null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await db.insertEssay(essay);
    await logActivity(req, {
      actorUserId: req.auth.user?.id || null,
      action: canManageEssays ? "essay.create" : "essay.submission.create",
      resourceType: "essay",
      resourceId: created.id,
      details: { title: created.title, slug: created.slug, status: created.status },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Lỗi tạo essay", err);
    res.status(500).json({ message: "Không tạo được bài luận" });
  }
});

app.put("/api/essays/:slug", requireEditor, async (req, res) => {
  try {
    const existing = await db.getEssayBySlug(req.params.slug, { status: null });
    if (!existing) {
      return res.status(404).json({ message: "Không tìm thấy bài luận để cập nhật" });
    }

    const input = req.body || {};
    const nextTitle =
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : existing.title;
    const nextBody =
      typeof input.body === "string" && input.body.trim()
        ? input.body.trim()
        : existing.body;
    const nextStatus = normalizeEssayStatus(input.status, existing.status);

    const updated = await db.updateEssay({
      ...existing,
      id: existing.id,
      slug: uniqueEssaySlug(nextTitle, input.slug || existing.slug, existing.id),
      title: nextTitle,
      author:
        typeof input.author === "string"
          ? input.author.trim()
          : existing.author,
      authorSlug:
        input.authorSlug !== undefined || input.author !== undefined
          ? resolveAuthorSlug(input.authorSlug, input.author)
          : existing.authorSlug,
      kind:
        input.kind === "research"
          ? "research"
          : input.kind === "commentary"
            ? "commentary"
            : existing.kind,
      summary:
        typeof input.summary === "string" ? input.summary.trim() : existing.summary,
      body: nextBody,
      image: typeof input.image === "string" ? input.image.trim() : existing.image,
      tags: input.tags !== undefined ? normalizeEssayTags(input.tags) : existing.tags,
      status: nextStatus,
      publishedAt:
        nextStatus === "published"
          ? input.publishedAt || existing.publishedAt || new Date().toISOString()
          : null,
      updatedAt: new Date().toISOString(),
    });

    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "essay.update",
      resourceType: "essay",
      resourceId: updated.id,
      details: { title: updated.title, slug: updated.slug },
    });
    res.json(updated);
  } catch (err) {
    console.error("Lỗi cập nhật essay", err);
    res.status(500).json({ message: "Không cập nhật được bài luận" });
  }
});

app.delete("/api/essays/:slug", requireEditor, async (req, res) => {
  try {
    const existing = await db.getEssayBySlug(req.params.slug, { status: null });
    if (!existing) {
      return res.status(404).json({ message: "Không tìm thấy bài luận để xóa" });
    }

    await db.deleteEssay(existing.id);
    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "essay.delete",
      resourceType: "essay",
      resourceId: existing.id,
      details: { title: existing.title, slug: existing.slug },
    });
    res.status(204).end();
  } catch (err) {
    console.error("Lỗi xóa essay", err);
    res.status(500).json({ message: "Không xóa được bài luận" });
  }
});

const SEED_POSTS = [
  {
    id: "seed-basho-1",
    title: "Gửi gió Edo",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Bỏ lên chiếc quạt nhỏ",
      "Từ Phú Sĩ gửi đi ngọn gió",
      "Một chút quà Edo",
    ],
    image: "seed/fuji.jpg",
    summary: "Haiku cổ điển của Basho, nhắc đến núi Phú Sĩ và Edo.",
    publishedAt: "2023-09-01",
    createdAt: "2023-09-01T00:00:00.000Z",
    updatedAt: "2023-09-01T00:00:00.000Z",
  },
  {
    id: "seed-shohaka-1",
    title: "Tia nắng cuối",
    author: "Shohaka",
    authorSlug: "shohaka",
    category: "jp",
    lines: ["Trong sương mờ bóng tối", "Tia nắng cuối lung linh"],
    image: "seed/poppy.jpg",
    summary: "Khoảnh khắc cuối ngày giữa sương và ánh sáng.",
    publishedAt: "2023-08-18",
    createdAt: "2023-08-18T00:00:00.000Z",
    updatedAt: "2023-08-18T00:00:00.000Z",
  },
  {
    id: "seed-sogi-1",
    title: "Giọt sương",
    author: "Sogi",
    authorSlug: "sogi",
    category: "jp",
    lines: [
      "Giọt sương buồn phiền",
      "Và cũng đau cho nỗi",
      "Bông hoa ở lại sau mình",
    ],
    image: "",
    summary: "Một haiku về nỗi niềm của giọt sương và bông hoa.",
    publishedAt: "2023-07-11",
    createdAt: "2023-07-11T00:00:00.000Z",
    updatedAt: "2023-07-11T00:00:00.000Z",
  },
  {
    id: "seed-kyorai-1",
    title: "Anh túc nở",
    author: "Kyorai",
    authorSlug: "kyorai",
    category: "jp",
    lines: ["Đã ra khơi", "Ngư phủ – Bên bờ biển", "Anh túc nở hoa tươi"],
    image: "seed/poppy.jpg",
    summary: "Không khí bờ biển giữa mùa anh túc.",
    publishedAt: "2023-08-02",
    createdAt: "2023-08-02T00:00:00.000Z",
    updatedAt: "2023-08-02T00:00:00.000Z",
  },
  {
    id: "seed-basho-2",
    title: "Tiếng ve",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Chẳng bao lâu sẽ chết",
      "Nhưng chưa thấy dấu hiệu nào hết",
      "Ve kêu không mỏi mệt",
    ],
    image: "",
    summary: "Âm thanh ve sầu và cảm nhận về thời gian.",
    publishedAt: "2023-06-21",
    createdAt: "2023-06-21T00:00:00.000Z",
    updatedAt: "2023-06-21T00:00:00.000Z",
  },
  {
    id: "seed-basho-3",
    title: "Mùa thu này",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Rồi đến mùa Thu này",
      "Sao ta lại già đi như vầy?",
      "Cánh chim bay về mây?",
    ],
    image: "",
    summary: "Một thoáng suy tư về mùa thu và tuổi tác.",
    publishedAt: "2023-09-30",
    createdAt: "2023-09-30T00:00:00.000Z",
    updatedAt: "2023-09-30T00:00:00.000Z",
  },
  {
    id: "seed-basho-4",
    title: "Quạt giấy rách",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: [
      "Viết để lại đôi dòng",
      "Chiếc quạt giấy bỗng rách một đường",
      "Dấu vết lòng vấn vương?",
    ],
    image: "",
    summary: "Một hình ảnh nhỏ về quạt giấy và ký ức.",
    publishedAt: "2023-05-09",
    createdAt: "2023-05-09T00:00:00.000Z",
    updatedAt: "2023-05-09T00:00:00.000Z",
  },
  {
    id: "seed-basho-5",
    title: "Ao cũ",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Ao xưa tĩnh lặng", "một con ếch vừa nhảy xuống", "vang tiếng nước xao"],
    image: "",
    summary: "Bài haiku nổi tiếng nhất của Basho về ao cũ và tiếng nước.",
    publishedAt: "2023-04-01",
    createdAt: "2023-04-01T00:00:00.000Z",
    updatedAt: "2023-04-01T00:00:00.000Z",
  },
  {
    id: "seed-basho-6",
    title: "Cành khô",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Trên cành khô héo", "một con quạ đang đậu yên", "chiều thu rất cũ"],
    image: "",
    summary: "Hình ảnh quạ đậu trên cành khô trong buổi chiều thu.",
    publishedAt: "2023-04-08",
    createdAt: "2023-04-08T00:00:00.000Z",
    updatedAt: "2023-04-08T00:00:00.000Z",
  },
  {
    id: "seed-basho-7",
    title: "Trọ dưới giàn tử đằng",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Lữ khách mỏi mệt", "ngã mình vào quán trọ nhỏ", "giàn tử đằng rơi"],
    image: "",
    summary: "Khoảnh khắc dừng chân của lữ khách Basho dưới giàn hoa tử đằng.",
    publishedAt: "2023-04-15",
    createdAt: "2023-04-15T00:00:00.000Z",
    updatedAt: "2023-04-15T00:00:00.000Z",
  },
  {
    id: "seed-basho-8",
    title: "Hạt sương cỏ hagi",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Cỏ hagi lay nhẹ", "không đánh rơi một hạt nào", "sương trong ban sớm"],
    image: "",
    summary: "Một cái nhìn cực nhỏ và tinh của Basho vào hạt sương trên cỏ.",
    publishedAt: "2023-04-22",
    createdAt: "2023-04-22T00:00:00.000Z",
    updatedAt: "2023-04-22T00:00:00.000Z",
  },
  {
    id: "seed-basho-9",
    title: "Tuyết đầu mùa",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Tuyết đầu mùa tới", "vừa đủ làm cong xuống khẽ", "lá thủy tiên xanh"],
    image: "",
    summary: "Basho chỉ cần một chạm rất nhỏ của tuyết để làm hiện ra cả mùa.",
    publishedAt: "2023-04-29",
    createdAt: "2023-04-29T00:00:00.000Z",
    updatedAt: "2023-04-29T00:00:00.000Z",
  },
  {
    id: "seed-basho-10",
    title: "Cổng chùa Miidera",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Ánh trăng đêm nay", "giá mà gõ được một tiếng", "cổng chùa Miidera"],
    image: "",
    summary: "Một niềm mong ngóng rất Basho trước cảnh chùa và trăng.",
    publishedAt: "2023-05-06",
    createdAt: "2023-05-06T00:00:00.000Z",
    updatedAt: "2023-05-06T00:00:00.000Z",
  },
  {
    id: "seed-basho-11",
    title: "Giấc mộng đồng hoang",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Nằm bệnh dọc đường", "mộng ta vẫn còn rong ruổi", "qua những đồng hoang"],
    image: "",
    summary: "Một trong những bài cuối cùng của Basho, về giấc mộng vẫn tiếp tục lên đường.",
    publishedAt: "2023-05-13",
    createdAt: "2023-05-13T00:00:00.000Z",
    updatedAt: "2023-05-13T00:00:00.000Z",
  },
  {
    id: "seed-basho-12",
    title: "Cỏ mùa hạ",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Cỏ mùa hè rậm", "dấu tích duy nhất còn lại", "giấc mơ tráng sĩ"],
    image: "",
    summary: "Basho nhìn đám cỏ mùa hè như tàn dư của những mộng lớn đã qua.",
    publishedAt: "2023-05-20",
    createdAt: "2023-05-20T00:00:00.000Z",
    updatedAt: "2023-05-20T00:00:00.000Z",
  },
  {
    id: "seed-basho-13",
    title: "Biển tối và tiếng vịt",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Biển chiều sẫm xuống", "tiếng vịt trời đâu thoáng lại", "trắng một khoảng xa"],
    image: "",
    summary: "Một trường nhìn rất thưa, rất lạnh của Basho trên mặt biển chiều.",
    publishedAt: "2023-05-27",
    createdAt: "2023-05-27T00:00:00.000Z",
    updatedAt: "2023-05-27T00:00:00.000Z",
  },
  {
    id: "seed-basho-14",
    title: "Sado và ngân hà",
    author: "Basho",
    authorSlug: "basho",
    category: "jp",
    lines: ["Biển động đêm nay", "trải dần về phía Sado", "một dải ngân hà"],
    image: "",
    summary: "Một Basho rộng lớn hơn thường lệ, nhìn từ biển dữ lên dải ngân hà.",
    publishedAt: "2023-06-03",
    createdAt: "2023-06-03T00:00:00.000Z",
    updatedAt: "2023-06-03T00:00:00.000Z",
  },
  {
    id: "seed-buson-1",
    title: "Hoa lê dưới trăng",
    author: "Yosa Buson",
    authorSlug: "yosa-buson",
    category: "jp",
    lines: ["Hoa lê nở trắng", "một người đàn bà dưới trăng", "đọc lá thư xa"],
    image: "",
    summary: "Một khoảnh khắc tinh tế của Buson giữa hoa lê và ánh trăng.",
    publishedAt: "2023-04-03",
    createdAt: "2023-04-03T00:00:00.000Z",
    updatedAt: "2023-04-03T00:00:00.000Z",
  },
  {
    id: "seed-ryota-1",
    title: "Sau mưa tháng sáu",
    author: "Oshima Ryota",
    authorSlug: "oshima-ryota",
    category: "jp",
    lines: ["Những cơn mưa tháng sáu", "rồi một buổi chiều kín đáo", "trăng qua hàng thông"],
    image: "",
    summary: "Ryota ghi lại sự chuyển mùa rất nhẹ sau những trận mưa dài.",
    publishedAt: "2023-04-10",
    createdAt: "2023-04-10T00:00:00.000Z",
    updatedAt: "2023-04-10T00:00:00.000Z",
  },
  {
    id: "seed-ranko-1",
    title: "Lùm xuân ngủ",
    author: "Takakuma Ranko",
    authorSlug: "takakuma-ranko",
    category: "jp",
    lines: ["Lùm cây mùa xuân", "cả loài chim săn chim nữa", "cũng đang ngủ yên"],
    image: "",
    summary: "Cả kẻ săn lẫn con mồi cùng chìm vào giấc ngủ mùa xuân.",
    publishedAt: "2023-04-17",
    createdAt: "2023-04-17T00:00:00.000Z",
    updatedAt: "2023-04-17T00:00:00.000Z",
  },
  {
    id: "seed-chora-1",
    title: "Ông cóc nhường đường",
    author: "Miura Chora",
    authorSlug: "miura-chora",
    category: "jp",
    lines: ["Tránh lối cho tôi", "để tôi trồng mấy bụi tre", "ông cóc già ơi"],
    image: "",
    summary: "Chora vừa dí dỏm vừa thân mật khi nói với con cóc bên vườn tre.",
    publishedAt: "2023-04-24",
    createdAt: "2023-04-24T00:00:00.000Z",
    updatedAt: "2023-04-24T00:00:00.000Z",
  },
  {
    id: "seed-kito-1",
    title: "Sẻ nhỏ không mẹ",
    author: "Tahai Kito",
    authorSlug: "tahai-kito",
    category: "jp",
    lines: ["Lại đây với ta", "mình cùng chơi với nhau nhé", "sẻ nhỏ không mẹ"],
    image: "",
    summary: "Một tiếng gọi dịu dàng của Kito dành cho chú sẻ mồ côi.",
    publishedAt: "2023-05-01",
    createdAt: "2023-05-01T00:00:00.000Z",
    updatedAt: "2023-05-01T00:00:00.000Z",
  },
  {
    id: "seed-issa-1",
    title: "Hoa gai quê cũ",
    author: "Kobayashi Issa",
    authorSlug: "kobayashi-issa",
    category: "jp",
    lines: ["Quê cũ của tôi", "đêm chạm vào đâu cũng thấy", "hoa gai đang nở"],
    image: "",
    summary: "Issa trở về quê cũ và gặp lại những gai nhọn của ký ức.",
    publishedAt: "2023-05-16",
    createdAt: "2023-05-16T00:00:00.000Z",
    updatedAt: "2023-05-16T00:00:00.000Z",
  },
  {
    id: "seed-sodo-1",
    title: "Lều xuân trống",
    author: "Yamaguchi Sodo",
    authorSlug: "yamaguchi-sodo",
    category: "jp",
    lines: ["Túp lều mùa xuân", "quả thật chẳng có gì cả", "mà cũng đủ đầy"],
    image: "",
    summary: "Sodo đưa sự trống rỗng của căn lều thành một cảm giác viên mãn.",
    publishedAt: "2023-05-23",
    createdAt: "2023-05-23T00:00:00.000Z",
    updatedAt: "2023-05-23T00:00:00.000Z",
  },
  {
    id: "seed-kikaku-1",
    title: "Bóng thông trên chiếu",
    author: "Enomoto Kikaku",
    authorSlug: "enomoto-kikaku",
    category: "jp",
    lines: ["Trăng rằm sáng quá", "trên chiếu tatami bỗng hiện", "bóng của hàng thông"],
    image: "",
    summary: "Kikaku chạm vào vẻ đẹp tĩnh lặng của bóng thông dưới trăng.",
    publishedAt: "2023-05-30",
    createdAt: "2023-05-30T00:00:00.000Z",
    updatedAt: "2023-05-30T00:00:00.000Z",
  },
  {
    id: "seed-joso-1",
    title: "Không còn gì nữa",
    author: "Naito Joso",
    authorSlug: "naito-joso",
    category: "jp",
    lines: ["Núi cùng đồng nội", "đều bị tuyết lấy mất rồi", "chẳng còn lại gì"],
    image: "",
    summary: "Joso nén toàn bộ phong cảnh vào một khoảng trắng do tuyết phủ kín.",
    publishedAt: "2023-06-06",
    createdAt: "2023-06-06T00:00:00.000Z",
    updatedAt: "2023-06-06T00:00:00.000Z",
  },
  {
    id: "seed-chiyo-ni-1",
    title: "Triêu nhan quấn gầu",
    author: "Chiyo-ni",
    authorSlug: "chiyo-ni",
    category: "jp",
    lines: ["Triêu nhan buổi sớm", "quấn quanh cả tay gầu nước", "đành xin nước bên"],
    image: "",
    summary: "Chiyo-ni giữ nguyên vẻ đẹp mong manh của hoa mà chấp nhận đi xin nước.",
    publishedAt: "2023-06-13",
    createdAt: "2023-06-13T00:00:00.000Z",
    updatedAt: "2023-06-13T00:00:00.000Z",
  },
  {
    id: "seed-hiep-1",
    title: "Mùa rêu xanh",
    author: "Nguyễn Vũ Hiệp",
    authorSlug: "nguyen-vu-hiep",
    category: "vi",
    lines: ["Đắp thêm mùa rêu xanh", "đá vẫn lạnh", "cùng thiên thanh"],
    image: "",
    summary: "Sự tĩnh lặng của đá và rêu.",
    publishedAt: "2024-01-10",
    createdAt: "2024-01-10T00:00:00.000Z",
    updatedAt: "2024-01-10T00:00:00.000Z",
  },
  {
    id: "seed-hiep-2",
    title: "Tịch liêu",
    author: "Nguyễn Vũ Hiệp",
    authorSlug: "nguyen-vu-hiep",
    category: "vi",
    lines: ["Tịch liêu", "chảy qua gối những", "bình minh màu chiều"],
    image: "",
    summary: "Hình ảnh tịch liêu chảy qua thời gian.",
    publishedAt: "2024-01-15",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "seed-hiep-3",
    title: "Ký ức mưa",
    author: "Nguyễn Vũ Hiệp",
    authorSlug: "nguyen-vu-hiep",
    category: "vi",
    lines: [
      "Trở lạnh",
      "cơn giận dài lung lay",
      "trong mưa ký ức bay",
    ],
    image: "",
    summary: "Những cơn mưa kéo dài ký ức.",
    publishedAt: "2024-01-20",
    createdAt: "2024-01-20T00:00:00.000Z",
    updatedAt: "2024-01-20T00:00:00.000Z",
  },
  {
    id: "seed-hieu-1",
    title: "Mưa xuân ngủ",
    author: "Đỗ Trung Hiếu",
    authorSlug: "do-trung-hieu",
    category: "vi",
    lines: ["Tiếng bà ru", "mưa xuân ngủ", "lá bàng non"],
    image: "",
    summary: "Hình ảnh bà ru và lá bàng non trong mưa xuân.",
    publishedAt: "2024-02-05",
    createdAt: "2024-02-05T00:00:00.000Z",
    updatedAt: "2024-02-05T00:00:00.000Z",
  },
  {
    id: "seed-hieu-2",
    title: "Ngón tay",
    author: "Đỗ Trung Hiếu",
    authorSlug: "do-trung-hieu",
    category: "vi",
    lines: ["Ngón tay", "trượt trên những chiếc bóng ", "chữ nhật"],
    image: "",
    summary: "Động tác ngón tay và bóng chữ nhật.",
    publishedAt: "2024-02-10",
    createdAt: "2024-02-10T00:00:00.000Z",
    updatedAt: "2024-02-10T00:00:00.000Z",
  },
  {
    id: "seed-ngo-1",
    title: "Anh giao hàng",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    category: "vi",
    lines: [
      "anh giao hàng đến muộn",
      "mặt trời vã mồ hôi",
      "từ hộp canh đánh đổ",
    ],
    image: "",
    summary: "Khoảnh khắc đời thường của người giao hàng.",
    publishedAt: "2024-03-01",
    createdAt: "2024-03-01T00:00:00.000Z",
    updatedAt: "2024-03-01T00:00:00.000Z",
  },
  {
    id: "seed-ngo-2",
    title: "Gió bơi",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    category: "vi",
    lines: ["gió bơi giữa trời", "giấu nắng trong mây", "chờ trăng tới lấy"],
    image: "",
    summary: "Gió, nắng và trăng đuổi nhau trên bầu trời.",
    publishedAt: "2024-03-06",
    createdAt: "2024-03-06T00:00:00.000Z",
    updatedAt: "2024-03-06T00:00:00.000Z",
  },
  {
    id: "seed-ngo-3",
    title: "Mười vầng trăng",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    category: "vi",
    lines: [
      "trăng mọc mười vầng",
      "trên tòa cao ốc",
      "một vầng dịu lặn",
      "khuất vào thinh không",
    ],
    image: "",
    summary: "Trăng soi trên cao ốc và biến mất vào tĩnh lặng.",
    publishedAt: "2024-03-12",
    createdAt: "2024-03-12T00:00:00.000Z",
    updatedAt: "2024-03-12T00:00:00.000Z",
  },
];

const VI_SEED_IMAGE_POOL = [
  "seed/1.jpg",
  "seed/2.jpg",
  "seed/3.jpg",
  "seed/4.jpg",
  "seed/5.jpg",
  "seed/7.jpg",
  "seed/8.jpg",
  "seed/9.jpg",
  "seed/10.jpg",
  "seed/71.jpg",
  "seed/72.jpg",
];

function hashString(value = "") {
  return [...value].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function assignVietnameseSeedImages(posts = []) {
  return posts.map((post) => {
    if (post.category !== "vi" || post.image) {
      return post;
    }

    const image = VI_SEED_IMAGE_POOL[hashString(post.id) % VI_SEED_IMAGE_POOL.length];
    return {
      ...post,
      image,
    };
  });
}

const seededPosts = assignVietnameseSeedImages(SEED_POSTS);
const SUPPLEMENTAL_JP_SEED_POST_IDS = new Set([
  "seed-basho-5",
  "seed-basho-6",
  "seed-basho-7",
  "seed-basho-8",
  "seed-basho-9",
  "seed-basho-10",
  "seed-basho-11",
  "seed-basho-12",
  "seed-basho-13",
  "seed-basho-14",
  "seed-buson-1",
  "seed-ryota-1",
  "seed-ranko-1",
  "seed-chora-1",
  "seed-kito-1",
  "seed-issa-1",
  "seed-sodo-1",
  "seed-kikaku-1",
  "seed-joso-1",
  "seed-chiyo-ni-1",
]);
const supplementalJapaneseSeedPosts = seededPosts.filter((post) =>
  SUPPLEMENTAL_JP_SEED_POST_IDS.has(post.id)
);
const seededVietnameseImageMap = Object.fromEntries(
  seededPosts
    .filter((post) => post.category === "vi" && post.image)
    .map((post) => [post.id, post.image])
);

const SEED_ESSAYS = [
  {
    id: "essay-ngo-hoang-1",
    slug: "haiku-va-khoang-lang",
    title: "Haiku và khoảng lặng",
    author: "Ngô Hoàng",
    authorSlug: "ngo-hoang",
    summary:
      "Khoảng trống trong haiku không phải phần bỏ đi. Nó là nơi hình ảnh lắng xuống và ý nghĩa bắt đầu ngân lên.",
    body: `Điều khiến haiku ở lại lâu trong trí nhớ không chỉ là ba dòng ngắn. Điều quan trọng hơn là khoảng lặng mà ba dòng đó mở ra.

Một bài haiku thường không giải thích trọn vẹn. Nó dừng lại trước khi kết luận, để người đọc tự đi thêm một bước.

Khoảng lặng ấy giống như mặt nước sau khi một chiếc lá vừa rơi xuống. Chúng ta không nhìn vào chiếc lá mãi, mà nhìn vào vòng gợn lan ra quanh nó.

Vì vậy, khi viết haiku, điều khó nhất không phải là viết ít chữ. Điều khó nhất là biết dừng đúng chỗ.`,
    image: "seed/71.jpg",
    tags: ["Thi pháp", "Đọc haiku"],
    kind: "research",
    status: "published",
    publishedAt: "2025-01-15T10:00:00.000Z",
    createdAt: "2025-01-15T10:00:00.000Z",
    updatedAt: "2025-01-15T10:00:00.000Z",
  },
  {
    id: "essay-do-trung-hieu-1",
    slug: "do-thi-va-bai-haiku-viet",
    title: "Đô thị và bài haiku Việt",
    author: "Đỗ Trung Hiếu",
    authorSlug: "do-trung-hieu",
    summary:
      "Khi haiku đi vào thành phố, nó không mất thiên nhiên. Nó chỉ đổi bề mặt của thiên nhiên sang kính, bê tông và ánh đèn.",
    body: `Có một thời người ta nghĩ haiku phải gắn với cỏ cây, chim chóc và bốn mùa theo nghĩa cổ điển. Nhưng trong đời sống hôm nay, thiên nhiên không biến mất. Nó chỉ xuất hiện qua những mặt phản chiếu khác.

Một ô cửa kính hắt nắng chiều cũng có thể mang cảm giác mùa. Một tiếng xe lẫn trong mưa đêm cũng có thể mở ra nỗi cô tịch.

Haiku Việt đương đại thường đứng trên ranh giới ấy: vừa giữ tinh thần tối giản, vừa đón nhận nhịp sống thành thị.

Khi đô thị bước vào bài thơ, thách thức nằm ở chỗ không biến haiku thành ghi chép vụn. Hình ảnh phải đủ cụ thể để chạm vào đời sống, nhưng cũng đủ mở để còn dư âm.`,
    image: "seed/1.jpg",
    tags: ["Haiku Việt", "Đô thị"],
    kind: "commentary",
    status: "published",
    publishedAt: "2025-02-03T08:30:00.000Z",
    createdAt: "2025-02-03T08:30:00.000Z",
    updatedAt: "2025-02-03T08:30:00.000Z",
  },
  {
    id: "essay-basho-1",
    slug: "doc-basho-hom-nay",
    title: "Đọc Basho hôm nay",
    author: "Basho",
    authorSlug: "basho",
    summary:
      "Basho không chỉ là một tượng đài để trích dẫn. Ông vẫn còn hiện diện trong cách chúng ta học nhìn những điều rất nhỏ.",
    body: `Đọc Basho hôm nay là đọc một cách chú ý. Ông không đòi hỏi người đọc phải sở hữu tri thức lớn lao trước khi bước vào thơ.

Ngược lại, Basho thường bắt đầu từ những điều cực nhỏ: một cành cây, tiếng ve, một con đường, một mái lều.

Điều bền vững ở Basho là khả năng làm cho sự vật tự lên tiếng. Nhà thơ không chen quá nhiều cái tôi vào giữa cảnh vật và người đọc.

Trong thời đại hình ảnh dư thừa, có lẽ Basho nhắc ta về một nghệ thuật tiết chế: nhìn đủ lâu để sự vật trở nên sâu hơn chính nó.`,
    image: "seed/fuji.jpg",
    tags: ["Basho", "Đọc haiku"],
    kind: "research",
    status: "published",
    publishedAt: "2025-02-28T09:45:00.000Z",
    createdAt: "2025-02-28T09:45:00.000Z",
    updatedAt: "2025-02-28T09:45:00.000Z",
  },
];

app.use("/api/data", express.static(path.resolve(__dirname, "data")));

const SPA_DIST = path.resolve(__dirname, "..", "dist", "spa");

if (fs.existsSync(SPA_DIST)) {
  app.use(express.static(SPA_DIST));
  // Fallback cho mọi route không phải /api/*
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith(`${mediaRoutePrefix}/`)) {
      return next();
    }
    res.sendFile(path.join(SPA_DIST, "index.html"));
  });
} else {
  console.warn("Không tìm thấy dist/spa, chỉ phục vụ API. Hãy chạy build trước.");
}

async function startServer() {
  await db.init();
  await ensureBootstrapAdmin();
  if (ENABLE_CONTENT_SEED) {
    await db.seedIfEmpty(seededPosts);
    await db.seedPostsIfMissing(supplementalJapaneseSeedPosts);
    await db.seedEssaysIfEmpty(SEED_ESSAYS);
    await db.assignImagesIfMissing(seededVietnameseImageMap);
  } else {
    console.log("Bo qua content seed theo cau hinh ENABLE_CONTENT_SEED.");
  }
  const legacyBackfill = await db.backfillCreatedByUserIfMissing(LEGACY_CONTENT_USERNAME);

  if (legacyBackfill.userFound && (legacyBackfill.poemsUpdated || legacyBackfill.essaysUpdated)) {
    console.log(
      `Đã gán người đăng mặc định "${legacyBackfill.username}" cho ${legacyBackfill.poemsUpdated} bài thơ và ${legacyBackfill.essaysUpdated} bài luận cũ.`
    );
  }

  app.listen(PORT, () => {
    console.log(`Haiku API server chạy trên cổng ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Không khởi động được server", error);
  process.exit(1);
});

function slugify(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function resolveAuthorSlug(authorSlug, author) {
  const normalizedAuthor = typeof author === "string" ? author.trim() : "";
  if (typeof authorSlug === "string" && authorSlug.trim()) {
    return authorSlug.trim();
  }
  return normalizedAuthor ? slugify(normalizedAuthor) : "";
}

function normalizeEssayTags(tags) {
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags.split(",")
      : [];

  const seen = new Set();

  return values
    .map((tag) =>
      typeof tag === "string"
        ? { label: tag.trim(), slug: slugify(tag) }
        : {
            label: typeof tag?.label === "string" ? tag.label.trim() : "",
            slug:
              typeof tag?.slug === "string" && tag.slug.trim()
                ? tag.slug.trim()
                : slugify(tag?.label || ""),
          }
    )
    .filter((tag) => tag.label && tag.slug)
    .filter((tag) => {
      if (seen.has(tag.slug)) {
        return false;
      }
      seen.add(tag.slug);
      return true;
    });
}

function normalizePoemStatus(value, fallback = "published") {
  const normalized = typeof value === "string" ? value.trim() : "";

  switch (normalized) {
    case "published":
    case "submitted":
      return normalized;
    default:
      return fallback;
  }
}

function normalizeEssayStatus(value, fallback = "published") {
  const normalized = typeof value === "string" ? value.trim() : "";

  switch (normalized) {
    case "draft":
    case "published":
    case "submitted":
      return normalized;
    default:
      return fallback;
  }
}

function uniqueEssaySlug(title, preferredSlug, essayId = "") {
  const base = slugify(preferredSlug || title || essayId || randomUUID());
  return base || `essay-${randomUUID()}`;
}

function normalizeRoutePrefix(value = "/media") {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function normalizeBaseUrl(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizeObjectKeyPrefix(value = "") {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function resolveMediaUploadMaxBytes(value) {
  const mb = Number(value || 5);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 5;
  return safeMb * 1024 * 1024;
}

function resolveBooleanEnv(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

function normalizeMediaUploadScope(value = "") {
  const normalized = String(value || "").trim();

  switch (normalized) {
    case "poem-cover":
      return "poems";
    case "essay-cover":
      return "essays/covers";
    case "essay-inline":
      return "essays/inline";
    case "submission-cover":
      return "submissions/covers";
    case "submission-inline":
      return "submissions/inline";
    default:
      return "misc";
  }
}

function resolveUploadExtension(fileName = "", contentType = "") {
  const explicitExtension = path.extname(String(fileName || "")).toLowerCase();
  if (explicitExtension && /^[.][a-z0-9]{1,10}$/i.test(explicitExtension)) {
    return explicitExtension;
  }

  const mimeExtensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
  };

  return mimeExtensions[contentType] || "";
}

function getS3UploadClient() {
  if (!s3UploadClient) {
    s3UploadClient = new S3Client({
      region: S3_UPLOAD_REGION,
    });
  }

  return s3UploadClient;
}

async function createPresignedMediaUpload({ fileName, contentType, scope, actorUserId }) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = resolveUploadExtension(fileName, contentType);
  const objectKey = [S3_UPLOAD_PREFIX, scope, year, month, `${Date.now()}-${randomUUID()}${extension}`]
    .filter(Boolean)
    .join("/");

  const command = new PutObjectCommand({
    Bucket: S3_UPLOAD_BUCKET,
    Key: objectKey,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: actorUserId
      ? {
          actor_user_id: actorUserId,
        }
      : undefined,
  });

  const uploadUrl = await getSignedUrl(getS3UploadClient(), command, {
    expiresIn: MEDIA_UPLOAD_URL_TTL_SECONDS,
  });

  return {
    method: "PUT",
    uploadUrl,
    publicUrl: `${MEDIA_PUBLIC_BASE}/${objectKey}`,
    key: objectKey,
    headers: {
      "Content-Type": contentType,
    },
  };
}

function resolveLocalMediaCandidates(assetPath = "") {
  const normalizedAssetPath = assetPath.replace(/^\/+/, "");
  const candidates = [normalizedAssetPath];

  if (normalizedAssetPath.startsWith("seed/")) {
    candidates.push(normalizedAssetPath.slice("seed/".length));
  }

  return [...new Set(candidates)].map((candidate) => path.resolve(localMediaRoot, candidate));
}

async function authenticateRequest(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || "";
  const tokenHash = token ? hashSessionToken(token) : "";

  req.auth = {
    token,
    tokenHash,
    user: null,
    role: "viewer",
    sessionId: null,
  };

  if (!tokenHash) {
    return next();
  }

  try {
    const session = await db.getSessionByTokenHash(tokenHash);
    if (!session) {
      return next();
    }

    const isExpired = session.expiresAt ? new Date(session.expiresAt).getTime() <= Date.now() : false;
    if (session.revokedAt || isExpired || session.user.status !== "active") {
      await db.revokeSessionByTokenHash(tokenHash);
      return next();
    }

    req.auth = {
      token,
      tokenHash,
      user: session.user,
      role: session.user.role,
      sessionId: session.sessionId,
    };

    await db.touchSession(session.sessionId);
    next();
  } catch (error) {
    next(error);
  }
}

function requireEditor(req, res, next) {
  if (!req.auth.user) {
    return res.status(401).json({ message: "Cần đăng nhập tài khoản Editor hoặc Admin" });
  }

  if (!["editor", "admin"].includes(req.auth.role)) {
    return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa nội dung" });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.auth.user) {
    return res.status(401).json({ message: "Cần đăng nhập tài khoản Admin" });
  }

  if (req.auth.role !== "admin") {
    return res.status(403).json({ message: "Chỉ Admin mới được phép truy cập" });
  }

  next();
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || "",
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function resolveSessionTtlMs(value) {
  const days = Number(value || 14);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 14;
  return safeDays * 24 * 60 * 60 * 1000;
}

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

function getUserAgent(req) {
  return String(req.headers["user-agent"] || "");
}

async function logActivity(req, entry) {
  await db.insertActivityLog({
    id: `activity-${randomUUID()}`,
    actorUserId: entry.actorUserId || req.auth?.user?.id || null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId || "",
    details: entry.details || {},
    ipAddress: entry.ipAddress || getRequestIp(req),
    userAgent: entry.userAgent || getUserAgent(req),
    createdAt: entry.createdAt || new Date().toISOString(),
  });
}

async function ensureBootstrapAdmin() {
  const totalUsers = await db.countUsers();
  if (totalUsers > 0) {
    return;
  }

  if (!DEFAULT_BOOTSTRAP_ADMIN.username || !DEFAULT_BOOTSTRAP_ADMIN.password) {
    console.warn(
      "Chua co user nao va cung chua cau hinh BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD. Bo qua khoi tao admin mac dinh."
    );
    return;
  }

  const now = new Date().toISOString();
  const created = await db.createUser({
    id: `user-${randomUUID()}`,
    username: DEFAULT_BOOTSTRAP_ADMIN.username,
    displayName: DEFAULT_BOOTSTRAP_ADMIN.displayName,
    passwordHash: hashPassword(DEFAULT_BOOTSTRAP_ADMIN.password),
    role: "admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await db.insertActivityLog({
    id: `activity-${randomUUID()}`,
    actorUserId: created.id,
    action: "admin.bootstrap",
    resourceType: "user",
    resourceId: created.id,
    details: {
      username: created.username,
      role: created.role,
    },
    ipAddress: "",
    userAgent: "server-bootstrap",
    createdAt: now,
  });

  console.warn(
    `Da khoi tao tai khoan admin mac dinh: ${created.username}. Hay doi mat khau BOOTSTRAP_ADMIN_PASSWORD truoc khi deploy.`
  );
}
