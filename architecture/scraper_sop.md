# SOP: Feed Scraper

## Goal
Fetch latest articles (last 24h) from three data source categories:
1. **Newsletters** via RSS/XML feeds
2. **Reddit AI communities** via PRAW (Official Reddit API)

## Inputs
- No user input needed. Feed URLs are hardcoded per `gemini.md`.
- Reddit credentials (PRAW): `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` in `.env`

## Outputs
- `.tmp/articles.json` — a JSON array of Article objects matching the Input Schema.

## Tool: `tools/scrape.py`

### Step-by-Step Logic
1. For each RSS feed (Ben's Bites):
   - Fetch the XML with `requests` + a proper User-Agent header.
   - Parse with `feedparser`.
   - For each entry, check `published_parsed` — skip if older than 24h.
   - Map to Article schema.

2. For The Rundown AI:
   - Scrape `https://www.therundown.ai` directly using BeautifulSoup (no RSS available).
   - Parse article links, titles, summaries from the HTML.
   - If the page is JS-rendered (no content), fall back to graceful skip.

3. For each Reddit subreddit (r/artificial, r/MachineLearning, r/singularity):
   - Use PRAW with client_id + client_secret from `.env` for read-only OAuth.
   - Fetch `subreddit.top(time_filter="day", limit=25)`.
   - Filter by `created_utc` within last 24h.
   - Map to Article schema.
   - If credentials are missing, skip Reddit and log a warning.

4. Combine all articles, deduplicate by `id` (hash of URL).
5. Sort by `published_at` descending.
6. Write to `.tmp/articles.json`.

## Edge Cases
- If a feed is unreachable (timeout/404), log the error and skip — do NOT crash.
- If RSS entry has no `published` date, use `now()` as fallback.
- Rate limit: PRAW auto-handles Reddit rate limits.
- If REDDIT_CLIENT_ID is absent from `.env`, skip Reddit with a clear warning.

## Self-Annealing Notes (Updated 2026-06-03)
- **Reddit 403**: Reddit's public JSON API is now blocked for unauthenticated requests.
  FIX: Use PRAW with OAuth credentials. Register app at reddit.com/prefs/apps (type: script).
  Credentials go in `.env` as REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.
- **Rundown AI RSS 404**: Beehiiv RSS is not publicly enabled for therundown.ai.
  FIX: Scrape therundown.ai directly via HTML parsing with BeautifulSoup.
- **Reddit rate limit**: PRAW auto-handles via built-in rate limiter (60 req/min).
