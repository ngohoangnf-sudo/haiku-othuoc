const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
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
const DEFAULT_BOOTSTRAP_ADMIN = {
  username: process.env.BOOTSTRAP_ADMIN_USERNAME || "admin",
  password:
    process.env.BOOTSTRAP_ADMIN_PASSWORD || (isProduction ? "" : "admin123456"),
  displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || "Administrator",
};
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
    const posts = await db.getAllPosts({
      category: req.query.category,
      authorSlug: req.query.authorSlug,
    });
    res.json(posts);
  } catch (err) {
    console.error("Lỗi lấy posts", err);
    res.status(500).json({ message: "Không lấy được danh sách bài viết" });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài" });
    res.json(post);
  } catch (err) {
    console.error("Lỗi lấy post", err);
    res.status(500).json({ message: "Không lấy được bài viết" });
  }
});

app.post("/api/posts", requireEditor, async (req, res) => {
  try {
    const input = req.body || {};
    const lines = Array.isArray(input.lines)
      ? input.lines.filter((l) => l && String(l).trim())
      : [];

    if (!lines.length) {
      return res.status(400).json({ message: "Cần ít nhất một dòng haiku" });
    }

    const now = new Date().toISOString();
    const post = {
      id: input.id || randomUUID(),
      title: typeof input.title === "string" ? input.title.trim() : "",
      author: input.author || "Vô danh",
      authorSlug: input.authorSlug || slugify(input.author || "vo-danh"),
      category: input.category || "vi",
      lines,
      summary: input.summary || "",
      image: input.image || "",
      publishedAt: input.publishedAt || now.split("T")[0],
      createdAt: now,
      updatedAt: now,
    };

    const created = await db.insertPost(post);
    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "post.create",
      resourceType: "poem",
      resourceId: created.id,
      details: { title: created.title, category: created.category },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Lỗi tạo post", err);
    res.status(500).json({ message: "Không tạo được bài viết" });
  }
});

app.put("/api/posts/:id", requireEditor, async (req, res) => {
  try {
    const existing = await db.getPostById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Không tìm thấy bài viết để cập nhật" });
    }

    const input = req.body || {};
    const lines = Array.isArray(input.lines)
      ? input.lines.filter((l) => l && String(l).trim())
      : existing.lines;

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
      publishedAt: input.publishedAt || existing.publishedAt,
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
    const existing = await db.getPostById(req.params.id);
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
    const essays = await db.getAllEssays({
      authorSlug: req.query.authorSlug,
      tagSlug: req.query.tagSlug,
      status: "published",
    });
    res.json(essays);
  } catch (err) {
    console.error("Lỗi lấy essays", err);
    res.status(500).json({ message: "Không lấy được danh sách bài luận" });
  }
});

app.get("/api/essays/:slug", async (req, res) => {
  try {
    const essay = await db.getEssayBySlug(req.params.slug);
    if (!essay) {
      return res.status(404).json({ message: "Không tìm thấy bài luận" });
    }
    res.json(essay);
  } catch (err) {
    console.error("Lỗi lấy essay", err);
    res.status(500).json({ message: "Không lấy được bài luận" });
  }
});

app.post("/api/essays", requireEditor, async (req, res) => {
  try {
    const input = req.body || {};
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";

    if (!title) {
      return res.status(400).json({ message: "Tiêu đề bài luận là bắt buộc" });
    }

    if (!body) {
      return res.status(400).json({ message: "Nội dung bài luận là bắt buộc" });
    }

    const now = new Date().toISOString();
    const essay = {
      id: input.id || randomUUID(),
      slug: uniqueEssaySlug(title, input.slug),
      title,
      author: typeof input.author === "string" ? input.author.trim() : "",
      authorSlug: resolveAuthorSlug(input.authorSlug, input.author),
      summary: typeof input.summary === "string" ? input.summary.trim() : "",
      body,
      image: typeof input.image === "string" ? input.image.trim() : "",
      tags: normalizeEssayTags(input.tags),
      status: input.status || "published",
      publishedAt: input.publishedAt || now,
      createdAt: now,
      updatedAt: now,
    };

    const created = await db.insertEssay(essay);
    await logActivity(req, {
      actorUserId: req.auth.user.id,
      action: "essay.create",
      resourceType: "essay",
      resourceId: created.id,
      details: { title: created.title, slug: created.slug },
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
      summary:
        typeof input.summary === "string" ? input.summary.trim() : existing.summary,
      body: nextBody,
      image: typeof input.image === "string" ? input.image.trim() : existing.image,
      tags: input.tags !== undefined ? normalizeEssayTags(input.tags) : existing.tags,
      status: input.status || existing.status,
      publishedAt: input.publishedAt || existing.publishedAt,
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
  await db.seedIfEmpty(seededPosts);
  await db.seedEssaysIfEmpty(SEED_ESSAYS);
  await db.assignImagesIfMissing(seededVietnameseImageMap);

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
