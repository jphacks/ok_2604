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
const TYPES = { exam: '資格・試験', textbook: '教科書・教材', project: '作品・制作', experience: '実務・経験' };

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

const newState = () => ({ v: 3, hero: '', job: '', status: '', onboarded: false, employed: false, threshold: 80, goals: [], entries: [] });

let session = null;
let state = newState();
let cands = [];
let busy = false;

function normalize(s) {
  const base = newState();
  if (!s || typeof s !== 'object') return base;
  const o = { ...base, ...s, v: 3 };
  o.goals = (Array.isArray(s.goals) ? s.goals : []).filter(g => g && g.title).map(g => {
    return {
      id: String(g.id || uid()), title: String(g.title).slice(0, 60), type: TYPES[g.type] ? g.type : 'project',
      xp: clampInt(g.xp, 5, 300) || 30, req: !!g.req, desc: String(g.desc || '').slice(0, 100), done: !!g.done, doneAt: g.doneAt || 0
    };
  });
  o.entries = (Array.isArray(s.entries) ? s.entries : []).filter(e => e && (e.exp != null || Array.isArray(e.gains))).map(e => ({
    t: Number(e.t) || Date.now(), text: String(e.text || '').slice(0, 500), mood: e.mood || 'flat',
    exp: e.exp != null ? clampInt(e.exp, 0, 1000) : e.gains.reduce((a, g) => a + (+g.v || 0), 0)
  }));
  o.threshold = clampInt(o.threshold, 10, 100) || 80;
  return o;
}

/* 経験値 = 日々の記録 + 撃破したボスの報酬 */
function totalExp() {
  return state.entries.reduce((a, e) => a + e.exp, 0) + state.goals.reduce((a, g) => a + (g.done ? g.xp : 0), 0);
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
  const w = g => g.req ? 2 : 1;
  const all = state.goals.reduce((a, g) => a + w(g), 0);
  const done = state.goals.reduce((a, g) => a + (g.done ? w(g) : 0), 0);
  return all ? Math.round(done / all * 100) : 0;
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

/* ================= ボス(目標) ================= */
function bossesActive() {
  return state.goals.filter(g => !g.done).map(g => ({ id: g.id, title: g.title, xp: g.xp }));
}

function refreshStage() {
  Stage.setGear(gearTiers());
  Stage.setBosses(bossesActive());
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

function defeatGoal(g, delay) {
  g.done = true; g.doneAt = Date.now();
  setTimeout(() => Stage.playDefeat({ id: g.id, title: g.title, xp: g.xp }, refreshStage), delay);
  toast(`${g.title} を撃破!`, `ボーナス +${g.xp} EXP`);
}

function toggleGoal(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  const before = snapshot();
  if (!g.done) defeatGoal(g, 0);
  else { g.done = false; g.doneAt = 0; refreshStage(); }
  save(); refreshHud();
  if (g.done) announce(before);
}

function removeGoal(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g || !confirm(`「${g.title}」を削除しますか?` + (g.done ? '\n獲得済みのボーナス経験値も減ります。' : ''))) return;
  state.goals = state.goals.filter(x => x.id !== id);
  save(); refreshHud(); refreshStage();
}

function makeGoal(f) {
  return {
    id: uid(), title: String(f.title).trim().slice(0, 60), type: TYPES[f.type] ? f.type : 'project',
    xp: clampInt(f.xp, 5, 300) || 30, req: !!f.req, desc: String(f.desc || '').slice(0, 100), done: false, doneAt: 0
  };
}

function drawThumb(canvas, xp) {
  const m = MONSTERS[tierOfXp(xp)], ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const s = Math.max(1, Math.floor(canvas.width / 16));
  drawGrid(ctx, m.art, m.pal, 0, Math.max(0, canvas.height - m.art.length * s), s);
}

function goalMeta(g) {
  return `${MONSTERS[tierOfXp(g.xp)].name} ・ ${TYPES[g.type]} ・ 撃破で +${g.xp} EXP${g.req ? '<span class="req">必須</span>' : ''}`;
}

function renderBossTab() {
  const p = progress(), ready = !state.employed && state.goals.length && p >= state.threshold;
  let box = '';
  if (!state.job) box = '<p class="dim">せっていで「目指す職業」を入力すると表示されます。</p>';
  else {
    if (state.employed) box += `<div class="job-unlocked"><h3>★ 現在の職業:${esc(state.job)}</h3><p class="dim">夢をかなえました!新しいボスで次の冒険へ。</p></div>`;
    else if (ready) box += `<div class="job-unlocked"><h3>🎉 就職条件クリア!</h3><p class="dim">達成率が ${state.threshold}% を超えました。</p><button class="btn primary" data-act="employ">この職業に就く!</button></div>`;
    box += `<p>目指す姿:<b style="color:var(--gold)">${esc(state.job)}</b></p>
      <div class="prog" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>
      <p class="dim">達成率 ${p}%(就職の目安 ${state.threshold}% / 必須の目標は2倍で計算)</p>`;
  }
  $('#jobBox').innerHTML = box;

  const list = state.goals.slice().sort((a, b) => a.done - b.done || b.req - a.req || b.xp - a.xp);
  $('#bossList').innerHTML = list.map(g => `
    <div class="boss ${g.done ? 'done' : ''}">
      <canvas width="64" height="64" data-xp="${g.xp}"></canvas>
      <div><div class="btitle">${esc(g.title)}</div><div class="bmeta">${goalMeta(g)}</div>
        ${g.desc ? `<div class="bdesc">${esc(g.desc)}</div>` : ''}</div>
      <div class="bact">
        <button class="btn small ${g.done ? '' : 'primary'}" data-act="toggle" data-id="${g.id}">${g.done ? '撃破を取り消す' : '撃破した!'}</button>
        <button class="btn small" data-act="remove" data-id="${g.id}">削除</button>
      </div>
    </div>`).join('') || '<p class="dim">ボスがまだいません。下の「ボスを増やす」から追加しましょう。</p>';
  $$('#bossList canvas').forEach(c => drawThumb(c, +c.dataset.xp));
  renderCandList('#candList2');
  $('#addCands').hidden = !cands.length;
}

function renderCandList(sel) {
  const host = $(sel);
  host.innerHTML = cands.map((c, i) => `
    <label class="cand">
      <input type="checkbox" data-cand="${i}" ${c.chosen ? 'checked' : ''}>
      <canvas width="48" height="48" data-xp="${c.xp}"></canvas>
      <span><span class="btitle">${esc(c.title)}</span><br><span class="bmeta">${goalMeta(c)}</span>${c.desc ? `<br><span class="bdesc">${esc(c.desc)}</span>` : ''}</span>
    </label>`).join('') || '<p class="dim">候補はまだありません。</p>';
  host.querySelectorAll('canvas').forEach(c => drawThumb(c, +c.dataset.xp));
}

async function fetchCands(job, status, exclude) {
  const r = await api('/plan', { method: 'POST', body: { job, status, exclude } });
  return (r.goals || []).filter(g => g && g.title).map(g => ({ ...makeGoal(g), chosen: !!g.req }));
}

function explain(e) {
  if (e.code === 'NO_SERVER') return 'AI機能にはサーバー(Worker)のURLが必要です。ログイン画面の「サーバー設定」で入力できます。下から手動で目標を追加することもできます。';
  if (e.code === 'NO_AUTH') return 'ゲストモードではAI提案を使えません。アカウント登録すると利用できます。下から手動で目標を追加できます。';
  return `${e.message} 下から手動で目標を追加することもできます。`;
}

/* 目標の手動追加フォーム */
function buildAddForms() {
  $$('.addgoal').forEach(host => {
    host.innerHTML = `
      <input type="text" data-f="title" maxlength="60" placeholder="例: 基本情報技術者試験に合格する" aria-label="目標のタイトル">
      <div class="two">
        <select data-f="type" aria-label="種類">${Object.entries(TYPES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <input type="number" data-f="xp" min="5" max="300" value="40" aria-label="撃破ボーナスEXP" title="撃破ボーナスEXP">
      </div>
      <label class="chk"><input type="checkbox" data-f="req">必須の目標</label>
      <button type="button" class="btn small" data-act="addManual" data-form="${host.dataset.form}">ボスとして追加</button>`;
  });
}

function addManual(btn) {
  const host = btn.closest('.addgoal');
  const val = f => host.querySelector(`[data-f=${f}]`);
  const title = val('title').value.trim();
  if (!title) { val('title').focus(); return; }
  const g = makeGoal({ title, type: val('type').value, xp: val('xp').value, req: val('req').checked });
  val('title').value = '';
  if (btn.dataset.form === 'ob') {
    cands.push({ ...g, chosen: true }); renderCandList('#candList');
  } else {
    state.goals.push(g); save(); refreshStage(); renderBossTab(); toast('ボスがあらわれた!');
  }
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
    cands = await fetchCands(job, state.status, []);
    renderCandList('#candList');
    step(3);
  } catch (e) {
    if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
    cands = []; renderCandList('#candList');
    const e3 = $('#obErr3'); e3.textContent = explain(e); e3.hidden = false;
    step(3);
  } finally {
    busy = false; $('#obPlan').disabled = false; $('#obPlan').textContent = '軍師に相談する';
  }
}

function finishOnboard() {
  const chosen = cands.filter(c => c.chosen);
  if (!chosen.length && !confirm('ボスが選ばれていません。このまま冒険に出ますか?(あとで追加できます)')) return;
  state.goals = chosen.map(({ chosen: _c, ...g }) => g);
  state.onboarded = true;
  cands = [];
  save(); refreshStage();
  toast(`${state.hero || '勇者'}の冒険がはじまった!`);
  show('record');
}

/* ================= イベント ================= */
function bind() {
  buildAddForms();

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

  $('#go').onclick = submit;
  $$('.menu button').forEach(b => b.onclick = () => show(b.dataset.tab));
  $('#prevBoss').onclick = () => Stage.step(-1);
  $('#nextBoss').onclick = () => Stage.step(1);

  document.addEventListener('change', e => {
    const i = e.target.dataset && e.target.dataset.cand;
    if (i !== undefined) cands[+i].chosen = e.target.checked;
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'toggle') toggleGoal(id);
    else if (b.dataset.act === 'remove') removeGoal(id);
    else if (b.dataset.act === 'addManual') addManual(b);
    else if (b.dataset.act === 'employ') {
      state.employed = true; save(); refreshHud(); renderBossTab();
      toast(`おめでとう!${state.job}になった!`);
    }
  });

  $('#aiMore').onclick = async () => {
    if (busy) return;
    const err = $('#moreErr'); err.hidden = true;
    if (!state.job) { err.textContent = '先に「せってい」で目指す職業を入力してください。'; err.hidden = false; return; }
    busy = true; $('#aiMore').disabled = true; $('#aiMore').textContent = '軍師が考え中…';
    try {
      cands = await fetchCands(state.job, state.status, state.goals.map(g => g.title));
      cands.forEach(c => c.chosen = false);
      renderBossTab();
    } catch (e) {
      if (e.status === 401) { logout('セッションが切れました。もう一度ログインしてください。'); return; }
      err.textContent = explain(e); err.hidden = false;
    } finally {
      busy = false; $('#aiMore').disabled = false; $('#aiMore').textContent = '軍師にほかの目標を提案してもらう';
    }
  };
  $('#addCands').onclick = () => {
    const chosen = cands.filter(c => c.chosen);
    if (!chosen.length) { toast('追加する目標をチェックしてください'); return; }
    chosen.forEach(({ chosen: _c, ...g }) => state.goals.push(g));
    cands = [];
    save(); refreshStage(); renderBossTab(); toast('新しいボスがあらわれた!');
  };

  $('#setName').onchange = e => { state.hero = e.target.value.trim() || '勇者'; save(); refreshHud(); };
  $('#setJob').onchange = e => { state.job = e.target.value.trim(); save(); };
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
    $('#bossLabel').textContent = boss ? `${MONSTERS[tierOfXp(boss.xp)].name}「${boss.title}」 ${i + 1}/${n}` : 'ボスはまだいません';
    $('#prevBoss').disabled = $('#nextBoss').disabled = n < 2;
  });
  bind();
  $('#authApi').value = lsGet(K_API) || (window.CONFIG && CONFIG.API_BASE) || '';
  try { session = JSON.parse(lsGet(K_SESSION)); } catch { session = null; }
  if (session && (session.guest || session.token)) await enterGame();
  else { session = null; screen('auth'); }
}

start();
