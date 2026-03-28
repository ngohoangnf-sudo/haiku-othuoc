# Data Model

This repo now targets a Postgres-backed content model so it can grow past a small SQLite blog.

## Core tables

### `authors`
- `id`
- `slug`
- `display_name`
- `bio`
- `avatar_media_id`
- timestamps

### `media_assets`
- `id`
- `kind`
- `storage_type`
- `source`
- `mime_type`
- `original_name`
- `size_bytes`
- `alt_text`
- timestamps

`storage_type` is intended to support the transition from local asset names and data URLs to proper object storage.

### `poems`
- `id`
- `slug`
- `title`
- `author_id`
- `category`
- `summary`
- `media_asset_id`
- `status`
- `published_at`
- timestamps

### `poem_lines`
- `poem_id`
- `line_number`
- `content`

Poem lines are stored row-by-row instead of serializing the whole poem body into one field. This keeps querying, editing, and future search/indexing simpler.

### `essays`
- `id`
- `slug`
- `title`
- `author_id`
- `summary`
- `body`
- `cover_media_id`
- `status`
- `published_at`
- timestamps

### `essay_tags`
- `id`
- `slug`
- `label`

### `essay_tag_links`
- `essay_id`
- `tag_id`

## Why this model

- Poems and essays are now separate content types.
- Media is normalized into its own table so the app can move to S3/R2 later without rewriting content tables.
- Authors are normalized so future author pages, bios, and essay ownership are consistent.
- The schema still supports the current UI shape for poems while leaving room for article features later.

## Next migration step

The app still stores uploaded images as data URLs at the UI/API layer for compatibility. The next production-grade step is:

1. upload image binaries to object storage
2. save only media metadata + object key/URL in `media_assets`
3. stop storing large inline image payloads in Postgres
