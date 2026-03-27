const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.resolve(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, "haiku.db");
const db = new Database(dbFile);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    authorSlug TEXT NOT NULL,
    category TEXT NOT NULL,
    lines TEXT NOT NULL,
    summary TEXT,
    image TEXT,
    publishedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

function mapRow(row) {
  return {
    ...row,
    lines: row.lines ? JSON.parse(row.lines) : [],
  };
}

function getAllPosts(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.category) {
    clauses.push("category = @category");
    params.category = filters.category;
  }

  if (filters.authorSlug) {
    clauses.push("authorSlug = @authorSlug");
    params.authorSlug = filters.authorSlug;
  }

  let sql = `
    SELECT * FROM posts
  `;

  if (clauses.length) {
    sql += " WHERE " + clauses.join(" AND ");
  }

  sql += " ORDER BY datetime(publishedAt) DESC, datetime(createdAt) DESC";

  const rows = db.prepare(sql).all(params);
  return rows.map(mapRow);
}

function getPostById(id) {
  const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(id);
  return row ? mapRow(row) : null;
}

function insertPost(post) {
  const stmt = db.prepare(`
    INSERT INTO posts (
      id, title, author, authorSlug, category, lines, summary, image, publishedAt, createdAt, updatedAt
    ) VALUES (
      @id, @title, @author, @authorSlug, @category, @lines, @summary, @image, @publishedAt, @createdAt, @updatedAt
    )
  `);

  stmt.run({
    ...post,
    lines: JSON.stringify(post.lines || []),
    image: post.image || "",
    summary: post.summary || "",
    publishedAt: post.publishedAt || "",
    createdAt: post.createdAt || new Date().toISOString(),
    updatedAt: post.updatedAt || new Date().toISOString(),
  });

  return getPostById(post.id);
}

function getAuthors() {
  const rows = db
    .prepare(
      `
      SELECT author, authorSlug, MAX(publishedAt) AS latest, COUNT(*) AS total
      FROM posts
      GROUP BY authorSlug
      ORDER BY total DESC, latest DESC
    `
    )
    .all();

  return rows;
}

function seedIfEmpty(seedPosts = []) {
  const count = db.prepare("SELECT COUNT(*) AS total FROM posts").get().total;
  if (count > 0 || !seedPosts.length) return;

  const insertMany = db.transaction((posts) => {
    posts.forEach((post) => insertPost(post));
  });

  insertMany(seedPosts);
}

function assignImagesIfMissing(postImageMap = {}) {
  const entries = Object.entries(postImageMap).filter(([, image]) => image);
  if (!entries.length) return;

  const updateImage = db.prepare(`
    UPDATE posts
    SET image = @image, updatedAt = @updatedAt
    WHERE id = @id AND (image IS NULL OR image = '')
  `);

  const assignMany = db.transaction((items) => {
    const updatedAt = new Date().toISOString();
    items.forEach(([id, image]) => {
      updateImage.run({ id, image, updatedAt });
    });
  });

  assignMany(entries);
}

module.exports = {
  getAllPosts,
  getPostById,
  insertPost,
  getAuthors,
  seedIfEmpty,
  assignImagesIfMissing,
};
