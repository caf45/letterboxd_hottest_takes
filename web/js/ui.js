// ui.js
// All DOM rendering lives here.

const el = id => document.getElementById(id);

function log(msg) {
  const logEl = el('log');
  const line = document.createElement('div');
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function showError(msg) {
  el('errorPanel').style.display = 'block';
  el('errorBox').textContent = msg;
}

function hideError() {
  el('errorPanel').style.display = 'none';
}

function updateProgress(done, total, row, result) {
  const pct = Math.round((done / total) * 100);
  el('progressFill').style.width = pct + '%';
  el('progressCount').textContent = `${done} / ${total}`;
  el('progressPct').textContent = pct + '%';

  let status;
  if (result.avg !== null) status = `avg ${result.avg}`;
  else if (result.reason === 'insufficient-ratings') status = 'not enough community ratings';
  else status = `fetch failed — ${result.detail || result.reason || 'unknown error'}`;

  log(`[${done}/${total}] ${row['Name']} (${row['Year']}) → ${status}`);
}

function starsFor(n) {
  const full = Math.floor(n);
  const half = (n - full) >= 0.5;
  return '\u2605'.repeat(full) + (half ? '\u00bd' : '');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

function renderCardList(containerId, list) {
  const cardsEl = el(containerId);
  cardsEl.innerHTML = '';
  if (!list.length) {
    cardsEl.innerHTML = '<div class="empty-note">Nothing here.</div>';
    return;
  }
  list.forEach((r, idx) => {
    const direction = r.diff > 0 ? 'Overrated it' : 'Underrated it';
    const badgeClass = r.diff > 0 ? 'over' : 'under';
    const posterHtml = r.poster
      ? `<img class="poster" src="${escapeHtml(r.poster)}" alt="">`
      : `<div class="poster placeholder"></div>`;
    const url = r.finalUrl || r.row['Letterboxd URI'];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="rank">#${idx + 1}</div>
      ${posterHtml}
      <div class="info">
        <div class="title"><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(r.row['Name'])}</a> <span class="year">(${escapeHtml(r.row['Year'])})</span></div>
        <div class="ratings">
          <span class="you">You: ${r.userRating.toFixed(1)} ${starsFor(r.userRating)}</span>
          <span class="avg">Crowd: ${r.avg.toFixed(2)} ${starsFor(r.avg)}</span>
        </div>
        <div class="diff-row">
          <span class="badge ${badgeClass}">${direction}</span>
          <span class="diff-value">${r.diff > 0 ? '+' : ''}${r.diff.toFixed(2)}</span>
        </div>
      </div>`;
    cardsEl.appendChild(card);
  });
}

function renderResults(overrated, underrated, skipped, failed, halfN) {
  const total = Math.min(halfN, overrated.length) + Math.min(halfN, underrated.length);
  el('resultsTitle').textContent = `Your top ${total} hottest takes`;

  renderCardList('overratedCards', overrated.slice(0, halfN));
  renderCardList('underratedCards', underrated.slice(0, halfN));

  renderExpandableSection(
    'skippedBox',
    skipped,
    n => `${n} film(s) skipped — fewer than 50 Letterboxd ratings, so there's no community average to compare against`
  );
  renderExpandableSection(
    'failedBox',
    failed,
    n => `${n} film(s) couldn't be fetched at all (network issue) — click for details`
  );

  el('resultsPanel').style.display = 'block';
  el('resultsPanel').scrollIntoView({ behavior: 'smooth' });
}

function renderExpandableSection(boxId, list, labelFn) {
  const box = el(boxId);
  if (!list.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.querySelector('summary').textContent = labelFn(list.length);
  const target = box.querySelector('.skipped-list');
  target.innerHTML = list.map(s =>
    `<div>${escapeHtml(s.row['Name'])} (${escapeHtml(s.row['Year'])})${s.detail ? ' — ' + escapeHtml(s.detail) : ''}</div>`
  ).join('');
}

window.log = log;
window.showError = showError;
window.hideError = hideError;
window.updateProgress = updateProgress;
window.renderResults = renderResults;
window.escapeHtml = escapeHtml;
