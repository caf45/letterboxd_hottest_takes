// api.js
// Calls our own backend's /api/rating endpoint. Because this request goes to
// the same site that served this page (same origin), it isn't subject to
// CORS at all -- the backend itself is what actually talks to Letterboxd.

async function fetchRating(letterboxdUrl) {
  const resp = await fetch(`/api/rating?url=${encodeURIComponent(letterboxdUrl)}`);
  if (!resp.ok) throw new Error(`server error (HTTP ${resp.status})`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data; // { avg, poster, final_url } or { avg: null, reason: 'insufficient-ratings' }
}

window.fetchRating = fetchRating;
