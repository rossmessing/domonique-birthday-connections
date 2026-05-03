/*
 * NYT Connections Clone — game.js
 *
 * localStorage key schema
 * ───────────────────────
 * Key:   "conn_<puzzle-id>"
 * Value (JSON):
 * {
 *   status:       "new" | "inprogress" | "completed" | "failed",
 *   mistakes:     number  (0–4),
 *   solvedTiers:  number[]  (tiers whose groups have been correctly guessed, e.g. [0, 2]),
 *   guessedWords: string[]  (all words that belong to solved groups),
 *   guessHistory: number[][]  (one entry per guess attempt; each entry holds the tier
 *                              index of each of the 4 guessed words — used for the
 *                              coloured-dot result summary on the end screen),
 *   wordOrder:    string[]  (current display order of ALL 16 words; solved words are
 *                            filtered out at render time so the order is preserved
 *                            across shuffles and page reloads)
 * }
 */

'use strict';

// ─── constants ────────────────────────────────────────────────────────────────

const TIER_COLORS  = ['#F9DF6D', '#A0C35A', '#B0C4EF', '#BA81C5'];
const MAX_MISTAKES = 4;
const LS_PREFIX    = 'conn_';

// ─── runtime state ────────────────────────────────────────────────────────────

let puzzles         = [];
let currentPuzzle   = null;
let gameState       = null;
let selectedWords   = new Set();
let isAnimating     = false;
let lastSolvedTier  = null; // tier just solved this turn; renderSolvedGroups uses it to skip re-animating existing rows
let boardObserver   = null; // ResizeObserver that keeps solved-group rows the same height as tiles

// ─── init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('puzzles.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    puzzles = await res.json();
    showSelectionScreen();
  } catch (err) {
    document.body.innerHTML =
      `<p style="padding:32px;color:#c00;font-size:16px;">
        Could not load puzzles.json (${err.message}).<br>
        Make sure you are serving the files from a web server, not opening index.html directly as a file.
      </p>`;
  }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsGet(id) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + id)); }
  catch { return null; }
}

function lsSet(id, state) {
  localStorage.setItem(LS_PREFIX + id, JSON.stringify(state));
}

function makeInitialState(puzzle) {
  return {
    status:       'new',
    mistakes:     0,
    solvedTiers:  [],
    guessedWords: [],
    guessHistory: [],
    wordOrder:    shuffle(puzzle.groups.flatMap(g => g.words)),
  };
}

// ─── selection screen ─────────────────────────────────────────────────────────

function showSelectionScreen() {
  document.getElementById('selection-screen').classList.add('active');
  document.getElementById('game-screen').classList.remove('active');
  renderPuzzleList();
}

function renderPuzzleList() {
  const list = document.getElementById('puzzle-list');
  list.innerHTML = '';

  puzzles.forEach(puzzle => {
    const saved  = lsGet(puzzle.id);
    const status = saved ? saved.status : 'new';
    const badgeClass = status === 'new'        ? 'badge-new'
                     : status === 'inprogress'  ? 'badge-inprogress'
                     :                            'badge-done';
    const badgeLabel = status === 'new'        ? 'New'
                     : status === 'inprogress'  ? 'In Progress'
                     :                            'Completed';

    const card = document.createElement('div');
    card.className = 'puzzle-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${puzzle.title || 'Untitled Puzzle'}, ${badgeLabel}`);

    card.innerHTML =
      `<div class="puzzle-card-top">
         <div class="puzzle-card-title">${esc(puzzle.title || 'Untitled Puzzle')}</div>
         <span class="status-badge ${badgeClass}">${badgeLabel}</span>
       </div>
       <div class="tier-dots">
         ${TIER_COLORS.map(c =>
           `<div class="tier-dot" style="background:${c}"></div>`
         ).join('')}
       </div>`;

    const open = () => openPuzzle(puzzle.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    list.appendChild(card);
  });
}

// ─── open a puzzle ────────────────────────────────────────────────────────────

function openPuzzle(puzzleId) {
  currentPuzzle = puzzles.find(p => p.id === puzzleId);
  if (!currentPuzzle) return;

  gameState = lsGet(puzzleId);
  if (!gameState) {
    gameState = makeInitialState(currentPuzzle);
    lsSet(currentPuzzle.id, gameState);
  }

  selectedWords.clear();
  isAnimating = false;

  document.getElementById('selection-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  document.getElementById('end-overlay').classList.add('hidden');

  renderGame();
  setupBoardObserver();

  // Re-surface end overlay for already-finished puzzles
  if (gameState.status === 'completed' || gameState.status === 'failed') {
    setTimeout(showEndOverlay, 500);
  }
}

// ─── render helpers ───────────────────────────────────────────────────────────

function renderGame() {
  // Header title
  document.getElementById('game-title').textContent = 'Connections';

  // Flavor text
  const flavEl = document.getElementById('flavor-text');
  if (currentPuzzle.title) {
    flavEl.textContent = currentPuzzle.title;
    flavEl.classList.remove('hidden');
  } else {
    flavEl.classList.add('hidden');
  }

  renderSolvedGroups();
  renderWordGrid();
  renderMistakeDots();
  updateButtons();
  syncSolvedGroupHeights();
}

function renderSolvedGroups() {
  const wrap = document.getElementById('solved-groups');
  wrap.innerHTML = '';
  const sorted = [...gameState.solvedTiers].sort((a, b) => a - b);
  sorted.forEach(tier => {
    const grp = currentPuzzle.groups.find(g => g.tier === tier);
    if (!grp) return;
    const div = document.createElement('div');
    div.className = 'solved-group';
    // Suppress the slide-in animation for rows that were already visible;
    // only the tier that was just solved this turn should animate in.
    if (tier !== lastSolvedTier) div.style.animation = 'none';
    div.style.background = TIER_COLORS[tier];
    div.innerHTML =
      `<div class="solved-group-category">${esc(grp.category)}</div>
       <div class="solved-group-words">${grp.words.map(esc).join(', ')}</div>`;
    wrap.appendChild(div);
  });
}

function solvedWordSet() {
  return new Set(
    currentPuzzle.groups
      .filter(g => gameState.solvedTiers.includes(g.tier))
      .flatMap(g => g.words)
  );
}

function renderWordGrid() {
  const grid     = document.getElementById('word-grid');
  const solved   = solvedWordSet();
  const remaining = gameState.wordOrder.filter(w => !solved.has(w));

  grid.innerHTML = '';
  remaining.forEach(word => {
    const tile = makeTile(word);
    grid.appendChild(tile);
  });
}

function makeTile(word) {
  const tile = document.createElement('div');
  tile.className = 'word-tile' + (selectedWords.has(word) ? ' selected' : '');
  tile.textContent = word;
  tile.dataset.word = word;
  tile.setAttribute('role', 'checkbox');
  tile.setAttribute('aria-checked', selectedWords.has(word) ? 'true' : 'false');
  tile.setAttribute('tabindex', '0');

  const toggle = () => handleTileClick(word);
  tile.addEventListener('click', toggle);
  tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(); });
  return tile;
}

function renderMistakeDots() {
  const wrap = document.getElementById('mistake-dots');
  wrap.innerHTML = '';
  for (let i = 0; i < MAX_MISTAKES; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < gameState.mistakes ? ' used' : '');
    wrap.appendChild(dot);
  }
}

function updateButtons() {
  const gameOver = gameState.status === 'completed' || gameState.status === 'failed';
  document.getElementById('submit-btn').disabled   = selectedWords.size !== 4 || gameOver;
  document.getElementById('deselect-btn').disabled = selectedWords.size === 0 || gameOver;
}

// ─── tile interaction ─────────────────────────────────────────────────────────

function handleTileClick(word) {
  if (isAnimating) return;
  if (gameState.status === 'completed' || gameState.status === 'failed') return;

  if (selectedWords.has(word)) {
    selectedWords.delete(word);
  } else {
    if (selectedWords.size >= 4) return;
    selectedWords.add(word);
  }

  // Update just the clicked tile's visual state instead of full re-render
  const tile = tileEl(word);
  if (tile) {
    tile.classList.toggle('selected', selectedWords.has(word));
    tile.setAttribute('aria-checked', selectedWords.has(word) ? 'true' : 'false');
  }
  updateButtons();
}

// ─── submit ───────────────────────────────────────────────────────────────────

async function handleSubmit() {
  if (isAnimating || selectedWords.size !== 4) return;
  if (gameState.status === 'completed' || gameState.status === 'failed') return;

  isAnimating = true;
  const guess = [...selectedWords];

  // Record tiers for end-screen dot visualisation
  const guessTiers = guess.map(w => {
    const g = currentPuzzle.groups.find(g => g.words.includes(w));
    return g ? g.tier : -1;
  });
  gameState.guessHistory.push(guessTiers);

  // Did we nail a group?
  const match = currentPuzzle.groups.find(g => {
    const s = new Set(g.words);
    return guess.every(w => s.has(w));
  });

  if (match) {
    await animateCorrect(guess, match.tier);

    gameState.solvedTiers.push(match.tier);
    gameState.guessedWords.push(...guess);
    selectedWords.clear();

    gameState.status = gameState.solvedTiers.length === 4 ? 'completed' : 'inprogress';
    lsSet(currentPuzzle.id, gameState);

    lastSolvedTier = match.tier;
    renderGame();
    lastSolvedTier = null;

    if (gameState.status === 'completed') {
      setTimeout(showEndOverlay, 700);
    }
  } else {
    // Check for "one away"
    const oneAway = currentPuzzle.groups.some(g => {
      const s = new Set(g.words);
      return guess.filter(w => s.has(w)).length === 3;
    });

    await animateWrong(guess, oneAway);

    gameState.mistakes++;
    if (gameState.status === 'new') gameState.status = 'inprogress';

    if (gameState.mistakes >= MAX_MISTAKES) {
      gameState.status = 'failed';
      lsSet(currentPuzzle.id, gameState);
      selectedWords.clear();
      updateButtons();
      // Animate the dot going away
      animateDotLoss();
      await delay(350);
      revealAll();
      await delay(900);
      showEndOverlay();
    } else {
      lsSet(currentPuzzle.id, gameState);
      animateDotLoss();
      renderMistakeDots();
      updateButtons();
    }
  }

  isAnimating = false;
}

async function animateCorrect(guess, tier) {
  const tiles = guess.map(w => tileEl(w)).filter(Boolean);

  // Phase 1: staggered scaleX flip, colour swap at the invisible midpoint
  tiles.forEach((t, i) => {
    setTimeout(() => {
      t.classList.add('flipping');
      setTimeout(() => {
        t.style.background = TIER_COLORS[tier];
        t.style.color = '#1a1a1b';
      }, 180 + i * 80);
    }, i * 80);
  });
  await delay(tiles.length * 80 + 420);

  // Phase 2: tiles fly upward and fade out, signalling they're moving to the solved row
  tiles.forEach(t => {
    t.style.transition = 'transform 0.28s ease-in, opacity 0.22s ease-in';
    t.style.transform  = 'translateY(-52px) scale(0.82)';
    t.style.opacity    = '0';
  });
  await delay(300);
  // Caller re-renders the board; the new solved row slides in from above via solvedIn
}

async function animateWrong(guess, oneAway) {
  const tiles = guess.map(w => tileEl(w)).filter(Boolean);

  tiles.forEach(t => t.classList.add('shaking'));
  await delay(420);
  tiles.forEach(t => t.classList.remove('shaking'));

  if (oneAway) {
    showToast('One away…');
    tiles.forEach(t => t.classList.add('pulsing'));
    await delay(560);
    tiles.forEach(t => t.classList.remove('pulsing'));
  } else {
    showToast('Not quite!');
    await delay(200);
  }

  // Deselect
  selectedWords.clear();
  tiles.forEach(t => {
    t.classList.remove('selected');
    t.setAttribute('aria-checked', 'false');
  });
}

function animateDotLoss() {
  const dots = document.querySelectorAll('#mistake-dots .dot:not(.used)');
  // Pop the last active dot
  if (dots.length > 0) {
    const last = dots[dots.length - 1];
    last.classList.add('popping');
    setTimeout(() => last.classList.add('used'), 200);
  }
}

function revealAll() {
  const remaining = [0, 1, 2, 3].filter(t => !gameState.solvedTiers.includes(t));
  remaining.forEach(t => gameState.solvedTiers.push(t));
  renderSolvedGroups();
  document.getElementById('word-grid').innerHTML = '';
}

// ─── end overlay ──────────────────────────────────────────────────────────────

function showEndOverlay() {
  const won = gameState.status === 'completed';

  document.getElementById('end-emoji').textContent = won ? '🎉' : '😔';
  document.getElementById('end-title').textContent =
    won ? 'Solved it!' : 'Better luck next time';
  document.getElementById('end-message').textContent = won
    ? `Solved with ${gameState.mistakes} mistake${gameState.mistakes !== 1 ? 's' : ''}!`
    : 'Here are the categories you missed:';

  // Coloured dot result grid
  const resultsEl = document.getElementById('end-results');
  resultsEl.innerHTML = '';
  gameState.guessHistory.forEach(row => {
    const div = document.createElement('div');
    div.className = 'end-result-row';
    row.forEach(tier => {
      const dot = document.createElement('div');
      dot.className = 'end-dot';
      dot.style.background = tier >= 0 ? TIER_COLORS[tier] : '#ccc';
      div.appendChild(dot);
    });
    resultsEl.appendChild(div);
  });

  document.getElementById('end-overlay').classList.remove('hidden');
}

// ─── board sizing ─────────────────────────────────────────────────────────────

// Make solved-group rows exactly as tall as a word tile.
// CSS alone can't account for the grid gap deducted from tile width, so JS measures
// a live tile and sets an explicit height on every solved-group element.
function syncSolvedGroupHeights() {
  requestAnimationFrame(() => {
    const tile = document.querySelector('#word-grid .word-tile');
    if (!tile) return;
    const h = tile.getBoundingClientRect().height;
    if (h <= 0) return;
    document.querySelectorAll('.solved-group').forEach(g => {
      g.style.height = h + 'px';
    });
  });
}

function setupBoardObserver() {
  if (boardObserver) boardObserver.disconnect();
  const grid = document.getElementById('word-grid');
  boardObserver = new ResizeObserver(syncSolvedGroupHeights);
  boardObserver.observe(grid);
}

// ─── shuffle ──────────────────────────────────────────────────────────────────

function handleShuffle() {
  if (isAnimating) return;
  const solved   = solvedWordSet();
  const remain   = gameState.wordOrder.filter(w => !solved.has(w));
  shuffle(remain);
  // Rebuild wordOrder keeping solved words in front (they're hidden anyway)
  // so only the remaining portion changes
  const solvedOrder = gameState.wordOrder.filter(w => solved.has(w));
  gameState.wordOrder = [...solvedOrder, ...remain];
  lsSet(currentPuzzle.id, gameState);
  renderWordGrid();
}

// ─── toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'fading');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.classList.add('hidden'), 320);
  }, 1600);
}

// ─── utilities ────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tileEl(word) {
  return document.querySelector(`.word-tile[data-word="${CSS.escape(word)}"]`);
}

// ─── event listeners ──────────────────────────────────────────────────────────

document.getElementById('back-btn').addEventListener('click', showSelectionScreen);

document.getElementById('shuffle-btn').addEventListener('click', handleShuffle);

document.getElementById('deselect-btn').addEventListener('click', () => {
  if (isAnimating) return;
  selectedWords.clear();
  renderWordGrid();
  updateButtons();
});

document.getElementById('submit-btn').addEventListener('click', handleSubmit);

document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('end-overlay').classList.add('hidden');
  gameState = makeInitialState(currentPuzzle);
  lsSet(currentPuzzle.id, gameState);
  selectedWords.clear();
  isAnimating = false;
  renderGame();
});

document.getElementById('back-to-list-btn').addEventListener('click', () => {
  document.getElementById('end-overlay').classList.add('hidden');
  showSelectionScreen();
});

// ─── go ───────────────────────────────────────────────────────────────────────

init();
