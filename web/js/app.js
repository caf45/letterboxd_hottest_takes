// app.js
// Wires everything together: file upload -> parse -> fetch averages -> render.

// Fetching now goes through our own local server rather than shared,
// rate-limited third-party proxies, so we can afford more parallel requests.
// Letterboxd itself is still a real website being polite to, though, so this
// stays moderate rather than maximal.
const CONCURRENCY = 10;

let selectedFile = null;
let lastFullResults = [];

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filenameEl = document.getElementById('filename');
const startBtn = document.getElementById('startBtn');
const topNInput = document.getElementById('topN');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const startOverBtn = document.getElementById('startOverBtn');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  selectedFile = file;
  filenameEl.textContent = file.name;
  startBtn.disabled = false;
}

async function processAll(rows, concurrency, onProgress) {
  const results = new Array(rows.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= rows.length) return;
      const row = rows[i];
      let result;
      try {
        const data = await fetchRating(row['Letterboxd URI']);
        if (data.avg !== null && data.avg !== undefined) {
          result = { row, avg: data.avg, poster: data.poster, finalUrl: data.final_url, reason: null };
        } else {
          result = { row, avg: null, poster: null, finalUrl: null, reason: data.reason || 'insufficient-ratings' };
        }
      } catch (e) {
        result = { row, avg: null, poster: null, finalUrl: null, reason: 'network', detail: e.message };
      }
      results[i] = result;
      completed++;
      onProgress(completed, rows.length, row, result);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

function buildCsv(compared) {
  const header = ['Name', 'Year', 'Your Rating', 'Average Rating', 'Difference', 'URL'];
  const lines = [header.join(',')];
  compared.forEach(r => {
    const url = r.finalUrl || r.row['Letterboxd URI'];
    const vals = [r.row['Name'], r.row['Year'], r.userRating, r.avg, r.diff, url]
      .map(v => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(vals.join(','));
  });
  return lines.join('\n');
}

startBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  hideError();
  document.getElementById('progressPanel').style.display = 'block';
  document.getElementById('resultsPanel').style.display = 'none';
  startBtn.disabled = true;
  document.getElementById('log').innerHTML = '';

  try {
    const csvText = await extractRatingsCsvText(selectedFile);
    const rows = parseRatingsCsv(csvText);
    if (!rows.length) throw new Error('No rated films found in that file.');

    const topN = Math.max(1, parseInt(topNInput.value) || 10);
    const halfN = Math.max(1, Math.round(topN / 2));

    log(`Found ${rows.length} rated films. Fetching Letterboxd averages (${CONCURRENCY} at a time)…`);

    const results = await processAll(rows, CONCURRENCY, updateProgress);

    const overrated = [];
    const underrated = [];
    const skipped = [];
    const failed = [];
    results.forEach(r => {
      if (r.avg !== null) {
        const userRating = parseFloat(r.row['Rating']);
        const diff = Math.round((userRating - r.avg) * 100) / 100;
        const entry = { ...r, userRating, diff };
        if (diff > 0) overrated.push(entry);
        else if (diff < 0) underrated.push(entry);
        // diff === 0 (exact match with the crowd) isn't a "take" either way, so it's excluded from both lists.
      } else if (r.reason === 'insufficient-ratings') {
        skipped.push(r);
      } else {
        failed.push(r);
      }
    });
    overrated.sort((a, b) => b.diff - a.diff);
    underrated.sort((a, b) => a.diff - b.diff);
    lastFullResults = [...overrated, ...underrated].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    document.getElementById('progressPanel').style.display = 'none';
    renderResults(overrated, underrated, skipped, failed, halfN);
  } catch (e) {
    document.getElementById('progressPanel').style.display = 'none';
    showError('Something went wrong: ' + e.message);
    startBtn.disabled = false;
  }
});

downloadCsvBtn.addEventListener('click', () => {
  const csv = buildCsv(lastFullResults);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'full_comparison.csv';
  a.click();
  URL.revokeObjectURL(url);
});

startOverBtn.addEventListener('click', () => {
  document.getElementById('resultsPanel').style.display = 'none';
  selectedFile = null;
  filenameEl.textContent = '';
  fileInput.value = '';
  startBtn.disabled = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
