CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  project TEXT DEFAULT 'general',
  extracted_text TEXT,
  parsed_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_project ON files (project);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at DESC);
