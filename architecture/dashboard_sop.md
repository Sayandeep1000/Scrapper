# SOP: Dashboard UI

## Goal
A gorgeous, interactive, single-page AI news dashboard that:
- Displays articles from multiple AI news sources
- Filters by source, search, and "Saved"
- Persists data and saves across page refreshes via localStorage
- Auto-fetches fresh data from the Python scraper every 24 hours

## Architecture
- **Frontend**: Pure HTML + CSS + JavaScript (no frameworks)
- **Data Source**: `/api/articles` endpoint served by `tools/serve.py`
- **Persistence**: `localStorage` keys: `ai_dashboard_articles`, `ai_dashboard_saved`, `ai_dashboard_last_fetch`
- **Supabase**: Deferred to Phase 5

## UI Components

### Header
- App name + live clock
- "Refresh" button (manual trigger)
- Last-fetched timestamp

### Source Filter Bar
- Pills for each source: "All", "Ben's Bites", "The Rundown AI", "Reddit"
- Active pill highlighted

### Search Bar
- Real-time search across title + summary

### Article Grid
- Responsive masonry-style card grid
- Each card: source badge, title, summary, published time, upvotes (Reddit), Save button

### Saved Articles Panel
- Slide-in sidebar or tab showing saved articles
- Persisted in localStorage

## Refresh Logic
1. On page load: check `ai_dashboard_last_fetch` timestamp.
2. If older than 24h (or missing): call `/api/articles`, update localStorage, render.
3. If fresh: render from localStorage cache directly.
4. Manual "Refresh" button always triggers a fetch.

## Design System
- Dark mode, glassmorphism cards
- Color palette: deep space (#0a0a1a), accent cyan (#00d4ff), accent purple (#7c3aed)
- Font: Inter (Google Fonts)
- Micro-animations: card hover lift, fade-in on load, shimmer loading skeletons
