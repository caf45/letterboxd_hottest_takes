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

function buildCsv(allResults) {
  const header = ['Name', 'Year', 'Your Rating', 'Average Rating', 'Difference', 'Status', 'URL'];
  const lines = [header.join(',')];
  allResults.forEach(r => {
    const url = r.finalUrl || r.row['Letterboxd URI'];
    const vals = [
      r.row['Name'],
      r.row['Year'],
      r.userRating ?? r.row['Rating'],
      r.avg ?? '',
      r.diff ?? '',
      r.status,
      url,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
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

    // Always shows 10 total: the 5 most overrated and 5 most underrated.
    const halfN = 5;

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
        const entry = { ...r, userRating, diff, status: 'compared' };
        if (diff > 0) overrated.push(entry);
        else if (diff < 0) underrated.push(entry);
        else overrated.push(entry); // diff === 0: no lean either way, still a real comparison -- keep it in the CSV
      } else if (r.reason === 'insufficient-ratings') {
        skipped.push({ ...r, status: 'insufficient-ratings (fewer than 50 Letterboxd ratings)' });
      } else {
        failed.push({ ...r, status: `fetch failed (${r.detail || r.reason || 'unknown error'})` });
      }
    });
    overrated.sort((a, b) => b.diff - a.diff);
    underrated.sort((a, b) => a.diff - b.diff);
    // The CSV gets every film that was in the export, tagged with why it's
    // missing numbers where that applies -- the on-page cards still only
    // show the two top-5 lists, which don't need diff === 0 entries.
    lastFullResults = [...overrated, ...underrated, ...skipped, ...failed];

    document.getElementById('progressPanel').style.display = 'none';
    renderResults(overrated.filter(r => r.diff > 0), underrated, skipped, failed, halfN);
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
