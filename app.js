const TICKET_THEMES = {
  talonario: {
    name: 'Talonario', swatch: '#D9311C', stubText: '#FFFFFF',
    bg1: '#2A2822', bg2: '#2A2822', card: '#FBFAF6', inner: '#EEEBE3',
    border: '#16150F', accent: '#D9311C', pillBg: 'rgba(217,49,28,0.12)',
    pillBorder: '#D9311C', pillText: '#D9311C', textMain: '#16150F',
    textMuted: '#5E5B52', codeBg: '#FBFAF6', codeText: '#16150F', divider: '#B9B4A6'
  },
  classic: {
    name: 'Noche Dorada', swatch: '#f59e0b', stubText: '#0b1120',
    bg1: '#0b1120', bg2: '#132038', card: '#162235', inner: '#0f172a',
    border: '#f59e0b', accent: '#f59e0b', pillBg: 'rgba(16,185,129,0.18)',
    pillBorder: '#10b981', pillText: '#34d399', textMain: '#ffffff',
    textMuted: '#94a3b8', codeBg: '#0b1324', codeText: '#fef3c7', divider: '#334155'
  },
  royal: {
    name: 'Azul Real', swatch: '#38bdf8', stubText: '#09152b',
    bg1: '#09152b', bg2: '#102a54', card: '#112244', inner: '#0a1730',
    border: '#38bdf8', accent: '#38bdf8', pillBg: 'rgba(251,191,36,0.18)',
    pillBorder: '#fbbf24', pillText: '#fde68a', textMain: '#ffffff',
    textMuted: '#93c5fd', codeBg: '#081226', codeText: '#e0f2fe', divider: '#1e3a6d'
  },
  ruby: {
    name: 'Fuego VIP', swatch: '#fb7185', stubText: '#1a0812',
    bg1: '#1a0812', bg2: '#331020', card: '#280d1b', inner: '#190711',
    border: '#fb7185', accent: '#fbbf24', pillBg: 'rgba(251,113,133,0.18)',
    pillBorder: '#fb7185', pillText: '#fecdd3', textMain: '#ffffff',
    textMuted: '#fda4af', codeBg: '#16050e', codeText: '#fef3c7', divider: '#542038'
  },
  light: {
    name: 'Blanco Limpio', swatch: '#10b981', stubText: '#ffffff',
    bg1: '#e2e8f0', bg2: '#f8fafc', card: '#ffffff', inner: '#f1f5f9',
    border: '#059669', accent: '#059669', pillBg: 'rgba(5,150,105,0.12)',
    pillBorder: '#059669', pillText: '#047857', textMain: '#0f172a',
    textMuted: '#475569', codeBg: '#f8fafc', codeText: '#0f172a', divider: '#cbd5e1'
  }
};

const QR = (() => {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  let v = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = v; LOG[v] = i; v <<= 1; if (v & 256) v ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gfMul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  function rsEncode(data, ecCount) {
    let gen = [1];
    for (let i = 0; i < ecCount; i++) {
      const next = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= gfMul(gen[j], EXP[i]); }
      gen = next;
    }
    const rem = data.concat(new Array(ecCount).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = rem[i];
      if (factor) for (let j = 0; j < gen.length; j++) rem[i + j] ^= gfMul(gen[j], factor);
    }
    return rem.slice(data.length);
  }

  function getFormatBits(mask) {
    let rem = mask << 10;
    for (let i = 4; i >= 0; i--) if ((rem >> (i + 10)) & 1) rem ^= (0x537 << i);
    return ((mask << 10) | rem) ^ 0x5412;
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0, (r, c) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  function generate(text) {
    const bytes = Array.from(new TextEncoder().encode(text)).slice(0, 42);
    let ver, dataCap, ecCount, align;
    if (bytes.length <= 14) { ver = 1; dataCap = 16; ecCount = 10; align = 0; }
    else if (bytes.length <= 26) { ver = 2; dataCap = 28; ecCount = 16; align = 18; }
    else { ver = 3; dataCap = 44; ecCount = 26; align = 22; }

    const bits = [];
    const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    pushBits(0b0100, 4); pushBits(bytes.length, 8); bytes.forEach((b) => pushBits(b, 8));
    pushBits(0, Math.min(4, dataCap * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const dataWords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataWords.push(byte);
    }
    const pads = [0xec, 0x11];
    for (let i = 0; dataWords.length < dataCap; i++) dataWords.push(pads[i & 1]);

    const allWords = dataWords.concat(rsEncode(dataWords, ecCount));
    const size = 17 + ver * 4;
    const base = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r0, c0]) => {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r >= 0 && r < size && c >= 0 && c < size) {
          isFunc[r][c] = 1;
          const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          base[r][c] = (inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))) ? 1 : 0;
        }
      }
    });
    if (align) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      isFunc[align + dr][align + dc] = 1;
      base[align + dr][align + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
    }
    for (let i = 8; i < size - 8; i++) { isFunc[6][i] = isFunc[i][6] = 1; base[6][i] = base[i][6] = (i % 2 === 0) ? 1 : 0; }
    isFunc[size - 8][8] = 1; base[size - 8][8] = 1;

    const copy1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const copy2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
    copy1.concat(copy2).forEach(([r, c]) => { isFunc[r][c] = 1; });

    let bitIdx = 0, up = true;
    const totalBits = allWords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const r = up ? (size - 1 - vert) : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) { base[r][c] = bitIdx < totalBits ? ((allWords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) : 0; bitIdx++; }
        }
      }
      up = !up;
    }

    let bestGrid = null, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const g = base.map((row) => row.slice()), fn = MASKS[m];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!isFunc[r][c] && fn(r, c)) g[r][c] ^= 1;
      const fmt = getFormatBits(m);
      for (let i = 0; i < 15; i++) { const b = (fmt >> (14 - i)) & 1; g[copy1[i][0]][copy1[i][1]] = b; g[copy2[i][0]][copy2[i][1]] = b; }
      let score = 0, dark = 0;
      for (let r = 0; r < size; r++) {
        let runR = 1, runC = 1;
        for (let c = 0; c < size; c++) {
          dark += g[r][c];
          if (c > 0) {
            if (g[r][c] === g[r][c - 1]) { runR++; if (runR === 5) score += 3; else if (runR > 5) score++; } else runR = 1;
            if (g[c][r] === g[c - 1][r]) { runC++; if (runC === 5) score += 3; else if (runC > 5) score++; } else runC = 1;
          }
          if (r > 0 && c > 0 && g[r][c] === g[r-1][c] && g[r][c] === g[r][c-1] && g[r][c] === g[r-1][c-1]) score += 3;
        }
      }
      score += Math.abs(Math.round((dark * 100) / (size * size)) - 50) * 2;
      if (score < bestScore) { bestScore = score; bestGrid = g; }
    }
    return bestGrid;
  }
  return { generate };
})();

let audioCtx = null, soundEnabled = true;
try { soundEnabled = localStorage.getItem('concursopro_sound') !== 'off'; } catch {}

function ensureAudio() {
  if (!soundEnabled) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playTickSound(progress) {
  const ctx = ensureAudio(); if (!ctx) return;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(340 + progress * 380, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.045);
  gain.gain.setValueAtTime(0.14, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.055);
}

function playWinFanfare() {
  const ctx = ensureAudio(); if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    const t = ctx.currentTime + idx * 0.11;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (idx === 3 ? 0.65 : 0.28));
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + (idx === 3 ? 0.68 : 0.3));
  });
}

const DB_NAME = 'ConcursoProDB', STORE_NAME = 'contests', LS_KEY = 'concursopro_fallback_v1';
let db = null, contests = [], activeContestId = null, selectedPackIndex = 2, packCount = 1;
let currentModalSale = null, currentTicketBlob = null, isDrawing = false, isSimMode = false;
let qrStream = null, qrScanTimer = null;
try { activeContestId = localStorage.getItem('concursopro_active_id') || null; } catch {}

function openDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    // Antes eran 1,5 s y la app caía a un almacenamiento vacío: ahora espera hasta 10 s
    setTimeout(() => finish(null), 10000);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(STORE_NAME)) idb.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      req.onsuccess = (e) => finish(e.target.result);
      req.onerror = () => finish(null);
    } catch { finish(null); }
  });
}

function readLocalMirror() {
  try { const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
}
let mirrorWarned = false;
function writeLocalMirror() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(contests)); }
  catch { if (!db && !mirrorWarned) { mirrorWarned = true; alert('⚠️ El almacenamiento del navegador está lleno. Haz un Respaldo JSON ahora.'); } }
}

function idbGetAll() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    try {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

// Une la base principal (IndexedDB) con la copia local: por cada concurso gana la versión más nueva
async function loadAllContests() {
  const fromDb = await idbGetAll(), fromLs = readLocalMirror(), byId = new Map();
  fromDb.forEach((c) => byId.set(c.id, c));
  const toMigrate = [];
  fromLs.forEach((c) => {
    if (!c || !c.id) return;
    const cur = byId.get(c.id);
    if (!cur || (c.rev || 0) > (cur.rev || 0)) { byId.set(c.id, c); if (db) toMigrate.push(c); }
  });
  for (const c of toMigrate) { try { await idbPut(c); } catch {} }
  return [...byId.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function idbPut(contest) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(contest);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

class ConflictError extends Error {}
const syncChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('concursopro_sync') : null;

// Guarda con control de versión: si otra pestaña guardó algo más nuevo, no lo pisa
async function saveContest(contest) {
  const prevRev = contest.rev || 0;
  const next = () => { contest.rev = prevRev + 1; contest.updatedAt = new Date().toISOString(); };
  try {
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite'), store = tx.objectStore(STORE_NAME);
        const getReq = store.get(contest.id);
        getReq.onsuccess = () => {
          const stored = getReq.result;
          if (stored && (stored.rev || 0) > prevRev) { tx.abort(); return reject(new ConflictError()); }
          next(); store.put(contest);
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } else {
      const stored = readLocalMirror().find((c) => c.id === contest.id);
      if (stored && (stored.rev || 0) > prevRev) throw new ConflictError();
      next();
    }
  } catch (err) {
    if (err instanceof ConflictError) {
      contests = await loadAllContests(); renderAll();
      alert('⚠️ La app se modificó en otra pestaña o ventana. Recargué los datos más nuevos: repite tu última acción.');
    } else {
      alert('⚠️ No se pudo guardar el cambio. Haz un Respaldo JSON y recarga la app.');
    }
    throw err;
  }
  const idx = contests.findIndex((c) => c.id === contest.id);
  if (idx >= 0) contests[idx] = contest; else contests.push(contest);
  writeLocalMirror();
  syncChannel?.postMessage({ id: contest.id, rev: contest.rev });
}

if (syncChannel) syncChannel.onmessage = async () => {
  if (isDrawing) return;
  contests = await loadAllContests(); renderAll(); showToast('Datos actualizados desde otra pestaña');
};

function getActiveContest() {
  const c = contests.find((x) => x.id === activeContestId) || contests[0];
  if (c && !c.theme) c.theme = 'talonario';
  return c;
}

function createDefaultContest() {
  return {
    id: 'c_' + Date.now(), name: 'Gran Concurso Oficial', drawDate: 'Por definir',
    contact: '@tuconcurso', theme: 'talonario', logoDataUrl: '',
    createdAt: new Date().toISOString(), unsavedChanges: 0,
    packs: [
      { qty: 1, price: 2000, badge: '' },
      { qty: 3, price: 5000, badge: 'Ahorras $1.000' },
      { qty: 8, price: 10000, badge: 'Más vendido' }
    ],
    prizes: [], sales: [], tickets: []
  };
}

const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const jsArg = (v) => escapeHtml(JSON.stringify(String(v)));
const formatCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2700);
}

const cleanRut = (val) => String(val || '').replace(/[^0-9kK]/g, '').toUpperCase();
function formatRut(val) {
  const c = cleanRut(val);
  if (c.length < 2) return c;
  return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
}
function validateRut(val) {
  const c = cleanRut(val);
  if (c.length < 7 || c.length > 9) return false;
  const body = c.slice(0, -1), dv = c.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const rem = 11 - (sum % 11);
  return dv === (rem === 11 ? '0' : rem === 10 ? 'K' : String(rem));
}
function maskRut(val) {
  const f = formatRut(val);
  if (f.includes('-') && f.length >= 6) {
    const [body, dv] = f.split('-');
    const digits = body.replace(/\./g, '');
    if (digits.length >= 4) return digits.slice(0, 2) + '.XXX.XX' + digits.slice(-1) + '-' + dv;
  }
  return f ? f.slice(0, 2) + '***' + f.slice(-2) : 'Sin RUT';
}
function normalizePhone(val) {
  let digits = String(val || '').replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) digits = '56' + digits;
  return digits;
}
// Identifica al cliente: por RUT si lo dio; si no, por WhatsApp; si no, por nombre
function customerKey(p) {
  if (!p) return '';
  if (typeof p === 'string') { const r = cleanRut(p); return r ? 'R:' + r : ''; }
  const r = cleanRut(p.buyerRut); if (r) return 'R:' + r;
  const ph = normalizePhone(p.buyerPhone); if (ph.length >= 8) return 'P:' + ph;
  const n = String(p.buyerName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return n ? 'N:' + n : '';
}
function getCustomerStats(contest, person) {
  const target = customerKey(person);
  if (!target) return { totalTickets: 0, lastSale: null };
  const matchingSales = contest.sales.filter((s) => customerKey(s) === target);
  const totalTickets = contest.tickets.filter((t) => customerKey(t) === target).length;
  return { totalTickets, lastSale: matchingSales[0] || null };
}
const rutOrDash = (rut) => (cleanRut(rut) ? rut : 'Sin RUT');

const MAX_CODES_PER_SALE = 120;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateUniqueCode(existingSet) {
  const bytes = new Uint8Array(6);
  for (let tries = 0; tries < 50; tries++) {
    crypto.getRandomValues(bytes);
    let code = 'CN-';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] & 31];
    if (!existingSet.has(code)) { existingSet.add(code); return code; }
  }
  throw new Error('Error generando código');
}
function secureRandomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const arr = new Uint32Array(1);
  do { crypto.getRandomValues(arr); } while (arr[0] >= limit);
  return arr[0] % max;
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`).classList.add('active');
  ['vender', 'premios', 'sorteo', 'ajustes'].forEach((t) => document.body.classList.toggle('tab-' + t, t === tab));
  window.scrollTo(0, 0);
  renderAll();
}
function openContestSwitcher() {
  switchTab('ajustes');
  const sel = document.getElementById('contestSelector');
  document.getElementById('contestCard').scrollIntoView({ block: 'start' });
  setTimeout(() => sel.focus(), 50);
}
const stripEmoji = (t) => String(t || '').replace(/[\p{Extended_Pictographic}\uFE0F]\s*/gu, '').trim();

function renderAll() {
  const c = getActiveContest(); if (!c) return;
  document.getElementById('hdrContestName').textContent = c.name;
  document.getElementById('hdrContestDate').textContent = 'Sorteo: ' + (c.drawDate || 'Por definir');
  document.getElementById('hdrRevenue').textContent = formatCLP(c.sales.reduce((s, x) => s + Number(x.amount || 0), 0));

  const banner = document.getElementById('backupBanner');
  if ((c.unsavedChanges || 0) > 0) {
    banner.classList.remove('hidden');
    document.getElementById('backupBannerText').textContent = `${c.unsavedChanges} cambio${c.unsavedChanges > 1 ? 's' : ''} sin respaldar`;
  } else banner.classList.add('hidden');

  document.getElementById('kpiSales').textContent = c.sales.length;
  document.getElementById('kpiTickets').textContent = c.tickets.length;
  document.getElementById('kpiPrizes').textContent = c.prizes.length;

  renderPacks(c); renderSalesList(); renderPrizesList(c); renderDrawTab(c); renderSettingsTab(c);
}

function renderPacks(c) {
  document.getElementById('packsContainer').innerHTML = c.packs.map((p, idx) => {
    const unit = Math.round(p.price / p.qty), isFeatured = idx === c.packs.length - 1;
    return `<button type="button" class="pack-btn ${idx === selectedPackIndex ? 'selected' : ''} ${isFeatured ? 'featured' : ''}" onclick="selectPack(${idx})">
      ${stripEmoji(p.badge) ? `<span class="pack-badge">${escapeHtml(stripEmoji(p.badge))}</span>` : ''}
      <span class="pack-qty">${p.qty}</span>
      <span class="pack-unit">${p.qty === 1 ? 'número' : formatCLP(unit) + ' c/u'}</span>
      <span class="pack-price">${formatCLP(p.price)}</span></button>`;
  }).join('');
  updatePackCountUI();
}
function selectPack(idx) { selectedPackIndex = idx; renderPacks(getActiveContest()); setPackCount(packCount); }
function changePackCount(delta) { setPackCount(packCount + delta); }
function setPackCount(val) {
  const n = parseInt(val, 10);
  const pack = getActiveContest()?.packs[selectedPackIndex];
  const maxPacks = pack ? Math.max(1, Math.floor(MAX_CODES_PER_SALE / pack.qty)) : 50;
  packCount = Math.min(maxPacks, Math.max(1, isNaN(n) ? 1 : n));
  updatePackCountUI();
}
function updatePackCountUI() {
  const c = getActiveContest(); if (!c) return;
  const pack = c.packs[selectedPackIndex]; if (!pack) return;
  const input = document.getElementById('packCountInput');
  if (input && String(input.value) !== String(packCount)) input.value = packCount;
  const sum = document.getElementById('packCountSummary');
  if (sum) sum.innerHTML = `${packCount} × pack x${pack.qty} = <strong>${pack.qty * packCount} ${pack.qty * packCount === 1 ? 'ticket' : 'tickets'}</strong> · Total <strong>${formatCLP(pack.price * packCount)}</strong>`;
  const n = pack.qty * packCount;
  const tot = document.getElementById('saleBarTotal'), cnt = document.getElementById('saleBarCount');
  if (tot) tot.textContent = formatCLP(pack.price * packCount);
  if (cnt) cnt.textContent = `${n} ${n === 1 ? 'número' : 'números'}`;
}

function onRutInput() {
  const val = document.getElementById('buyerRut').value.trim();
  const hint = document.getElementById('rutHint'), retBox = document.getElementById('returningCustomerBox');
  const c = getActiveContest();
  if (!val) { hint.className = 'hint'; hint.textContent = 'Confirma la transferencia en tu banco antes de emitir.'; retBox.classList.add('hidden'); return; }
  if (validateRut(val)) { hint.className = 'hint ok'; hint.textContent = 'RUT válido: ' + formatRut(val); }
  else { hint.className = 'hint warn'; hint.textContent = 'Revisa el dígito verificador (puedes emitir igual si es pasaporte).'; }

  const stats = getCustomerStats(c, val);
  if (stats.totalTickets > 0 && stats.lastSale) {
    const needsAutofill = !document.getElementById('buyerName').value.trim() || !document.getElementById('buyerPhone').value.trim();
    retBox.classList.remove('hidden');
    retBox.innerHTML = `<span><strong>${escapeHtml(stats.lastSale.buyerName)}</strong> ya suma <strong>${stats.totalTickets} ${stats.totalTickets === 1 ? 'ticket' : 'tickets'}</strong>.</span>
      ${needsAutofill ? `<button type="button" class="btn btn-info btn-sm" onclick="autofillReturning(${jsArg(stats.lastSale.id)})">Usar datos</button>` : ''}`;
  } else retBox.classList.add('hidden');
}

function autofillReturning(saleId) {
  const s = getActiveContest().sales.find((x) => x.id === saleId); if (!s) return;
  document.getElementById('buyerName').value = s.buyerName;
  if (s.buyerPhone) document.getElementById('buyerPhone').value = '+' + s.buyerPhone;
  onRutInput(); showToast('Datos del cliente cargados');
}

function copySalesTemplate() {
  const c = getActiveContest();
  const lines = c.packs.map((p, i) => `${i === c.packs.length - 1 ? '🔥' : '🎟️'} ${p.qty} ${p.qty === 1 ? 'ticket' : 'tickets'}: ${formatCLP(p.price)}${p.badge ? ' (' + p.badge + ')' : ''}`).join('\n');
  const msg = `¡Hola! Para participar en *${c.name}* elige tu pack:\n${lines}\n\n✨ Mientras más tickets lleves, ¡más premios puedes ganar en el mismo sorteo!\n\nEnvíame tu comprobante de transferencia junto a estos datos:\nNombre:\nRUT:\nPack:`;
  navigator.clipboard?.writeText(msg).then(() => showToast('Plantilla copiada para WhatsApp')).catch(() => alert(msg));
}

function applyQuickPaste() {
  const text = document.getElementById('quickPasteBox').value.trim();
  if (!text) return showToast('Pega primero el mensaje del cliente');
  const c = getActiveContest(), lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let name = '', rut = '', phone = '', packIdx = -1, count = 0;
  const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}(?:-[\dkK]|[kK])\b|\b\d{1,2}\.\d{3}\.\d{3}-?[\dkK]\b/, PHONE_RE = /(\+?56)?\s*9[\s-]?\d{4}[\s-]?\d{4}/;
  const findPack = (num) => c.packs.findIndex((p) => p.qty === num || p.price === num);
  for (const line of lines) {
    let rest = line;
    const label = line.match(/^(nombre|rut|whatsapp|fono|tel[eé]fono|cel(ular)?|pack|tickets?|n[uú]meros?|cantidad|monto)\s*[:\-]\s*(.*)$/i);
    if (label) {
      const key = label[1].toLowerCase(), val = label[3].trim();
      if (key === 'nombre') { name = val; continue; }
      if (key === 'rut') { rut = val; continue; }
      if (/whatsapp|fono|tel|cel/.test(key)) { phone = val; continue; }
      rest = val;
    }
    if (!rut && RUT_RE.test(rest)) { rut = rest.match(RUT_RE)[0]; rest = rest.replace(RUT_RE, ' '); }
    if (!phone && PHONE_RE.test(rest)) { phone = rest.match(PHONE_RE)[0]; rest = rest.replace(PHONE_RE, ' '); }
    // "4 del pack de 8", "pack de 8", "x8", "$10.000", "2 packs"
    const pk = rest.match(/pack\s*(?:de|x)?\s*(\d{1,3})\b/i) || rest.match(/\bx\s*(\d{1,3})\b/i) || rest.match(/\$\s*(\d{1,3}(?:\.?\d{3})+)/);
    if (pk && packIdx < 0) { const f = findPack(parseInt(pk[1].replace(/\D/g, ''), 10)); if (f >= 0) packIdx = f; }
    const ct = rest.match(/\b(\d{1,2})\s*(?:packs?\b|del\s+pack|de\s+(?:los|esos)?\s*packs?|veces)/i);
    if (ct) { count = parseInt(ct[1], 10); rest = rest.replace(ct[0], ' '); }
    if (pk) rest = rest.replace(pk[0], ' ');
    if (/^\s*\$?\s*\d[\d.]*\s*$/.test(rest) && packIdx < 0) { const f = findPack(parseInt(rest.replace(/\D/g, ''), 10)); if (f >= 0) { packIdx = f; continue; } }
    if (!name && /\p{L}{2,}/u.test(rest)) {
      const nm = rest.replace(/^(hola|buenas(\s+(tardes|noches|d[ií]as))?|buen\s+d[ií]a|hey)[!,.\s]*/i, '')
        .replace(/^(soy|me llamo|mi nombre es|les habla|te habla|habla)\s+/i, '')
        .replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (nm && nm.split(' ').length <= 5 && !/\b(quiero|quisiera|comprar|transfer|pago|pagu[eé]|n[uú]meros?|tickets?|gracias)\b/i.test(nm)) name = nm;
    }
  }
  const found = [];
  if (name) { document.getElementById('buyerName').value = name; found.push('nombre'); }
  if (phone) { document.getElementById('buyerPhone').value = phone.trim(); found.push('WhatsApp'); }
  if (rut) { document.getElementById('buyerRut').value = formatRut(rut); onRutInput(); found.push('RUT'); }
  if (packIdx >= 0) { selectPack(packIdx); found.push('pack'); }
  if (count > 0) { setPackCount(count); found.push('cantidad'); }
  showToast(found.length ? 'Leí: ' + found.join(', ') + '. Revisa antes de emitir.' : 'No encontré datos; complétalos a mano');
}

async function createSale() {
  const c = getActiveContest(), name = document.getElementById('buyerName').value.trim();
  const rawRut = document.getElementById('buyerRut').value.trim(), phone = document.getElementById('buyerPhone').value.trim();
  const pack = c.packs[selectedPackIndex], mult = packCount;
  const totalQty = pack.qty * mult, totalAmount = pack.price * mult;
  if (totalQty > MAX_CODES_PER_SALE) return showToast(`Máximo ${MAX_CODES_PER_SALE} códigos por venta. Divídela en dos.`);
  if (!name) return showToast('Ingresa el nombre del comprador');

  const cleaned = cleanRut(rawRut), fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const buyerKey = customerKey({ buyerRut: rawRut, buyerPhone: phone, buyerName: name });
  const recentDup = c.sales.find((s) => customerKey(s) === buyerKey && Number(s.amount) === Number(totalAmount) && new Date(s.createdAt).getTime() >= fiveMinAgo);
  if (recentDup) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(recentDup.createdAt).getTime()) / 60000));
    if (!confirm(`⚠️ POSIBLE VENTA DUPLICADA\n\n${recentDup.buyerName} (${rutOrDash(recentDup.buyerRut)}) ya registró una compra de ${formatCLP(totalAmount)} hace menos de ${mins} min.\n\n¿Confirmas que recibiste una SEGUNDA transferencia real?`)) return;
  }

  const rutFormatted = cleaned.length >= 7 ? formatRut(rawRut) : rawRut;
  const existingCodes = new Set(c.tickets.map((t) => t.code)), newCodes = [];
  const saleId = 'S-' + Date.now().toString(36).toUpperCase();
  for (let i = 0; i < totalQty; i++) {
    const code = generateUniqueCode(existingCodes);
    newCodes.push(code);
    c.tickets.push({ code, saleId, buyerName: name, buyerRut: rutFormatted, buyerPhone: normalizePhone(phone), wonPrizeId: null });
  }
  const sale = { id: saleId, buyerName: name, buyerRut: rutFormatted, buyerPhone: normalizePhone(phone), qty: totalQty, amount: totalAmount, packCount: mult, packQty: pack.qty, codes: newCodes, createdAt: new Date().toISOString() };
  c.sales.unshift(sale); c.unsavedChanges = (c.unsavedChanges || 0) + 1;
  await saveContest(c);

  document.getElementById('buyerName').value = ''; document.getElementById('buyerRut').value = '';
  document.getElementById('buyerPhone').value = ''; document.getElementById('quickPasteBox').value = '';
  setPackCount(1); onRutInput(); renderAll(); openTicketModal(sale, false);
}

function renderSalesList() {
  const c = getActiveContest(), q = (document.getElementById('salesSearch').value || '').trim().toLowerCase();
  const filtered = c.sales.filter((s) => !q || s.buyerName.toLowerCase().includes(q) || String(s.buyerRut || '').toLowerCase().includes(q) || String(s.buyerPhone || '').includes(q) || s.id.toLowerCase().includes(q) || s.codes.some((cd) => cd.toLowerCase().includes(q)));
  document.getElementById('salesCountBadge').textContent = `${filtered.length} ventas`;
  const container = document.getElementById('salesList');
  if (!filtered.length) { container.innerHTML = '<div class="hint" style="margin:6px 0 0;">Aún no hay ventas registradas.</div>'; return; }
  container.innerHTML = filtered.slice(0, 40).map((s) => {
    const dateStr = new Date(s.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
    const total = getCustomerStats(c, s).totalTickets;
    return `<div class="list-item" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
        <div class="item-main"><div class="item-title">${escapeHtml(s.buyerName)} · ${formatCLP(s.amount)}</div>
        <div class="item-sub">${escapeHtml(rutOrDash(s.buyerRut))} · ${s.packCount > 1 ? s.packCount + ' packs · ' : 'Pack '}x${s.qty} (Acum: ${total}) · ${dateStr}</div></div>
        <div style="display:flex;gap:6px;"><button class="btn btn-secondary btn-sm" onclick="openTicketById(${jsArg(s.id)})">Ticket</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSale(${jsArg(s.id)})">Anular</button></div>
      </div>
      <div class="code-chips">${s.codes.map((cd) => `<span class="chip">${escapeHtml(cd)}</span>`).join('')}</div></div>`;
  }).join('');
}

async function deleteSale(saleId, skipConfirm) {
  const c = getActiveContest();
  if (c.tickets.some((t) => t.saleId === saleId && t.wonPrizeId)) return showToast('No se puede anular: ya ganó un premio');
  if (!skipConfirm && !confirm('¿Anular esta venta y eliminar sus números?')) return;
  c.sales = c.sales.filter((s) => s.id !== saleId); c.tickets = c.tickets.filter((t) => t.saleId !== saleId);
  c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c); renderAll(); showToast('Venta anulada');
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function loadImageSafe(src) {
  return new Promise((resolve) => { if (!src) return resolve(null); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}

const F_DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';
const F_UI = '"Instrument Sans", system-ui, sans-serif';
const F_MONO = '"IBM Plex Mono", ui-monospace, monospace';
let fontsPromise = null;
function ensureTicketFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  if (!fontsPromise) fontsPromise = Promise.all([
    document.fonts.load(`800 60px ${F_DISPLAY}`), document.fonts.load(`700 26px ${F_UI}`),
    document.fonts.load(`600 24px ${F_UI}`), document.fonts.load(`600 32px ${F_MONO}`)
  ]).catch(() => {});
  return Promise.race([fontsPromise, new Promise((r) => setTimeout(r, 2500))]);
}
function fitText(ctx, text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrapText(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const rest = lines.slice(maxLines - 1).join(' '); lines.length = maxLines - 1; lines.push(fitText(ctx, rest, maxW)); }
  return lines.map((l) => fitText(ctx, l, maxW));
}

// Ticket estilo talonario: talón de color a la izquierda, números en monoespaciada, sello PAGADO y QR
async function renderTicketToBlob(contest, sale) {
  const th = TICKET_THEMES[contest.theme] || TICKET_THEMES.talonario;
  await ensureTicketFonts();
  const logoImg = await loadImageSafe(contest.logoDataUrl);
  const n = sale.codes.length, cols = n === 1 ? 1 : n <= 12 ? 3 : 4, rows = Math.ceil(n / cols);
  const W = 1080, M = 40, STUB = 170, PAD = 46, X0 = M + STUB, cx = X0 + PAD, CW = W - M - X0 - PAD * 2;
  const rowH = n === 1 ? 110 : 62, codeFont = cols === 1 ? 64 : cols === 3 ? 36 : 30;

  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `800 60px ${F_DISPLAY}`;
  const titleLines = wrapText(meas, contest.name || 'Concurso', CW, 2);

  let H = M + PAD;
  const logoY = H; if (logoImg) H += 120 + 24;
  const kickerY = H + 22; H += 22 + 18;
  const titleY = H + 54; H += titleLines.length * 66 + 20;
  const infoY = H; H += 132 + 30;
  const codesHeadY = H + 22; H += 22 + 20;
  const codesY = H; H += rows * rowH + 10;
  const bandY = H; H += 100;
  const qrY = H; H += 196;
  H += PAD + M;
  H = Math.max(H, 760);

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = th.bg1; ctx.fillRect(0, 0, W, H);

  // papel + talón
  ctx.save(); drawRoundRect(ctx, M, M, W - 2 * M, H - 2 * M, 22); ctx.clip();
  ctx.fillStyle = th.card; ctx.fillRect(M, M, W - 2 * M, H - 2 * M);
  ctx.fillStyle = th.accent; ctx.fillRect(M, M, STUB, H - 2 * M);
  ctx.restore();
  ctx.strokeStyle = th.card; ctx.lineWidth = 5; ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.moveTo(X0, M + 26); ctx.lineTo(X0, H - M - 26); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = th.bg1;
  [[X0, M], [X0, H - M]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); });

  const stubText = th.stubText || '#FFFFFF';
  ctx.textAlign = 'center'; ctx.fillStyle = stubText;
  ctx.font = `800 ${n >= 100 ? 64 : 84}px ${F_DISPLAY}`; ctx.fillText(String(n), M + STUB / 2, M + 120);
  ctx.font = `700 22px ${F_UI}`; ctx.fillText(n === 1 ? 'NÚMERO' : 'NÚMEROS', M + STUB / 2, M + 158);
  ctx.save(); ctx.translate(M + STUB / 2, (M + 200 + H - M - 30) / 2); ctx.rotate(-Math.PI / 2);
  ctx.font = `600 26px ${F_MONO}`; ctx.fillText(`COMPROBANTE Nº ${sale.id}`, 0, 9); ctx.restore();

  // logo
  if (logoImg) {
    const sc = Math.min(320 / logoImg.width, 120 / logoImg.height, 1), dw = Math.round(logoImg.width * sc), dh = Math.round(logoImg.height * sc);
    ctx.save(); drawRoundRect(ctx, cx, logoY, dw, dh, 12); ctx.clip(); ctx.drawImage(logoImg, cx, logoY, dw, dh); ctx.restore();
  }

  // título
  ctx.textAlign = 'left'; ctx.fillStyle = th.textMuted; ctx.font = `700 22px ${F_UI}`;
  ctx.fillText('PARTICIPACIÓN', cx, kickerY);
  ctx.fillStyle = th.textMain; ctx.font = `800 60px ${F_DISPLAY}`;
  titleLines.forEach((l, i) => ctx.fillText(l, cx, titleY + i * 66));

  // datos
  ctx.strokeStyle = th.textMain; ctx.lineWidth = 3;
  [infoY, infoY + 132].forEach((y) => { ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + CW, y); ctx.stroke(); });
  const colX = [cx, cx + CW * 0.44, cx + CW * 0.76], colW = [CW * 0.44 - 20, CW * 0.32 - 20, CW * 0.24];
  const info = [['Titular', sale.buyerName], ['Sorteo', contest.drawDate || 'Por definir'], ['Pagado', formatCLP(sale.amount)]];
  info.forEach(([lab, val], i) => {
    ctx.fillStyle = th.textMuted; ctx.font = `600 22px ${F_UI}`; ctx.fillText(lab, colX[i], infoY + 44);
    ctx.fillStyle = th.textMain; ctx.font = i === 2 ? `600 30px ${F_MONO}` : `700 30px ${F_UI}`;
    ctx.fillText(fitText(ctx, val, colW[i]), colX[i], infoY + 86);
  });
  if (cleanRut(sale.buyerRut)) { ctx.fillStyle = th.textMuted; ctx.font = `500 20px ${F_UI}`; ctx.fillText('RUT ' + maskRut(sale.buyerRut), colX[0], infoY + 116); }

  // números
  ctx.fillStyle = th.textMuted; ctx.font = `700 22px ${F_UI}`;
  ctx.fillText(n === 1 ? 'TU NÚMERO' : 'TUS NÚMEROS', cx, codesHeadY);
  const cellW = CW / cols;
  sale.codes.forEach((code, i) => {
    const r = Math.floor(i / cols), c = i % cols, x = cx + c * cellW, y = codesY + r * rowH;
    ctx.fillStyle = th.codeText; ctx.font = `600 ${codeFont}px ${F_MONO}`; ctx.textAlign = cols === 1 ? 'left' : 'center';
    ctx.fillText(code, cols === 1 ? x : x + cellW / 2, y + rowH * 0.62);
    ctx.strokeStyle = th.divider; ctx.lineWidth = 2; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(x + (cols === 1 ? 0 : 10), y + rowH - 8); ctx.lineTo(x + cellW - 10, y + rowH - 8); ctx.stroke(); ctx.setLineDash([]);
  });

  // franja: emisión + sello
  ctx.textAlign = 'left'; ctx.fillStyle = th.textMuted; ctx.font = `500 22px ${F_UI}`;
  const packTxt = sale.packCount > 1 ? `${sale.packCount} packs de ${sale.packQty}` : `Pack de ${sale.qty}`;
  ctx.fillText(`Emitido ${new Date(sale.createdAt).toLocaleDateString('es-CL')} · ${packTxt}`, cx, bandY + 60);
  ctx.save(); ctx.translate(cx + CW - 125, bandY + 50); ctx.rotate(-0.2);
  ctx.strokeStyle = th.accent; ctx.lineWidth = 5; drawRoundRect(ctx, -115, -38, 230, 76, 12); ctx.stroke();
  ctx.fillStyle = th.accent; ctx.textAlign = 'center'; ctx.font = `800 46px ${F_DISPLAY}`; ctx.fillText('PAGADO', 0, 16);
  ctx.restore();

  // QR
  const matrix = QR.generate('CP:' + sale.id), qSize = matrix.length, box = 190;
  ctx.fillStyle = '#FFFFFF'; drawRoundRect(ctx, cx, qrY, box, box, 10); ctx.fill();
  ctx.strokeStyle = th.textMain; ctx.lineWidth = 3; ctx.stroke();
  const cell = Math.floor((box - 24) / qSize), qPx = cell * qSize, ox = cx + Math.floor((box - qPx) / 2), oy = qrY + Math.floor((box - qPx) / 2);
  ctx.fillStyle = '#16150F';
  for (let r = 0; r < qSize; r++) for (let c = 0; c < qSize; c++) if (matrix[r][c]) ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
  const tx = cx + box + 30, tw = CW - box - 30;
  ctx.textAlign = 'left';
  ctx.fillStyle = th.textMain; ctx.font = `700 26px ${F_UI}`; ctx.fillText(fitText(ctx, 'Escanea para verificar', tw), tx, qrY + 44);
  ctx.fillStyle = th.textMuted; ctx.font = `500 23px ${F_UI}`; ctx.fillText(fitText(ctx, 'tus números y ver el resultado.', tw), tx, qrY + 80);
  ctx.fillStyle = th.accent; ctx.font = `700 26px ${F_UI}`; ctx.fillText(fitText(ctx, contest.contact || '', tw), tx, qrY + 132);
  ctx.fillStyle = th.textMuted; ctx.font = `600 20px ${F_MONO}`; ctx.fillText(fitText(ctx, `ID ${sale.id}`, tw), tx, qrY + 176);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

function openTicketById(saleId) { const sale = getActiveContest().sales.find((s) => s.id === saleId); if (sale) openTicketModal(sale, false); }
async function previewSampleTicket() {
  const c = getActiveContest(), pack = c.packs[c.packs.length - 1] || { qty: 3, price: 5000 };
  await openTicketModal({ id: 'S-MUESTRA01', buyerName: 'Camila Rojas (Ejemplo)', buyerRut: '18.456.789-2', buyerPhone: '', qty: pack.qty, amount: pack.price, codes: Array.from({ length: pack.qty }, (_, i) => `CN-EJEM0${i + 1}`), createdAt: new Date().toISOString() }, true);
}

async function openTicketModal(sale, isSample) {
  const c = getActiveContest(); currentModalSale = isSample ? null : sale;
  currentTicketBlob = await renderTicketToBlob(c, sale);
  const url = URL.createObjectURL(currentTicketBlob), img = document.getElementById('ticketPreviewImg');
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.src = url; img.dataset.url = url;
  document.getElementById('ticketModalTitle').textContent = isSample ? 'Vista previa del ticket' : `${sale.qty} ${sale.qty === 1 ? 'número emitido' : 'números emitidos'}`;
  document.getElementById('ticketModalActions').classList.toggle('hidden', isSample);
  document.getElementById('ticketModalSaleId').textContent = isSample ? '' : 'Venta ' + sale.id;
  const sumEl = document.getElementById('ticketModalSummary'), codesEl = document.getElementById('ticketCodesPreview');
  if (!isSample) {
    const total = getCustomerStats(c, sale).totalTickets;
    const packTxt = sale.packCount > 1 ? `${sale.packCount} packs de ${sale.packQty}` : `pack de ${sale.qty}`;
    sumEl.textContent = `${sale.buyerName} · ${packTxt} · ${formatCLP(sale.amount)}` + (total > sale.qty ? ` · ya suma ${total} números` : '');
    const shown = sale.codes.slice(0, sale.codes.length > 6 ? 5 : 6);
    codesEl.innerHTML = shown.map((cd) => `<span>${escapeHtml(cd.replace(/^CN-/, ''))}</span>`).join('') + (sale.codes.length > shown.length ? `<span class="more">+${sale.codes.length - shown.length} más</span>` : '');
    codesEl.classList.remove('hidden');
    document.getElementById('btnShareWALabel').textContent = `Enviar a ${sale.buyerName.split(' ')[0]} por WhatsApp`;
  } else { sumEl.textContent = 'Así verán el ticket tus compradores.'; codesEl.classList.add('hidden'); }
  document.getElementById('ticketModal').classList.add('open');
}
function closeTicketModal() { document.getElementById('ticketModal').classList.remove('open'); }
async function undoCurrentSale() {
  if (!currentModalSale) return;
  const id = currentModalSale.id;
  closeTicketModal(); await deleteSale(id, true);
}

function buildWhatsAppText(contest, sale) {
  const total = getCustomerStats(contest, sale).totalTickets;
  const accumLine = total > sale.qty ? `\n🔥 ¡Ya acumulas *${total} códigos en total* participando por los premios!` : '';
  return `¡Gracias por participar en *${contest.name}*, ${sale.buyerName}! ✅\nAquí tienes tu comprobante con ${sale.qty} ${sale.qty === 1 ? 'código' : 'códigos'}.${accumLine}\n¡Mucho éxito en el sorteo! 🍀`;
}
async function shareCurrentTicket() {
  if (!currentTicketBlob || !currentModalSale) return;
  const c = getActiveContest(), file = new File([currentTicketBlob], `ticket-${currentModalSale.id}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: c.name, text: buildWhatsAppText(c, currentModalSale) }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  downloadCurrentTicket(); showToast('Imagen guardada; adjúntala en WhatsApp');
}
function downloadCurrentTicket() {
  if (!currentTicketBlob || !currentModalSale) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(currentTicketBlob);
  a.download = `ticket-${currentModalSale.buyerName.replace(/\s+/g, '_')}-${currentModalSale.id}.png`; a.click();
  showToast('Ticket PNG guardado');
}
function openWhatsAppChat() {
  if (!currentModalSale) return;
  const msg = encodeURIComponent(buildWhatsAppText(getActiveContest(), currentModalSale) + `\n\nTus códigos: ${currentModalSale.codes.join(', ')}`);
  window.open(currentModalSale.buyerPhone ? `https://wa.me/${currentModalSale.buyerPhone}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank');
}

async function addPrize() {
  const name = document.getElementById('prizeName').value.trim(), desc = document.getElementById('prizeDesc').value.trim(), isMajor = document.getElementById('prizeMajor').checked;
  if (!name) return showToast('Escribe el nombre del premio');
  const c = getActiveContest();
  c.prizes.push({ id: 'P-' + Date.now().toString(36), name, desc, isMajor, winner: null });
  c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c);
  document.getElementById('prizeName').value = ''; document.getElementById('prizeDesc').value = ''; document.getElementById('prizeMajor').checked = false;
  renderAll(); showToast('Premio agregado');
}
function renderPrizesList(c) {
  const el = document.getElementById('prizesList');
  if (!c.prizes.length) { el.innerHTML = '<div class="hint" style="margin:0;">Aún no hay premios. Agrega los que vayan llegando.</div>'; return; }
  el.innerHTML = c.prizes.map((p, idx) => `<div class="list-item"><div class="item-main">
    <div class="item-title">${idx + 1}. ${escapeHtml(p.name)}${p.isMajor ? ' · Mayor' : ''}</div>
    <div class="item-sub">${p.desc ? escapeHtml(p.desc) + ' · ' : ''}${p.winner ? `Ganador: ${escapeHtml(p.winner.buyerName)} (${escapeHtml(p.winner.code)})` : 'Pendiente por sortear'}</div>
  </div><div style="display:flex;gap:4px;">
    ${idx > 0 ? `<button class="btn btn-secondary btn-sm" onclick="movePrize(${idx}, -1)">↑</button>` : ''}
    ${idx < c.prizes.length - 1 ? `<button class="btn btn-secondary btn-sm" onclick="movePrize(${idx}, 1)">↓</button>` : ''}
    ${!p.winner ? `<button class="btn btn-danger btn-sm" onclick="deletePrize(${jsArg(p.id)})">Quitar</button>` : ''}
  </div></div>`).join('');
}
async function movePrize(idx, delta) {
  const c = getActiveContest(), target = idx + delta;
  if (target < 0 || target >= c.prizes.length) return;
  [c.prizes[idx], c.prizes[target]] = [c.prizes[target], c.prizes[idx]];
  c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c); renderAll();
}
async function deletePrize(id) {
  if (!confirm('¿Eliminar este premio?')) return;
  const c = getActiveContest(); c.prizes = c.prizes.filter((p) => p.id !== id);
  c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c); renderAll();
}

function toggleSimMode() { if (isDrawing) return; isSimMode = !isSimMode; renderDrawTab(getActiveContest()); showToast(isSimMode ? 'Simulacro activado' : 'Modo real activado'); }
function toggleSound() { soundEnabled = !soundEnabled; try { localStorage.setItem('concursopro_sound', soundEnabled ? 'on' : 'off'); } catch {} renderDrawTab(getActiveContest()); if (soundEnabled) playTickSound(0.5); }

function renderDrawTab(c) {
  const sel = document.getElementById('drawPrizeSelect'), pending = c.prizes.filter((p) => !p.winner), prevVal = sel.value;
  sel.innerHTML = pending.length ? pending.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.isMajor ? ' (mayor)' : ''}</option>`).join('') : '<option value="">No hay premios pendientes</option>';
  if (pending.some((p) => p.id === prevVal)) sel.value = prevVal;

  const activeCount = c.tickets.filter((t) => !t.wonPrizeId).length;
  const poolEl = document.getElementById('drawPoolInfo');
  const btn = document.getElementById('btnStartDraw');

  document.getElementById('drawBackupNotice').classList.toggle('hidden', !(c.unsavedChanges > 0));

  if (isSimMode) {
    poolEl.textContent = `Modo ensayo activo · Tickets activos reales: ${activeCount}`;
    btn.disabled = isDrawing;
    btn.textContent = isDrawing ? 'Ensayando…' : 'Probar sorteo (simulacro)';
  } else if (!pending.length) {
    poolEl.textContent = 'Agrega un premio pendiente en la pestaña Premios para sortear.';
    btn.disabled = true;
    btn.textContent = 'Sin premios pendientes';
  } else if (!activeCount) {
    poolEl.textContent = 'No hay tickets activos. Registra ventas o activa Simulacro.';
    btn.disabled = true;
    btn.textContent = 'Sin números en juego';
  } else {
    poolEl.textContent = `Tickets activos: ${activeCount} · Premios pendientes: ${pending.length}`;
    btn.disabled = isDrawing;
    btn.textContent = isDrawing ? 'Sorteando…' : 'Sortear ganador';
  }

  const simBtn = document.getElementById('btnSimToggle');
  simBtn.textContent = isSimMode ? 'Simulacro: sí' : 'Simulacro: no';
  simBtn.className = isSimMode ? 'btn btn-gold btn-sm' : 'btn btn-secondary btn-sm';
  document.getElementById('btnSoundToggle').textContent = soundEnabled ? 'Sonido: sí' : 'Sonido: no';
  document.getElementById('liveSoundMini').textContent = soundEnabled ? '♪' : '–';
  document.getElementById('liveStage').classList.toggle('sim-mode', isSimMode);
  document.getElementById('simRibbon').classList.toggle('hidden', !isSimMode);
  document.getElementById('liveContestBadge').textContent = (isSimMode ? 'Prueba · ' : '') + c.name;
  updateLiveStageHeader();

  const winners = c.prizes.filter((p) => p.winner);
  document.getElementById('btnUndoLastWinner').classList.toggle('hidden', !winners.length || isSimMode);
  document.getElementById('winnersList').innerHTML = winners.length ? winners.map((p) => `<div class="list-item"><div class="item-main">
    <div class="item-title">${escapeHtml(p.name)}${p.isMajor ? ' · Mayor' : ''}</div>
    <div class="item-sub">${escapeHtml(p.winner.buyerName)} ${cleanRut(p.winner.buyerRut) ? '(' + maskRut(p.winner.buyerRut) + ')' : ''}</div>
    <div class="code-chips"><span class="chip winner">${escapeHtml(p.winner.code)}</span></div>
  </div>${p.winner.buyerPhone ? `<button class="btn btn-primary btn-sm" onclick="contactWinner(${jsArg(p.id)})">WhatsApp</button>` : ''}</div>`).join('') : '<div class="hint" style="margin:0;">Todavía no se ha sorteado ningún premio.</div>';
}

async function undoLastWinner() {
  if (isDrawing || isSimMode) return;
  const c = getActiveContest();
  const drawn = c.prizes.filter((p) => p.winner).sort((a, b) => new Date(b.winner.drawnAt || 0) - new Date(a.winner.drawnAt || 0));
  const lastPrize = drawn[0];
  if (!lastPrize) return;
  if (!confirm(`¿Anular a ${lastPrize.winner.buyerName} (${lastPrize.winner.code}) en "${lastPrize.name}" y volver a dejar el premio pendiente?`)) return;

  const t = c.tickets.find((x) => x.code === lastPrize.winner.code && x.wonPrizeId === lastPrize.id);
  if (t) t.wonPrizeId = null;
  lastPrize.winner = null;
  c.unsavedChanges = (c.unsavedChanges || 0) + 1;
  await saveContest(c);
  renderAll();
  showToast('Último ganador anulado');
}

function updateLiveStageHeader() {
  if (isDrawing) return;
  const c = getActiveContest(), prize = c.prizes.find((p) => p.id === document.getElementById('drawPrizeSelect').value);
  document.getElementById('livePrizeName').textContent = prize ? prize.name : (isSimMode ? 'Premio de ensayo' : 'Sin premios pendientes');
}
function toggleLiveFullscreen() {
  const active = document.body.classList.toggle('live-fullscreen');
  document.getElementById('exitLiveBtn').classList.toggle('hidden', !active);
  document.getElementById('liveSoundMini').classList.toggle('hidden', !active);
}

function startLiveDraw() {
  if (isDrawing) return; ensureAudio();
  const c = getActiveContest(), prize = c.prizes.find((p) => p.id === document.getElementById('drawPrizeSelect').value && !p.winner);
  if (!isSimMode && !prize) return showToast('Agrega o selecciona un premio pendiente');

  let activePool = c.tickets.filter((t) => !t.wonPrizeId);
  if (!activePool.length) {
    if (!isSimMode) return showToast('No hay tickets activos para sortear');
    activePool = [
      { code: 'CN-PRB9A2', buyerName: 'Camila Prueba', buyerRut: '18.234.567-K' },
      { code: 'CN-PRB4K7', buyerName: 'Matías Ensayo', buyerRut: '19.876.543-2' },
      { code: 'CN-PRB7M3', buyerName: 'Sofía Demo', buyerRut: '17.444.333-5' },
      { code: 'CN-PRB2X9', buyerName: 'Diego Test', buyerRut: '20.111.222-8' }
    ];
  }
  isDrawing = true;
  const btn = document.getElementById('btnStartDraw'); btn.disabled = true; btn.textContent = isSimMode ? 'Ensayando…' : 'Sorteando…';
  const winnerTicket = activePool[secureRandomInt(activePool.length)];
  const codeEl = document.getElementById('rouletteCode'), winEl = document.getElementById('rouletteWinner'), rutEl = document.getElementById('rouletteRut');
  winEl.textContent = 'Buscando ganador...'; rutEl.textContent = '';

  let step = 0, totalSteps = 34;
  (function tick() {
    step++;
    if (step < totalSteps) {
      codeEl.textContent = activePool[secureRandomInt(activePool.length)].code;
      playTickSound(step / totalSteps);
      setTimeout(tick, 45 + Math.pow(step / totalSteps, 2.6) * 310);
    } else finalizeWinner(c, prize, winnerTicket);
  })();
}

async function finalizeWinner(c, prize, ticket) {
  if (!isSimMode && prize) {
    ticket.wonPrizeId = prize.id;
    prize.winner = { code: ticket.code, buyerName: ticket.buyerName, buyerRut: ticket.buyerRut, buyerPhone: ticket.buyerPhone, drawnAt: new Date().toISOString() };
    c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c);
  }
  document.getElementById('rouletteCode').textContent = ticket.code;
  document.getElementById('rouletteWinner').textContent = ticket.buyerName;
  document.getElementById('rouletteRut').textContent = isSimMode ? 'SIMULACRO — No guardado en el concurso' : (cleanRut(ticket.buyerRut) ? 'RUT: ' + maskRut(ticket.buyerRut) : '');
  playWinFanfare(); launchConfetti();
  isDrawing = false;
  const btn = document.getElementById('btnStartDraw'); btn.disabled = false;
  btn.textContent = isSimMode ? 'Probar otro simulacro' : 'Sortear siguiente premio';
  renderAll();
}

function contactWinner(prizeId) {
  const c = getActiveContest(), p = c.prizes.find((x) => x.id === prizeId); if (!p || !p.winner) return;
  const msg = encodeURIComponent(`🎉 ¡FELICIDADES ${p.winner.buyerName}! Ganaste *${p.name}* en *${c.name}* con tu código *${p.winner.code}*. ¡Coordinemos la entrega!`);
  window.open(`https://wa.me/${p.winner.buyerPhone}?text=${msg}`, '_blank');
}

function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; canvas.style.display = 'block';
  const ctx = canvas.getContext('2d'), colors = ['#f59e0b', '#10b981', '#38bdf8', '#f43f5e', '#fef08a'];
  const pieces = Array.from({ length: 110 }, () => ({ x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.4, w: 7 + Math.random() * 6, h: 10 + Math.random() * 8, vy: 3 + Math.random() * 5, vx: (Math.random() - 0.5) * 4, rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 0.2, color: colors[Math.floor(Math.random() * colors.length)] }));
  let frames = 0;
  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) { p.x += p.vx; p.y += p.vy; p.rot += p.vrot; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
    if (++frames < 140) requestAnimationFrame(frame); else canvas.style.display = 'none';
  })();
}

async function selectTheme(themeKey) {
  const c = getActiveContest(); c.theme = themeKey; c.unsavedChanges = (c.unsavedChanges || 0) + 1;
  await saveContest(c); renderAll(); showToast('Tema actualizado: ' + TICKET_THEMES[themeKey].name);
}

function handleLogoUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(320 / img.width, 320 / img.height, 1);
      const cw = Math.max(1, Math.round(img.width * scale)), ch = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      let dataUrl = cv.toDataURL('image/png');
      if (dataUrl.length > 180000) dataUrl = cv.toDataURL('image/jpeg', 0.82);
      if (dataUrl.length > 180000) dataUrl = cv.toDataURL('image/jpeg', 0.65);
      const c = getActiveContest(); c.logoDataUrl = dataUrl; c.unsavedChanges = (c.unsavedChanges || 0) + 1;
      await saveContest(c); renderAll(); showToast('Logo guardado (' + Math.round(dataUrl.length / 1024) + ' KB)');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file); e.target.value = '';
}
async function removeContestLogo() { const c = getActiveContest(); c.logoDataUrl = ''; c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c); renderAll(); showToast('Logo eliminado'); }

function verifyCode(overrideVal) {
  const c = getActiveContest(), raw = (overrideVal !== undefined ? overrideVal : document.getElementById('verifyInput').value).trim().toUpperCase();
  if (overrideVal !== undefined) document.getElementById('verifyInput').value = raw;
  const box = document.getElementById('verifyResult'); if (!raw) return;

  const saleKey = raw.startsWith('CP:') ? raw.slice(3) : raw, sale = c.sales.find((s) => s.id.toUpperCase() === saleKey);
  if (sale) {
    const total = getCustomerStats(c, sale).totalTickets, saleTickets = c.tickets.filter((t) => t.saleId === sale.id);
    box.innerHTML = `<div style="background:var(--bg);border:1px solid var(--primary);padding:11px;border-radius:10px;">
      <div style="color:var(--primary);font-weight:800;">Comprobante válido (${escapeHtml(sale.id)})</div>
      <div>Titular: <strong>${escapeHtml(sale.buyerName)}</strong> (${escapeHtml(rutOrDash(sale.buyerRut))})</div>
      <div>${sale.packCount > 1 ? sale.packCount + ' packs · ' : 'Pack '}x${sale.qty} (${formatCLP(sale.amount)}) · Total cliente: <strong>${total} tickets</strong></div>
      <div class="code-chips">${saleTickets.map((t) => { const wp = t.wonPrizeId ? c.prizes.find((p) => p.id === t.wonPrizeId) : null; return `<span class="chip ${wp ? 'winner' : ''}">${escapeHtml(t.code)}${wp ? ' 🏆' : ''}</span>`; }).join('')}</div></div>`;
    return;
  }
  const t = c.tickets.find((x) => x.code.toUpperCase() === raw);
  if (!t) { box.innerHTML = `<span style="color:#B42318;font-weight:700;">"${escapeHtml(raw)}" no existe en este concurso.</span>`; return; }
  const wonPrize = t.wonPrizeId ? c.prizes.find((p) => p.id === t.wonPrizeId) : null, total = getCustomerStats(c, t).totalTickets;
  box.innerHTML = `<div style="background:var(--bg);border:1px solid var(--primary);padding:11px;border-radius:10px;">
    <div style="color:var(--primary);font-weight:800;">Número válido: ${escapeHtml(t.code)}</div>
    <div>Titular: <strong>${escapeHtml(t.buyerName)}</strong> (${escapeHtml(rutOrDash(t.buyerRut))})</div>
    <div>Total acumulado: <strong>${total} ${total === 1 ? 'ticket' : 'tickets'}</strong></div>
    <div>Estado: ${wonPrize ? `Ya ganó "${escapeHtml(wonPrize.name)}"` : 'Participando'}</div></div>`;
}

async function openQrScanner() {
  const modal = document.getElementById('qrScannerModal'), status = document.getElementById('qrScannerStatus'), video = document.getElementById('qrVideo');
  modal.classList.add('open');
  if (!('BarcodeDetector' in window)) { status.textContent = 'Tu navegador no soporta escaneo QR directo. Escribe el código CN-... o ID S-... manualmente.'; return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status.textContent = 'No se puede acceder a la cámara aquí. Usa el ingreso manual.'; return; }
  try {
    status.textContent = 'Iniciando cámara trasera...';
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = qrStream; await video.play(); status.textContent = 'Apunta al código QR del ticket...';
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    qrScanTimer = setInterval(async () => {
      if (!video || video.readyState < 2) return;
      try { const found = await detector.detect(video); if (found.length && found[0].rawValue) { const val = found[0].rawValue.trim(); navigator.vibrate?.(80); closeQrScanner(); verifyCode(val); showToast('QR reconocido'); } } catch {}
    }, 220);
  } catch { status.textContent = 'Permiso de cámara denegado. Ingresa el código manualmente.'; }
}
function closeQrScanner() {
  if (qrScanTimer) { clearInterval(qrScanTimer); qrScanTimer = null; }
  if (qrStream) { qrStream.getTracks().forEach((t) => t.stop()); qrStream = null; }
  const video = document.getElementById('qrVideo'); if (video) video.srcObject = null;
  document.getElementById('qrScannerModal').classList.remove('open');
}

function renderSettingsTab(c) {
  document.getElementById('contestSelector').innerHTML = contests.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === c.id ? 'selected' : ''}>${escapeHtml(x.name)} (${x.tickets.length} tickets)</option>`).join('');
  document.getElementById('editContestName').value = c.name;
  document.getElementById('editContestDate').value = c.drawDate || '';
  document.getElementById('editContestContact').value = c.contact || '';
  document.getElementById('themePicker').innerHTML = Object.entries(TICKET_THEMES).map(([key, th]) => `<button type="button" class="theme-opt ${(c.theme || 'talonario') === key ? 'active' : ''}" onclick="selectTheme('${key}')"><span class="swatch" style="background:${th.swatch};"></span><span>${escapeHtml(th.name)}</span></button>`).join('');
  const wrap = document.getElementById('logoPreviewWrap');
  if (c.logoDataUrl) { wrap.classList.remove('hidden'); document.getElementById('logoPreviewThumb').src = c.logoDataUrl; document.getElementById('logoSizeInfo').textContent = `Logo activo (${Math.round(c.logoDataUrl.length / 1024)} KB)`; }
  else wrap.classList.add('hidden');
}

function switchContest(id) { activeContestId = id; try { localStorage.setItem('concursopro_active_id', id); } catch {} selectedPackIndex = Math.min(2, getActiveContest().packs.length - 1); renderAll(); }
async function createNewContest() {
  const name = document.getElementById('newContestName').value.trim(); if (!name) return showToast('Ponle un nombre al concurso');
  const packs = [
    { qty: parseInt(document.getElementById('p1Qty').value, 10) || 1, price: parseInt(document.getElementById('p1Price').value, 10) || 2000, badge: '' },
    { qty: parseInt(document.getElementById('p2Qty').value, 10) || 3, price: parseInt(document.getElementById('p2Price').value, 10) || 5000, badge: 'Pack Ahorro' },
    { qty: parseInt(document.getElementById('p3Qty').value, 10) || 8, price: parseInt(document.getElementById('p3Price').value, 10) || 10000, badge: 'Más vendido' }
  ];
  const nc = { id: 'c_' + Date.now(), name, drawDate: document.getElementById('newContestDate').value.trim() || 'Por definir', contact: document.getElementById('newContestContact').value.trim() || '', theme: 'talonario', logoDataUrl: '', createdAt: new Date().toISOString(), unsavedChanges: 0, packs, prizes: [], sales: [], tickets: [] };
  contests.push(nc); await saveContest(nc); activeContestId = nc.id; try { localStorage.setItem('concursopro_active_id', nc.id); } catch {}
  document.getElementById('newContestName').value = ''; renderAll(); showToast('Nuevo concurso creado');
}
async function saveCurrentContestMeta() {
  const c = getActiveContest();
  c.name = document.getElementById('editContestName').value.trim() || c.name;
  c.drawDate = document.getElementById('editContestDate').value.trim();
  c.contact = document.getElementById('editContestContact').value.trim();
  c.unsavedChanges = (c.unsavedChanges || 0) + 1; await saveContest(c); renderAll(); showToast('Datos actualizados');
}
async function exportContestJson() {
  const c = getActiveContest(), copy = { ...c, unsavedChanges: 0, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const filename = `respaldo-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], filename, { type: 'application/json' });
  let delivered = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Respaldo ' + c.name }); delivered = true; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  if (!delivered) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); }
  c.unsavedChanges = 0; await saveContest(c); renderAll(); showToast('Respaldo generado');
}
function exportContestCsv() {
  const c = getActiveContest(), header = ['Fecha', 'ID Venta', 'Nombre', 'RUT', 'WhatsApp', 'Pack', 'Monto CLP', 'Codigos'];
  const rows = c.sales.map((s) => [new Date(s.createdAt).toLocaleString('es-CL'), s.id, s.buyerName, s.buyerRut, s.buyerPhone, 'x' + s.qty, s.amount, s.codes.join(' | ')].map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `ventas-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`; a.click(); showToast('Excel (CSV) descargado');
}
async function importContestJson(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.id || !data.name || !Array.isArray(data.tickets)) return showToast('Archivo no válido');
    if (!data.theme) data.theme = 'talonario'; data.unsavedChanges = 0;
    const existing = contests.find((x) => x.id === data.id);
    if (existing) {
      const nowSales = existing.sales.length, bkSales = (data.sales || []).length;
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('es-CL') : 'fecha desconocida';
      const warn = bkSales < nowSales ? `\n\n⚠️ EL RESPALDO TIENE MENOS VENTAS QUE LO ACTUAL. Se perderían ${nowSales - bkSales} venta(s).` : '';
      if (!confirm(`¿Reemplazar "${existing.name}" con el respaldo?\n\nActual: ${nowSales} ventas, ${existing.tickets.length} tickets.\nRespaldo (${when}): ${bkSales} ventas, ${data.tickets.length} tickets.${warn}`)) { e.target.value = ''; return; }
      data.rev = existing.rev || 0;
    } else data.rev = 0;
    await saveContest(data); activeContestId = data.id; try { localStorage.setItem('concursopro_active_id', data.id); } catch {}
    renderAll(); showToast('Concurso restaurado con éxito');
  } catch { showToast('Error al leer el archivo JSON'); }
  e.target.value = '';
}

(async function init() {
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    db = await openDB(); contests = await loadAllContests();
  } catch { db = null; contests = []; }
  if (!contests.length) { const def = createDefaultContest(); contests.push(def); try { await saveContest(def); } catch {} }
  if (!activeContestId || !contests.some((c) => c.id === activeContestId)) activeContestId = contests[0].id;
  renderAll();
})();
