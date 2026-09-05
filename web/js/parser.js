// parser.js
// Reading the user's uploaded Letterboxd export .zip. (Extracting the
// average rating from a Letterboxd page happens server-side in app.py, not
// here.)

async function extractRatingsCsvText(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Please upload the .zip file exported from Letterboxd (Settings → Data → Export your data).');
  }

  const zip = await JSZip.loadAsync(file);
  const seenPaths = [];
  zip.forEach((relPath, f) => {
    if (!f.dir) seenPaths.push(relPath);
  });

  // Prefer the real top-level ratings.csv. Letterboxd's export can also
  // include a "deleted/ratings.csv" (previously-deleted ratings) -- picking
  // that up by mistake instead of the real one would silently produce a
  // smaller, wrong film count. zip.file('ratings.csv') is an exact-path
  // lookup, so it can only match the genuine top-level file, never a
  // nested one.
  let entry = zip.file('ratings.csv');

  if (!entry) {
    // No top-level ratings.csv -- fall back to a nested one, but never one
    // under "deleted/", and prefer the shallowest match if there's more
    // than one.
    const candidates = seenPaths
      .filter(p => /(^|\/)ratings\.csv$/i.test(p) && !/^deleted\//i.test(p))
      .sort((a, b) => a.split('/').length - b.split('/').length);
    const path = candidates[0];
    if (path) entry = zip.file(path);
  }

  if (!entry) {
    const preview = seenPaths.slice(0, 8).join(', ') || '(no files found in the zip at all)';
    throw new Error(
      `Could not find ratings.csv inside "${file.name}". Files this zip actually contains: ${preview}` +
      (seenPaths.length > 8 ? `, and ${seenPaths.length - 8} more.` : '.')
    );
  }
  return await entry.async('string');
}

function parseRatingsCsv(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data.filter(r => r['Letterboxd URI'] && r['Rating']);
}

window.extractRatingsCsvText = extractRatingsCsvText;
window.parseRatingsCsv = parseRatingsCsv;
