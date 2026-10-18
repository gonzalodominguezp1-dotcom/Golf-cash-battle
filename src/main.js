import './style.css';
import { HOLES_PER_MATCH, MAX_STROKES_PER_HOLE, PLATFORM_COMMISSION, PLAYERS_PER_MATCH, TIERS, potFor, prizeFor } from './config.js';
import { LocalWallet } from './wallet/LocalWallet.js';
import { InsufficientFundsError } from './wallet/WalletService.js';
import { MatchService } from './match/MatchService.js';
import { COURSES } from './game/courses.js';
import { GolfGame } from './game/GolfGame.js';

const wallet = new LocalWallet();
const matches = new MatchService(wallet);
const app = document.getElementById('app');

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const coin = (n) => `<span class="coin">◎</span>${fmt(n)}`;
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

let game = null;

async function shell(content, { hideHeader = false } = {}) {
  game?.dispose();
  game = null;
  const balance = await wallet.getBalance();
  app.innerHTML = '';
  if (!hideHeader) {
    const header = h(`
      <header class="topbar">
        <button class="brand" data-go="lobby">⛳ Golf Cash Battle</button>
        <button class="balance" data-go="wallet">${coin(balance)}</button>
      </header>`);
    app.append(header);
  }
  app.append(content);
  app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}

function go(screen) {
  if (screen === 'wallet') return showWallet();
  return showLobby();
}

// ---------- lobby ----------

async function showLobby() {
  const balance = await wallet.getBalance();
  const view = h(`
    <main class="screen lobby">
      <h1>Elige tu partida</h1>
      <p class="sub">${PLAYERS_PER_MATCH} jugadores · ${HOLES_PER_MATCH} hoyos · gana quien haga menos golpes</p>
      <div class="tiers"></div>
      <p class="legal">Créditos de demostración sin valor real. El resultado depende solo de la habilidad: mismo campo para todos y sin elementos aleatorios. Comisión de la plataforma: ${Math.round(PLATFORM_COMMISSION * 100)}% del bote.</p>
    </main>`);
  const list = view.querySelector('.tiers');
  for (const tier of TIERS) {
    const free = tier.entryFee === 0;
    const enough = balance >= tier.entryFee;
    const card = h(`
      <div class="tier" style="--tier:${tier.color}">
        <div class="tier-head">
          <span class="tier-name">${tier.name}</span>
          <span class="tier-fee">${free ? 'Gratis' : `Entrada ${coin(tier.entryFee)}`}</span>
        </div>
        <div class="tier-body">
          ${free ? '<span>Entrena sin arriesgar créditos</span>' : `<span>Bote ${coin(potFor(tier))}</span><strong>Premio ${coin(prizeFor(tier))}</strong>`}
        </div>
        <button class="play" ${enough ? '' : 'disabled'}>${enough ? 'Jugar' : 'Saldo insuficiente'}</button>
      </div>`);
    card.querySelector('.play').addEventListener('click', () => startMatch(tier));
    list.append(card);
  }
  await shell(view);
}

// ---------- wallet ----------

const TX_LABEL = { deposit: 'Recarga', entry: 'Entrada', prize: 'Premio', refund: 'Devolución' };

async function showWallet() {
  const [balance, txs] = await Promise.all([wallet.getBalance(), wallet.getTransactions()]);
  const view = h(`
    <main class="screen wallet">
      <div class="wallet-card">
        <span>Saldo disponible</span>
        <strong>${coin(balance)}</strong>
        <small>Créditos demo · sin valor real</small>
      </div>
      <div class="row">
        <button class="primary" data-add="50">+50 demo</button>
        <button class="primary" data-add="200">+200 demo</button>
      </div>
      <h2>Movimientos</h2>
      <ul class="txs">
        ${
          txs.length
            ? txs
                .map(
                  (t) => `<li>
                    <div><b>${TX_LABEL[t.type]}</b><small>${t.note} · ${new Date(t.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
                    <span class="${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount >= 0 ? '+' : ''}${fmt(t.amount)}</span>
                  </li>`,
                )
                .join('')
            : '<li class="empty">Sin movimientos</li>'
        }
      </ul>
      <button class="ghost" data-go="lobby">← Volver</button>
    </main>`);
  view.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', async () => {
      await wallet.deposit(Number(b.dataset.add), 'Recarga demo');
      showWallet();
    }),
  );
  await shell(view);
}

// ---------- matchmaking ----------

async function startMatch(tier) {
  let match;
  try {
    match = await matches.join(tier);
  } catch (e) {
    if (e instanceof InsufficientFundsError) return showWallet();
    throw e;
  }
  const view = h(`
    <main class="screen matchmaking">
      <h1>Buscando rivales…</h1>
      <p class="sub">${tier.name} · ${tier.entryFee ? `bote ${coin(potFor(tier))}` : 'práctica'}</p>
      <div class="seats"></div>
      <button class="ghost cancel">Cancelar y recuperar entrada</button>
    </main>`);
  const seats = view.querySelector('.seats');
  for (let i = 0; i < PLAYERS_PER_MATCH; i++) seats.append(h(`<div class="seat"><span>…</span></div>`));
  let cancelled = false;
  view.querySelector('.cancel').addEventListener('click', async () => {
    cancelled = true;
    await matches.cancel(match);
    showLobby();
  });
  await shell(view);
  for (let i = 0; i < match.players.length; i++) {
    await wait(i === 0 ? 200 : 250 + Math.random() * 350);
    if (cancelled) return;
    const s = seats.children[i];
    s.classList.add('filled', ...(match.players[i].isBot ? [] : ['me']));
    s.innerHTML = `<span class="avatar">${match.players[i].name[0]}</span><span>${match.players[i].name}</span>`;
  }
  await wait(600);
  if (!cancelled) playHole(match, 0);
}

// ---------- juego ----------

function playHole(match, index) {
  const course = COURSES[index % COURSES.length];
  const view = h(`
    <main class="play-screen">
      <div class="stage"></div>
      <div class="hud">
        <div class="pill">Hoyo ${index + 1}/${match.holes}</div>
        <div class="pill">${course.name} · Par ${course.par}</div>
        <div class="pill strokes">Golpes <b>0</b></div>
      </div>
      <div class="hint">Arrastra hacia atrás y suelta para golpear</div>
      <div class="power"><div></div></div>
    </main>`);
  shell(view, { hideHeader: true }).then(() => {
    const strokesEl = view.querySelector('.strokes b');
    const powerEl = view.querySelector('.power div');
    const hint = view.querySelector('.hint');
    let finished = false;
    const finish = (strokes) => {
      if (finished) return;
      finished = true;
      game.locked = true;
      const standings = matches.recordHole(match, index, course.par, strokes);
      showHoleResult(match, index, course, strokes, standings);
    };
    game = new GolfGame(view.querySelector('.stage'), {
      onAim: (p) => {
        powerEl.style.width = `${p * 100}%`;
        powerEl.parentElement.classList.toggle('active', p > 0);
      },
      onStroke: (n) => {
        strokesEl.textContent = n;
        hint.classList.add('gone');
      },
      onSunk: finish,
      onRest: (n) => {
        if (n >= MAX_STROKES_PER_HOLE) finish(n);
      },
    });
    game.load(course);
  });
}

function scoreLabel(strokes, par) {
  if (strokes === 1) return '¡Hoyo en uno!';
  const d = strokes - par;
  return { '-3': 'Albatros', '-2': '¡Eagle!', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Doble bogey' }[d] ?? `+${d}`;
}

function standingsTable(players, highlightPayout) {
  return `<ol class="standings">${players
    .map(
      (p, i) => `<li class="${p.isBot ? '' : 'me'}">
        <span class="pos">${p.position ?? i + 1}</span>
        <span class="name">${p.name}</span>
        <span class="scores">${p.scores.join(' · ')}</span>
        <b>${p.total}</b>
        ${highlightPayout && p.payout ? `<span class="payout">+${fmt(p.payout)}</span>` : ''}
      </li>`,
    )
    .join('')}</ol>`;
}

function showHoleResult(match, index, course, strokes, standings) {
  const last = index + 1 >= match.holes;
  const overlay = h(`
    <div class="overlay">
      <div class="card">
        <h2>${scoreLabel(strokes, course.par)}</h2>
        <p class="sub">${strokes} golpe${strokes === 1 ? '' : 's'} · par ${course.par}</p>
        ${standingsTable(standings)}
        <button class="primary next">${last ? 'Ver resultado' : 'Siguiente hoyo'}</button>
      </div>
    </div>`);
  overlay.querySelector('.next').addEventListener('click', () => (last ? showResults(match) : playHole(match, index + 1)));
  app.append(overlay);
}

async function showResults(match) {
  const result = await matches.finish(match);
  const won = result.me.payout > 0;
  const view = h(`
    <main class="screen results">
      <div class="trophy">${won ? '🏆' : result.me.position <= 3 ? '🥈' : '⛳'}</div>
      <h1>${won ? '¡Has ganado!' : `Posición ${result.me.position} de ${PLAYERS_PER_MATCH}`}</h1>
      <p class="sub">${match.tier.entryFee ? (won ? `Premio ${coin(result.me.payout)}` : `Bote ${coin(result.pot)} para el ganador`) : 'Partida de práctica'}</p>
      ${standingsTable(result.ranking, true)}
      ${match.tier.entryFee ? `<p class="legal">Bote ${fmt(result.pot)} · comisión ${fmt(result.commission)} · premio ${fmt(result.prize)}</p>` : ''}
      <div class="row">
        <button class="primary again">Revancha</button>
        <button class="ghost" data-go="lobby">Lobby</button>
      </div>
    </main>`);
  view.querySelector('.again').addEventListener('click', () => startMatch(match.tier));
  await shell(view);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

wallet.subscribe((b) => {
  const el = app.querySelector('.balance');
  if (el) el.innerHTML = coin(b);
});

showLobby();
