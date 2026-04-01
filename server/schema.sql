CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'image',
  storage_type TEXT NOT NULL DEFAULT 'local_asset',
  source TEXT NOT NULL,
  mime_type TEXT,
  original_name TEXT,
  size_bytes BIGINT,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poems (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  author_id TEXT REFERENCES authors(id) ON DELETE RESTRICT,
  pending_author_name TEXT,
  pending_author_slug TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_session_id TEXT,
  submitted_ip_address TEXT,
  submitted_user_agent TEXT,
  category TEXT NOT NULL CHECK (category IN ('jp', 'vi', 'global')),
  summary TEXT NOT NULL DEFAULT '',
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published',
  published_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poem_lines (
  poem_id TEXT NOT NULL REFERENCES poems(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (poem_id, line_number)
);

CREATE TABLE IF NOT EXISTS essays (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author_id TEXT REFERENCES authors(id) ON DELETE SET NULL,
  pending_author_name TEXT,
  pending_author_slug TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_session_id TEXT,
  submitted_ip_address TEXT,
  submitted_user_agent TEXT,
  kind TEXT NOT NULL DEFAULT 'commentary' CHECK (kind IN ('research', 'commentary')),
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  cover_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS essay_tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS essay_tag_links (
  essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES essay_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (essay_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_poems_category_published_at
  ON poems (category, published_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poems_author_id
  ON poems (author_id);

CREATE INDEX IF NOT EXISTS idx_poem_lines_poem_id
  ON poem_lines (poem_id, line_number);

CREATE INDEX IF NOT EXISTS idx_essays_status_published_at
  ON essays (status, published_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON users (role, status);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash
  ON user_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user_id
  ON activity_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON activity_logs (created_at DESC);
