/* ═══════════════════════════════════════════════════════════════
   B.L.A.S.T. AI Dashboard — app.js
   Glaido-style UI logic
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const API_URL       = 'http://localhost:8765/api/articles';
const SCRAPE_URL    = 'http://localhost:8765/api/scrape';
const LS_ARTICLES   = 'blast_articles';
const LS_SAVED      = 'blast_saved';
const LS_LAST_FETCH = 'blast_last_fetch';
const REFRESH_MS    = 24 * 60 * 60 * 1000;

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  articles:     [],
  saved:        new Set(),
  activeSource: 'all',
  searchQuery:  '',
  modalArticle: null,
  lensEnabled:  false,
};

// ── Source meta ────────────────────────────────────────────────────────────────
const SOURCE_META = {
  'bensbites':           { label: "Ben's Bites",       color: '#f5a623', icon: '🍔' },
  'airundown':           { label: 'The Rundown AI',    color: '#10b981', icon: '⚡' },
  'techcrunch':          { label: 'TechCrunch AI',     color: '#00b233', icon: '🚀' },
  'venturebeat':         { label: 'VentureBeat AI',    color: '#e84040', icon: '💡' },
  'mittech':             { label: 'MIT Tech Review',   color: '#a78bfa', icon: '🎓' },
  'theverge':            { label: 'The Verge',         color: '#e85d04', icon: '📡' },
  'wired':               { label: 'Wired AI',          color: '#38bdf8', icon: '🔌' },
  'hackernews':          { label: 'Hacker News',       color: '#ff6600', icon: '🔶' },
  'reddit_artificial':   { label: 'r/artificial',      color: '#ff4500', icon: '🤖' },
  'reddit_ml':           { label: 'r/MachineLearning', color: '#d946ef', icon: '🧠' },
  'reddit_singularity':  { label: 'r/singularity',     color: '#3b82f6', icon: '🌀' },
};

// ── DOM refs ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  // Tabs
  tabAll:          $('tabAll'),
  tabRundown:      $('tabRundown'),
  tabBens:         $('tabBens'),
  tabTechCrunch:   $('tabTechCrunch'),
  tabVentureBeat:  $('tabVentureBeat'),
  tabMIT:          $('tabMIT'),
  tabVerge:        $('tabVerge'),
  tabWired:        $('tabWired'),
  tabHN:           $('tabHN'),
  tabArtificial:   $('tabArtificial'),
  tabML:           $('tabML'),
  tabSingularity:  $('tabSingularity'),
  tabSaved:        $('tabSaved'),
  // Counts
  countAll:        $('countAll'),
  countBens:       $('countBens'),
  countRundown:    $('countRundown'),
  countTechCrunch: $('countTechCrunch'),
  countVentureBeat:$('countVentureBeat'),
  countMIT:        $('countMIT'),
  countVerge:      $('countVerge'),
  countWired:      $('countWired'),
  countHN:         $('countHN'),
  countArtificial: $('countArtificial'),
  countML:         $('countML'),
  countSingularity:$('countSingularity'),
  savedBadge:      $('savedBadge'),
  // Stats
  statTotal:       $('statTotal'),
  statSaved:       $('statSaved'),
  // Search
  searchInput:     $('searchInput'),
  searchClear:     $('searchClear'),
  searchDropdown:  $('searchDropdown'),
  searchDropdownList: $('searchDropdownList'),
  // Clock
  liveClock:       $('liveClock'),
  // Refresh
  btnRefresh:      $('btnRefresh'),
  lastFetch:       $('lastFetch'),
  // Content
  loadingState:    $('loadingState'),
  errorState:      $('errorState'),
  errorMsg:        $('errorMsg'),
  emptyState:      $('emptyState'),
  articleGrid:     $('articleGrid'),
  btnRetry:        $('btnRetry'),
  // Saved panel
  savedOverlay:    $('savedOverlay'),
  savedPanel:      $('savedPanel'),
  savedClose:      $('savedClose'),
  savedEmpty:      $('savedEmpty'),
  savedList:       $('savedList'),
  // Modal
  modalOverlay:    $('modalOverlay'),
  articleModal:    $('articleModal'),
  modalClose:      $('modalClose'),
  modalSource:     $('modalSource'),
  modalTitle:      $('modalTitle'),
  modalMeta:       $('modalMeta'),
  modalImageWrap:  $('modalImageWrap'),
  modalImage:      $('modalImage'),
  modalSummary:    $('modalSummary'),
  modalLink:       $('modalLink'),
  modalSaveBtn:    $('modalSaveBtn'),
  // Lens & Theme
  btnLens:         $('btnLens'),
  btnTheme:        $('btnTheme'),
  hoverTooltip:    $('hoverTooltip'),
  tooltipSource:   $('tooltipSource'),
  tooltipTitle:    $('tooltipTitle'),
  tooltipSummary:  $('tooltipSummary'),
  tooltipTime:     $('tooltipTime'),
  // Toast
  toastStack:      $('toastStack'),
};

// ── Tab map ────────────────────────────────────────────────────────────────────
const TAB_MAP = {
  'all':               dom.tabAll,
  'airundown':         dom.tabRundown,
  'bensbites':         dom.tabBens,
  'techcrunch':        dom.tabTechCrunch,
  'venturebeat':       dom.tabVentureBeat,
  'mittech':           dom.tabMIT,
  'theverge':          dom.tabVerge,
  'wired':             dom.tabWired,
  'hackernews':        dom.tabHN,
  'reddit_artificial': dom.tabArtificial,
  'reddit_ml':         dom.tabML,
  'reddit_singularity':dom.tabSingularity,
};

// ── Utilities ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isNew(iso) {
  return Date.now() - new Date(iso).getTime() < 2 * 3600000;
}

function esc(s = '') {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtNum(n) {
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n);
}

function formatPubDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// ── Clock ──────────────────────────────────────────────────────────────────────
function tick() {
  const now = new Date();
  const p = n => String(n).padStart(2,'0');
  dom.liveClock.textContent = `${p(now.getHours())}:${p(now.getMinutes())}`;
}
setInterval(tick, 1000);
tick();

// ── Toast ──────────────────────────────────────────────────────────────────────
function toast(msg, icon = '✓', style = '', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${style}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(msg)}</span>`;
  dom.toastStack.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => {
    el.classList.replace('in', 'out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── LocalStorage ───────────────────────────────────────────────────────────────
function loadSaved() {
  try { state.saved = new Set(JSON.parse(localStorage.getItem(LS_SAVED) || '[]')); }
  catch { state.saved = new Set(); }
}

function persistSaved() {
  localStorage.setItem(LS_SAVED, JSON.stringify([...state.saved]));
}

function loadCache() {
  try {
    const raw  = localStorage.getItem(LS_ARTICLES);
    const last = localStorage.getItem(LS_LAST_FETCH);
    if (raw && last) return { articles: JSON.parse(raw), fetchedAt: last };
  } catch {}
  return null;
}

function cache(articles, fetchedAt) {
  localStorage.setItem(LS_ARTICLES, JSON.stringify(articles));
  localStorage.setItem(LS_LAST_FETCH, fetchedAt);
}

function isStale() {
  const last = localStorage.getItem(LS_LAST_FETCH);
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > REFRESH_MS;
}

// ── Theme ──────────────────────────────────────────────────────────────────────


// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchArticles(force = false) {
  if (!force && !isStale()) {
    const c = loadCache();
    if (c) { state.articles = c.articles; updateLastFetch(c.fetchedAt); return true; }
  }

  try {
    setLoading(true);
    if (force) {
      const r1 = await fetch(SCRAPE_URL, { method:'POST', signal: AbortSignal.timeout(45000) });
      if (!r1.ok) throw new Error(`Scrape failed: ${r1.status}`);
    }
    const resp = await fetch(API_URL, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    const data = await resp.json();
    state.articles = data.articles || [];
    const fetchedAt = data.fetched_at || new Date().toISOString();
    cache(state.articles, fetchedAt);
    updateLastFetch(fetchedAt);
    return true;
  } catch (err) {
    console.error('Fetch error:', err);
    const c = loadCache();
    if (c) {
      state.articles = c.articles;
      updateLastFetch(c.fetchedAt);
      toast('Using cached data (server unreachable)', '⚠️', '', 5000);
      return true;
    }
    return false;
  } finally {
    setLoading(false);
  }
}

function updateLastFetch(iso) {
  dom.lastFetch.textContent = timeAgo(iso);
}

// ── Filtering ──────────────────────────────────────────────────────────────────
function getFiltered() {
  return state.articles.filter(a => {
    if (state.activeSource !== 'all' && a.source !== state.activeSource) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      if (!a.title?.toLowerCase().includes(q) && !a.summary?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function countBySource(src) {
  return src === 'all' ? state.articles.length : state.articles.filter(a => a.source === src).length;
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  const filtered = getFiltered();

  // Update tab counts
  dom.countAll.textContent         = countBySource('all');
  dom.countBens.textContent        = countBySource('bensbites');
  dom.countRundown.textContent     = countBySource('airundown');
  dom.countTechCrunch.textContent  = countBySource('techcrunch');
  dom.countVentureBeat.textContent = countBySource('venturebeat');
  dom.countMIT.textContent         = countBySource('mittech');
  dom.countVerge.textContent       = countBySource('theverge');
  dom.countWired.textContent       = countBySource('wired');
  dom.countHN.textContent          = countBySource('hackernews');
  dom.countArtificial.textContent  = countBySource('reddit_artificial');
  dom.countML.textContent          = countBySource('reddit_ml');
  dom.countSingularity.textContent = countBySource('reddit_singularity');
  dom.savedBadge.textContent       = state.saved.size;

  // Stats pills
  dom.statTotal.textContent = state.articles.length;
  dom.statSaved.textContent = state.saved.size;

  // Empty state
  if (!filtered.length && state.articles.length > 0) {
    dom.emptyState.style.display  = 'flex';
    dom.articleGrid.style.display = 'none';
  } else {
    dom.emptyState.style.display  = 'none';
    dom.articleGrid.style.display = 'grid';
  }

  // Render cards
  dom.articleGrid.innerHTML = '';
  filtered.forEach((article, i) => {
    const card = buildCard(article, i);
    dom.articleGrid.appendChild(card);
  });

  // Re-apply lens class after innerHTML wipe
  applyLens();

  renderSavedPanel();
}

// ── Card Builder ───────────────────────────────────────────────────────────────
function buildCard(article, idx) {
  const meta  = SOURCE_META[article.source] || { label: article.source_label || article.source, color: '#8c8c9e', icon: '📰' };
  const saved = state.saved.has(article.id);
  const brand = isNew(article.published_at);

  const card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = `${idx * 40}ms`;
  card.dataset.id = article.id;

  // Image area
  let imageHtml = '';
  if (article.image_url) {
    imageHtml = `
      <div class="card-image-wrap">
        <img class="card-image" src="${esc(article.image_url)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-image-placeholder>${meta.icon}</div>'" />
        <div class="card-date-overlay">${formatPubDate(article.published_at)}</div>
        <div class="card-actions">
          <button class="card-action-btn heart ${saved ? 'saved' : ''}" data-id="${article.id}" aria-label="${saved ? 'Unsave' : 'Save'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
          <button class="card-action-btn trash" data-id="${article.id}" aria-label="Remove from saved" style="display:${saved ? 'flex' : 'none'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <polyline points="3,6 5,6 21,6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  } else {
    imageHtml = `
      <div class="card-image-wrap">
        <div class="card-image-placeholder">${meta.icon}</div>
        <div class="card-date-overlay">${formatPubDate(article.published_at)}</div>
        <div class="card-actions">
          <button class="card-action-btn heart ${saved ? 'saved' : ''}" data-id="${article.id}" aria-label="${saved ? 'Unsave' : 'Save'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
          <button class="card-action-btn trash" data-id="${article.id}" aria-label="Remove" style="display:${saved ? 'flex' : 'none'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <polyline points="3,6 5,6 21,6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  // Score badge
  let scoreBadge = '';
  if (article.score !== null && article.score !== undefined) {
    scoreBadge = `
      <div class="card-score">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 8.5 8.5H2l5 4.5-2 7.5L12 17l7 3.5-2-7.5 5-4.5h-6.5L12 2z"/>
        </svg>
        ${fmtNum(article.score)}
      </div>`;
  }

  card.innerHTML = `
    ${imageHtml}
    <div class="card-body">
      <div class="card-meta-row">
        <div class="card-source" style="color:${meta.color};border-color:${meta.color}50">
          ${meta.label}
        </div>
        ${scoreBadge}
      </div>
      <div class="card-title">
        ${esc(article.title)}${brand ? '<span class="new-tag">New</span>' : ''}
      </div>
      <p class="card-summary">${esc(article.summary || '')}</p>
      <div class="card-footer">
        <span class="card-time">${timeAgo(article.published_at)}</span>
        <a class="card-read-link" href="${esc(article.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
          Read →
        </a>
      </div>
    </div>
  `;

  // Card click → open modal
  card.addEventListener('click', e => {
    if (e.target.closest('.card-action-btn') || e.target.closest('.card-read-link')) return;
    openModal(article);
  });

  // Lens hover events
  attachLensEvents(card, article);

  // Heart button
  card.querySelector('.card-action-btn.heart').addEventListener('click', e => {
    e.stopPropagation();
    toggleSave(article.id);
  });

  // Trash button
  const trashBtn = card.querySelector('.card-action-btn.trash');
  if (trashBtn) {
    trashBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSave(article.id);
    });
  }

  return card;
}

// ── Saved Panel Renderer ────────────────────────────────────────────────────────
function renderSavedPanel() {
  const savedArticles = state.articles.filter(a => state.saved.has(a.id));

  if (savedArticles.length === 0) {
    dom.savedEmpty.style.display = 'flex';
    dom.savedList.style.display  = 'none';
    return;
  }

  dom.savedEmpty.style.display = 'none';
  dom.savedList.style.display  = 'flex';
  dom.savedList.innerHTML = '';

  savedArticles.forEach(article => {
    const meta = SOURCE_META[article.source] || { label: article.source_label, color: '#8c8c9e', icon: '📰' };
    const item = document.createElement('div');
    item.className = 'saved-item';
    item.innerHTML = `
      <div class="saved-item-content">
        <div class="saved-item-source" style="color:${meta.color}">${meta.icon} ${esc(meta.label)}</div>
        <div class="saved-item-title">${esc(article.title)}</div>
        <div class="saved-item-time">${timeAgo(article.published_at)}</div>
      </div>
      <button class="saved-item-remove" data-id="${article.id}" title="Remove">✕</button>
    `;
    item.addEventListener('click', e => {
      if (e.target.closest('.saved-item-remove')) return;
      closeSavedPanel();
      setTimeout(() => openModal(article), 350);
    });
    item.querySelector('.saved-item-remove').addEventListener('click', e => {
      e.stopPropagation();
      toggleSave(article.id);
    });
    dom.savedList.appendChild(item);
  });
}

// ── Toggle Save ─────────────────────────────────────────────────────────────────
function toggleSave(id) {
  const wasSaved = state.saved.has(id);
  wasSaved ? state.saved.delete(id) : state.saved.add(id);
  persistSaved();
  updateSaveUI(id, !wasSaved);
  
  // Lightweight DOM updates instead of a full render()
  dom.savedBadge.textContent = state.saved.size;
  dom.statSaved.textContent  = state.saved.size;
  renderSavedPanel();
  
  toast(wasSaved ? 'Removed from saved' : 'Article saved!', wasSaved ? '🗑' : '❤️', wasSaved ? '' : 'lime');
}

function updateSaveUI(id, saved) {
  // Update all heart buttons for this article
  document.querySelectorAll(`.card-action-btn.heart[data-id="${id}"]`).forEach(btn => {
    btn.classList.toggle('saved', saved);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
  });

  // Update trash buttons
  document.querySelectorAll(`.card-action-btn.trash[data-id="${id}"]`).forEach(btn => {
    btn.style.display = saved ? 'flex' : 'none';
  });

  // Modal save btn
  if (state.modalArticle?.id === id) {
    dom.modalSaveBtn.classList.toggle('saved', saved);
    const svg = dom.modalSaveBtn.querySelector('svg');
    if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
    dom.modalSaveBtn.title = saved ? 'Unsave' : 'Save article';
  }
}

// ── Modal ───────────────────────────────────────────────────────────────────────
function openModal(article) {
  state.modalArticle = article;
  const meta  = SOURCE_META[article.source] || { label: article.source_label, color: '#8c8c9e', icon: '📰' };
  const saved = state.saved.has(article.id);

  dom.modalSource.textContent      = `${meta.icon} ${meta.label}`;
  dom.modalSource.style.color      = meta.color;
  dom.modalSource.style.borderColor= `${meta.color}60`;
  dom.modalTitle.textContent       = article.title;
  dom.modalLink.href               = article.url;
  dom.modalSummary.textContent     = article.summary || 'No summary available.';

  let metaHtml = `<span>🕐 ${formatDateTime(article.published_at)}</span>`;
  if (article.score !== null && article.score !== undefined) {
    metaHtml += `<span>⬆ ${fmtNum(article.score)} upvotes</span>`;
  }
  dom.modalMeta.innerHTML = metaHtml;

  if (article.image_url) {
    dom.modalImage.src = article.image_url;
    dom.modalImageWrap.style.display = 'block';
    dom.modalImage.onerror = () => { dom.modalImageWrap.style.display = 'none'; };
  } else {
    dom.modalImageWrap.style.display = 'none';
  }

  dom.modalSaveBtn.classList.toggle('saved', saved);
  const svg = dom.modalSaveBtn.querySelector('svg');
  if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
  dom.modalSaveBtn.title = saved ? 'Unsave' : 'Save article';

  dom.modalOverlay.classList.add('visible');
  dom.articleModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  dom.modalOverlay.classList.remove('visible');
  dom.articleModal.classList.remove('open');
  state.modalArticle = null;
  document.body.style.overflow = '';
}

// ── Saved Panel ─────────────────────────────────────────────────────────────────
function openSavedPanel() {
  dom.savedOverlay.classList.add('visible');
  dom.savedPanel.classList.add('open');
  renderSavedPanel();
  document.body.style.overflow = 'hidden';
}

function closeSavedPanel() {
  dom.savedOverlay.classList.remove('visible');
  dom.savedPanel.classList.remove('open');
  document.body.style.overflow = '';
}

// ── UI States ───────────────────────────────────────────────────────────────────
function setLoading(on) {
  dom.loadingState.style.display = on ? 'block' : 'none';
  dom.articleGrid.style.display  = on ? 'none'  : 'grid';
  // Re-apply lens class after display toggle
  if (!on) applyLens();
}

function showError(msg) {
  dom.errorState.style.display   = 'flex';
  dom.loadingState.style.display = 'none';
  dom.articleGrid.style.display  = 'none';
  if (msg) dom.errorMsg.innerHTML = msg;
}

function hideError() { dom.errorState.style.display = 'none'; }

// ── Refresh ─────────────────────────────────────────────────────────────────────
async function refresh(force = false) {
  dom.btnRefresh.classList.add('spinning');
  hideError();

  const ok = await fetchArticles(force);
  dom.btnRefresh.classList.remove('spinning');

  if (!ok) {
    showError(`Server unreachable.<br><code>python tools/serve.py</code>`);
    return;
  }
  if (!state.articles.length) {
    showError(`No articles returned. Try:<br><code>python tools/scrape.py</code>`);
    return;
  }

  render();
  if (force) toast(`Refreshed! ${state.articles.length} articles loaded`, '🚀', 'lime');
}

// ── Source switching ────────────────────────────────────────────────────────────
function setSource(src) {
  state.activeSource = src;
  Object.entries(TAB_MAP).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('active', key === src);
  });
  dom.tabSaved?.classList.remove('active');
  render();
}

// ── Auto-refresh ────────────────────────────────────────────────────────────────
function scheduleAutoRefresh() {
  const last = localStorage.getItem(LS_LAST_FETCH);
  if (!last) return;
  const remaining = Math.max(0, REFRESH_MS - (Date.now() - new Date(last).getTime()));
  setTimeout(async () => {
    const ok = await fetchArticles(false);
    if (ok) { render(); toast('Auto-refreshed with latest AI news', '🔄', 'lime'); }
    scheduleAutoRefresh();
  }, remaining);
}

// ── Events ──────────────────────────────────────────────────────────────────────

// Source tabs
document.querySelectorAll('.tab[data-source]').forEach(btn => {
  btn.addEventListener('click', () => setSource(btn.dataset.source));
});

// Saved tab
dom.tabSaved?.addEventListener('click', () => {
  dom.tabSaved.classList.add('active');
  Object.values(TAB_MAP).forEach(el => el?.classList.remove('active'));
  openSavedPanel();
});

// Search
dom.searchInput.addEventListener('focus', () => {
  updateSearchDropdown();
  dom.searchDropdown.classList.remove('hidden');
});
dom.searchInput.addEventListener('blur', () => {
  setTimeout(() => {
    dom.searchDropdown.classList.add('hidden');
  }, 200);
});
dom.searchInput.addEventListener('input', e => {
  state.searchQuery = e.target.value.trim();
  dom.searchClear.classList.toggle('visible', state.searchQuery.length > 0);
  render();
  updateSearchDropdown();
});
dom.searchClear.addEventListener('click', () => {
  dom.searchInput.value = '';
  state.searchQuery = '';
  dom.searchClear.classList.remove('visible');
  dom.searchInput.focus();
  render();
  updateSearchDropdown();
});

function updateSearchDropdown() {
  const query = state.searchQuery.toLowerCase();
  let pool = state.articles;
  if (query) {
    pool = pool.filter(a => 
      a.title.toLowerCase().includes(query) || 
      (a.summary && a.summary.toLowerCase().includes(query))
    );
  }
  
  // Sort: prioritize high score (trendy) and recent
  const sorted = [...pool].sort((a, b) => {
    const scoreA = a.score || 0;
    const scoreB = b.score || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.published_at) - new Date(a.published_at);
  });
  
  const top = sorted.slice(0, 5);
  
  if (top.length === 0) {
    dom.searchDropdownList.innerHTML = `<div style="padding: 12px 14px; font-size: 0.8rem; color: var(--text-muted);">No results found</div>`;
    return;
  }
  
  dom.searchDropdownList.innerHTML = top.map(a => `
    <li class="search-dropdown-item" data-id="${a.id}">
      <div class="search-dropdown-item-title">${esc(a.title)}</div>
      <div class="search-dropdown-item-meta">
        <span style="color: var(--accent)">${a.source_label}</span>
        <span>${timeAgo(a.published_at)}</span>
      </div>
    </li>
  `).join('');
  
  dom.searchDropdownList.querySelectorAll('.search-dropdown-item').forEach(li => {
    li.addEventListener('click', () => {
      const article = state.articles.find(x => x.id === li.dataset.id);
      if (article) openModal(article);
      dom.searchDropdown.classList.add('hidden');
    });
  });
}

// Refresh
dom.btnRefresh.addEventListener('click', () => refresh(true));
dom.btnRetry?.addEventListener('click',  () => refresh(false));

// Saved panel
dom.savedClose.addEventListener('click',   closeSavedPanel);
dom.savedOverlay.addEventListener('click', closeSavedPanel);

// After closing saved panel, restore active tab state
dom.savedClose.addEventListener('click', () => {
  dom.tabSaved?.classList.remove('active');
  const activeEl = TAB_MAP[state.activeSource];
  if (activeEl) activeEl.classList.add('active');
});
dom.savedOverlay.addEventListener('click', () => {
  dom.tabSaved?.classList.remove('active');
  const activeEl = TAB_MAP[state.activeSource];
  if (activeEl) activeEl.classList.add('active');
});

// Modal
dom.modalClose.addEventListener('click', closeModal);
dom.modalOverlay.addEventListener('click', closeModal);
dom.modalSaveBtn.addEventListener('click', () => {
  if (state.modalArticle) toggleSave(state.modalArticle.id);
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (dom.articleModal.classList.contains('open')) closeModal();
    else if (dom.savedPanel.classList.contains('open')) closeSavedPanel();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    dom.searchInput.focus();
    dom.searchInput.select();
  }
});

// ── Theme Mode ──────────────────────────────────────────────────────────────
function initTheme() {
  if (!dom.btnTheme) return;
  const isLight = localStorage.getItem('blast_theme') === 'light';
  if (isLight) toggleTheme(true);

  dom.btnTheme.addEventListener('click', () => {
    const willBeLight = !document.body.classList.contains('light-mode');
    toggleTheme(willBeLight);
    localStorage.setItem('blast_theme', willBeLight ? 'light' : 'dark');
    toast(willBeLight ? 'Light Mode ON' : 'Dark Mode ON', willBeLight ? '☀️' : '🌙', 'lime');
  });
}

function toggleTheme(isLight) {
  document.body.classList.toggle('light-mode', isLight);
}

// ── Lens Mode ───────────────────────────────────────────────────────────────
function initLens() {
  if (!dom.btnLens || !dom.hoverTooltip) {
    console.warn('Lens elements not found in DOM');
    return;
  }
  // Restore persisted preference
  state.lensEnabled = localStorage.getItem('blast_lens') === '1';
  applyLens();

  dom.btnLens.addEventListener('click', () => {
    state.lensEnabled = !state.lensEnabled;
    localStorage.setItem('blast_lens', state.lensEnabled ? '1' : '0');
    applyLens();
    toast(
      state.lensEnabled ? 'Zoom Lens ON' : 'Zoom Lens OFF',
      state.lensEnabled ? '🔍' : '🔲',
      state.lensEnabled ? 'lime' : ''
    );
  });
}

function applyLens() {
  if (!dom.btnLens || !dom.articleGrid) return;
  dom.btnLens.classList.toggle('active', state.lensEnabled);
  dom.articleGrid.classList.toggle('lens-mode', state.lensEnabled);
  if (!state.lensEnabled) hideTooltip();
}

// ── Tooltip logic ────────────────────────────────────────────────────────────
let _tooltipTimer = null;

function showTooltip(article, mouseX, mouseY) {
  const meta = SOURCE_META[article.source] || { label: article.source_label, color: '#8c8c9e', icon: '📰' };
  dom.tooltipSource.textContent  = `${meta.icon} ${meta.label}`;
  dom.tooltipSource.style.color  = meta.color;
  dom.tooltipTitle.textContent   = article.title;
  
  if (!article.summary) {
    dom.tooltipSummary.textContent = 'No summary available.';
  } else {
    // Intelligently generate 3 key points
    let points = [];
    
    // 1. Try splitting by sentences
    const sentences = article.summary.split(/\. (?=[A-Z])|\.\s*$/).map(s => s.trim()).filter(s => s.length > 10);
    
    if (sentences.length >= 3) {
      points = sentences.slice(0, 3);
    } else {
      // 2. Try splitting a long single sentence by commas or semicolons
      const clauses = article.summary.split(/[,;]\s+(?=[a-zA-Z])/).map(c => c.trim()).filter(c => c.length > 12);
      if (clauses.length >= 2) {
        points = clauses.slice(0, 3).map(c => c.charAt(0).toUpperCase() + c.slice(1));
        if (points.length === 2) {
            points.push(`Sourced from ${meta.label} for deeper insights.`);
        }
      } else {
        // 3. Fallback: Synthesize 3 points from title, summary, and source metadata
        points = [
            `Core Subject: ${article.title.split(' ').slice(0, 8).join(' ')}...`,
            article.summary,
            `Trending coverage provided by ${meta.label}`
        ];
      }
    }
    
    dom.tooltipSummary.innerHTML = `<ul style="margin: 0; padding-left: 16px; list-style-type: disc;">` + 
      points.map(p => {
          let text = p;
          if (!text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) text += '.';
          return `<li style="margin-bottom: 6px;">${text}</li>`;
      }).join('') + 
      `</ul>`;
  }

  dom.tooltipTime.textContent    = '🕐 ' + timeAgo(article.published_at);
  positionTooltip(mouseX, mouseY);
  dom.hoverTooltip.classList.add('visible');
}

function hideTooltip() {
  dom.hoverTooltip.classList.remove('visible');
  clearTimeout(_tooltipTimer);
}

function positionTooltip(mx, my) {
  const tip  = dom.hoverTooltip;
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;
  const tw   = 310;  // approx tooltip width
  const th   = 160;  // approx tooltip height
  const gap  = 16;

  let left = mx + gap;
  let top  = my - 20;

  // Flip left if overflowing right
  if (left + tw > vw - 8) left = mx - tw - gap;
  // Clamp vertically
  if (top + th > vh - 8) top = vh - th - 8;
  if (top < 8) top = 8;

  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}

// Attach lens hover events to a card
function attachLensEvents(card, article) {
  let mx = 0, my = 0;

  card.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    if (state.lensEnabled && dom.hoverTooltip.classList.contains('visible')) {
      positionTooltip(mx, my);
    }
  });

  card.addEventListener('mouseenter', e => {
    if (!state.lensEnabled) return;
    mx = e.clientX;
    my = e.clientY;
    clearTimeout(_tooltipTimer);
    _tooltipTimer = setTimeout(() => showTooltip(article, mx, my), 180);
  });

  card.addEventListener('mouseleave', () => {
    hideTooltip();
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  loadSaved();
  dom.savedBadge.textContent = state.saved.size;
  dom.statSaved.textContent  = state.saved.size;
  initLens();
  initTheme();

  // Make mouse wheel scroll the tabs horizontally
  const filterTabs = document.getElementById('filterTabs');
  if (filterTabs) {
    filterTabs.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        filterTabs.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  const c = loadCache();
  if (c && !isStale()) {
    state.articles = c.articles;
    updateLastFetch(c.fetchedAt);
    setLoading(false);
    render();
    scheduleAutoRefresh();
    return;
  }

  await refresh(false);
  scheduleAutoRefresh();
}

init();


// Initialize Unicorn Studio Background
window.addEventListener('load', () => {
  if (window.UnicornStudio) {
    window.UnicornStudio.init().then(() => {
      console.log('Unicorn Studio Raycast Background loaded!');
    }).catch(err => {
      console.warn('Unicorn Studio failed to load:', err);
    });
  }
});
