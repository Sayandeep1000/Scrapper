#!/usr/bin/env python3
"""
B.L.A.S.T. Layer 3 Tool: serve.py
Lightweight HTTP server that:
  1. Serves the dashboard/ directory as a static site
  2. Exposes GET /api/articles — runs scrape.py and returns .tmp/articles.json
  3. Exposes POST /api/scrape   — force-runs the scraper
"""

import http.server
import json
import subprocess
import sys
import os
import logging
from pathlib import Path
from datetime import datetime, timezone

BASE_DIR = Path(__file__).parent.parent
DASHBOARD_DIR = BASE_DIR / "dashboard"
TMP_DIR = BASE_DIR / ".tmp"
ARTICLES_FILE = TMP_DIR / "articles.json"
SCRAPER_SCRIPT = BASE_DIR / "tools" / "scrape.py"

PORT = 8765

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("server")


def run_scraper() -> bool:
    """Run scrape.py and return True if successful."""
    log.info("Running scraper...")
    try:
        result = subprocess.run(
            [sys.executable, str(SCRAPER_SCRIPT)],
            capture_output=True,
            text=True,
            timeout=90
        )
        if result.returncode == 0:
            log.info("Scraper completed successfully.")
            return True
        else:
            log.error(f"Scraper failed:\n{result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        log.error("Scraper timed out after 60s")
        return False
    except Exception as e:
        log.error(f"Failed to run scraper: {e}")
        return False


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/articles":
            self._serve_articles()
        elif self.path == "/api/health":
            self._json_response({"status": "ok", "time": datetime.now(timezone.utc).isoformat()})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/scrape":
            self._trigger_scrape()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _serve_articles(self):
        # Run scraper if no file exists yet
        if not ARTICLES_FILE.exists():
            log.info("No articles file found, running scraper...")
            run_scraper()
        
        if ARTICLES_FILE.exists():
            with open(ARTICLES_FILE, "r", encoding="utf-8") as f:
                data = f.read()
            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(data.encode("utf-8"))
        else:
            self._json_response({"error": "No articles available. Scraper may have failed."}, 503)

    def _trigger_scrape(self):
        success = run_scraper()
        if success and ARTICLES_FILE.exists():
            with open(ARTICLES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._json_response({"status": "ok", "count": data.get("count", 0)})
        else:
            self._json_response({"status": "error", "message": "Scraper failed"}, 500)

    def _json_response(self, data: dict, code: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        log.info(f"{self.address_string()} - {format % args}")


def main():
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    
    log.info("=" * 55)
    log.info("  🚀 AI News Dashboard Server")
    log.info(f"  Dashboard: http://localhost:{PORT}")
    log.info(f"  API:       http://localhost:{PORT}/api/articles")
    log.info("=" * 55)
    
    # Run initial scrape if needed
    if not ARTICLES_FILE.exists():
        log.info("Running initial scrape on startup...")
        run_scraper()
    
    with http.server.HTTPServer(("", PORT), DashboardHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log.info("\nServer stopped.")


if __name__ == "__main__":
    main()
