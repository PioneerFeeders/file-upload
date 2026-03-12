require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool, initDb } = require('./db');
const pdfParse = require('pdf-parse');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Upload directory — Railway volume mount or local
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.xlsx', '.xls', '.txt', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed: ${allowed.join(', ')}`));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload endpoint
app.post('/api/upload', upload.array('files', 20), async (req, res) => {
  try {
    const project = req.body.project || 'general';
    const results = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      let extractedText = null;
      let parsedData = null;

      // Extract text from PDFs
      if (ext === '.pdf') {
        try {
          const buffer = fs.readFileSync(file.path);
          const pdf = await pdfParse(buffer);
          extractedText = pdf.text;
        } catch (e) {
          extractedText = `[PDF parse error: ${e.message}]`;
        }
      }

      // Parse CSVs
      if (ext === '.csv') {
        try {
          const content = fs.readFileSync(file.path, 'utf8');
          const records = parse(content, { columns: true, skip_empty_lines: true });
          parsedData = records;
          extractedText = content;
        } catch (e) {
          extractedText = `[CSV parse error: ${e.message}]`;
        }
      }

      // Plain text files
      if (['.txt', '.json'].includes(ext)) {
        try {
          extractedText = fs.readFileSync(file.path, 'utf8');
        } catch (e) {
          extractedText = null;
        }
      }

      const result = await pool.query(
        `INSERT INTO files (original_name, stored_name, file_path, mime_type, size_bytes, project, extracted_text, parsed_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, original_name, project, size_bytes, created_at`,
        [
          file.originalname,
          file.filename,
          file.path,
          file.mimetype,
          file.size,
          project,
          extractedText,
          parsedData ? JSON.stringify(parsedData) : null
        ]
      );

      results.push(result.rows[0]);
    }

    res.json({ success: true, files: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List files
app.get('/api/files', async (req, res) => {
  try {
    const { project, type, search, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT id, original_name, mime_type, size_bytes, project, created_at FROM files WHERE 1=1';
    const params = [];

    if (project) {
      params.push(project);
      query += ` AND project = $${params.length}`;
    }
    if (type) {
      params.push(`%.${type}`);
      query += ` AND original_name ILIKE $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (original_name ILIKE $${params.length} OR extracted_text ILIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC';
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    res.json({ files: result.rows });
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single file metadata + extracted text
app.get('/api/files/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, original_name, stored_name, mime_type, size_bytes, project, extracted_text, parsed_data, created_at FROM files WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download file
app.get('/api/files/:id/download', async (req, res) => {
  try {
    const result = await pool.query('SELECT original_name, file_path, mime_type FROM files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    res.download(file.file_path, file.original_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file
app.delete('/api/files/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT file_path FROM files WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    // Delete from disk
    const filePath = result.rows[0].file_path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from DB
    await pool.query('DELETE FROM files WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List distinct projects
app.get('/api/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT project FROM files ORDER BY project');
    res.json({ projects: result.rows.map(r => r.project) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handler for multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`File Upload Service running on port ${PORT}`);
  });
}

start();
