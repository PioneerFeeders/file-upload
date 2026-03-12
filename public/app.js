const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const projectSelect = document.getElementById('projectSelect');
const pendingDiv = document.getElementById('pendingFiles');
const fileList = document.getElementById('fileList');
const filterProject = document.getElementById('filterProject');
const searchInput = document.getElementById('searchInput');
const progressBar = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const previewModal = document.getElementById('previewModal');
const previewTitle = document.getElementById('previewTitle');
const previewBody = document.getElementById('previewBody');
const closePreview = document.getElementById('closePreview');

let pendingFiles = [];

// Drop zone events
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  addFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

function addFiles(fileListObj) {
  for (const file of fileListObj) {
    pendingFiles.push(file);
  }
  renderPending();
}

function renderPending() {
  uploadBtn.disabled = pendingFiles.length === 0;
  pendingDiv.innerHTML = pendingFiles.map((f, i) => `
    <div class="pending-file">
      <span>${f.name}</span>
      <span class="remove" data-idx="${i}">&times;</span>
    </div>
  `).join('');

  pendingDiv.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      pendingFiles.splice(parseInt(e.target.dataset.idx), 1);
      renderPending();
    });
  });
}

// Upload
uploadBtn.addEventListener('click', async () => {
  if (pendingFiles.length === 0) return;

  const formData = new FormData();
  formData.append('project', projectSelect.value);
  pendingFiles.forEach(f => formData.append('files', f));

  uploadBtn.disabled = true;
  progressBar.hidden = false;
  progressFill.style.width = '0%';

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        progressFill.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      }
    });

    xhr.onload = () => {
      if (xhr.status === 200) {
        pendingFiles = [];
        renderPending();
        loadFiles();
      } else {
        const err = JSON.parse(xhr.responseText);
        alert('Upload failed: ' + err.error);
      }
      progressBar.hidden = true;
    };

    xhr.onerror = () => {
      alert('Upload failed — network error');
      progressBar.hidden = true;
      uploadBtn.disabled = false;
    };

    xhr.send(formData);
  } catch (err) {
    alert('Upload error: ' + err.message);
    progressBar.hidden = true;
    uploadBtn.disabled = false;
  }
});

// Load files
async function loadFiles() {
  const params = new URLSearchParams();
  if (filterProject.value) params.set('project', filterProject.value);
  if (searchInput.value) params.set('search', searchInput.value);

  try {
    const res = await fetch('/api/files?' + params);
    const data = await res.json();
    renderFiles(data.files);
  } catch (err) {
    fileList.innerHTML = '<div class="empty-state">Error loading files</div>';
  }
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { pdf: 'PDF', csv: 'CSV', txt: 'TXT', json: 'JSON', xlsx: 'XLSX', xls: 'XLS' };
  return { ext, label: map[ext] || ext.toUpperCase() };
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function renderFiles(files) {
  if (!files || files.length === 0) {
    fileList.innerHTML = '<div class="empty-state">No files uploaded yet</div>';
    return;
  }

  fileList.innerHTML = files.map(f => {
    const icon = getFileIcon(f.original_name);
    return `
      <div class="file-row">
        <div class="file-info">
          <div class="file-type-icon ${icon.ext}">${icon.label}</div>
          <div class="file-details">
            <div class="file-name">${escapeHtml(f.original_name)}</div>
            <div class="file-meta">${f.project} &middot; ${formatSize(f.size_bytes)} &middot; ${formatDate(f.created_at)}</div>
          </div>
        </div>
        <div class="file-actions">
          <button onclick="previewFile(${f.id})">Preview</button>
          <button onclick="downloadFile(${f.id})">Download</button>
          <button class="delete" onclick="deleteFile(${f.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Preview
async function previewFile(id) {
  try {
    const res = await fetch(`/api/files/${id}`);
    const file = await res.json();
    previewTitle.textContent = file.original_name;

    if (file.parsed_data) {
      const data = typeof file.parsed_data === 'string' ? JSON.parse(file.parsed_data) : file.parsed_data;
      if (Array.isArray(data) && data.length > 0) {
        const cols = Object.keys(data[0]);
        previewBody.innerHTML = `
          <table class="csv-table">
            <thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>${data.slice(0, 100).map(row =>
              `<tr>${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`
            ).join('')}</tbody>
          </table>
          ${data.length > 100 ? `<p style="padding:1rem;color:#8b949e;">Showing 100 of ${data.length} rows</p>` : ''}
        `;
      } else {
        previewBody.textContent = JSON.stringify(data, null, 2);
      }
    } else if (file.extracted_text) {
      previewBody.textContent = file.extracted_text;
    } else {
      previewBody.textContent = 'No preview available for this file type.';
    }

    previewModal.hidden = false;
  } catch (err) {
    alert('Error loading preview');
  }
}

function downloadFile(id) {
  window.open(`/api/files/${id}/download`, '_blank');
}

async function deleteFile(id) {
  if (!confirm('Delete this file?')) return;
  try {
    await fetch(`/api/files/${id}`, { method: 'DELETE' });
    loadFiles();
  } catch (err) {
    alert('Error deleting file');
  }
}

closePreview.addEventListener('click', () => { previewModal.hidden = true; });
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) previewModal.hidden = true;
});

// Filters
filterProject.addEventListener('change', loadFiles);
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadFiles, 300);
});

// Load project filter options
async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    data.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      filterProject.appendChild(opt);
    });
  } catch (err) {
    // Ignore
  }
}

// Init
loadProjects();
loadFiles();
