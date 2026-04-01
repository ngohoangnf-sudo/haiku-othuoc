const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { Pool } = require("pg");

const schemaSql = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");

function createPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "haiku",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(createPoolConfig());
let initPromise = null;

function inferStorageType(source = "") {
  if (!source) return null;
  if (source.startsWith("data:")) return "data_url";
  if (source.startsWith("http://") || source.startsWith("https://")) return "remote_url";
  if (source.startsWith("s3://") || source.startsWith("r2://")) return "object_storage";
  return "local_asset";
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function mapPoemRow(row) {
  return {
    id: row.id,
    slug: row.slug || "",
    title: row.title || "",
    author: row.author,
    authorSlug: row.authorSlug,
    category: row.category,
    lines: Array.isArray(row.lines) ? row.lines : [],
    summary: row.summary || "",
    image: row.image || "",
    status: row.status || "published",
    postedBy: row.postedById
      ? {
          id: row.postedById,
          username: row.postedByUsername,
          displayName: row.postedByDisplayName || row.postedByUsername || "",
        }
      : null,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEssayRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind || "commentary",
    author: row.author || "",
    authorSlug: row.authorSlug || "",
    summary: row.summary || "",
    body: row.body || "",
    image: row.image || "",
    postedBy: row.postedById
      ? {
          id: row.postedById,
          username: row.postedByUsername,
          displayName: row.postedByDisplayName || row.postedByUsername || "",
        }
      : null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status || "draft",
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName || "",
    role: row.role,
    status: row.status,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSessionUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastSeenAt: row.lastSeenAt,
    user: mapUserRow(row),
  };
}

function mapActivityRow(row) {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId || "",
    details: row.details || {},
    ipAddress: row.ipAddress || "",
    userAgent: row.userAgent || "",
    createdAt: row.createdAt,
    actor: row.actorId
      ? {
          id: row.actorId,
          username: row.actorUsername,
          displayName: row.actorDisplayName || "",
          role: row.actorRole,
        }
      : null,
  };
}

async function init() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const statements = schemaSql
      .split(/;\s*$/m)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }

    await pool.query(`
      ALTER TABLE poems
      ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE essays
      ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE essays
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'commentary'
    `);
    await pool.query(`
      UPDATE essays
      SET kind = 'commentary'
      WHERE kind IS NULL OR kind = ''
    `);
    await pool.query(`
      ALTER TABLE essays
      DROP CONSTRAINT IF EXISTS essays_kind_check
    `);
    await pool.query(`
      ALTER TABLE essays
      ADD CONSTRAINT essays_kind_check
      CHECK (kind IN ('research', 'commentary'))
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_poems_created_by_user_id
        ON poems (created_by_user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_essays_created_by_user_id
        ON essays (created_by_user_id)
    `);
  })();

  return initPromise;
}

async function withClient(task) {
  await init();
  const client = await pool.connect();
  try {
    return await task(client);
  } finally {
    client.release();
  }
}

async function ensureAuthor(client, { author, authorSlug }) {
  const now = new Date().toISOString();
  const result = await client.query(
    `
      INSERT INTO authors (id, slug, display_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (slug)
      DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [authorSlug, authorSlug, author, now]
  );

  return result.rows[0].id;
}

async function ensureAuthorIfPresent(client, { author, authorSlug }) {
  if (!author || !authorSlug) {
    return null;
  }

  return ensureAuthor(client, { author, authorSlug });
}

async function ensureMediaAsset(client, source, existingMediaAssetId = null) {
  if (!source) {
    return null;
  }

  const now = new Date().toISOString();
  const storageType = inferStorageType(source);

  if (existingMediaAssetId) {
    const updated = await client.query(
      `
        UPDATE media_assets
        SET source = $2, storage_type = $3, updated_at = $4
        WHERE id = $1
        RETURNING id
      `,
      [existingMediaAssetId, source, storageType, now]
    );

    if (updated.rowCount) {
      return updated.rows[0].id;
    }
  }

  const mediaId = `media-${randomUUID()}`;
  await client.query(
    `
      INSERT INTO media_assets (id, kind, storage_type, source, created_at, updated_at)
      VALUES ($1, 'image', $2, $3, $4, $4)
    `,
    [mediaId, storageType, source, now]
  );

  return mediaId;
}

async function replacePoemLines(client, poemId, lines = []) {
  await client.query("DELETE FROM poem_lines WHERE poem_id = $1", [poemId]);

  for (const [index, line] of lines.entries()) {
    await client.query(
      `
        INSERT INTO poem_lines (poem_id, line_number, content)
        VALUES ($1, $2, $3)
      `,
      [poemId, index, line]
    );
  }
}

async function ensureEssayTag(client, tag) {
  const normalizedTag =
    typeof tag === "string"
      ? { label: tag.trim(), slug: slugify(tag) }
      : {
          label: typeof tag?.label === "string" ? tag.label.trim() : "",
          slug:
            typeof tag?.slug === "string" && tag.slug.trim()
              ? tag.slug.trim()
              : slugify(tag?.label || ""),
        };

  if (!normalizedTag.label || !normalizedTag.slug) {
    return null;
  }

  const now = new Date().toISOString();
  const result = await client.query(
    `
      INSERT INTO essay_tags (id, slug, label, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (slug)
      DO UPDATE SET label = EXCLUDED.label
      RETURNING id
    `,
    [tag?.id || `tag-${randomUUID()}`, normalizedTag.slug, normalizedTag.label, now]
  );

  return result.rows[0].id;
}

async function replaceEssayTags(client, essayId, tags = []) {
  await client.query("DELETE FROM essay_tag_links WHERE essay_id = $1", [essayId]);

  for (const tag of tags) {
    const tagId = await ensureEssayTag(client, tag);
    if (!tagId) {
      continue;
    }
    await client.query(
      `
        INSERT INTO essay_tag_links (essay_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT (essay_id, tag_id) DO NOTHING
      `,
      [essayId, tagId]
    );
  }
}

async function getUsers() {
  await init();

  const result = await pool.query(
    `
      SELECT
        id,
        username,
        display_name AS "displayName",
        role,
        status,
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM users
      ORDER BY
        CASE role WHEN 'admin' THEN 0 ELSE 1 END,
        created_at ASC
    `
  );

  return result.rows.map(mapUserRow);
}

async function getUserById(id) {
  await init();

  const result = await pool.query(
    `
      SELECT
        id,
        username,
        display_name AS "displayName",
        role,
        status,
        password_hash AS "passwordHash",
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM users
      WHERE id = $1
    `,
    [id]
  );

  return result.rowCount ? result.rows[0] : null;
}

async function getUserByUsername(username) {
  await init();

  const result = await pool.query(
    `
      SELECT
        id,
        username,
        display_name AS "displayName",
        role,
        status,
        password_hash AS "passwordHash",
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM users
      WHERE username = $1
    `,
    [username]
  );

  return result.rowCount ? result.rows[0] : null;
}

async function countUsers() {
  await init();
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM users");
  return result.rows[0]?.total || 0;
}

async function createUser(user) {
  await init();

  const now = user.updatedAt || new Date().toISOString();
  const result = await pool.query(
    `
      INSERT INTO users (
        id,
        username,
        display_name,
        password_hash,
        role,
        status,
        last_login_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        username,
        display_name AS "displayName",
        role,
        status,
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      user.id,
      user.username,
      user.displayName || "",
      user.passwordHash,
      user.role,
      user.status || "active",
      user.lastLoginAt || null,
      user.createdAt || now,
      now,
    ]
  );

  return mapUserRow(result.rows[0]);
}

async function updateUser(id, updates = {}) {
  await init();

  const sets = [];
  const values = [id];

  const fields = {
    username: "username",
    displayName: "display_name",
    passwordHash: "password_hash",
    role: "role",
    status: "status",
    lastLoginAt: "last_login_at",
  };

  Object.entries(fields).forEach(([key, column]) => {
    if (updates[key] === undefined) {
      return;
    }
    values.push(updates[key]);
    sets.push(`${column} = $${values.length}`);
  });

  values.push(updates.updatedAt || new Date().toISOString());
  sets.push(`updated_at = $${values.length}`);

  const result = await pool.query(
    `
      UPDATE users
      SET ${sets.join(", ")}
      WHERE id = $1
      RETURNING
        id,
        username,
        display_name AS "displayName",
        role,
        status,
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    values
  );

  return result.rowCount ? mapUserRow(result.rows[0]) : null;
}

async function createSession(session) {
  await init();

  const result = await pool.query(
    `
      INSERT INTO user_sessions (
        id,
        user_id,
        token_hash,
        expires_at,
        revoked_at,
        user_agent,
        ip_address,
        created_at,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $7)
      RETURNING id
    `,
    [
      session.id,
      session.userId,
      session.tokenHash,
      session.expiresAt,
      session.userAgent || "",
      session.ipAddress || "",
      session.createdAt || new Date().toISOString(),
    ]
  );

  return result.rows[0]?.id || null;
}

async function getSessionByTokenHash(tokenHash) {
  await init();

  const result = await pool.query(
    `
      SELECT
        s.id AS "sessionId",
        s.token_hash AS "tokenHash",
        s.expires_at AS "expiresAt",
        s.revoked_at AS "revokedAt",
        s.last_seen_at AS "lastSeenAt",
        u.id,
        u.username,
        u.display_name AS "displayName",
        u.role,
        u.status,
        u.last_login_at AS "lastLoginAt",
        u.created_at AS "createdAt",
        u.updated_at AS "updatedAt"
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rowCount ? mapSessionUserRow(result.rows[0]) : null;
}

async function touchSession(id) {
  await init();
  await pool.query(
    "UPDATE user_sessions SET last_seen_at = $2 WHERE id = $1",
    [id, new Date().toISOString()]
  );
}

async function revokeSessionByTokenHash(tokenHash) {
  await init();

  const result = await pool.query(
    `
      UPDATE user_sessions
      SET revoked_at = COALESCE(revoked_at, $2)
      WHERE token_hash = $1
      RETURNING id
    `,
    [tokenHash, new Date().toISOString()]
  );

  return result.rowCount > 0;
}

async function insertActivityLog(entry) {
  await init();

  await pool.query(
    `
      INSERT INTO activity_logs (
        id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
    `,
    [
      entry.id,
      entry.actorUserId || null,
      entry.action,
      entry.resourceType,
      entry.resourceId || null,
      JSON.stringify(entry.details || {}),
      entry.ipAddress || "",
      entry.userAgent || "",
      entry.createdAt || new Date().toISOString(),
    ]
  );
}

async function getActivityLogs(limit = 100, actorUserId = "") {
  await init();

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const values = [safeLimit];
  const clauses = [];

  if (actorUserId) {
    values.push(actorUserId);
    clauses.push(`l.actor_user_id = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query(
    `
      SELECT
        l.id,
        l.action,
        l.resource_type AS "resourceType",
        l.resource_id AS "resourceId",
        l.details,
        l.ip_address AS "ipAddress",
        l.user_agent AS "userAgent",
        l.created_at AS "createdAt",
        u.id AS "actorId",
        u.username AS "actorUsername",
        u.display_name AS "actorDisplayName",
        u.role AS "actorRole"
      FROM activity_logs l
      LEFT JOIN users u ON u.id = l.actor_user_id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $1
    `,
    values
  );

  return result.rows.map(mapActivityRow);
}

async function getAllPosts(filters = {}) {
  await init();

  const values = [];
  const clauses = [];

  if (filters.category) {
    values.push(filters.category);
    clauses.push(`p.category = $${values.length}`);
  }

  if (filters.authorSlug) {
    values.push(filters.authorSlug);
    clauses.push(`a.slug = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    clauses.push(`(
      p.title ILIKE $${values.length}
      OR p.summary ILIKE $${values.length}
      OR a.display_name ILIKE $${values.length}
      OR EXISTS (
        SELECT 1
        FROM poem_lines pl_search
        WHERE pl_search.poem_id = p.id
          AND pl_search.content ILIKE $${values.length}
      )
    )`);
  }

  if (filters.status !== null) {
    values.push(filters.status || "published");
    clauses.push(`p.status = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await pool.query(
    `
      SELECT
        p.id,
        p.slug,
        p.title,
        p.category,
        p.summary,
        p.status,
        p.published_at AS "publishedAt",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(pl.content ORDER BY pl.line_number) FILTER (WHERE pl.content IS NOT NULL),
          '[]'::json
        ) AS lines
      FROM poems p
      JOIN authors a ON a.id = p.author_id
      LEFT JOIN users u ON u.id = p.created_by_user_id
      LEFT JOIN media_assets m ON m.id = p.media_asset_id
      LEFT JOIN poem_lines pl ON pl.poem_id = p.id
      ${where}
      GROUP BY p.id, a.id, u.id, m.id
      ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
    `,
    values
  );

  return result.rows.map(mapPoemRow);
}

async function getPagedPosts(filters = {}, pagination = {}) {
  await init();

  const values = [];
  const clauses = [];

  if (filters.category) {
    values.push(filters.category);
    clauses.push(`p.category = $${values.length}`);
  }

  if (filters.authorSlug) {
    values.push(filters.authorSlug);
    clauses.push(`a.slug = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    clauses.push(`(
      p.title ILIKE $${values.length}
      OR p.summary ILIKE $${values.length}
      OR a.display_name ILIKE $${values.length}
      OR EXISTS (
        SELECT 1
        FROM poem_lines pl_search
        WHERE pl_search.poem_id = p.id
          AND pl_search.content ILIKE $${values.length}
      )
    )`);
  }

  if (filters.status !== null) {
    values.push(filters.status || "published");
    clauses.push(`p.status = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const pageSize = Math.max(1, Math.min(Number(pagination.pageSize) || 12, 100));
  const page = Math.max(1, Number(pagination.page) || 1);
  const offset = (page - 1) * pageSize;

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM poems p
      JOIN authors a ON a.id = p.author_id
      ${where}
    `,
    values
  );

  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;
  const itemsValues = [...values];
  let orderClause = "ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC";

  if (pagination.seed) {
    itemsValues.push(String(pagination.seed));
    const seedPlaceholder = `$${itemsValues.length}`;
    orderClause = `ORDER BY md5(${seedPlaceholder} || p.id::text), p.id`;
  }

  const itemsResult = await pool.query(
    `
      SELECT
        p.id,
        p.slug,
        p.title,
        p.category,
        p.summary,
        p.status,
        p.published_at AS "publishedAt",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(pl.content ORDER BY pl.line_number) FILTER (WHERE pl.content IS NOT NULL),
          '[]'::json
        ) AS lines
      FROM poems p
      JOIN authors a ON a.id = p.author_id
      LEFT JOIN users u ON u.id = p.created_by_user_id
      LEFT JOIN media_assets m ON m.id = p.media_asset_id
      LEFT JOIN poem_lines pl ON pl.poem_id = p.id
      ${where}
      GROUP BY p.id, a.id, u.id, m.id
      ${orderClause}
      LIMIT $${itemsValues.length + 1}
      OFFSET $${itemsValues.length + 2}
    `,
    [...itemsValues, pageSize, safeOffset]
  );

  return {
    items: itemsResult.rows.map(mapPoemRow),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

async function getPostById(id, options = { status: null }) {
  await init();

  const values = [id];
  const clauses = ["p.id = $1"];

  if (options.status !== null) {
    values.push(options.status || "published");
    clauses.push(`p.status = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT
        p.id,
        p.slug,
        p.title,
        p.category,
        p.summary,
        p.status,
        p.published_at AS "publishedAt",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(pl.content ORDER BY pl.line_number) FILTER (WHERE pl.content IS NOT NULL),
          '[]'::json
        ) AS lines
      FROM poems p
      JOIN authors a ON a.id = p.author_id
      LEFT JOIN users u ON u.id = p.created_by_user_id
      LEFT JOIN media_assets m ON m.id = p.media_asset_id
      LEFT JOIN poem_lines pl ON pl.poem_id = p.id
      WHERE ${clauses.join(" AND ")}
      GROUP BY p.id, a.id, u.id, m.id
    `,
    values
  );

  return result.rowCount ? mapPoemRow(result.rows[0]) : null;
}

async function getRandomPostWithImage() {
  await init();

  const result = await pool.query(
    `
      SELECT
        p.id,
        p.slug,
        p.title,
        p.category,
        p.summary,
        p.status,
        p.published_at AS "publishedAt",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(pl.content ORDER BY pl.line_number) FILTER (WHERE pl.content IS NOT NULL),
          '[]'::json
        ) AS lines
      FROM poems p
      JOIN authors a ON a.id = p.author_id
      LEFT JOIN users u ON u.id = p.created_by_user_id
      JOIN media_assets m ON m.id = p.media_asset_id
      LEFT JOIN poem_lines pl ON pl.poem_id = p.id
      WHERE COALESCE(m.source, '') <> ''
        AND p.status = 'published'
      GROUP BY p.id, a.id, u.id, m.id
      ORDER BY random()
      LIMIT 1
    `
  );

  return result.rowCount ? mapPoemRow(result.rows[0]) : null;
}

async function getAllEssays(filters = {}) {
  await init();

  const values = [];
  const clauses = [];

  if (filters.authorSlug) {
    values.push(filters.authorSlug);
    clauses.push(`a.slug = $${values.length}`);
  }

  if (filters.kind) {
    values.push(filters.kind);
    clauses.push(`e.kind = $${values.length}`);
  }

  if (filters.tagSlug) {
    values.push(filters.tagSlug);
    clauses.push(`EXISTS (
      SELECT 1
      FROM essay_tag_links etl_filter
      JOIN essay_tags t_filter ON t_filter.id = etl_filter.tag_id
      WHERE etl_filter.essay_id = e.id
        AND t_filter.slug = $${values.length}
    )`);
  }

  if (filters.status !== null) {
    if (filters.status === "editable") {
      clauses.push(`e.status <> 'submitted'`);
    } else {
      values.push(filters.status || "published");
      clauses.push(`e.status = $${values.length}`);
    }
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    clauses.push(`(
      e.title ILIKE $${values.length}
      OR e.summary ILIKE $${values.length}
      OR e.body ILIKE $${values.length}
      OR COALESCE(a.display_name, '') ILIKE $${values.length}
      OR EXISTS (
        SELECT 1
        FROM essay_tag_links etl_search
        JOIN essay_tags t_search ON t_search.id = etl_search.tag_id
        WHERE etl_search.essay_id = e.id
          AND (
            t_search.label ILIKE $${values.length}
            OR t_search.slug ILIKE $${values.length}
          )
      )
    )`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await pool.query(
    `
      SELECT
        e.id,
        e.slug,
        e.title,
        e.kind,
        e.summary,
        e.body,
        e.status,
        e.published_at AS "publishedAt",
        e.created_at AS "createdAt",
        e.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('slug', t.slug, 'label', t.label)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tags
      FROM essays e
      LEFT JOIN authors a ON a.id = e.author_id
      LEFT JOIN users u ON u.id = e.created_by_user_id
      LEFT JOIN media_assets m ON m.id = e.cover_media_id
      LEFT JOIN essay_tag_links etl ON etl.essay_id = e.id
      LEFT JOIN essay_tags t ON t.id = etl.tag_id
      ${where}
      GROUP BY e.id, a.id, u.id, m.id
      ORDER BY e.published_at DESC NULLS LAST, e.created_at DESC
    `,
    values
  );

  return result.rows.map(mapEssayRow);
}

async function getPagedEssays(filters = {}, pagination = {}) {
  await init();

  const values = [];
  const clauses = [];

  if (filters.authorSlug) {
    values.push(filters.authorSlug);
    clauses.push(`a.slug = $${values.length}`);
  }

  if (filters.kind) {
    values.push(filters.kind);
    clauses.push(`e.kind = $${values.length}`);
  }

  if (filters.tagSlug) {
    values.push(filters.tagSlug);
    clauses.push(`EXISTS (
      SELECT 1
      FROM essay_tag_links etl_filter
      JOIN essay_tags t_filter ON t_filter.id = etl_filter.tag_id
      WHERE etl_filter.essay_id = e.id
        AND t_filter.slug = $${values.length}
    )`);
  }

  if (filters.status !== null) {
    if (filters.status === "editable") {
      clauses.push(`e.status <> 'submitted'`);
    } else {
      values.push(filters.status || "published");
      clauses.push(`e.status = $${values.length}`);
    }
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    clauses.push(`(
      e.title ILIKE $${values.length}
      OR e.summary ILIKE $${values.length}
      OR e.body ILIKE $${values.length}
      OR COALESCE(a.display_name, '') ILIKE $${values.length}
      OR EXISTS (
        SELECT 1
        FROM essay_tag_links etl_search
        JOIN essay_tags t_search ON t_search.id = etl_search.tag_id
        WHERE etl_search.essay_id = e.id
          AND (
            t_search.label ILIKE $${values.length}
            OR t_search.slug ILIKE $${values.length}
          )
      )
    )`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const pageSize = Math.max(1, Math.min(Number(pagination.pageSize) || 9, 100));
  const page = Math.max(1, Number(pagination.page) || 1);

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM essays e
      LEFT JOIN authors a ON a.id = e.author_id
      ${where}
    `,
    values
  );

  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;

  const itemsResult = await pool.query(
    `
      SELECT
        e.id,
        e.slug,
        e.title,
        e.kind,
        e.summary,
        e.body,
        e.status,
        e.published_at AS "publishedAt",
        e.created_at AS "createdAt",
        e.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('slug', t.slug, 'label', t.label)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tags
      FROM essays e
      LEFT JOIN authors a ON a.id = e.author_id
      LEFT JOIN users u ON u.id = e.created_by_user_id
      LEFT JOIN media_assets m ON m.id = e.cover_media_id
      LEFT JOIN essay_tag_links etl ON etl.essay_id = e.id
      LEFT JOIN essay_tags t ON t.id = etl.tag_id
      ${where}
      GROUP BY e.id, a.id, u.id, m.id
      ORDER BY e.published_at DESC NULLS LAST, e.created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, pageSize, safeOffset]
  );

  return {
    items: itemsResult.rows.map(mapEssayRow),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

async function getEssayTags(filters = {}) {
  await init();

  const values = [];
  const clauses = [];

  if (filters.status !== null) {
    if (filters.status === "editable") {
      clauses.push(`e.status <> 'submitted'`);
    } else {
      values.push(filters.status || "published");
      clauses.push(`e.status = $${values.length}`);
    }
  }

  if (filters.kind) {
    values.push(filters.kind);
    clauses.push(`e.kind = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await pool.query(
    `
      SELECT
        t.slug,
        t.label,
        COUNT(DISTINCT e.id)::int AS count
      FROM essay_tags t
      JOIN essay_tag_links etl ON etl.tag_id = t.id
      JOIN essays e ON e.id = etl.essay_id
      ${where}
      GROUP BY t.id
      ORDER BY t.label ASC
    `,
    values
  );

  return result.rows.map((row) => ({
    slug: row.slug,
    label: row.label,
    count: row.count,
  }));
}

async function getEssayById(id) {
  await init();

  const result = await pool.query(
    `
      SELECT
        e.id,
        e.slug,
        e.title,
        e.kind,
        e.summary,
        e.body,
        e.status,
        e.published_at AS "publishedAt",
        e.created_at AS "createdAt",
        e.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('slug', t.slug, 'label', t.label)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tags
      FROM essays e
      LEFT JOIN authors a ON a.id = e.author_id
      LEFT JOIN users u ON u.id = e.created_by_user_id
      LEFT JOIN media_assets m ON m.id = e.cover_media_id
      LEFT JOIN essay_tag_links etl ON etl.essay_id = e.id
      LEFT JOIN essay_tags t ON t.id = etl.tag_id
      WHERE e.id = $1
      GROUP BY e.id, a.id, u.id, m.id
    `,
    [id]
  );

  return result.rowCount ? mapEssayRow(result.rows[0]) : null;
}

async function getEssayBySlug(slug, options = {}) {
  await init();

  const values = [slug];
  const clauses = ["e.slug = $1"];

  if (options.status !== null) {
    values.push(options.status || "published");
    clauses.push(`e.status = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT
        e.id,
        e.slug,
        e.title,
        e.kind,
        e.summary,
        e.body,
        e.status,
        e.published_at AS "publishedAt",
        e.created_at AS "createdAt",
        e.updated_at AS "updatedAt",
        a.display_name AS author,
        a.slug AS "authorSlug",
        u.id AS "postedById",
        u.username AS "postedByUsername",
        u.display_name AS "postedByDisplayName",
        COALESCE(m.source, '') AS image,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('slug', t.slug, 'label', t.label)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tags
      FROM essays e
      LEFT JOIN authors a ON a.id = e.author_id
      LEFT JOIN users u ON u.id = e.created_by_user_id
      LEFT JOIN media_assets m ON m.id = e.cover_media_id
      LEFT JOIN essay_tag_links etl ON etl.essay_id = e.id
      LEFT JOIN essay_tags t ON t.id = etl.tag_id
      WHERE ${clauses.join(" AND ")}
      GROUP BY e.id, a.id, u.id, m.id
    `,
    values
  );

  return result.rowCount ? mapEssayRow(result.rows[0]) : null;
}

async function insertPost(post) {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const authorId = await ensureAuthor(client, {
        author: post.author,
        authorSlug: post.authorSlug,
      });
      const mediaAssetId = await ensureMediaAsset(client, post.image);

      await client.query(
        `
          INSERT INTO poems (
            id,
            slug,
            title,
            author_id,
            created_by_user_id,
            category,
            summary,
            media_asset_id,
            status,
            published_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          post.id,
          post.slug || null,
          post.title || "",
          authorId,
          post.createdByUserId || null,
          post.category,
          post.summary || "",
          mediaAssetId,
          post.status || "published",
          post.publishedAt || null,
          post.createdAt || new Date().toISOString(),
          post.updatedAt || new Date().toISOString(),
        ]
      );

      await replacePoemLines(client, post.id, post.lines || []);
      await client.query("COMMIT");

      return getPostById(post.id, { status: null });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function updatePost(post) {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const existing = await client.query(
        "SELECT media_asset_id AS \"mediaAssetId\" FROM poems WHERE id = $1",
        [post.id]
      );

      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const authorId = await ensureAuthor(client, {
        author: post.author,
        authorSlug: post.authorSlug,
      });
      const mediaAssetId = await ensureMediaAsset(
        client,
        post.image,
        existing.rows[0].mediaAssetId
      );

      await client.query(
        `
          UPDATE poems
          SET
            slug = $2,
            title = $3,
            author_id = $4,
            category = $5,
            summary = $6,
            media_asset_id = $7,
            status = $8,
            published_at = $9,
            updated_at = $10
          WHERE id = $1
        `,
        [
          post.id,
          post.slug || null,
          post.title || "",
          authorId,
          post.category,
          post.summary || "",
          mediaAssetId,
          post.status || "published",
          post.publishedAt || null,
          post.updatedAt || new Date().toISOString(),
        ]
      );

      await replacePoemLines(client, post.id, post.lines || []);
      await client.query("COMMIT");

      return getPostById(post.id, { status: null });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function insertEssay(essay) {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const authorId = await ensureAuthorIfPresent(client, {
        author: essay.author,
        authorSlug: essay.authorSlug,
      });
      const mediaAssetId = await ensureMediaAsset(client, essay.image);

      await client.query(
        `
          INSERT INTO essays (
            id,
            slug,
            title,
            author_id,
            created_by_user_id,
            kind,
            summary,
            body,
            cover_media_id,
            status,
            published_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          essay.id,
          essay.slug,
          essay.title,
          authorId,
          essay.createdByUserId || null,
          essay.kind || "commentary",
          essay.summary || "",
          essay.body || "",
          mediaAssetId,
          essay.status || "published",
          essay.publishedAt || null,
          essay.createdAt || new Date().toISOString(),
          essay.updatedAt || new Date().toISOString(),
        ]
      );

      await replaceEssayTags(client, essay.id, essay.tags || []);
      await client.query("COMMIT");

      return getEssayById(essay.id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function updateEssay(essay) {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const existing = await client.query(
        `
          SELECT
            e.id,
            e.cover_media_id AS "mediaAssetId"
          FROM essays e
          WHERE e.id = $1
        `,
        [essay.id]
      );

      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const authorId = await ensureAuthorIfPresent(client, {
        author: essay.author,
        authorSlug: essay.authorSlug,
      });
      const mediaAssetId = await ensureMediaAsset(
        client,
        essay.image,
        existing.rows[0].mediaAssetId
      );

      await client.query(
        `
          UPDATE essays
          SET
            slug = $2,
            title = $3,
            author_id = $4,
            kind = $5,
            summary = $6,
            body = $7,
            cover_media_id = $8,
            status = $9,
            published_at = $10,
            updated_at = $11
          WHERE id = $1
        `,
        [
          essay.id,
          essay.slug,
          essay.title,
          authorId,
          essay.kind || "commentary",
          essay.summary || "",
          essay.body || "",
          mediaAssetId,
          essay.status || "published",
          essay.publishedAt || null,
          essay.updatedAt || new Date().toISOString(),
        ]
      );

      await replaceEssayTags(client, essay.id, essay.tags || []);
      await client.query("COMMIT");

      return getEssayById(essay.id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function deleteEssay(id) {
  await init();
  const result = await pool.query("DELETE FROM essays WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function deletePost(id) {
  await init();
  const result = await pool.query("DELETE FROM poems WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function getAuthors() {
  await init();
  const result = await pool.query(
    `
      SELECT
        a.display_name AS author,
        a.slug AS "authorSlug",
        MAX(p.published_at) AS latest,
        COUNT(p.id)::int AS total
      FROM authors a
      JOIN poems p ON p.author_id = a.id
      GROUP BY a.id
      ORDER BY total DESC, latest DESC
    `
  );

  return result.rows;
}

async function seedIfEmpty(seedPosts = []) {
  await init();
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM poems");
  if (result.rows[0].total > 0 || !seedPosts.length) {
    return;
  }

  for (const post of seedPosts) {
    await insertPost(post);
  }
}

async function seedPostsIfMissing(seedPosts = []) {
  await init();
  if (!seedPosts.length) {
    return;
  }

  const ids = seedPosts.map((post) => post.id).filter(Boolean);
  if (!ids.length) {
    return;
  }

  const existing = await pool.query("SELECT id FROM poems WHERE id = ANY($1::text[])", [ids]);
  const existingIds = new Set(existing.rows.map((row) => row.id));

  for (const post of seedPosts) {
    if (existingIds.has(post.id)) {
      continue;
    }
    await insertPost(post);
  }
}

async function seedEssaysIfEmpty(seedEssays = []) {
  await init();
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM essays");
  if (result.rows[0].total > 0 || !seedEssays.length) {
    return;
  }

  for (const essay of seedEssays) {
    await insertEssay(essay);
  }
}

async function assignImagesIfMissing(postImageMap = {}) {
  const entries = Object.entries(postImageMap).filter(([, image]) => image);
  if (!entries.length) {
    return;
  }

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      for (const [poemId, image] of entries) {
        const result = await client.query(
          "SELECT media_asset_id AS \"mediaAssetId\" FROM poems WHERE id = $1",
          [poemId]
        );

        if (!result.rowCount || result.rows[0].mediaAssetId) {
          continue;
        }

        const mediaAssetId = await ensureMediaAsset(client, image);
        await client.query(
          `
            UPDATE poems
            SET media_asset_id = $2, updated_at = $3
            WHERE id = $1 AND media_asset_id IS NULL
          `,
          [poemId, mediaAssetId, new Date().toISOString()]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function backfillCreatedByUserIfMissing(username = "") {
  await init();

  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) {
    return { userFound: false, poemsUpdated: 0, essaysUpdated: 0 };
  }

  const user = await getUserByUsername(normalizedUsername);
  if (!user) {
    return { userFound: false, poemsUpdated: 0, essaysUpdated: 0 };
  }

  const poemsResult = await pool.query(
    `
      UPDATE poems
      SET created_by_user_id = $1
      WHERE created_by_user_id IS NULL
    `,
    [user.id]
  );

  const essaysResult = await pool.query(
    `
      UPDATE essays
      SET created_by_user_id = $1
      WHERE created_by_user_id IS NULL
    `,
    [user.id]
  );

  return {
    userFound: true,
    poemsUpdated: poemsResult.rowCount || 0,
    essaysUpdated: essaysResult.rowCount || 0,
    userId: user.id,
    username: user.username,
  };
}

async function close() {
  await pool.end();
}

module.exports = {
  init,
  close,
  getUsers,
  getUserById,
  getUserByUsername,
  countUsers,
  createUser,
  updateUser,
  createSession,
  getSessionByTokenHash,
  touchSession,
  revokeSessionByTokenHash,
  insertActivityLog,
  getActivityLogs,
  getAllPosts,
  getPagedPosts,
  getPostById,
  getRandomPostWithImage,
  insertPost,
  updatePost,
  deletePost,
  getAuthors,
  getAllEssays,
  getPagedEssays,
  getEssayById,
  getEssayBySlug,
  getEssayTags,
  insertEssay,
  updateEssay,
  deleteEssay,
  seedIfEmpty,
  seedPostsIfMissing,
  seedEssaysIfEmpty,
  assignImagesIfMissing,
  backfillCreatedByUserIfMissing,
};
