/**
 * Blackjack AI – Frontend Game Controller
 * Pure vanilla JS. No frameworks.
 *
 * Flow:
 *  1. User clicks New Game  → POST /api/start
 *  2. User clicks Hit       → POST /api/hit
 *  3. User clicks Stand     → POST /api/stand
 *     → Response includes dealer_steps array
 *     → We animate AI moves step-by-step with delays
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & STATE
   ═══════════════════════════════════════════════════════════════ */

const RED_SUITS  = ['♥', '♦'];
const STEP_DELAY = 1000; // ms between AI steps

let gameState = null; // latest state from server
let isAnimating = false;

/* ═══════════════════════════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const dom = {
  playerCards:      $('playerCards'),
  dealerCards:      $('dealerCards'),
  playerScore:      $('playerScore'),
  dealerScore:      $('dealerScore'),
  playerScoreBadge: $('playerScoreBadge'),
  dealerScoreBadge: $('dealerScoreBadge'),
  deckCount:        $('deckCount'),
  resultBanner:     $('resultBanner'),
  resultEmoji:      $('resultEmoji'),
  resultText:       $('resultText'),
  resultSub:        $('resultSub'),
  statusMsg:        $('statusMsg'),
  aiSteps:          $('aiSteps'),
  btnHit:           $('btnHit'),
  btnStand:         $('btnStand'),
  btnRestart:       $('btnRestart'),
};

/* ═══════════════════════════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════════════════════════ */

async function apiPost(endpoint) {
  const res = await fetch(`/api/${endpoint}`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════
   CARD RENDERING
   ═══════════════════════════════════════════════════════════════ */

function createCardEl(card, isNew = false) {
  const el = document.createElement('div');
  el.setAttribute('role', 'listitem');

  if (card.hidden) {
    el.className = 'playing-card hidden';
    el.innerHTML = `<div class="card-back-icon">🂠</div>`;
    el.setAttribute('aria-label', 'Hidden dealer card');
    return el;
  }

  const isRed = RED_SUITS.includes(card.suit);
  el.className = `playing-card face ${isRed ? 'red' : 'black'}${isNew ? ' new-card' : ''}`;
  el.setAttribute('aria-label', `${card.rank} of ${card.suit}`);

  el.innerHTML = `
    <div class="card-rank-top">${card.rank}<br/><small>${card.suit}</small></div>
    <div class="card-suit-center">${card.suit}</div>
    <div class="card-rank-bot">${card.rank}<br/><small>${card.suit}</small></div>
  `;
  return el;
}

function renderCards(container, cards, newCardIndex = -1) {
  container.innerHTML = '';
  cards.forEach((card, i) => {
    const el = createCardEl(card, i === newCardIndex);
    // Staggered deal animation
    el.style.animationDelay = `${i * 80}ms`;
    container.appendChild(el);
  });
}

/* ═══════════════════════════════════════════════════════════════
   SCORE DISPLAY
   ═══════════════════════════════════════════════════════════════ */

function updateScores(state, hideDealer = true) {
  dom.playerScore.textContent = state.player.score;
  dom.playerScore.className   = 'score-value' + (state.player.is_bust ? ' bust' : '');

  // Backend already sends the correct score (single-card score when hidden)
  dom.dealerScore.textContent = state.dealer.score;
  dom.dealerScore.className   = 'score-value' + (state.dealer.is_bust ? ' bust' : '');

  dom.deckCount.textContent = state.deck_remaining;
}

/* ═══════════════════════════════════════════════════════════════
   AI REASONING PANEL
   ═══════════════════════════════════════════════════════════════ */

function clearAIPanel() {
  dom.aiSteps.innerHTML = `<p class="ai-placeholder">AI is thinking…</p>`;
}

function addAIStep(step, index) {
  // Remove placeholder
  const ph = dom.aiSteps.querySelector('.ai-placeholder');
  if (ph) ph.remove();

  const isHit   = step.action === 'HIT';
  const bustPct = step.bust_probability * 100;
  const barClass = bustPct < 30 ? 'low' : bustPct < 50 ? 'mid' : 'high';

  const el = document.createElement('div');
  el.className = `ai-step ${isHit ? 'hit' : 'stand'}`;
  el.style.animationDelay = '0ms';

  let cardDrawnHtml = '';
  if (step.card_drawn) {
    const c = step.card_drawn;
    cardDrawnHtml = `<div class="step-card">🃏 Drew: <strong>${c.rank}${c.suit}</strong></div>`;
  }

  el.innerHTML = `
    <div class="step-number">${index + 1}</div>
    <div class="step-meta">
      <span class="step-action ${isHit ? 'hit' : 'stand'}">${step.action}</span>
      <span class="step-score">Score: <strong>${step.score}</strong></span>
    </div>
    <div class="bust-bar-wrap">
      <span class="bust-bar-label">Bust Probability</span>
      <div class="bust-bar">
        <div class="bust-bar-fill ${barClass}" style="width: 0%"></div>
      </div>
      <span class="bust-pct ${barClass}">${step.bust_probability_pct}</span>
    </div>
    <div class="step-reason">${step.reason}</div>
    ${cardDrawnHtml}
  `;

  dom.aiSteps.appendChild(el);

  // Animate bar fill after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = el.querySelector('.bust-bar-fill');
      if (fill) fill.style.width = `${bustPct}%`;
    });
  });

  // Auto-scroll
  dom.aiSteps.scrollTop = dom.aiSteps.scrollHeight;
}

function showThinkingDots() {
  dom.aiSteps.innerHTML = `
    <div style="text-align:center; padding: 20px 0;">
      <span style="font-size:0.8rem; color:rgba(255,255,255,0.4); margin-right:6px;">AI is calculating</span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   RESULT BANNER
   ═══════════════════════════════════════════════════════════════ */

const RESULT_MAP = {
  player_win: {
    cls:   'win',
    emoji: '🏆',
    text:  'You Win!',
    sub:   'Congratulations! The AI concedes.',
  },
  dealer_win: {
    cls:   'lose',
    emoji: '💔',
    text:  'Dealer Wins',
    sub:   'Better luck next time!',
  },
  draw: {
    cls:   'draw',
    emoji: '🤝',
    text:  "It's a Draw",
    sub:   'Equal scores — push!',
  },
};

function showResult(result, playerBust = false, dealerBust = false) {
  const info = RESULT_MAP[result] || RESULT_MAP['draw'];
  let sub = info.sub;
  if (playerBust)  sub = 'You went over 21 — bust!';
  if (dealerBust)  sub = 'Dealer went over 21 — you win!';

  dom.resultBanner.className = `result-banner ${info.cls}`;
  dom.resultEmoji.textContent = info.emoji;
  dom.resultText.textContent  = info.text;
  dom.resultSub.textContent   = sub;
  dom.resultBanner.hidden     = false;

  if (result === 'player_win') launchConfetti();
}

function hideResult() {
  dom.resultBanner.hidden = true;
  dom.resultBanner.className = 'result-banner';
}

/* ═══════════════════════════════════════════════════════════════
   CONFETTI
   ═══════════════════════════════════════════════════════════════ */

function launchConfetti() {
  const colors = ['#f5c842', '#39ff78', '#4dc3ff', '#ff4d6d', '#ffffff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left      = `${Math.random() * 100}vw`;
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width     = `${6 + Math.random() * 8}px`;
    el.style.height    = `${6 + Math.random() * 8}px`;
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    const duration = 2.5 + Math.random() * 2;
    el.style.animationDuration  = `${duration}s`;
    el.style.animationDelay     = `${Math.random() * 0.8}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), (duration + 1) * 1000);
  }
}

/* ═══════════════════════════════════════════════════════════════
   BUTTON STATE
   ═══════════════════════════════════════════════════════════════ */

function setButtons(canPlay) {
  dom.btnHit.disabled   = !canPlay || isAnimating;
  dom.btnStand.disabled = !canPlay || isAnimating;
}

function setStatus(msg) {
  dom.statusMsg.innerHTML = msg;
}

/* ═══════════════════════════════════════════════════════════════
   RENDER FULL STATE
   ═══════════════════════════════════════════════════════════════ */

function renderState(state, opts = {}) {
  const {
    newPlayerCard = false,
    revealDealer  = false,
    newDealerCardIndex = -1,
  } = opts;

  gameState = state;
  const playing  = state.status === 'playing';
  const finished = state.status === 'finished';

  // Cards
  const playerCardCount = state.player.cards.length;
  renderCards(dom.playerCards, state.player.cards, newPlayerCard ? playerCardCount - 1 : -1);
  renderCards(dom.dealerCards, state.dealer.cards, newDealerCardIndex);

  // Scores
  updateScores(state, !revealDealer && !finished);

  // Buttons
  setButtons(playing && !isAnimating);

  // Result
  if (finished) {
    showResult(state.result, state.player.is_bust, state.dealer.is_bust);
  } else {
    hideResult();
  }
}

/* ═══════════════════════════════════════════════════════════════
   AI TURN ANIMATION
   ═══════════════════════════════════════════════════════════════ */

async function animateDealerTurn(state) {
  isAnimating = true;
  setButtons(false);
  showThinkingDots();

  const steps   = state.dealer_steps || [];
  let   stepIdx = 0;

  // We need to reconstruct dealer cards step-by-step.
  // The server already played everything; we have the final state.
  // We'll replay: start from the initial 2 dealer cards (revealed)
  // and add drawn cards one at a time.

  // Gather cards drawn by AI steps
  const drawnCards = steps
    .filter(s => s.card_drawn)
    .map(s => s.card_drawn);

  // Initial dealer cards (first 2, no hidden)
  const initialDealerCards = state.dealer.cards
    .slice(0, state.dealer.cards.length - drawnCards.length)
    .map(c => ({ ...c, hidden: false }));

  // Show initial state (reveal hole card)
  const initDisplayCards = [...initialDealerCards];
  dom.dealerCards.innerHTML = '';
  initDisplayCards.forEach((card, i) => {
    const el = createCardEl(card, false);
    el.style.animationDelay = `${i * 80}ms`;
    dom.dealerCards.appendChild(el);
  });
  dom.dealerScore.textContent = steps[0]?.score ?? computeHandScore(initialDealerCards);

  await delay(700); // pause before AI steps

  const displayHand = [...initDisplayCards];

  for (const step of steps) {
    // Add AI reasoning step to panel
    addAIStep(step, stepIdx);
    stepIdx++;

    await delay(STEP_DELAY * 0.5);

    if (step.card_drawn) {
      // Animate drawing the card
      displayHand.push({ ...step.card_drawn, hidden: false });

      dom.dealerCards.innerHTML = '';
      displayHand.forEach((card, i) => {
        const el = createCardEl(card, i === displayHand.length - 1);
        el.style.animationDelay = `${i * 60}ms`;
        dom.dealerCards.appendChild(el);
      });

      // Update score after card
      const newScore = steps[stepIdx - 1]?.score ?? 0;
      // Compute actual running score
      const currentScore = computeHandScore(displayHand);
      dom.dealerScore.textContent = currentScore;
      dom.dealerScore.className = currentScore > 21 ? 'score-value bust' : 'score-value';

      await delay(STEP_DELAY * 0.5);
    }
  }

  await delay(600);

  // Final render (full reveal)
  renderState(state, { revealDealer: true });
  isAnimating = false;
}

function computeHandScore(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces++; }
    else if (['J','Q','K'].includes(c.rank)) total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ═══════════════════════════════════════════════════════════════
   GAME ACTIONS
   ═══════════════════════════════════════════════════════════════ */

async function startGame() {
  hideResult();
  clearAIPanel();
  dom.aiSteps.innerHTML = `<p class="ai-placeholder">AI reasoning will appear here during the dealer's turn.</p>`;
  setButtons(false);
  setStatus('Dealing cards…');

  try {
    const state = await apiPost('start');
    renderState(state, { newPlayerCard: false });
    setStatus('Your turn — <strong>Hit</strong> or <strong>Stand</strong>?');

    if (state.status === 'finished') {
      // Immediate blackjack
      setStatus(`<strong>Blackjack!</strong> Game over.`);
      renderState(state, { revealDealer: true });
    }
  } catch (e) {
    setStatus(`⚠️ Error: ${e.message}`);
  }
}

async function playerHit() {
  if (isAnimating) return;
  setButtons(false);
  setStatus('Drawing card…');

  try {
    const state = await apiPost('hit');
    renderState(state, { newPlayerCard: true });

    if (state.status === 'playing') {
      setStatus('Your turn — <strong>Hit</strong> or <strong>Stand</strong>?');
      setButtons(true);
    } else if (state.player.is_bust) {
      setStatus('💥 You went bust! Dealer wins.');
      renderState(state, { revealDealer: true });
    } else {
      // Score = 21, auto-stand
      setStatus('21! Dealer plays…');
      await animateDealerTurn(state);
      finishAITurn(state);
    }
  } catch (e) {
    setStatus(`⚠️ Error: ${e.message}`);
    setButtons(true);
  }
}

async function playerStand() {
  if (isAnimating) return;
  setButtons(false);
  setStatus('You stood — AI dealer is playing…');

  try {
    const state = await apiPost('stand');
    await animateDealerTurn(state);
    finishAITurn(state);
  } catch (e) {
    setStatus(`⚠️ Error: ${e.message}`);
    setButtons(false);
  }
}

function finishAITurn(state) {
  const msgs = {
    player_win: '🏆 You win! Well played.',
    dealer_win: '😔 Dealer wins. Try again!',
    draw:       '🤝 It\'s a draw — push!',
  };
  setStatus(msgs[state.result] || 'Game over.');
}

/* ═══════════════════════════════════════════════════════════════
   FLOATING PARTICLES (background)
   ═══════════════════════════════════════════════════════════════ */

function initParticles() {
  const container = document.getElementById('particles');
  const suits = ['♠', '♥', '♦', '♣'];
  const count = 12;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.style.left     = `${Math.random() * 100}%`;
    el.style.width    = el.style.height = `${3 + Math.random() * 4}px`;
    el.style.animationDuration = `${8 + Math.random() * 12}s`;
    el.style.animationDelay   = `-${Math.random() * 14}s`;

    // Occasionally use suit symbols as text instead
    if (Math.random() > 0.6) {
      el.style.background = 'transparent';
      el.style.width = el.style.height = 'auto';
      el.style.fontSize = `${10 + Math.random() * 14}px`;
      el.style.opacity = '0';
      el.textContent = suits[Math.floor(Math.random() * suits.length)];
      el.style.color = Math.random() > 0.5 ? '#f5c84280' : '#ffffff25';
    }

    container.appendChild(el);
  }
}

/* ═══════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════ */

dom.btnRestart.addEventListener('click', startGame);
dom.btnHit.addEventListener('click', playerHit);
dom.btnStand.addEventListener('click', playerStand);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (isAnimating) return; // Block all shortcuts during AI animation
  if (e.key === 'h' || e.key === 'H') {
    if (!dom.btnHit.disabled) playerHit();
  }
  if (e.key === 's' || e.key === 'S') {
    if (!dom.btnStand.disabled) playerStand();
  }
  if (e.key === 'r' || e.key === 'R') {
    startGame();
  }
});

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */

initParticles();
setStatus('Press <strong>New Game</strong> to start. (Shortcuts: H = Hit, S = Stand, R = Restart)');
