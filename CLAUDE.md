# File Upload Service

Standalone file upload and document storage service for Pioneer Feeders.

## Stack
- Express/JS with raw pg driver
- Postgres for file metadata + extracted text
- Railway volume for file storage
- Vanilla JS frontend (no framework)

## Key Files
- `server.js` — Express server, API routes, file processing
- `db.js` — Postgres connection + migration runner
- `migrations/001_init.sql` — Database schema
- `public/` — Frontend (index.html, style.css, app.js)

## Environment Variables
- `DATABASE_URL` — Postgres connection string
- `PORT` — Server port (default 3000)
- `UPLOAD_DIR` — File storage path (default ./uploads, use /data/uploads on Railway)

## API Endpoints
- `POST /api/upload` — Upload files (multipart, field: `files`, body: `project`)
- `GET /api/files` — List files (query: project, type, search, limit, offset)
- `GET /api/files/:id` — Get file metadata + extracted text
- `GET /api/files/:id/download` — Download file
- `DELETE /api/files/:id` — Delete file
- `GET /api/projects` — List distinct project tags

## Railway Setup
- Needs a Postgres database
- Needs a volume mounted at `/data/uploads`
- Set `UPLOAD_DIR=/data/uploads`

## Related projects

Standalone utility — not wired into the Pioneer Feeders data pipeline. Nothing depends on it and it depends on nothing. If you need file/media handling inside a real product, look at how the existing apps already do it (for example, HelmHQ's SOP proof-photo uploads or keel-inventory's item photos) before extending this.
