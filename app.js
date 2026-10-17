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

const newState = () => ({ v: 3, hero: '', job: '', status: '', onboarded: false, employed: false, threshold: 80, goals: [], focus: '', entries: [] });

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

function normalize(s) {
  const base = newState();
  if (!s || typeof s !== 'object') return base;
  const o = { ...base, ...s, v: 3 };
  o.goals = normalizeGoals(s.goals, s.job);
  o.focus = String(s.focus || '');
  o.entries = (Array.isArray(s.entries) ? s.entries : []).filter(e => e && (e.exp != null || Array.isArray(e.gains))).map(e => ({
    t: Number(e.t) || Date.now(), text: String(e.text || '').slice(0, 500), mood: e.mood || 'flat',
    exp: e.exp != null ? clampInt(e.exp, 0, 1000) : e.gains.reduce((a, g) => a + (+g.v || 0), 0)
  }));
  o.threshold = clampInt(o.threshold, 10, 100) || 80;
  return o;
}

/* 経験値 = 日々の記録 + 撃破したボスの報酬 */
function totalExp() {
  return state.entries.reduce((a, e) => a + e.exp, 0) + state.goals.reduce((a, g) => a + (g.done ? expOfDepth(depthOf(g)) : 0), 0);
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

function progress() {
  const leaves = state.goals.filter(isLeaf);
  return leaves.length ? Math.round(leaves.filter(g => g.done).length / leaves.length * 100) : 0;
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
  const mood = document.querySelector('[name=mood]:checked').value;
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
const rootNode = () => state.goals.find(g => !g.parentId);
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

/* 子が全部撃破されたら親も撃破、1つでも未達成なら親は未達成に戻す */
function syncUp(startId) {
  let p = byId(startId);
  while (p) {
    const ks = kids(p.id);
    if (ks.length) {
      const all = ks.every(k => k.done);
      if (all !== p.done) { p.done = all; p.doneAt = all ? Date.now() : 0; }
    }
    p = p.parentId ? byId(p.parentId) : null;
  }
}

const doneIds = () => new Set(state.goals.filter(g => g.done).map(g => g.id));
const stageBoss = g => ({ id: g.id, title: g.title, tier: tierOfDepth(depthOf(g)) });

/* アニメに映すボス:選んだもの → なければ最終目標(魔王) */
function focusNode() {
  const f = state.focus && byId(state.focus);
  if (f && !f.done) return f;
  const r = rootNode();
  return r && !r.done ? r : null;
}

function refreshStage() {
  Stage.setGear(gearTiers());
  const f = focusNode();
  Stage.setBosses(f ? [stageBoss(f)] : []);
}

function refreshHud() {
  const li = lvInfo();
  $('#heroName').textContent = state.hero || '勇者';
  $('#cls').textContent = state.employed && state.job ? `〈${state.job}〉` : `〈${rankOf(li.lv)}〉`;
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
  save();
  if (newly.length) {
    toast(...newly.slice(0, 4).map(g => `${g.title} を撃破! +${expOfDepth(depthOf(g))} EXP`));
    Stage.playDefeat(stageBoss(newly[newly.length - 1]), refreshStage);
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
  const root = rootNode(), p = progress();
  let box = '';
  if (!root) {
    box = `<p class="dim">最終目標がまだありません。いちばん大きな目標(なりたい姿)を入力しましょう。</p>
      <input type="text" id="rootTitle" maxlength="60" placeholder="例: ゲーム開発の仕事に就く" aria-label="最終目標">
      <button class="btn primary" data-act="addRoot">最終目標を決める</button>`;
  } else {
    const ready = !state.employed && p >= state.threshold;
    if (state.employed) box += `<div class="job-unlocked"><h3>★ 現在の職業:${esc(state.job)}</h3><p class="dim">夢をかなえました!</p></div>`;
    else if (ready) box += `<div class="job-unlocked"><h3>🎉 就職条件クリア!</h3><p class="dim">達成率が ${state.threshold}% を超えました。</p><button class="btn primary" data-act="employ">この職業に就く!</button></div>`;
    box += `<p>最終目標:<b style="color:var(--gold)">${esc(root.title)}</b></p>
      <div class="prog" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>
      <p class="dim">達成率 ${p}%(いちばん小さい目標のうち撃破した割合 / 就職の目安 ${state.threshold}%)</p>`;
  }
  $('#jobBox').innerHTML = box;
  renderTree();
}

function renderTree() {
  const root = rootNode(), host = $('#tree');
  if (!root) { host.innerHTML = ''; return; }
  const draw = (g, d) => {
    const ks = kids(g.id), lc = leafCount(g.id), open = !g.collapsed, tier = tierOfDepth(d);
    const meta = `${MONSTERS[tier].name}${lc ? ` ・ ${lc.done}/${lc.total}` : ''}${g.done ? ' ・ 撃破!' : ''}`;
    return `<div class="node ${g.done ? 'done' : ''}">
      <div class="nrow">
        ${ks.length ? `<button class="tgl" data-act="fold" data-id="${g.id}" aria-label="${open ? '閉じる' : '開く'}">${open ? '▾' : '▸'}</button>` : '<span class="tgl"></span>'}
        <canvas class="ico" width="48" height="48" data-tier="${tier}"></canvas>
        <div class="ntxt"><div class="btitle">${esc(g.title)}</div><div class="bmeta">${meta}</div>${g.desc ? `<div class="bdesc">${esc(g.desc)}</div>` : ''}</div>
      </div>
      <div class="bact">
        ${ks.length ? '' : `<button class="btn small ${g.done ? '' : 'primary'}" data-act="tick" data-id="${g.id}">${g.done ? '撃破を取り消す' : '撃破した!'}</button>`}
        ${g.done ? '' : `<button class="btn small" data-act="show" data-id="${g.id}">アニメに映す</button>`}
        <button class="btn small" data-act="split" data-id="${g.id}">AIに分けてもらう</button>
        <button class="btn small" data-act="addOpen" data-id="${g.id}">子目標を追加</button>
        <button class="btn small" data-act="remove" data-id="${g.id}">削除</button>
      </div>
      ${addingFor === g.id ? `<div class="addrow"><input type="text" id="addTitle" maxlength="60" placeholder="子目標の名前" aria-label="子目標の名前"><button class="btn small primary" data-act="addGo" data-id="${g.id}">追加</button></div>` : ''}
      ${open ? ks.map(k => draw(k, d + 1)).join('') : ''}
    </div>`;
  };
  host.innerHTML = draw(root, 0);
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

function addRoot() {
  const title = ($('#rootTitle').value || '').trim();
  if (!title) { $('#rootTitle').focus(); return; }
  const root = { id: uid(), parentId: null, title: title.slice(0, 60), desc: '', done: false, doneAt: 0, collapsed: false };
  state.goals = [root]; state.job = root.title; state.focus = root.id;
  save(); refreshStage(); renderBossTab();
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
  $$('.menu button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === v)));
  refreshHud();
  if (v === 'boss') renderBossTab();
  if (v === 'status') renderStatus();
  if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

function renderSettings() {
  $('#acct').textContent = session.guest ? 'ゲストモード(この端末だけに保存されます)' : `ログイン中:${session.user}`;
  $('#setName').value = state.hero;
  $('#setJob').value = state.job;
  $('#setThr').value = state.threshold;
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
  setSync(session.guest ? '端末に保存' : '☁ 保存済み');
  Stage.setGear(gearTiers());
  refreshStage();
  refreshHud();
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
    else if (act === 'remove') removeNode(id);
    else if (act === 'fold') { const g = byId(id); if (g) { g.collapsed = !g.collapsed; save(); renderTree(); } }
    else if (act === 'show') { state.focus = id; save(); refreshStage(); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('アニメに映しました'); }
    else if (act === 'split') openSplit(id);
    else if (act === 'addOpen') { addingFor = addingFor === id ? '' : id; renderTree(); }
    else if (act === 'addGo') addManualChild(id);
    else if (act === 'addRoot') addRoot();
    else if (act === 'employ') {
      state.employed = true; save(); refreshHud(); renderBossTab();
      toast(`おめでとう!${state.job}になった!`);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addTitle' && addingFor) addManualChild(addingFor);
    else if (e.target.id === 'rootTitle') addRoot();
    else if (e.target.id === 'obAddTitle') $('#obAddGo').click();
  });

  $('#addCands').onclick = addChosen;
  $('#closeSplit').onclick = () => { splitFor = ''; cands = []; $('#splitWin').hidden = true; };

  $('#setName').onchange = e => { state.hero = e.target.value.trim() || '勇者'; save(); refreshHud(); };
  $('#setJob').onchange = e => {
    state.job = e.target.value.trim();
    const r = rootNode(); if (r && state.job) { r.title = state.job.slice(0, 60); refreshStage(); }
    save();
  };
  $('#setThr').onchange = e => { state.threshold = clampInt(e.target.value, 10, 100) || 80; e.target.value = state.threshold; save(); };
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
    $('#bossLabel').textContent = boss ? `${MONSTERS[boss.tier].name}「${boss.title}」` : 'ボスはまだいません';
  });
  bind();
  $('#authApi').value = lsGet(K_API) || (window.CONFIG && CONFIG.API_BASE) || '';
  try { session = JSON.parse(lsGet(K_SESSION)); } catch { session = null; }
  if (session && (session.guest || session.token)) await enterGame();
  else { session = null; screen('auth'); }
}

start();
