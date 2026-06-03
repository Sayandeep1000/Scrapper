# Project Findings & Discoveries

## 🔍 Research & Resources

### Data Sources
| Source           | Method         | Status  | Notes |
|------------------|----------------|---------|-------|
| Ben's Bites      | Substack RSS   | ✅ Working | `https://bensbites.substack.com/feed` |
| The Rundown AI   | HTML scrape    | ✅ Working | Beehiiv RSS not publicly enabled; direct HTML parse yields 5 articles |
| r/artificial     | PRAW OAuth     | ⚠ Needs creds | REDDIT_CLIENT_ID required in `.env` |
| r/MachineLearning| PRAW OAuth     | ⚠ Needs creds | Same |
| r/singularity    | PRAW OAuth     | ⚠ Needs creds | Same |

### Key Discoveries
- **Reddit's unauthenticated JSON API** (`/top.json`) now returns 403 Forbidden.
  Solution: PRAW library with OAuth client credentials (register at reddit.com/prefs/apps).
- **The Rundown AI** does not have a public Beehiiv RSS feed enabled.
  Solution: Direct HTML scraping with BeautifulSoup.
- **Ben's Bites** Substack RSS works correctly at `https://bensbites.substack.com/feed`.

## ⚠️ Constraints & Guidelines
- All temporary artifacts must be stored under `.tmp/`.
- No arbitrary script execution in main files without linking.
- All secrets/keys must be in `.env`.
- Reddit credentials must be obtained from https://www.reddit.com/prefs/apps (create a "script" app).
