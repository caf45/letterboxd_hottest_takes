// parser.js
// Reading the user's uploaded export. (Extracting the average rating from a
// Letterboxd page now happens server-side in server.py, not here.)

async function extractRatingsCsvText(file) {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return await file.text();
  }
  const zip = await JSZip.loadAsync(file);
  let entry = null;
  const seenPaths = [];
  zip.forEach((relPath, f) => {
    if (!f.dir) seenPaths.push(relPath);
    if (!entry && /(^|\/)ratings\.csv$/i.test(relPath)) entry = f;
  });
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
