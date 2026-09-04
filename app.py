"""
Hottest Takes -- Flask app.

Serves the web page and provides an /api/rating endpoint that fetches a
Letterboxd film page directly (server-side, so no CORS involved at all --
CORS only restricts a browser reading a *cross-origin* response; a request
this server makes to Letterboxd isn't cross-origin from anyone's browser,
it's just this server making an ordinary HTTP request, same as curl would).

This file is named app.py and exposes a module-level `app` object because
that's what Vercel's zero-config Python/Flask deployment looks for. Running
it locally (python3 app.py) still works the same as any other Flask app,
for testing before you deploy.
"""

import re
import requests
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder="web", static_url_path="")

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

# Letterboxd only publishes a community "weighted average" once a film has at
# least 50 member ratings. When it exists, it's in the page's <head> as a
# twitter-card meta tag, e.g.: <meta name="twitter:data2" content="4.39 out of 5">
RATING_RE = re.compile(r'content=["\']([\d.]+)\s+out of 5["\']', re.IGNORECASE)
POSTER_RE = re.compile(r'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']', re.IGNORECASE)
CANONICAL_RE = re.compile(r'property=["\']og:url["\']\s+content=["\']([^"\']+)["\']', re.IGNORECASE)
FILM_PAGE_RE = re.compile(r'property=["\']og:type["\']\s+content=["\']video\.movie["\']', re.IGNORECASE)


def fetch_rating(url):
    """Fetch a Letterboxd film page directly and pull out its average rating."""
    try:
        resp = requests.get(url, headers=REQUEST_HEADERS, timeout=15)
    except requests.RequestException as e:
        return {"error": f"network error: {e}"}

    if resp.status_code != 200:
        return {"error": f"HTTP {resp.status_code}"}

    html = resp.text
    m = RATING_RE.search(html)
    if m:
        poster = POSTER_RE.search(html)
        canonical = CANONICAL_RE.search(html)
        return {
            "avg": float(m.group(1)),
            "poster": poster.group(1) if poster else None,
            "final_url": canonical.group(1) if canonical else resp.url,
        }
    if FILM_PAGE_RE.search(html):
        # Real film page, just not enough community ratings for an average yet.
        return {"avg": None, "reason": "insufficient-ratings"}
    return {"error": "unexpected response (doesn't look like a film page)"}


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/rating")
def api_rating():
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "missing url"}), 400
    return jsonify(fetch_rating(url))


if __name__ == "__main__":
    # Only used if you run this directly for local testing
    # (python3 flask_app.py) -- the hosting platform runs it differently.
    app.run(debug=True)
