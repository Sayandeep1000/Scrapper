# Project Constitution: B.L.A.S.T. Protocol

## 📊 Data Schema

### Input Schema — Article Feed Item
```json
{
  "id": "string (hash of url+title)",
  "source": "string (e.g. 'bensbites' | 'airundown' | 'reddit')",
  "source_label": "string (display name)",
  "title": "string",
  "summary": "string",
  "url": "string",
  "published_at": "ISO8601 string",
  "image_url": "string | null",
  "tags": ["string"],
  "score": "number | null (reddit upvotes, null for newsletters)"
}
```

### Output Schema — Dashboard State (localStorage)
```json
{
  "last_fetched": "ISO8601 string",
  "articles": [ "...Article[]" ],
  "saved_ids": ["string (article id)"],
  "filters": {
    "sources": ["string"],
    "search": "string"
  }
}
```

## 📡 Data Sources
| Source        | Method         | URL / Endpoint                                        |
|---------------|----------------|-------------------------------------------------------|
| Ben's Bites   | RSS/XML Scrape | `https://bensbites.substack.com/feed`                 |
| The Rundown AI| RSS/XML Feed   | `https://rss.beehiiv.com/feeds/2R3C6B.xml`            |
| Reddit AI     | JSON API       | `https://www.reddit.com/r/artificial/top.json?t=day`  |
| Reddit ML     | JSON API       | `https://www.reddit.com/r/MachineLearning/top.json?t=day` |
| Reddit Sing.  | JSON API       | `https://www.reddit.com/r/singularity/top.json?t=day` |

## 📜 Behavioral Rules
- Be deterministic.
- Use Python scripts in `tools/` for execution.
- Use `.tmp/` for all intermediate file operations.
- Update `architecture/` SOPs before changing code.
- Filter articles published within the last 24 hours only.
- Articles must survive page refresh (localStorage persistence).
- Saved articles must persist across sessions.
- Auto-refresh data every 24 hours. If no new data, do nothing.
- Design must be gorgeous, interactive, and feel premium.
- Supabase integration deferred to Phase 5.

## 🛠️ Architectural Invariants
- Layer 1: SOPs in `architecture/`
- Layer 2: System Pilot routing in conversation
- Layer 3: Deterministic scripts in `tools/`

## 🗂️ File Structure
```
scrapper/
├── gemini.md              # Project Constitution (this file)
├── task_plan.md           # Phase checklist
├── findings.md            # Research notes
├── progress.md            # Logs and errors
├── .env                   # API keys (none needed for Phase 1)
├── architecture/
│   ├── scraper_sop.md     # How scraping works
│   └── dashboard_sop.md   # How the UI works
├── tools/
│   ├── scrape.py          # Fetches all feeds, outputs to .tmp/
│   └── serve.py           # Lightweight local HTTP server
├── dashboard/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── .tmp/
    └── articles.json      # Intermediate scraped data
```

---
## 🛰️ Maintenance Log
- 2026-06-03: Initialized constitution. Discovery complete. Build starting.
