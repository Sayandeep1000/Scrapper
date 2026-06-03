#!/usr/bin/env python3
"""
B.L.A.S.T. Layer 3 Tool: scrape.py
Fetches latest AI news articles from all configured sources.
Outputs to .tmp/articles.json

Sources:
  - Ben's Bites         (Substack RSS + OG image fetch per article)
  - The Rundown AI      (Sitemap XML → /p/ articles, OG image from each page)
  - Reddit r/artificial, r/MachineLearning, r/singularity  (via PRAW OAuth)

Image Strategy:
  - Rundown AI: Parse sitemap.xml for recent /p/ articles → fetch og:image from each page
  - Ben's Bites: Try RSS media/enclosure first, then fetch og:image from article page
  - Reddit: Use PRAW's preview.images[0] or thumbnail URL
"""

import json
import hashlib
import time
import sys
import os
import re
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Dependency check ──────────────────────────────────────────────────────────
MISSING = []
try:
    import requests
except ImportError:
    MISSING.append("requests")
try:
    import feedparser
except ImportError:
    MISSING.append("feedparser")

if MISSING:
    print(f"Missing dependencies. Run: python -m pip install {' '.join(MISSING)}")
    sys.exit(1)

# Optional: PRAW for Reddit
try:
    import praw
    PRAW_AVAILABLE = True
except ImportError:
    PRAW_AVAILABLE = False

# Optional: BeautifulSoup (not required anymore but kept as fallback)
try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

# ── dotenv loading ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
ENV_FILE = BASE_DIR / ".env"

def load_env():
    if ENV_FILE.exists():
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())

load_env()

# ── Config ─────────────────────────────────────────────────────────────────

SOURCES = {
    "rss": [
        {
            "id": "bensbites",
            "label": "Ben's Bites",
            "url": "https://bensbites.substack.com/feed",
            "color": "#f59e0b",
            "icon": "🍔"
        },
        {
            "id": "techcrunch",
            "label": "TechCrunch AI",
            "url": "https://techcrunch.com/category/artificial-intelligence/feed/",
            "color": "#00b233",
            "icon": "🚀"
        },
        {
            "id": "venturebeat",
            "label": "VentureBeat AI",
            "url": "https://venturebeat.com/category/ai/feed/",
            "color": "#e84040",
            "icon": "💡"
        },
        {
            "id": "mittech",
            "label": "MIT Tech Review",
            "url": "https://www.technologyreview.com/feed/",
            "color": "#a78bfa",
            "icon": "🎓"
        },
        {
            "id": "theverge",
            "label": "The Verge",
            "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
            "color": "#e85d04",
            "icon": "📡"
        },
        {
            "id": "wired",
            "label": "Wired",
            "url": "https://www.wired.com/feed/rss",
            "color": "#38bdf8",
            "icon": "🔌"
        }
    ],
    "rundown": [
        {
            "id": "airundown",
            "label": "The Rundown AI",
            "sitemap_url": "https://www.therundown.ai/sitemap.xml",
            "base_url": "https://www.therundown.ai",
            "color": "#10b981",
            "icon": "⚡"
        }
    ],
    "reddit": [
        {
            "id": "reddit_artificial",
            "label": "r/artificial",
            "subreddit": "artificial",
            "color": "#ff4500",
            "icon": "🤖"
        },
        {
            "id": "reddit_ml",
            "label": "r/MachineLearning",
            "subreddit": "MachineLearning",
            "color": "#ff6b35",
            "icon": "🧠"
        },
        {
            "id": "reddit_singularity",
            "label": "r/singularity",
            "subreddit": "singularity",
            "color": "#a855f7",
            "icon": "🌀"
        }
    ],
    "hackernews": {
        "id": "hackernews",
        "label": "Hacker News",
        "color": "#ff6600",
        "icon": "🔶",
        "limit": 40  # fetch top N stories, filter by AI keywords
    }
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

LOOKBACK_HOURS = 120  # Wide window — newsletters publish infrequently
REQUEST_TIMEOUT = 8
OG_IMAGE_TIMEOUT = 6
MAX_OG_WORKERS = 8        # Concurrent OG image fetches
MAX_OG_PER_SOURCE = 25   # Max articles to OG-enrich per source

OUTPUT_DIR = BASE_DIR / ".tmp"
OUTPUT_FILE = OUTPUT_DIR / "articles.json"

# ── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("scraper")

# ── Helpers ──────────────────────────────────────────────────────────────────

def make_id(url: str, title: str) -> str:
    raw = f"{url}|{title}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]

def cutoff_time() -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)

def within_window(dt: datetime | None) -> bool:
    if dt is None:
        return True
    return dt >= cutoff_time()

def struct_to_dt(t) -> datetime | None:
    if t is None:
        return None
    try:
        return datetime(*t[:6], tzinfo=timezone.utc)
    except Exception:
        return None

def truncate(text: str, max_len: int = 300) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] + "…" if len(text) > max_len else text

def strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "")

def parse_iso_date(date_str: str) -> datetime | None:
    """Parse ISO 8601 date string, including date-only formats. Always returns UTC-aware datetime."""
    if not date_str:
        return None
    try:
        # Try full ISO with timezone
        dt = datetime.fromisoformat(date_str.strip().replace("Z", "+00:00"))
        # Ensure timezone-aware
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    try:
        # Try date-only: YYYY-MM-DD
        d = datetime.strptime(date_str.strip()[:10], "%Y-%m-%d")
        return d.replace(tzinfo=timezone.utc)
    except Exception:
        return None

# ── OG Image Extractor ────────────────────────────────────────────────────────

def fetch_og_image(url: str) -> str | None:
    """Fetch og:image meta tag from a URL's HTML head. Uses r.text for proper decompression."""
    try:
        # Add identity encoding to ensure we get decompressible content
        h = {**HEADERS, "Accept-Encoding": "gzip, deflate"}
        resp = requests.get(url, headers=h, timeout=OG_IMAGE_TIMEOUT)
        resp.raise_for_status()
        # Use .text — requests auto-decompresses gzip/deflate
        chunk = resp.text[:16000]

        # Try og:image first (handles both attribute orderings)
        m = re.search(r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']', chunk)
        if m:
            return m.group(1).strip()
        m = re.search(r'content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', chunk)
        if m:
            return m.group(1).strip()
        # Twitter:image fallback
        m = re.search(r'name=["\']twitter:image["\'][^>]*content=["\']([^"\']+)["\']', chunk)
        if m:
            return m.group(1).strip()
        m = re.search(r'content=["\']([^"\']+)["\'][^>]*name=["\']twitter:image["\']', chunk)
        if m:
            return m.group(1).strip()
        # Fallback: any S3 beehiiv image URL
        m = re.search(r'(https://beehiiv-images-production\.s3\.amazonaws\.com/[^\s"\']+'  
                      r'\.(?:jpg|png|jpeg|webp)(?:\?[^\s"\']*)?)' , chunk)
        if m:
            return m.group(1)
    except Exception:
        pass
    return None


def enrich_with_og_images(articles: list[dict], max_workers: int = MAX_OG_WORKERS) -> list[dict]:
    """For articles missing image_url, fetch OG image concurrently."""
    to_enrich = [a for a in articles if not a.get("image_url")]
    if not to_enrich:
        return articles

    log.info(f"  → Fetching OG images for {len(to_enrich)} articles...")
    url_to_article = {a["url"]: a for a in to_enrich}

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(fetch_og_image, url): url for url in url_to_article}
        for future in as_completed(futures):
            url = futures[future]
            try:
                img = future.result()
                if img:
                    url_to_article[url]["image_url"] = img
            except Exception:
                pass

    return articles


# ── RSS Scraper (Ben's Bites) ─────────────────────────────────────────────────

def fetch_rss(source: dict) -> list[dict]:
    articles = []
    log.info(f"Fetching RSS: {source['label']} ({source['url']})")
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        feed = feedparser.parse(resp.content)

        for entry in feed.entries:
            pub_dt = struct_to_dt(getattr(entry, "published_parsed", None))
            if not within_window(pub_dt):
                continue

            title = getattr(entry, "title", "Untitled")
            url = getattr(entry, "link", "")
            summary_raw = getattr(entry, "summary", "") or getattr(entry, "description", "")
            summary = truncate(strip_html(summary_raw))

            # Try to get image from RSS media tags
            image_url = None
            # feedparser media_content
            media = getattr(entry, "media_content", None)
            if media and isinstance(media, list):
                for m in media:
                    if m.get("url") and "image" in m.get("type", "image"):
                        image_url = m["url"]
                        break
            # feedparser enclosures
            if not image_url:
                enclosures = getattr(entry, "enclosures", [])
                for enc in enclosures:
                    if hasattr(enc, "url") and "image" in getattr(enc, "type", "image"):
                        image_url = enc.url
                        break
            # Try media_thumbnail
            if not image_url:
                thumbs = getattr(entry, "media_thumbnail", None)
                if thumbs and isinstance(thumbs, list):
                    image_url = thumbs[0].get("url")

            article = {
                "id": make_id(url, title),
                "source": source["id"],
                "source_label": source["label"],
                "source_color": source["color"],
                "source_icon": source["icon"],
                "title": title,
                "summary": summary,
                "url": url,
                "published_at": pub_dt.isoformat() if pub_dt else datetime.now(timezone.utc).isoformat(),
                "image_url": image_url,
                "tags": [],
                "score": None
            }
            articles.append(article)

        log.info(f"  → {len(articles)} articles from {source['label']}")

        # Enrich missing images via OG fetch (limit to avoid slowness)
        to_enrich = [a for a in articles if not a.get("image_url")][:MAX_OG_PER_SOURCE]
        if to_enrich:
            enrich_with_og_images(to_enrich)

    except Exception as e:
        log.error(f"  ✗ Failed to fetch {source['label']}: {e}")

    return articles


# ── The Rundown AI — Sitemap Scraper ──────────────────────────────────────────

def fetch_rundown_sitemap(source: dict) -> list[dict]:
    """
    Parse therundown.ai/sitemap.xml to get recent /p/ newsletter issues.
    The sitemap contains <news:title> and <news:publication_date> for recent articles.
    Then fetch og:image from each article page concurrently.
    """
    articles = []
    log.info(f"Fetching Rundown AI via sitemap: {source['sitemap_url']}")
    cutoff = cutoff_time()

    try:
        resp = requests.get(source["sitemap_url"], headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        xml = resp.text

        # Extract URL blocks
        url_blocks = re.findall(r"<url>(.*?)</url>", xml, re.DOTALL)

        for block in url_blocks:
            # Only process /p/ newsletter articles
            loc_m = re.search(r"<loc>(.*?)</loc>", block)
            if not loc_m:
                continue
            loc = loc_m.group(1).strip()
            if "/p/" not in loc:
                continue

            # Get publication date — prefer news:publication_date (has time), fall back to lastmod
            pub_dt = None
            news_date_m = re.search(r"<news:publication_date>(.*?)</news:publication_date>", block)
            if news_date_m:
                pub_dt = parse_iso_date(news_date_m.group(1).strip())
            if pub_dt is None:
                lastmod_m = re.search(r"<lastmod>(.*?)</lastmod>", block)
                if lastmod_m:
                    pub_dt = parse_iso_date(lastmod_m.group(1).strip())

            if pub_dt and pub_dt < cutoff:
                continue  # Too old

            # Get title from news:title or derive from URL slug
            title = None
            news_title_m = re.search(r"<news:title>(.*?)</news:title>", block)
            if news_title_m:
                title = news_title_m.group(1).strip()
                # Unescape common XML entities
                title = title.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'")
            if not title:
                # Derive from URL slug
                slug = loc.rstrip("/").split("/p/")[-1]
                title = slug.replace("-", " ").title()

            article = {
                "id": make_id(loc, title),
                "source": source["id"],
                "source_label": source["label"],
                "source_color": source["color"],
                "source_icon": source["icon"],
                "title": title,
                "summary": "",  # Will attempt to fill from OG description
                "url": loc,
                "published_at": pub_dt.isoformat() if pub_dt else datetime.now(timezone.utc).isoformat(),
                "image_url": None,
                "tags": ["newsletter"],
                "score": None
            }
            articles.append(article)

        log.info(f"  → {len(articles)} recent articles found in sitemap")

        if not articles:
            log.warning("  ⚠ No articles within 24h found in sitemap. Check lookback window.")
            return articles

        # Fetch OG image + description for each article concurrently
        log.info(f"  → Fetching thumbnails + descriptions for {min(len(articles), MAX_OG_PER_SOURCE)} articles...")
        to_enrich = articles[:MAX_OG_PER_SOURCE]

        def fetch_article_meta(article: dict) -> dict:
            url = article["url"]
            try:
                h = {**HEADERS, "Accept-Encoding": "gzip, deflate"}
                r = requests.get(url, headers=h, timeout=OG_IMAGE_TIMEOUT)
                r.raise_for_status()
                chunk = r.text[:18000]  # First 18KB covers all <head> tags

                # og:image
                for pat in [
                    r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
                    r'content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']',
                    r'name=["\']twitter:image["\'][^>]*content=["\']([^"\']+)["\']',
                    r'content=["\']([^"\']+)["\'][^>]*name=["\']twitter:image["\']',
                    r'(https://beehiiv-images-production\.s3\.amazonaws\.com/[^\s"\']+'  
                    r'\.(?:jpg|png|jpeg|webp)(?:\?[^\s"\']*)?)'
                ]:
                    m = re.search(pat, chunk)
                    if m:
                        article["image_url"] = m.group(1).strip()
                        break

                # og:description
                if not article.get("summary"):
                    for pat in [
                        r'property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']',
                        r'content=["\']([^"\']+)["\'][^>]*property=["\']og:description["\']',
                        r'name=["\']description["\'][^>]*content=["\']([^"\']+)["\']',
                        r'content=["\']([^"\']+)["\'][^>]*name=["\']description["\']',
                    ]:
                        m = re.search(pat, chunk)
                        if m:
                            desc = m.group(1).strip()
                            desc = desc.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'").replace("&quot;", '"')
                            article["summary"] = truncate(desc)
                            break

            except Exception as ex:
                log.debug(f"  ⚠ Could not fetch meta for {url}: {ex}")
            return article

        with ThreadPoolExecutor(max_workers=MAX_OG_WORKERS) as pool:
            futures = {pool.submit(fetch_article_meta, a): a for a in to_enrich}
            enriched = 0
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result.get("image_url"):
                        enriched += 1
                except Exception:
                    pass
            log.info(f"  → {enriched}/{len(to_enrich)} articles got thumbnail images")

        # Fill in default summary for any still missing
        for a in articles:
            if not a.get("summary"):
                a["summary"] = "Read the latest AI news digest from The Rundown AI."

    except Exception as e:
        log.error(f"  ✗ Failed to scrape Rundown AI: {e}")

    return articles


# ── Reddit Scraper (PRAW) ─────────────────────────────────────────────────────

def fetch_reddit_praw(source: dict, reddit_client) -> list[dict]:
    articles = []
    log.info(f"Fetching Reddit (PRAW): {source['label']}")
    try:
        cutoff = cutoff_time().timestamp()
        subreddit = reddit_client.subreddit(source["subreddit"])

        for post in subreddit.top(time_filter="day", limit=40):
            if post.created_utc < cutoff:
                continue

            title = post.title
            permalink = f"https://reddit.com{post.permalink}"
            url_link = post.url
            selftext = post.selftext or ""
            score = post.score

            # Image
            image_url = None
            if hasattr(post, "preview") and post.preview:
                try:
                    image_url = post.preview["images"][0]["source"]["url"]
                    # Reddit encodes & as &amp; in preview URLs
                    image_url = image_url.replace("&amp;", "&")
                except (KeyError, IndexError):
                    pass
            if not image_url and hasattr(post, "thumbnail") and post.thumbnail.startswith("http"):
                image_url = post.thumbnail

            summary = truncate(selftext) if selftext.strip() else f"↑ {score:,} upvotes · {post.num_comments:,} comments"
            pub_dt = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)

            article = {
                "id": make_id(permalink, title),
                "source": source["id"],
                "source_label": source["label"],
                "source_color": source["color"],
                "source_icon": source["icon"],
                "title": title,
                "summary": summary,
                "url": permalink,
                "published_at": pub_dt.isoformat(),
                "image_url": image_url,
                "tags": [],
                "score": score
            }
            articles.append(article)

        log.info(f"  → {len(articles)} posts from {source['label']}")
    except Exception as e:
        log.error(f"  ✗ Failed to fetch {source['label']}: {e}")

    return articles


def init_reddit_client():
    client_id     = os.environ.get("REDDIT_CLIENT_ID", "").strip()
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        log.warning("⚠ Reddit credentials not found in .env (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET)")
        log.warning("  → Reddit sources will be skipped.")
        log.warning("  → To enable: register a script app at https://www.reddit.com/prefs/apps")
        return None

    if not PRAW_AVAILABLE:
        log.warning("⚠ PRAW not installed. Run: python -m pip install praw")
        log.warning("  → Reddit sources will be skipped.")
        return None

    try:
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent="windows:ai-pulse-dashboard:v1.0 (personal use)"
        )
        reddit.read_only = True
        log.info(f"✓ Reddit OAuth ready (read-only)")
        return reddit
    except Exception as e:
        log.error(f"✗ Reddit PRAW init failed: {e}")
        return None


# ── Hacker News Scraper ──────────────────────────────────────────────────────

HN_AI_KEYWORDS = [
    "ai", "artificial intelligence", "machine learning", "llm", "gpt", "openai",
    "anthropic", "gemini", "claude", "chatgpt", "deepmind", "neural", "model",
    "transformer", "diffusion", "stable diffusion", "midjourney", "robotics",
    "automation", "language model", "generative", "deep learning", "ml",
    "agi", "alignment"
]

def fetch_hackernews(source: dict) -> list[dict]:
    articles = []
    log.info(f"Fetching Hacker News top stories...")
    try:
        # Get top story IDs
        resp = requests.get(
            "https://hacker-news.firebaseio.com/v0/topstories.json",
            headers=HEADERS, timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        story_ids = resp.json()[:source["limit"]]

        cutoff = cutoff_time()

        def fetch_story(sid):
            try:
                r = requests.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{sid}.json",
                    headers=HEADERS, timeout=(3, 6)  # (connect, read)
                )
                r.raise_for_status()
                return r.json()
            except Exception:
                return None

        with ThreadPoolExecutor(max_workers=20) as pool:
            results = list(pool.map(fetch_story, story_ids))

        for item in results:
            if not item or item.get("type") != "story":
                continue

            title = item.get("title", "")
            url = item.get("url") or f"https://news.ycombinator.com/item?id={item['id']}"
            score = item.get("score", 0)
            created = item.get("time", 0)

            # Filter by time window
            pub_dt = datetime.fromtimestamp(created, tz=timezone.utc)
            if pub_dt < cutoff:
                continue

            # Filter: title must contain an AI keyword
            title_lower = title.lower()
            if not any(kw in title_lower for kw in HN_AI_KEYWORDS):
                continue

            permalink = f"https://news.ycombinator.com/item?id={item['id']}"
            num_comments = item.get("descendants", 0)

            article = {
                "id": make_id(permalink, title),
                "source": source["id"],
                "source_label": source["label"],
                "source_color": source["color"],
                "source_icon": source["icon"],
                "title": title,
                "summary": f"↑ {score:,} points · {num_comments:,} comments · {url}",
                "url": permalink,
                "published_at": pub_dt.isoformat(),
                "image_url": None,
                "tags": ["hackernews"],
                "score": score
            }
            articles.append(article)

        articles.sort(key=lambda x: x["score"] or 0, reverse=True)
        log.info(f"  → {len(articles)} AI-tagged stories from Hacker News")

    except Exception as e:
        log.error(f"  ✗ Failed to fetch Hacker News: {e}")

    return articles


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 55)
    log.info("  B.L.A.S.T. Scraper — Starting feed collection")
    log.info(f"  Lookback window: last {LOOKBACK_HOURS} hours")
    log.info("=" * 55)

    all_articles = []

    # ── Run ALL sources in parallel ──────────────────────────────────
    tasks = []

    # RSS sources (each gets its own thread)
    for source in SOURCES["rss"]:
        tasks.append(("rss", source))

    # Rundown AI
    for source in SOURCES["rundown"]:
        tasks.append(("rundown", source))

    # Hacker News
    tasks.append(("hackernews", SOURCES["hackernews"]))

    def run_task(task):
        kind, source = task
        try:
            if kind == "rss":
                return fetch_rss(source)
            elif kind == "rundown":
                return fetch_rundown_sitemap(source)
            elif kind == "hackernews":
                return fetch_hackernews(source)
        except Exception as e:
            log.error(f"Task {kind} failed: {e}")
        return []

    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        futures = [pool.submit(run_task, t) for t in tasks]
        for f in as_completed(futures):
            try:
                all_articles.extend(f.result())
            except Exception as e:
                log.error(f"Parallel task error: {e}")

    # Reddit via PRAW (sequential, rate-limited)
    reddit_client = init_reddit_client()
    if reddit_client:
        for source in SOURCES["reddit"]:
            articles = fetch_reddit_praw(source, reddit_client)
            all_articles.extend(articles)
            time.sleep(0.3)  # Be polite

    # Deduplicate
    seen = set()
    unique = []
    for a in all_articles:
        if a["id"] not in seen:
            seen.add(a["id"])
            unique.append(a)

    # Sort by published_at descending
    unique.sort(key=lambda x: x["published_at"], reverse=True)

    # Stats
    with_images = sum(1 for a in unique if a.get("image_url"))
    log.info(f"  → {with_images}/{len(unique)} articles have thumbnail images")

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(unique),
        "articles": unique
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    log.info("=" * 55)
    log.info(f"  ✅ Done! {len(unique)} articles saved to {OUTPUT_FILE}")
    log.info("=" * 55)


if __name__ == "__main__":
    main()
