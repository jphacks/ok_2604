'use strict';

/* ================= データ定義 ================= */
/* オフライン時の簡易判定用。AIが使えるときはスキル名を自由に付ける */
const FALLBACK = [
  { name: '折れない心', kw: [['怒られ', 2], ['失敗', 2], ['ミス', 2], ['乗り越え', 3], ['耐えた', 3], ['克服', 4], ['面接', 3]] },
  { name: '学ぶ力', kw: [['勉強', 1], ['読書', 1], ['復習', 1], ['プログラミング', 2], ['レポート', 2], ['課題', 2], ['資格', 3], ['試験', 3], ['論文', 4], ['研究', 4]] },
  { name: '体力', kw: [['散歩', 1], ['ストレッチ', 1], ['ランニング', 2], ['筋トレ', 2], ['ジム', 2], ['マラソン', 4], ['追い込んだ', 3]] },
  { name: '行動力', kw: [['調べた', 1], ['片付け', 1], ['申し込んだ', 2], ['参加した', 2], ['予約した', 2], ['提出した', 3], ['応募した', 3], ['登壇した', 4], ['発表した', 4]] },
  { name: '対話力', kw: [['会話', 1], ['挨拶', 1], ['相談した', 2], ['お礼', 2], ['連絡した', 2], ['交渉した', 3], ['謝罪した', 3], ['幹事をやった', 4]] },
  { name: '創造力', kw: [['考えた', 1], ['メモした', 1], ['作った', 2], ['描いた', 2], ['書いた', 2], ['企画した', 3], ['デザインした', 3], ['完成させた', 4], ['リリースした', 4]] }
];
const MODIFIERS = [
  [['完成', '解決', '達成', '合格', '採用', '内定', 'リリース', '登壇'], 2],
  [['提出', '公開', '応募', '仕上げた', 'やりきった', '乗り越えた'], 1],
  [['始めた', '挑戦', '試した', '着手'], 1]
];
const NEG = ['怒られ', '叱られ', '失敗', '落ち込', '嫌', 'つらい', '辛い', 'ミス', '断られ', '振られ', '疲', '最悪', '意味がな', '泣', '恥ずか'];
/* 撃破の経験値(木の浅い層=大きい目標ほど多い) */
const EXP_BY_DEPTH = [200, 100, 50, 25, 10];

/* 装備:レベルで解放(3段階ずつ) */
const GEAR = [
  { slot: 'weapon', part: '武器', lv: [2, 6, 11], names: ['銅の剣', '鋼の剣', '勇者の聖剣'] },
  { slot: 'shield', part: '盾', lv: [3, 7, 12], names: ['木の盾', '鉄の盾', '黄金の盾'] },
  { slot: 'armor', part: '鎧', lv: [4, 8, 13], names: ['革の鎧', '鉄の鎧', '黄金の鎧'] },
  { slot: 'head', part: '頭', lv: [5, 9, 14], names: ['バンダナ', '鉄の兜', '王者の冠'] },
  { slot: 'cape', part: 'マント', lv: [3, 8, 13], names: ['旅人のマント', '紅のマント', '英雄のマント'] },
  { slot: 'aura', part: '輝き', lv: [6, 10, 15], names: ['魔法の火花', '魔導の輝き', '創造の後光'] }
];
const RANKS = [[1, '見習い冒険者'], [3, '駆け出しの勇者'], [6, '一人前の勇者'], [10, '歴戦の勇者'], [15, '伝説の勇者']];

/* ================= ユーティリティ ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

function toast(...msgs) {
  const box = $('#toast');
  msgs.filter(Boolean).forEach((m, i) => setTimeout(() => {
    const d = document.createElement('div');
    d.textContent = m; box.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }, i * 600));
}

/* ================= 状態 ================= */
const K_SESSION = 'liferpg.v3.session';
const K_API = 'liferpg.v3.api';
const saveKey = () => 'liferpg.v3.save.' + (session && !session.guest ? session.user.toLowerCase() : '_guest');

const newState = () => ({ v: 3, hero: '', job: '', status: '', onboarded: false, goals: [], focus: '', entries: [], studies: [], study: null, daily: { missions: [], days: {}, active: null } });

let session = null;
let state = newState();
let cands = [];
let busy = false;

function normalizeGoals(list, job) {
  const src = (Array.isArray(list) ? list : []).filter(g => g && g.title);
  const hasTree = src.some(g => 'parentId' in g);
  const nodes = src.map(g => ({
    id: String(g.id || uid()), parentId: hasTree && g.parentId ? String(g.parentId) : null,
    title: String(g.title).slice(0, 60), desc: String(g.desc || '').slice(0, 100),
    done: !!g.done, doneAt: g.doneAt || 0, collapsed: !!g.collapsed
  }));
  if (!hasTree && nodes.length) {
    const root = { id: uid(), parentId: null, title: String(job || '最終目標').slice(0, 60), desc: '', done: false, doneAt: 0, collapsed: false };
    nodes.forEach(n => n.parentId = root.id);
    nodes.unshift(root);
  }
  const ids = new Set(nodes.map(n => n.id));
  const rootId = (nodes.find(n => !n.parentId) || {}).id;
  nodes.forEach(n => { if (n.parentId && !ids.has(n.parentId)) n.parentId = rootId && n.id !== rootId ? rootId : null; });
  return nodes;
}

function normalizeDaily(d) {
  const monOf = id => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 8;
  const missions = (d && Array.isArray(d.missions) ? d.missions : []).filter(m => m && m.title).slice(0, 20)
    .map(m => {
      const id = String(m.id || uid());
      return {
        id, title: String(m.title).slice(0, 40), minutes: clampInt(m.minutes, 0, 600),
        mon: Number.isInteger(m.mon) && m.mon >= 0 && m.mon < 8 ? m.mon : monOf(id)
      };
    });
  const days = {};
  Object.keys((d && d.days) || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-400).forEach(k => {
    const r = d.days[k] || {}, spent = {};
    Object.keys(r.spent || {}).slice(0, 20).forEach(id => { spent[String(id)] = clampInt(r.spent[id], 0, 86400); });
    days[k] = {
      done: (Array.isArray(r.done) ? r.done : []).map(String).slice(0, 20),
      total: clampInt(r.total, 0, 20), exp: clampInt(r.exp, 0, 500), spent
    };
  });
  const act = d && d.active;
  const active = act && missions.some(m => m.id === act.id) && Number(act.startedAt) > 0
    ? { id: String(act.id), startedAt: Number(act.startedAt) } : null;
  return { missions, days, active };
}

function normalize(s) {
  const base = newState();
  if (!s || typeof s !== 'object') return base;
  const o = { ...base, ...s, v: 3 };
  o.goals = normalizeGoals(s.goals, s.job);
  o.focus = String(s.focus || '');
  o.studies = (Array.isArray(s.studies) ? s.studies : []).filter(x => x && x.subject).map(x => ({
    t: Number(x.t) || Date.now(), subject: String(x.subject).slice(0, 40), minutes: clampInt(x.minutes, 1, 720), exp: clampInt(x.exp, 1, 300)
  }));
  o.study = s.study && s.study.subject && Number(s.study.startedAt) > 0
    ? { subject: String(s.study.subject).slice(0, 40), startedAt: Number(s.study.startedAt) } : null;
  o.daily = normalizeDaily(s.daily);
  o.entries = (Array.isArray(s.entries) ? s.entries : []).filter(e => e && (e.exp != null || Array.isArray(e.gains))).map(e => ({
    t: Number(e.t) || Date.now(), text: String(e.text || '').slice(0, 500), mood: e.mood || 'flat',
    exp: e.exp != null ? clampInt(e.exp, 0, 1000) : e.gains.reduce((a, g) => a + (+g.v || 0), 0)
  }));
  return o;
}

/* 経験値 = 日々の記録 + 撃破したボスの報酬 */
function totalExp() {
  return state.entries.reduce((a, e) => a + e.exp, 0) + state.studies.reduce((a, x) => a + x.exp, 0) + Object.values(state.daily.days).reduce((a, r) => a + r.exp, 0) + state.goals.reduce((a, g) => a + (g.done ? expOfDepth(depthOf(g)) : 0), 0);
}

function lvInfo() {
  const n = totalExp();
  const lv = Math.floor(Math.sqrt(n / 20)) + 1, base = (lv - 1) ** 2 * 20, nxt = lv ** 2 * 20;
  return { n, lv, pct: Math.round((n - base) / (nxt - base) * 100), rest: nxt - n };
}

const rankOf = lv => RANKS.filter(([l]) => lv >= l).pop()[1];

function gearTiers(lv = lvInfo().lv) {
  const g = {};
  GEAR.forEach(p => g[p.slot] = p.lv.filter(l => lv >= l).length);
  return g;
}

const snapshot = () => ({ lv: lvInfo().lv, gear: gearTiers() });
function announce(before) {
  const after = snapshot(), msgs = [];
  if (after.lv > before.lv) msgs.push(`レベルアップ! Lv.${before.lv} → Lv.${after.lv}`);
  GEAR.forEach(p => {
    if (after.gear[p.slot] > (before.gear[p.slot] || 0)) msgs.push(`装備を手に入れた:${p.names[after.gear[p.slot] - 1]}`);
  });
  if (msgs.length) toast(...msgs);
}

/* ================= 通信・保存 ================= */
const apiBase = () => (lsGet(K_API) || (window.CONFIG && CONFIG.API_BASE) || '').replace(/\/+$/, '');

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const base = apiBase();
  if (!base) throw Object.assign(new Error('サーバーURLが未設定です。'), { code: 'NO_SERVER' });
  if (auth && (!session || session.guest)) throw Object.assign(new Error('ログインが必要です。'), { code: 'NO_AUTH' });
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    res = await fetch(base + path, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + session.token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'サーバーの応答が遅すぎます。もう一度お試しください。' : 'サーバーに接続できません。'), { code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `エラー(${res.status})`), { status: res.status, code: data.code });
  return data;
}

let syncTimer = 0;
function setSync(msg) { $('#sync').textContent = msg; }

function save() {
  lsSet(saveKey(), JSON.stringify(state));
  if (!session || session.guest) { setSync('端末に保存'); return; }
  queueProfile();
  setSync('保存中…');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushSave, 1200);
}

async function pushSave() {
  try {
    await api('/save', { method: 'PUT', body: state });
    setSync('☁ 保存済み');
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
    setSync('⚠ 未保存');
    syncTimer = setTimeout(pushSave, 15000);
  }
}

/* ================= 判定 ================= */
function judgeLocal(text, mood) {
  const neg = mood === 'bad' || NEG.some(w => text.includes(w));
  const found = [];
  let pts = 0;
  FALLBACK.forEach(a => {
    const sc = a.kw.reduce((s, [w, p]) => s + (text.includes(w) ? p : 0), 0);
    if (sc) { found.push([a.name, sc]); pts += sc; }
  });
  found.sort((a, b) => b[1] - a[1]);
  const skills = found.slice(0, 3).map(f => f[0]);
  if (neg && !skills.includes('折れない心')) skills.unshift('折れない心');
  if (!skills.length) skills.push('記録する習慣');
  let bonus = 0;
  MODIFIERS.forEach(([ws, b]) => { if (ws.some(w => text.includes(w))) bonus = Math.max(bonus, b); });
  const exp = clampInt(10 + pts * 4 + (neg ? 10 : 0) + bonus * 10, 10, 60);
  return {
    skills: skills.slice(0, 3),
    harvest: neg ? 'つらい出来事から目をそらさず、記録に残しました。' : '今日の行動を、確かな一歩として記録できました。',
    future: neg ? 'この経験は、次に似た場面で「知っている状況」として背中を押してくれます。' : '小さな積み重ねが、これからの自信と実績につながります。',
    exp, local: true
  };
}

async function judge(text, mood) {
  try {
    const r = await api('/judge', { method: 'POST', body: { text, mood } });
    const skills = (r.skills || []).map(x => String(x).slice(0, 12)).filter(Boolean).slice(0, 3);
    if (!skills.length) throw new Error('bad');
    return {
      skills, harvest: String(r.harvest || '').slice(0, 120), future: String(r.future || '').slice(0, 160),
      exp: clampInt(r.exp, 10, 100), local: false
    };
  } catch (e) {
    if (e.status === 401) throw e;
    return judgeLocal(text, mood);
  }
}

async function submit() {
  if (busy) return;
  const text = $('#text').value.trim();
  if (!text) { $('#text').focus(); return; }
  const mood = document.querySelector('[name=mood]:checked')?.value || 'flat';
  busy = true; $('#go').disabled = true; $('#go').textContent = '分析中…';
  try {
    const before = snapshot();
    const r = await judge(text, mood);
    state.entries.push({ t: Date.now(), text, mood, exp: r.exp });
    $('#text').value = '';
    renderResult(r);
    save();
    refreshHud();
    announce(before);
  } catch (e) {
    if (e.status === 401) logout('セッションが切れました。もう一度ログインしてください。');
  } finally {
    busy = false; $('#go').disabled = false; $('#go').textContent = '経験値に変える';
  }
}

function renderResult(r) {
  const lines = r.skills.map(n => `<p class="skill">▶ ${esc(n)} UP!</p>`);
  $('#battle').innerHTML = lines.map((l, i) => l.replace('<p', `<p style="--i:${i}"`)).join('');
  $('#harvest').innerHTML = `<b>今日の収穫</b><br>${esc(r.harvest)}`;
  $('#future').innerHTML = `<b>未来へのリターン</b><br>${esc(r.future)}`;
  $('#expPt').textContent = `+${r.exp} EXP`;
  $('#dmg').textContent = r.local ? '(オフライン判定:簡易な分析です)' : '';
  $('#result').hidden = false;
}

/* ================= 目標の木 ================= */
let addingFor = '';
let splitFor = '';

const byId = id => state.goals.find(g => g.id === id);
const kids = id => state.goals.filter(g => g.parentId === id);
const roots = () => state.goals.filter(g => !g.parentId);
function rootOf(g) {
  let p = g, n = 0;
  while (p && p.parentId && n++ < 50) p = byId(p.parentId);
  return p;
}
/* いま挑戦中の大目標:選んだ目標が属する木。それが倒れていれば、残っている最初の大目標 */
function currentRoot() {
  const f = state.focus && byId(state.focus), fr = f && rootOf(f);
  if (fr && !fr.done) return fr;
  return roots().find(r => !r.done) || null;
}
const isLeaf = g => !state.goals.some(x => x.parentId === g.id);
const tierOfDepth = d => Math.max(0, 4 - d);
const expOfDepth = d => EXP_BY_DEPTH[Math.min(d, EXP_BY_DEPTH.length - 1)];

function depthOf(g) {
  let d = 0, p = g;
  while (p && p.parentId && d < 50) { p = byId(p.parentId); d++; }
  return d;
}
function pathTitles(g) {
  const a = []; let p = g, n = 0;
  while (p && n++ < 20) { a.unshift(p.title); p = p.parentId ? byId(p.parentId) : null; }
  return a;
}
function descendants(id) {
  const out = [], stack = [id];
  while (stack.length) kids(stack.pop()).forEach(k => { out.push(k); stack.push(k.id); });
  return out;
}
function leafCount(id) {
  const ls = descendants(id).filter(isLeaf);
  return ls.length ? { done: ls.filter(x => x.done).length, total: ls.length } : null;
}

/* 子が1つでも未達成になったら、撃破済みの親は未達成に戻す(親が自動で撃破されることはない) */
function syncUp(startId) {
  let p = byId(startId);
  while (p) {
    const ks = kids(p.id);
    if (ks.length && p.done && !ks.every(k => k.done)) { p.done = false; p.doneAt = 0; }
    p = p.parentId ? byId(p.parentId) : null;
  }
}

const doneIds = () => new Set(state.goals.filter(g => g.done).map(g => g.id));
const stageBoss = g => ({ id: g.id, title: g.title, tier: tierOfDepth(depthOf(g)) });

/* アニメに映すボス:選んだもの → なければ最終目標(魔王) */
function focusNode() {
  const f = state.focus && byId(state.focus);
  if (f && !f.done) return f;
  return currentRoot();
}

function refreshStage() {
  Stage.setGear(gearTiers());
  const am = activeMission();
  if (am) { Stage.setBosses([dailyBoss(am)]); return; }   // デイリーミッション中は、そのタスクの怪物を映す
  const f = focusNode();
  Stage.setBosses(f ? [stageBoss(f)] : []);
}

function refreshHud() {
  const li = lvInfo();
  $('#heroName').textContent = state.hero || '勇者';
  $('#cls').textContent = `〈${rankOf(li.lv)}〉`;
  $('#lv').textContent = 'Lv.' + li.lv;
  $('#lvbar').style.width = li.pct + '%';
  $('#nextxp').textContent = '次まで' + li.rest;
  Stage.setGear(gearTiers(li.lv));
  const active = $('#menu button[aria-selected=true]')?.dataset.tab;
  if (active === 'status') renderStatus();
  if (active === 'boss') renderBossTab();
}

/* 木を変えたあとの共通処理:撃破の演出・保存・表示更新・レベルアップ通知 */
function finishChange(prevDone, before) {
  const newly = state.goals.filter(g => g.done && !prevDone.has(g.id)).sort((a, b) => depthOf(b) - depthOf(a));
  const bigNew = newly.find(g => !g.parentId);
  if (bigNew) bigNew.collapsed = true;          // 倒した大目標は畳んで、ボス画面が長くならないようにする
  save();
  if (newly.length) {
    toast(...newly.slice(0, 4).map(g => `${g.title} を撃破! +${expOfDepth(depthOf(g))} EXP`));
    if (bigNew) Stage.playDefeat(stageBoss(bigNew), () => { refreshStage(); openNewGoal(); }, true);
    else Stage.playDefeat(stageBoss(newly[newly.length - 1]), refreshStage);
  } else refreshStage();
  refreshHud();
  announce(before);
}

function tickLeaf(id) {
  const g = byId(id);
  if (!g || !isLeaf(g)) return;
  const prev = doneIds(), before = snapshot();
  g.done = !g.done; g.doneAt = g.done ? Date.now() : 0;
  syncUp(g.id);
  finishChange(prev, before);
}

/* 子がすべて撃破された目標を、自分の手で撃破する */
function defeatNode(id) {
  const g = byId(id), ks = g ? kids(g.id) : [];
  if (!g || g.done || !ks.length || !ks.every(k => k.done)) return;
  const prev = doneIds(), before = snapshot();
  g.done = true; g.doneAt = Date.now();
  finishChange(prev, before);
}

/* れきしからの撃破取り消し:その目標と、その下の目標をすべて未撃破に戻す(上の撃破済み目標も戻る) */
function undoDefeat(id) {
  const g = byId(id);
  if (!g || !g.done) return;
  const prev = doneIds(), before = snapshot();
  [g, ...descendants(g.id)].forEach(n => { n.done = false; n.doneAt = 0; });
  syncUp(g.id);
  finishChange(prev, before);
  renderHistory();
}

function addChild(parentId, title, desc = '') {
  const p = byId(parentId), t = String(title).trim().slice(0, 60);
  if (!p || !t) return null;
  const n = { id: uid(), parentId, title: t, desc: String(desc).slice(0, 100), done: false, doneAt: 0, collapsed: false };
  state.goals.push(n);
  p.collapsed = false;
  syncUp(parentId);
  return n;
}

function removeNode(id) {
  const g = byId(id);
  if (!g) return;
  const n = descendants(id).length;
  if (!confirm(`「${g.title}」を削除しますか?` + (n ? `\n下の ${n} 件の目標も一緒に消えます。` : '') + '\n撃破済みの経験値も減ります。')) return;
  const prev = doneIds(), before = snapshot(), parentId = g.parentId;
  const gone = new Set([id, ...descendants(id).map(x => x.id)]);
  state.goals = state.goals.filter(x => !gone.has(x.id));
  if (parentId) syncUp(parentId);
  if (gone.has(addingFor)) addingFor = '';
  if (gone.has(splitFor)) { splitFor = ''; $('#splitWin').hidden = true; }
  finishChange(prev, before);
}

function drawThumb(canvas, tier) {
  const m = MONSTERS[tier], ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const s = Math.max(1, Math.floor(canvas.width / 16));
  drawGrid(ctx, m.art, m.pal, 0, Math.max(0, canvas.height - m.art.length * s), s);
}

function renderBossTab() {
  const cur = currentRoot();
  $('#jobBox').innerHTML = `${cur ? `<p>挑戦中の大目標:<b style="color:var(--gold)">${esc(cur.title)}</b></p>` : '<p class="dim">挑戦中の大目標はありません。下で新しい大目標を決めましょう。</p>'}
    <p class="dim">大目標(魔王)は、同時にいくつでも持てます。「これに挑戦する」で、いつでも切り替えられます。</p>
    <div class="addrow"><input type="text" id="rootTitle" maxlength="60" placeholder="新しい大目標(例: ゲーム開発の仕事に就く)" aria-label="新しい大目標"><button class="btn small primary" data-act="addRoot">追加</button></div>`;
  renderTree();
}

function renderTree() {
  const host = $('#tree'), cur = currentRoot();
  const list = roots().filter(r => !r.done).sort((a, b) => (b === cur) - (a === cur));
  if (!list.length) { host.innerHTML = '<p class="dim">大目標がまだありません。</p>'; return; }
  const draw = (g, d) => {
    const ks = kids(g.id), vk = ks.filter(k => !k.done), lc = leafCount(g.id), open = !g.collapsed, tier = tierOfDepth(d);
    const allKidsDone = ks.length > 0 && vk.length === 0;
    const isCur = d === 0 && cur && cur.id === g.id;
    const meta = `${MONSTERS[tier].name}${isCur ? ' ・ 挑戦中' : ''}${lc ? ` ・ ${lc.done}/${lc.total}` : ''}${g.done ? ' ・ 撃破!' : ''}`;
    return `<div class="node ${g.done ? 'done' : ''} ${isCur ? 'current' : ''}">
      <div class="nrow">
        ${vk.length ? `<button class="tgl" data-act="fold" data-id="${g.id}" aria-label="${open ? '閉じる' : '開く'}">${open ? '▾' : '▸'}</button>` : '<span class="tgl"></span>'}
        <canvas class="ico" width="48" height="48" data-tier="${tier}"></canvas>
        <div class="ntxt"><div class="btitle">${esc(g.title)}</div><div class="bmeta">${meta}</div>${g.desc ? `<div class="bdesc">${esc(g.desc)}</div>` : ''}</div>
      </div>
      <div class="bact">
        ${ks.length ? (allKidsDone ? `<button class="btn small primary" data-act="defeat" data-id="${g.id}">撃破する</button>` : '') : `<button class="btn small primary" data-act="tick" data-id="${g.id}">撃破した!</button>`}
        ${g.done || isCur ? '' : `<button class="btn small" data-act="show" data-id="${g.id}">${d === 0 ? 'これに挑戦する' : 'アニメに映す'}</button>`}
        <button class="btn small" data-act="split" data-id="${g.id}">AIに分けてもらう</button>
        <button class="btn small" data-act="addOpen" data-id="${g.id}">子目標を追加</button>
        <button class="btn small" data-act="remove" data-id="${g.id}">削除</button>
      </div>
      ${addingFor === g.id ? `<div class="addrow"><input type="text" id="addTitle" maxlength="60" placeholder="子目標の名前" aria-label="子目標の名前"><button class="btn small primary" data-act="addGo" data-id="${g.id}">追加</button></div>` : ''}
      ${open ? vk.map(k => draw(k, d + 1)).join('') : ''}
    </div>`;
  };
  host.innerHTML = list.map(r => draw(r, 0)).join('');
  host.querySelectorAll('canvas').forEach(c => drawThumb(c, +c.dataset.tier));
  const input = $('#addTitle');
  if (input) input.focus();
}

function renderCandList(sel, depth) {
  const host = $(sel), tier = tierOfDepth(depth);
  host.innerHTML = cands.map((c, i) => `
    <label class="cand">
      <input type="checkbox" data-cand="${i}" ${c.chosen ? 'checked' : ''}>
      <canvas width="48" height="48" data-tier="${tier}"></canvas>
      <span><span class="btitle">${esc(c.title)}</span>${c.desc ? `<br><span class="bdesc">${esc(c.desc)}</span>` : ''}</span>
    </label>`).join('') || '<p class="dim">候補はまだありません。</p>';
  host.querySelectorAll('canvas').forEach(c => drawThumb(c, +c.dataset.tier));
}

async function fetchSplit(path, existing) {
  const r = await api('/split', { method: 'POST', body: { path, status: state.status, existing } });
  return {
    actionable: !!r.actionable, note: String(r.note || '').slice(0, 80),
    steps: (r.steps || []).filter(x => x && x.title).map(x => ({ title: String(x.title).slice(0, 60), desc: String(x.desc || '').slice(0, 100), chosen: true }))
  };
}

function explain(e) {
  if (e.code === 'NO_SERVER') return 'AI機能にはサーバー(Worker)のURLが必要です。ログイン画面の「サーバー設定」で入力できます。自分で目標を追加することもできます。';
  if (e.code === 'NO_AUTH') return 'ゲストモードではAIを使えません。アカウント登録すると利用できます。自分で目標を追加することもできます。';
  return `${e.message} 自分で目標を追加することもできます。`;
}

/* 「AIに分けてもらう」:提案を見て、チェックしたものだけ追加。何度でも繰り返せる */
async function openSplit(id) {
  const g = byId(id);
  if (!g || busy) return;
  busy = true; splitFor = id; cands = [];
  const win = $('#splitWin');
  win.hidden = false;
  $('#splitTitle').textContent = `「${g.title}」を軍師が考え中…`;
  $('#splitMsg').hidden = true; $('#splitErr').hidden = true;
  $('#candList2').innerHTML = ''; $('#addCands').hidden = true;
  win.scrollIntoView({ block: 'center', behavior: 'smooth' });
  try {
    const r = await fetchSplit(pathTitles(g), kids(g.id).map(k => k.title));
    $('#splitTitle').textContent = `「${g.title}」`;
    if (r.actionable) {
      $('#splitMsg').textContent = r.note || 'これ以上分けなくても、そのまま取り組めそうです。';
      $('#splitMsg').hidden = false;
    } else {
      cands = r.steps;
      renderCandList('#candList2', depthOf(g) + 1);
      $('#splitMsg').textContent = '追加したいものにチェックしてください。しっくりこなければ、もう一度「AIに分けてもらう」を押せます。';
      $('#splitMsg').hidden = false;
      $('#addCands').hidden = !cands.length;
    }
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
    $('#splitTitle').textContent = `「${g.title}」`;
    $('#splitErr').textContent = explain(e); $('#splitErr').hidden = false;
  } finally { busy = false; }
}

function addChosen() {
  const p = byId(splitFor), chosen = cands.filter(c => c.chosen);
  if (!p || !chosen.length) { toast('追加する目標をチェックしてください'); return; }
  if (p.done && !confirm(`「${p.title}」は撃破済みです。子目標を足すと、未達成に戻ります。`)) return;
  const prev = doneIds(), before = snapshot();
  chosen.forEach(c => addChild(p.id, c.title, c.desc));
  cands = []; splitFor = ''; $('#splitWin').hidden = true;
  finishChange(prev, before);
  toast('新しい目標を追加しました');
}

function addManualChild(id) {
  const input = $('#addTitle'), p = byId(id);
  const title = input ? input.value.trim() : '';
  if (!p) return;
  if (!title) { if (input) input.focus(); return; }
  if (p.done && !confirm(`「${p.title}」は撃破済みです。子目標を足すと、未達成に戻ります。`)) return;
  const prev = doneIds(), before = snapshot();
  addChild(id, title);
  finishChange(prev, before);
}

function addRoot(fromModal) {
  const input = fromModal ? $('#ngTitle') : $('#rootTitle');
  const title = (input.value || '').trim();
  if (!title) { input.focus(); return; }
  const root = { id: uid(), parentId: null, title: title.slice(0, 60), desc: '', done: false, doneAt: 0, collapsed: false };
  state.goals.push(root); state.focus = root.id;
  input.value = '';
  if (fromModal) $('#newGoalWin').hidden = true;
  save(); refreshStage(); refreshHud();
  toast('新しい魔王があらわれた!');
}

/* 大目標(魔王)を倒したあと:次の最終目標を入力してもらう */
function openNewGoal() {
  $('#newGoalWin').hidden = false;
  $('#ngTitle').value = '';
  setTimeout(() => $('#ngTitle').focus(), 50);
}

/* ================= ともだちに見せる公開プロフィール ================= */
let lastProfile = '', profTimer = 0;

function profileData() {
  const f = focusNode(), r = currentRoot();
  return {
    name: state.hero || '勇者', finalGoal: r ? r.title : '',
    defeats: state.goals.filter(g => g.done && g.doneAt).sort((a, b) => b.doneAt - a.doneAt).slice(0, 50)
      .map(g => ({ title: g.title, tier: tierOfDepth(depthOf(g)), t: g.doneAt })),
    focus: f ? { title: f.title, tier: tierOfDepth(depthOf(f)) } : null,
    level: lvInfo().lv, gear: gearTiers(),
    studying: state.study ? { subject: state.study.subject, since: state.study.startedAt } : null
  };
}

function queueProfile(now) {
  if (!session || session.guest || !apiBase() || !state.onboarded) return;
  clearTimeout(profTimer);
  profTimer = setTimeout(async () => {
    const d = profileData(), j = JSON.stringify(d);
    if (j === lastProfile) return;
    try { await api('/profile', { method: 'PUT', body: d }); lastProfile = j; } catch (e) { /* 次の保存でまた送る */ }
  }, now ? 0 : 2500);
}

/* ================= 勉強タイマー ================= */
const fmtClock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
};

function renderStudy() {
  const box = $('#studyBox');
  if (state.study) {
    box.innerHTML = `<p class="body">鍛錬中:<b style="color:var(--gold)">${esc(state.study.subject)}</b></p>
      <div class="bignum" id="studyClock">${fmtClock(Date.now() - state.study.startedAt)}</div>
      <button class="btn primary" id="studyStop">終了して経験値にする</button>`;
    $('#studyStop').onclick = stopStudy;
  } else {
    box.innerHTML = `<input type="text" id="studySubject" maxlength="40" placeholder="例: TOEICの単語 / Pythonの教科書 第3章" aria-label="勉強する内容">
      <button class="btn primary" id="studyStart">鍛錬をはじめる</button>`;
    $('#studyStart').onclick = startStudy;
  }
}

function startStudy() {
  const subject = ($('#studySubject').value || '').trim();
  if (!subject) { $('#studySubject').focus(); return; }
  state.study = { subject: subject.slice(0, 40), startedAt: Date.now() };
  $('#studyResult').hidden = true;
  save(); queueProfile(true); renderStudy();
}

async function judgeStudy(subject, minutes) {
  try {
    const r = await api('/study', { method: 'POST', body: { subject, minutes } });
    return clampInt(r.exp, 1, 300) || 1;
  } catch (e) {
    if (e.status === 401) throw e;
    return clampInt(Math.round(minutes / 2), 1, 100);   // AIが使えないときは 2分=1EXP
  }
}

async function stopStudy() {
  if (busy || !state.study) return;
  const st = state.study, now = Date.now(), minutes = Math.min(720, Math.floor((now - st.startedAt) / 60000));
  if (minutes < 1) {
    if (!confirm('1分未満のため経験値は入りません。記録せずに終了しますか?')) return;
    state.study = null; save(); queueProfile(true); renderStudy(); return;
  }
  busy = true; $('#studyStop').disabled = true; $('#studyStop').textContent = '計算中…';
  try {
    const before = snapshot();
    const exp = await judgeStudy(st.subject, minutes);
    state.studies.push({ t: now, subject: st.subject, minutes, exp });
    state.study = null;
    save(); queueProfile(true);
    $('#studyResult').textContent = `「${st.subject}」を ${minutes}分 勉強して +${exp} EXP`;
    $('#studyResult').hidden = false;
    refreshHud(); announce(before);
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
  } finally {
    busy = false; renderStudy();
  }
}

/* ================= 履歴 ================= */
function renderHistory() {
  const items = [
    ...state.entries.map(e => ({ t: e.t, kind: '記録', text: e.text, exp: e.exp })),
    ...state.studies.map(x => ({ t: x.t, kind: '勉強', text: `${x.subject}(${x.minutes}分)`, exp: x.exp })),
    ...state.goals.filter(g => g.done).map(g => ({
      id: g.id, t: g.doneAt || 0, kind: '撃破', text: `${MONSTERS[tierOfDepth(depthOf(g))].name}「${g.title}」`, exp: expOfDepth(depthOf(g))
    }))
  ].sort((a, b) => b.t - a.t).slice(0, 1000);
  let html = '', day = '';
  items.forEach(it => {
    const d = it.t ? new Date(it.t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : '日付不明';
    if (d !== day) { html += `<div class="hday">${d}</div>`; day = d; }
    const hm = it.t ? new Date(it.t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + ' ・ ' : '';
    const undo = it.id ? ` <button class="btn small" data-act="undoDefeat" data-id="${it.id}">撃破を取り消す</button>` : '';
    html += `<div class="hitem"><span class="tag">${it.kind}</span><span class="body">${esc(it.text)}</span><span class="hexp">${hm}+${it.exp} EXP${undo}</span></div>`;
  });
  $('#historyList').innerHTML = html || '<p class="dim">まだ履歴がありません。記録や勉強をはじめると、ここに残ります。</p>';
}

/* ================= ともだち ================= */
let friendsData = null;

async function loadFriends() {
  const body = $('#frBody');
  if (session.guest) {
    body.hidden = true; $('#frGuest').hidden = false; return;
  }
  body.hidden = false; $('#frGuest').hidden = true;
  try {
    friendsData = await api('/friends');
    renderFriends();
    if (!$('[data-view=friendDetail]').hidden) renderFriendDetail();
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
    $('#frList').innerHTML = `<p class="foe">${esc(e.message)}</p>`;
  }
}

function renderFriends() {
  const d = friendsData || { friends: [], incoming: [], outgoing: [] };
  const reqRows = [
    ...d.incoming.map(u => `<div class="frrow"><span class="body">${esc(u.user)} さんから申請</span><span class="bact"><button class="btn small primary" data-act="frAccept" data-id="${esc(u.id)}">承認</button><button class="btn small" data-act="frDecline" data-id="${esc(u.id)}">断る</button></span></div>`),
    ...d.outgoing.map(u => `<div class="frrow"><span class="body">${esc(u.user)} さんに申請中</span><span class="bact"><button class="btn small" data-act="frCancel" data-id="${esc(u.id)}">取り消す</button></span></div>`)
  ];
  $('#frReq').innerHTML = reqRows.join('');
  $('#frReqWin').hidden = !reqRows.length;

  $('#frList').innerHTML = d.friends.map(f => {
    const p = f.profile;
    let info = '<div class="bmeta">まだ公開情報がありません。</div>';
    if (p) {
      const mins = p.studying ? Math.max(0, Math.floor((Date.now() - p.studying.since) / 60000)) : 0;
      info = `<div class="btitle">${esc(p.name || f.user)} <span class="dim">Lv.${p.level}</span></div>
        <div class="bmeta">最終目標:${esc(p.finalGoal || '未設定')}</div>
        <div class="bmeta">挑戦中:${p.focus ? `${MONSTERS[p.focus.tier].name}「${esc(p.focus.title)}」` : 'なし'}</div>
        ${p.studying ? `<div class="studying">「${esc(p.studying.subject)}」を勉強中(${mins}分)</div>` : ''}`;
    }
    return `<div class="friend">
      <canvas class="avatar" width="56" height="60" data-gear='${esc(JSON.stringify(p ? p.gear : {}))}'></canvas>
      <div class="ftxt">${info}<div class="bmeta">ユーザー名:${esc(f.user)}</div></div>
      <div class="fbtns"><button class="btn small" data-act="frDetail" data-id="${esc(f.id)}">詳細</button><button class="btn small" data-act="frRemove" data-id="${esc(f.id)}">削除</button></div>
    </div>`;
  }).join('') || '<p class="dim">まだともだちがいません。上の欄から、相手のユーザー名を入力して申請しましょう。</p>';
  $$('#frList canvas.avatar').forEach(c => {
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    try { drawHero(ctx, 4, 8, 3, JSON.parse(c.dataset.gear), 0, false); } catch { /* 表示できなくても続行 */ }
  });
}

let detailId = '';

function renderFriendDetail() {
  const f = ((friendsData || {}).friends || []).find(x => x.id === detailId);
  if (!f) { $('#frDetail').innerHTML = '<p class="dim">このともだちは見つかりません。</p>'; $('#frDefeats').innerHTML = ''; return; }
  const p = f.profile;
  if (!p) {
    $('#frDetail').innerHTML = `<div class="btitle">${esc(f.user)}</div><p class="dim">まだ公開情報がありません。</p>`;
    $('#frDefeats').innerHTML = '';
    return;
  }
  const mins = p.studying ? Math.max(0, Math.floor((Date.now() - p.studying.since) / 60000)) : 0;
  $('#frDetail').innerHTML = `<div class="friend detail">
    <canvas class="avatar" width="56" height="60" data-gear='${esc(JSON.stringify(p.gear || {}))}'></canvas>
    <div class="ftxt"><div class="btitle">${esc(p.name || f.user)} <span class="dim">Lv.${p.level}</span></div>
      <div class="bmeta">ユーザー名:${esc(f.user)}</div>
      <div class="bmeta">最終目標:${esc(p.finalGoal || '未設定')}</div>
      <div class="bmeta">挑戦中:${p.focus ? `${MONSTERS[p.focus.tier].name}「${esc(p.focus.title)}」` : 'なし'}</div>
      ${p.studying ? `<div class="studying">「${esc(p.studying.subject)}」を勉強中(${mins}分)</div>` : ''}</div></div>`;
  $$('#frDetail canvas.avatar').forEach(c => {
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    try { drawHero(ctx, 4, 8, 3, JSON.parse(c.dataset.gear), 0, false); } catch { /* 表示できなくても続行 */ }
  });
  const ds = (p.defeats || []).slice().sort((a, b) => b.t - a.t);
  let html = '', day = '';
  ds.forEach(x => {
    const d = new Date(x.t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    if (d !== day) { html += `<div class="hday">${d}</div>`; day = d; }
    html += `<div class="hitem"><span class="tag">${MONSTERS[x.tier] ? MONSTERS[x.tier].name : '怪物'}</span><span class="body">${esc(x.title)}</span></div>`;
  });
  $('#frDefeats').innerHTML = html || '<p class="dim">まだ倒したモンスターはいません。</p>';
}

async function friendCall(action, username) {
  try {
    const r = await api('/friends/' + action, { method: 'POST', body: { username } });
    await loadFriends();
    return r;
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return null; }
    toast(e.message); return null;
  }
}

async function sendFriendRequest() {
  const name = $('#frName').value.trim();
  const msg = $('#frMsg');
  if (!name) { $('#frName').focus(); return; }
  msg.hidden = false; msg.className = 'dim'; msg.textContent = '送信中…';
  try {
    const r = await api('/friends/request', { method: 'POST', body: { username: name } });
    $('#frName').value = '';
    msg.textContent = r.status === 'friends' ? 'ともだちになりました!' : '申請しました。相手の承認を待っています。';
    await loadFriends();
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
    msg.className = 'foe'; msg.textContent = e.message;
  }
}

/* ================= デイリーミッション ================= */
const DAILY_EXP = 10, DAILY_BONUS = 10;
let dailyKeyShown = '';

const dayKeyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = () => dayKeyOf(new Date());
const missionById = id => state.daily.missions.find(m => m.id === id);
const activeMission = () => (state.daily.active ? missionById(state.daily.active.id) || null : null);
const dailyBoss = m => ({ id: 'daily:' + m.id, title: m.title, tier: 0, mon: m.mon });

function dayRecord(key) {
  return state.daily.days[key] || (state.daily.days[key] = { done: [], total: 0, exp: 0, spent: {} });
}

/* その日の記録を、いまのミッション一覧に合わせて数え直す(今日の分だけ。過去の日は動かさない) */
function recalcDay(key) {
  const r = dayRecord(key);
  r.done = r.done.filter(id => state.daily.missions.some(m => m.id === id));
  r.total = state.daily.missions.length;
  r.exp = r.done.length * DAILY_EXP + (r.total > 0 && r.done.length === r.total ? DAILY_BONUS : 0);
  return r;
}

/* 今日そのタスクに使った秒数(進行中なら、いまの分も足す) */
function spentSeconds(id) {
  const r = state.daily.days[todayKey()], base = r && r.spent ? (r.spent[id] || 0) : 0;
  const act = state.daily.active;
  return base + (act && act.id === id ? Math.max(0, Math.floor((Date.now() - act.startedAt) / 1000)) : 0);
}

/* 進行中の分を今日の記録に足して、進行を止める */
function stopActive() {
  const act = state.daily.active;
  if (!act) return;
  const r = dayRecord(todayKey());
  r.spent = r.spent || {};
  r.spent[act.id] = Math.min(86400, (r.spent[act.id] || 0) + Math.max(0, Math.floor((Date.now() - act.startedAt) / 1000)));
  state.daily.active = null;
}

/* 連続日数:すべてのミッションを完了した日が続いている数。今日がまだなら、昨日までを数える */
function dailyStreak() {
  const full = k => { const r = state.daily.days[k]; return !!r && r.total > 0 && r.done.length === r.total; };
  const d = new Date();
  if (!full(dayKeyOf(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (full(dayKeyOf(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const fmtMin = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function renderDaily() {
  const key = todayKey(); dailyKeyShown = key;
  const rec = state.daily.days[key] || { done: [] };
  const ms = state.daily.missions, doneN = ms.filter(m => rec.done.includes(m.id)).length;
  const st = dailyStreak();
  $('#dailyStreak').innerHTML = ms.length
    ? `<p>今日 <b style="color:var(--gold)">${doneN}/${ms.length}</b> 撃破 ・ <b style="color:var(--gold)">${st}日連続</b></p>`
    : '<p class="dim">ミッションがまだありません。下の欄から、毎日やることを登録しましょう。</p>';
  const act = state.daily.active;
  $('#dailyList').innerHTML = ms.map(m => {
    const done = rec.done.includes(m.id), running = !!act && act.id === m.id;
    const sec = spentSeconds(m.id), goal = m.minutes * 60, reached = m.minutes === 0 || sec >= goal;
    let btns = '';
    if (done) btns = '';
    else if (running) btns = `<button class="btn small" data-act="dailyPause" data-id="${m.id}">中断</button>` +
      (reached ? `<button class="btn small primary" data-act="dailyFinish" data-id="${m.id}">${m.minutes ? '撃破' : '結束'}</button>` : '');
    else btns = `<button class="btn small primary" data-act="dailyStart" data-id="${m.id}">${sec > 0 ? '再開' : '開始'}</button>` +
      (m.minutes && reached ? `<button class="btn small" data-act="dailyFinish" data-id="${m.id}">撃破</button>` : '');
    const meta = `${DAILY_MONSTERS[m.mon].name} ・ ` + (m.minutes
      ? `<span data-prog="${m.id}">${fmtMin(Math.min(sec, 99 * 3600))}</span> / ${m.minutes}分`
      : '時間なし') + (done ? ' ・ 撃破!' : running ? ' ・ 戦闘中' : '');
    const bar = m.minutes && !done ? `<div class="prog hp"><i data-bar="${m.id}" style="width:${Math.min(100, Math.round(sec / goal * 100))}%"></i></div>` : '';
    return `<div class="mission ${done ? 'done' : ''} ${running ? 'running' : ''}">
      <canvas class="ico" width="48" height="48" data-mon="${m.mon}"></canvas>
      <div class="mtxt"><div class="btitle">${esc(m.title)}</div><div class="bmeta">${meta}</div>${bar}</div>
      <div class="bact">${btns}<button class="btn small" data-act="dailyDel" data-id="${m.id}">削除</button></div>
    </div>`;
  }).join('');
  $$('#dailyList canvas[data-mon]').forEach(c => {
    const m = DAILY_MONSTERS[+c.dataset.mon], ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawGrid(ctx, m.art, m.pal, 0, Math.max(0, c.height - m.art.length * 3), 3);
  });
}

/* 1秒ごとに、進行中タスクの経過表示を更新。目標時間に届いた瞬間だけ画面を作り直して「撃破」ボタンを出す */
function tickDaily() {
  const act = state.daily.active, m = activeMission();
  if (!act || !m) return;
  const sec = spentSeconds(m.id);
  const lbl = document.querySelector(`[data-prog="${m.id}"]`), bar = document.querySelector(`[data-bar="${m.id}"]`);
  if (lbl) lbl.textContent = fmtMin(Math.min(sec, 99 * 3600));
  if (bar && m.minutes) bar.style.width = Math.min(100, Math.round(sec / (m.minutes * 60) * 100)) + '%';
  if (m.minutes && sec >= m.minutes * 60 && !document.querySelector(`[data-act=dailyFinish][data-id="${m.id}"]`)) {
    renderDaily();
    toast(`「${m.title}」の時間になりました!「撃破」で怪物を倒そう`);
  }
}

function startMission(id) {
  const m = missionById(id), rec = dayRecord(todayKey());
  if (!m || rec.done.includes(id)) return;
  if (state.daily.active && state.daily.active.id !== id) stopActive();   // ほかのタスクは自動で中断
  if (!state.daily.active) state.daily.active = { id, startedAt: Date.now() };
  save(); refreshStage(); renderDaily();
}

function pauseMission() {
  stopActive();
  save(); refreshStage(); renderDaily();
}

function finishMission(id) {
  const m = missionById(id);
  if (!m) return;
  const rec = dayRecord(todayKey());
  if (rec.done.includes(id)) return;
  if (state.daily.active && state.daily.active.id === id) stopActive();
  if (m.minutes && (rec.spent[id] || 0) < m.minutes * 60) { save(); renderDaily(); return; }   // 時間が足りないときは倒せない
  const before = snapshot(), was = rec.exp;
  rec.done = [...rec.done, id];
  const now = recalcDay(todayKey());
  save(); refreshHud(); renderDaily();
  Stage.playDefeat(dailyBoss(m), refreshStage);
  toast(`${m.title} を撃破! +${now.exp - was} EXP`);
  announce(before);
}

function addMission() {
  const input = $('#dailyTitle'), title = input.value.trim().slice(0, 40);
  if (!title) { input.focus(); return; }
  if (state.daily.missions.length >= 20) { toast('ミッションは20個までです'); return; }
  const minutes = clampInt($('#dailyMin').value, 0, 600);
  const before = snapshot();
  state.daily.missions.push({ id: uid(), title, minutes, mon: Math.floor(Math.random() * DAILY_MONSTERS.length) });
  input.value = ''; $('#dailyMin').value = '';
  recalcDay(todayKey());             // 全撃破のボーナス判定を、増えた数に合わせる
  save(); refreshHud(); announce(before); renderDaily();
}

function deleteMission(id) {
  const m = missionById(id);
  if (!m || !confirm(`「${m.title}」を削除しますか?`)) return;
  const before = snapshot();
  if (state.daily.active && state.daily.active.id === id) state.daily.active = null;
  state.daily.missions = state.daily.missions.filter(x => x.id !== id);
  recalcDay(todayKey());
  save(); refreshHud(); refreshStage(); announce(before); renderDaily();
}

/* ================= ステータス(EXPとレベル・装備のみ) ================= */
function renderStatus() {
  const li = lvInfo();
  $('#statBox').innerHTML = `
    <div class="bignum">Lv.${li.lv}</div>
    <p class="body">${esc(rankOf(li.lv))}</p>
    <p class="dim">累計 ${li.n} EXP ・ 次のレベルまで ${li.rest} EXP</p>`;
  const items = GEAR.flatMap(p => p.names.map((name, i) => ({ name, part: p.part, lv: p.lv[i] }))).sort((a, b) => a.lv - b.lv);
  $('#gearList').innerHTML = items.map(it => {
    const on = li.lv >= it.lv;
    return `<div class="gear ${on ? 'on' : 'off'}"><span><b>${on ? esc(it.name) : '？？？'}</b> <span class="dim">${it.part}</span></span><span>Lv.${it.lv}${on ? ' ✔' : ''}</span></div>`;
  }).join('');
}

/* ================= 画面遷移 ================= */
function screen(name) {
  $$('[data-screen]').forEach(s => s.hidden = s.dataset.screen !== name);
  const main = name === 'main';
  if (!main) $$('[data-view]').forEach(s => s.hidden = true);
  $('#top').hidden = !(main || name === 'onboard');
  $('#menu').hidden = !main;
  window.scrollTo(0, 0);
}

function show(v) {
  screen('main');
  $$('[data-view]').forEach(s => s.hidden = s.dataset.view !== v);
  const tabOf = v === 'friendDetail' ? 'friends' : v;
  $$('.menu button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tabOf)));
  refreshHud();
  if (v === 'boss') renderBossTab();
  if (v === 'status') renderStatus();
  if (v === 'record') renderStudy();
  if (v === 'history') renderHistory();
  if (v === 'daily') renderDaily();
  if (v === 'friends') loadFriends();
  if (v === 'friendDetail') renderFriendDetail();
  if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

function renderSettings() {
  $('#acct').textContent = session.guest ? 'ゲストモード(この端末だけに保存されます)' : `ログイン中:${session.user}`;
  $('#setName').value = state.hero;
  const cr = currentRoot();
  $('#setJob').value = cr ? cr.title : '';
  $('#logout').textContent = session.guest ? 'ゲストを終了して戻る' : 'ログアウト';
}

/* ================= 認証 ================= */
function showAuthErr(msg) { const e = $('#authErr'); e.textContent = msg || ''; e.hidden = !msg; }

async function authSubmit() {
  if (busy) return;
  const mode = document.querySelector('[name=authMode]:checked').value;
  const user = $('#authUser').value.trim(), pass = $('#authPass').value;
  const apiUrl = $('#authApi').value.trim();
  if (apiUrl) lsSet(K_API, apiUrl);
  showAuthErr('');
  if (!user || !pass) { showAuthErr('ユーザー名とパスワードを入力してください。'); return; }
  busy = true; $('#authGo').disabled = true;
  try {
    const r = await api('/' + mode, { method: 'POST', body: { username: user, password: pass }, auth: false });
    session = { user: r.user, token: r.token, guest: false };
    lsSet(K_SESSION, JSON.stringify(session));
    $('#authPass').value = '';
    await enterGame();
  } catch (e) {
    showAuthErr(e.code === 'NO_SERVER' ? 'サーバー設定でWorkerのURLを入力してください。(試すだけならゲストで始められます)' : e.message);
  } finally {
    busy = false; $('#authGo').disabled = false;
  }
}

async function enterGame() {
  let loaded = null;
  if (!session.guest) {
    try { loaded = (await api('/save')).save; } catch (e) {
      if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
      try { loaded = JSON.parse(lsGet(saveKey())); } catch {}
    }
  } else {
    try { loaded = JSON.parse(lsGet(saveKey())); } catch {}
  }
  state = normalize(loaded);
  lastProfile = ''; friendsData = null;
  setSync(session.guest ? '端末に保存' : '☁ 保存済み');
  Stage.setGear(gearTiers());
  refreshStage();
  refreshHud();
  queueProfile(true);
  if (state.onboarded) show('record');
  else startOnboard();
}

function logout(msg) {
  clearTimeout(syncTimer);
  if (session && !session.guest && state.onboarded) { try { lsSet(saveKey(), JSON.stringify(state)); } catch {} }
  session = null; lsDel(K_SESSION);
  state = newState(); cands = [];
  Stage.setBosses([]);
  showAuthErr(msg || '');
  screen('auth');
}

/* ================= オンボーディング ================= */
function step(n) {
  $$('[data-step]').forEach(s => s.hidden = +s.dataset.step !== n);
  window.scrollTo(0, 0);
}

function startOnboard() {
  screen('onboard');
  $('#obName').value = state.hero;
  $('#obJob').value = state.job;
  step(1);
  refreshHud();
}

async function planGoals() {
  if (busy) return;
  const job = $('#obJob').value.trim();
  $('#obErr3').hidden = true;
  if (!job) { $('#obJob').focus(); return; }
  state.job = job; state.status = $('#obStatus').value.trim();
  busy = true; $('#obPlan').disabled = true; $('#obPlan').textContent = '軍師が考え中…';
  try {
    const r = await fetchSplit([job], []);
    cands = r.steps;
    renderCandList('#candList', 1);
    if (r.actionable) { const e3 = $('#obErr3'); e3.textContent = r.note || 'このまま取り組めそうです。'; e3.hidden = false; }
    step(3);
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
    cands = []; renderCandList('#candList', 1);
    const e3 = $('#obErr3'); e3.textContent = explain(e); e3.hidden = false;
    step(3);
  } finally {
    busy = false; $('#obPlan').disabled = false; $('#obPlan').textContent = '軍師に相談する';
  }
}

function finishOnboard() {
  const chosen = cands.filter(c => c.chosen);
  const root = { id: uid(), parentId: null, title: state.job.slice(0, 60), desc: '', done: false, doneAt: 0, collapsed: false };
  state.goals = [root];
  chosen.forEach(c => addChild(root.id, c.title, c.desc));
  state.focus = root.id;
  state.onboarded = true;
  cands = [];
  save(); refreshStage();
  toast(`${state.hero || '勇者'}の冒険がはじまった!`);
  show('record');
}

/* ================= イベント ================= */
function bind() {
  $$('[name=authMode]').forEach(r => r.onchange = () => {
    const reg = r.value === 'register' && r.checked;
    if (r.checked) { $('#authGo').textContent = reg ? '登録してはじめる' : 'ログインする'; $('#authPass').autocomplete = reg ? 'new-password' : 'current-password'; }
  });
  const isTextField = el => el && el.matches && el.matches('textarea, select, input:not([type=radio]):not([type=checkbox]):not([type=file])');
  document.addEventListener('focusin', e => {
    if (!isTextField(e.target)) return;
    document.body.classList.add('typing');
    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!isTextField(document.activeElement)) document.body.classList.remove('typing'); }, 150);
  });

  $('#authGo').onclick = authSubmit;
  $('#authPass').onkeydown = e => { if (e.key === 'Enter') authSubmit(); };
  $('#guestGo').onclick = async () => {
    const apiUrl = $('#authApi').value.trim(); if (apiUrl) lsSet(K_API, apiUrl);
    session = { user: 'ゲスト', token: '', guest: true };
    lsSet(K_SESSION, JSON.stringify(session));
    await enterGame();
  };

  $('#obNext1').onclick = () => { state.hero = $('#obName').value.trim() || '勇者'; refreshHud(); step(2); };
  $('#obBack2').onclick = () => step(1);
  $('#obBack3').onclick = () => step(2);
  $('#obPlan').onclick = planGoals;
  $('#obStart').onclick = finishOnboard;
  $('#obAddGo').onclick = () => {
    const t = $('#obAddTitle').value.trim();
    if (!t) { $('#obAddTitle').focus(); return; }
    cands.push({ title: t, desc: '', chosen: true }); $('#obAddTitle').value = ''; renderCandList('#candList', 1);
  };

  $('#go').onclick = submit;
  $('#frSend').onclick = sendFriendRequest;
  $('#frRefresh').onclick = loadFriends;
  $('#frBack').onclick = () => show('friends');
  $('#dailyAdd').onclick = addMission;
  setInterval(tickDaily, 1000);
  $('#ngOk').onclick = () => addRoot(true);
  $('#ngLater').onclick = () => { $('#newGoalWin').hidden = true; };
  setInterval(() => {
    const c = $('#studyClock');
    if (c && state.study) c.textContent = fmtClock(Date.now() - state.study.startedAt);
  }, 1000);
  setInterval(() => {
    const active = $('#menu button[aria-selected=true]')?.dataset.tab;
    if (active === 'daily' && dailyKeyShown && dailyKeyShown !== todayKey()) renderDaily();
  }, 30000);
  setInterval(() => {
    const active = $('#menu button[aria-selected=true]')?.dataset.tab;
    if (active === 'friends' && session && !session.guest && !document.hidden) loadFriends();
  }, 30000);
  $$('.menu button').forEach(b => b.onclick = () => show(b.dataset.tab));

  document.addEventListener('change', e => {
    const i = e.target.dataset && e.target.dataset.cand;
    if (i !== undefined) cands[+i].chosen = e.target.checked;
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'tick') tickLeaf(id);
    else if (act === 'defeat') defeatNode(id);
    else if (act === 'undoDefeat') undoDefeat(id);
    else if (act === 'dailyStart') startMission(id);
    else if (act === 'dailyPause') pauseMission();
    else if (act === 'dailyFinish') finishMission(id);
    else if (act === 'dailyDel') deleteMission(id);
    else if (act === 'remove') removeNode(id);
    else if (act === 'fold') { const g = byId(id); if (g) { g.collapsed = !g.collapsed; save(); renderTree(); } }
    else if (act === 'show') { state.focus = id; save(); refreshStage(); refreshHud(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('アニメに映しました'); }
    else if (act === 'split') openSplit(id);
    else if (act === 'addOpen') { addingFor = addingFor === id ? '' : id; renderTree(); }
    else if (act === 'addGo') addManualChild(id);
    else if (act === 'addRoot') addRoot(false);
    else if (act === 'frDetail') { detailId = id; show('friendDetail'); }
    else if (act === 'frAccept') friendCall('accept', id);
    else if (act === 'frDecline') friendCall('decline', id);
    else if (act === 'frCancel') friendCall('cancel', id);
    else if (act === 'frRemove') { if (confirm('このともだちを削除しますか?(相手のともだちからも消えます)')) friendCall('remove', id); }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addTitle' && addingFor) addManualChild(addingFor);
    else if (e.target.id === 'rootTitle') addRoot(false);
    else if (e.target.id === 'ngTitle') addRoot(true);
    else if (e.target.id === 'dailyTitle' || e.target.id === 'dailyMin') addMission();
    else if (e.target.id === 'studySubject') startStudy();
    else if (e.target.id === 'frName') sendFriendRequest();
    else if (e.target.id === 'obAddTitle') $('#obAddGo').click();
  });

  $('#addCands').onclick = addChosen;
  $('#closeSplit').onclick = () => { splitFor = ''; cands = []; $('#splitWin').hidden = true; };

  $('#setName').onchange = e => { state.hero = e.target.value.trim() || '勇者'; save(); refreshHud(); };
  $('#setJob').onchange = e => {
    const r = currentRoot(), t = e.target.value.trim();
    if (r && t) { r.title = t.slice(0, 60); save(); refreshStage(); }
  };
  $('#logout').onclick = () => logout();

  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'liferpg-save.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.v !== 3) throw new Error();
      if (!confirm('現在のデータを読み込んだデータで置き換えますか?')) return;
      state = normalize(data); save(); refreshStage(); refreshHud(); renderSettings();
      $('#setMsg').textContent = '読み込みました。';
    } catch { $('#setMsg').textContent = '読み込めませんでした。ライフRPGの書き出しファイルを選んでください。'; }
  };
}

/* ================= 起動 ================= */
async function start() {
  Stage.init($('#stage'), (boss, i, n) => {
    $('#bossLabel').textContent = boss ? (typeof boss.mon === 'number' ? `${DAILY_MONSTERS[boss.mon].name}「${boss.title}」(デイリー)` : `${MONSTERS[boss.tier].name}「${boss.title}」`) : 'ボスはまだいません';
  });
  bind();
  $('#authApi').value = lsGet(K_API) || (window.CONFIG && CONFIG.API_BASE) || '';
  try { session = JSON.parse(lsGet(K_SESSION)); } catch { session = null; }
  if (session && (session.guest || session.token)) await enterGame();
  else { session = null; screen('auth'); }
}

start();
