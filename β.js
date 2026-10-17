const ABIL = [
  { k: 'mental', n: '精神力', cls: '不屈の戦士', day: '不屈の日', kw: ['怒られ', '叱られ', '失敗', '落ち込', '嫌', 'つらい', '辛い', 'ミス', '断られ', '振られ', '我慢', '耐え', '不安', '緊張', 'それでも', 'でも', '立ち直', '挑戦', '頑張'], tip: '嫌なことがあった日は、5分だけ散歩して気持ちを書き出しましょう。' },
  { k: 'intel', n: '知力', cls: '見習い賢者', day: '修行の日', kw: ['勉強', '読書', '本', '授業', '講義', '試験', '資格', '学ん', '調べ', 'レポート', '課題', '論文', '研究', '復習', '英語', 'プログラ'], tip: '今日学んだことを1行でまとめると、知識が定着します。' },
  { k: 'body', n: '体力', cls: '鍛錬の闘士', day: '鍛錬の日', kw: ['運動', '走', 'ランニング', '筋トレ', 'ジム', '散歩', '歩', 'ストレッチ', 'ヨガ', '早起き', '睡眠', '健康', '自炊', '水泳', '体操'], tip: '10分だけ歩く、ストレッチをする。小さな運動から始めましょう。' },
  { k: 'act', n: '行動力', cls: '旅立ちの剣士', day: '旅立ちの日', kw: ['始め', '初めて', '申し込', '応募', '挑戦', '行った', '参加', '実行', 'やってみ', '提出', '決め', '片付', '掃除', '予約', '準備'], tip: '気になっていたことを、2分でできる最初の一歩に分けて動いてみましょう。' },
  { k: 'social', n: '社交力', cls: '絆の吟遊詩人', day: '出会いの日', kw: ['友達', '友人', '話し', '会話', '相談', '飲み', 'サークル', 'チーム', 'バイト', '同僚', '先輩', '後輩', '家族', 'ありがとう', '感謝', '挨拶', '連絡', '上司', '会った'], tip: '誰か1人に「ありがとう」を伝えてみましょう。' },
  { k: 'create', n: '創造力', cls: '創造の魔導士', day: '創造の日', kw: ['作っ', '描', '絵', 'デザイン', '書い', 'アイデア', '企画', '音楽', '演奏', '料理', '撮影', '動画', 'ブログ', '日記', '考え'], tip: 'うまくなくていいので、何か1つ作ってみましょう。' }
];

const NEG = ['怒られ', '叱られ', '失敗', '落ち込', '嫌', 'つらい', '辛い', 'ミス', '断られ', '振られ', '疲', '最悪', '意味がな', '泣'];
const FOES = ['モヤモヤ', '自己否定スライム', '不安ゴースト', '後悔ドラゴン', '先延ばしゴブリン'];
const EXAMPLES = ['上司に怒られた。でも最後まで資料を直した', 'サークルの友達と話して気持ちが楽になった', '3kmランニングして、夜に英語を30分勉強した', '面接で緊張して失敗した', '初めて企画書を作って提出した'];
const KEY = 'liferpg.v2';

const $ = s => document.querySelector(s);
const abil = k => ABIL.find(a => a.k === k);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isNeg = e => e.mood === 'bad' || NEG.some(w => e.text.includes(w));
const foeOf = e => e.enemy || FOES[[...e.text].reduce((a, c) => a + c.charCodeAt(0), 0) % FOES.length];

let state = load(), last = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.entries) return s;
  } catch (e) { }

  const at = (d, h) => {
    const x = new Date();
    x.setDate(x.getDate() - d);
    x.setHours(h, 0, 0, 0);
    return x.getTime();
  };

  const sample = [
    [6, 9, '上司に怒られた。でも最後まで資料を直して提出した', 'bad'],
    [6, 20, '帰り道に30分歩いて、気持ちを切り替えた', 'flat'],
    [5, 19, 'ジムで筋トレして、帰ってから英語の勉強をした', 'good'],
    [4, 18, 'サークルの先輩に相談して、アドバイスをもらった', 'flat'],
    [2, 21, '初めて動画を撮影して編集してみた', 'good'],
    [1, 15, '試験でミスをして落ち込んだ。夜に復習のノートを作った', 'bad']
  ].map(([d, h, text, mood]) => ({ t: at(d, h), text, mood, gains: judge(text, mood).gains, sample: true }));

  return { name: '', entries: sample, diaries: {} };
}

state.diaries ??= {};
let SAMPLE;

async function getSample() {
  if (SAMPLE === undefined) {
    try { SAMPLE = (await window.claude?.use?.('sample')) || null } catch (e) { SAMPLE = null }
  }
  return SAMPLE;
}

const generating = new Set(), failed = new Set();

/* AIが出来事を読んで経験値を判定する（使えない場合はキーワード判定） */
async function aiJudge(text, mood) {
  const f = judge(text, mood), s = await getSample();
  if (!s) return { ...f, ai: false };
  try {
    const prompt = `あなたはRPG世界のゲームマスターです。ユーザーの今日の出来事を読み、6つの能力への経験値を判定してください。
能力キー: mental=精神力, intel=知力, body=体力, act=行動力, social=社交力, create=創造力
ルール: 出来事に実際に関係する能力だけに1〜3の整数を付与（最大3つ）。嫌な出来事や失敗は成長の材料として、精神力を高めに付与する。
気分: ${mood}（good=快晴, flat=くもり, bad=嵐）
出来事: ${text}
JSONのみで返答: {"gains":[{"k":"mental","v":3}],"enemy":"出来事がつらいものなら敵の名前（例: 不安ゴースト）、そうでなければ空文字","reaction":"RPG風の一言（30字以内）","reframe":"出来事を成長として前向きに捉え直す、2文以内の言葉","next":"次にやると良い小さな行動を1文"}`;
    
    const r = await s.json(prompt, { modelTier: 'quick', cache: false });
    const gains = (r.gains || []).filter(g => abil(g.k) && +g.v > 0).slice(0, 3).map(g => ({ k: g.k, v: Math.min(3, Math.round(+g.v)) }));
    if (!gains.length) return { ...f, ai: false };
    return { neg: !!r.enemy || f.neg, gains, enemy: r.enemy || '', reaction: r.reaction || '', reframe: r.reframe || '', next: r.next || '', ai: true };
  } catch (e) { return { ...f, ai: false } }
}

/* 1日分の記録から、AIが冒険日誌を書く */
async function aiDiary(day, es) {
  const s = await getSample(); if (!s) return null;
  const ev = es.map(e => { const d = new Date(e.t); return `- ${d.getHours()}時 ${e.text}（気分:${e.mood}、獲得:${gStr(e)}）` }).join('\n');
  const prompt = `あなたはRPGの語り部です。主人公「${hero()}」のある1日の出来事から、冒険日誌の1ページを日本語で書いてください。
条件:
- 下の出来事だけを素材にし、書かれていない事実は作らない
- 主人公は三人称（${hero()}は〜）、ファンタジーRPGの文体。350字前後、2〜3段落
- つらい出来事は強敵や試練として描き、成長の糧として前向きにまとめる
- 最後に、獲得した経験値に触れる一文を入れる
日付: ${day}
出来事:
${ev}
JSONのみで返答: {"title":"その日の章タイトル（15字以内）","body":"本文（段落は\\n\\nで区切る）","hint":"明日の冒険へのヒント1文"}`;
  try {
    const r = await s.json(prompt, { modelTier: 'default', cache: false });
    return r && r.body ? { title: String(r.title || ''), body: String(r.body), hint: String(r.hint || '') } : null;
  } catch (e) { return null }
}

const groupDays = () => { const g = {}; state.entries.slice().sort((a, b) => a.t - b.t).forEach(e => (g[dayKey(e.t)] ??= []).push(e)); return g };
const sigOf = es => es.map(e => e.t).join(',');

async function genDay(k) {
  const es = groupDays()[k]; if (!es || generating.has(k)) return;
  generating.add(k); failed.delete(k); renderDiary();
  const r = await aiDiary(k, es);
  generating.delete(k);
  if (r) { state.diaries[k] = { ...r, sig: sigOf(es) }; save() } else failed.add(k);
  if (!$('[data-view=diary]').hidden) renderDiary();
}

let busy = false;
async function ensureDiaries() {   /* 日付が変わった日の日誌を、開いたときに自動で書く */
  if (busy) return; busy = true;
  try {
    const g = groupDays(), today = dayKey(Date.now());
    for (const k of Object.keys(g)) {
      const d = state.diaries[k];
      if (k !== today && (!d || d.sig !== sigOf(g[k])) && !failed.has(k)) await genDay(k);
    }
  } finally { busy = false }
}

function save() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { } }
const hero = () => state.name || '勇者';

function judge(text, mood) {
  const neg = isNeg({ text, mood }), g = {};
  ABIL.forEach(a => { const h = a.kw.filter(w => text.includes(w)).length; if (h && a.k !== 'mental') g[a.k] = Math.min(3, h + 1) });
  if (neg) g.mental = 3; else if (ABIL[0].kw.some(w => text.includes(w))) g.mental = 2;
  if (!Object.keys(g).length) g.mental = 1;
  return { neg, gains: Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => ({ k, v })) };
}

const total = es => { const t = {}; ABIL.forEach(a => t[a.k] = 0); es.forEach(x => x.gains.forEach(g => t[g.k] += g.v)); return t };
const sorted = t => ABIL.slice().sort((a, b) => t[b.k] - t[a.k]);
const gStr = e => e.gains.map(g => `${abil(g.k).n}+${g.v}`).join('、');

function lvInfo() {
  const n = Object.values(total(state.entries)).reduce((a, b) => a + b, 0);
  const lv = Math.floor(Math.sqrt(n / 4)) + 1, base = (lv - 1) ** 2 * 4, nxt = lv ** 2 * 4;
  return { n, lv, pct: Math.round((n - base) / (nxt - base) * 100), rest: nxt - n };
}

/* 日誌の物語を組み立てる */
function diaryOf(es) {
  const t = total(es), top = sorted(t)[0], negs = es.filter(isNeg), sum = Object.values(t).reduce((a, b) => a + b, 0);
  const title = negs.length ? (top.k === 'mental' ? '試練を越えた日' : '嵐のなかの冒険') : top.day;
  const intro = negs.length ? `${hero()}の行く手に暗雲が立ちこめた一日だった。` : `${hero()}は今日も冒険の旅を続けた。`;
  const body = es.map(e => {
    const a = abil(e.gains[0].k).n, q = `「${esc(e.text)}」`;
    return isNeg(e) ? `${q}――強敵〈${foeOf(e)}〉があらわれた！ ${hero()}は${a}を振りしぼって立ち向かい、${gStr(e)}の経験値を手に入れた。`
      : `${q}――${hero()}はこの出来事で${a}を磨き、${gStr(e)}の経験値を手に入れた。`
  }).join('');
  const outro = `こうして一日の冒険は幕を閉じた。${top.n}がもっとも輝いた日として、日誌に刻まれる。`;
  return { title, sum, top, paras: [intro + body, outro], hint: sorted(total(state.entries)).pop().tip, t };
}

function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` }

function renderDiary() {
  const groups = groupDays(), keys = Object.keys(groups), n = keys.length, today = dayKey(Date.now());
  $('#diary').innerHTML = keys.reverse().map((k, i) => {
    const es = groups[k], t = diaryOf(es), no = n - i, ai = state.diaries[k], fresh = ai && ai.sig === sigOf(es);
    const head = `<div class="day">冒険の記録 第${no}日 ${k}${k === today ? ' （今日）' : ''}</div>`;
    const loot = `<div class="loot"><span>獲得経験値 ${t.sum}XP</span>${ABIL.filter(a => t.t[a.k]).map(a => `<span>${a.n} +${t.t[a.k]}</span>`).join('')}</div>`;
    if (generating.has(k)) return `<article class="page pending">${head}<h3>語り部が日誌を綴っています</h3><p>この日の冒険を思い返しています</p></article>`;
    if (fresh) return `<article class="page">${head}<span class="badge">AI語り部</span><h3>${esc(ai.title || t.title)}</h3>
      ${ai.body.split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('')}${loot}
      ${ai.hint ? `<div class="hint">明日への手がかり：${esc(ai.hint)}</div>` : ''}
      ${k === today ? `<button class="btn" data-day="${k}">日誌を書き直す</button>` : ''}</article>`;
    const label = k === today ? '今日の冒険を締めて、日誌を書く' : 'AIで日誌を書く';
    return `<article class="page">${head}<span class="badge">${k === today ? 'まだ書かれていません' : failed.has(k) ? 'AIを使えなかったため仮の日誌' : '未作成'}</span><h3>${t.title}</h3>
      ${k === today ? `<p>今日の出来事：${es.map(e => '「' + esc(e.text) + '」').join('')}</p>` : t.paras.map(p => `<p>${p}</p>`).join('')}${loot}
      <button class="btn" data-day="${k}">${label}</button></article>`
  }).join('')
    || '<div class="win"><p class="dim">まだ日誌はありません。最初の冒険を記しましょう。</p></div>';
}

function radar(svg, t) {
  const cx = 180, cy = 165, R = 105, N = 6, max = Math.max(10, Math.ceil(Math.max(...Object.values(t)) / 5) * 5);
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] };
  const poly = r => ABIL.map((_, i) => pt(i, r).join(',')).join(' ');
  let h = '';
  [.25, .5, .75, 1].forEach(f => h += `<polygon points="${poly(R * f)}" fill="none" stroke="var(--dim)" stroke-opacity=".5" stroke-width="1"/>`);
  ABIL.forEach((a, i) => { const [x, y] = pt(i, R); h += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--dim)" stroke-opacity=".5"/>` });
  h += `<polygon points="${ABIL.map((a, i) => pt(i, R * t[a.k] / max).join(',')).join(' ')}" fill="var(--gold)" fill-opacity=".3" stroke="var(--gold)" stroke-width="3" stroke-linejoin="miter"/>`;
  ABIL.forEach((a, i) => {
    const [px, py] = pt(i, R * t[a.k] / max); h += `<rect x="${px - 4}" y="${py - 4}" width="8" height="8" fill="var(--gold)"/>`;
    const [x, y] = pt(i, R + 24), anc = Math.abs(x - cx) < 5 ? 'middle' : x > cx ? 'start' : 'end';
    h += `<text x="${x}" y="${y - 2}" text-anchor="${anc}">${a.n}</text><text class="v" x="${x}" y="${y + 13}" text-anchor="${anc}">${t[a.k]}</text>`;
  });
  svg.innerHTML = h;
}

function renderStatus() {
  const t = total(state.entries), s = sorted(t), w = s[5], mx = Math.max(1, s[0] && t[s[0].k]);
  radar($('#radar'), t);
  $('#stats').innerHTML = ABIL.map(a => `<div class="stat"><span>${a.n}</span><span class="track"><i style="width:${t[a.k] / mx * 100}%"></i></span><span>${t[a.k]}</span></div>`).join('');
  $('#swot').innerHTML = `<p>得意：${s[0].n}（${t[s[0].k]}XP）</p><p>伸びしろ：${w.n}（${t[w.k]}XP）</p><p class="dim" style="margin-top:6px">助言：${w.tip}</p>`;
  $('#nameIn').value = state.name;
}

function renderReview() {
  const days = +document.querySelector('[name=period]:checked').value, since = Date.now() - days * 864e5;
  const es = state.entries.filter(e => e.t >= since), t = total(es), sum = Object.values(t).reduce((a, b) => a + b, 0), top = sorted(t)[0];
  $('#sumline').innerHTML = es.length ? `${days === 7 ? 'この1週間' : 'この1か月'}で<b>${es.length}件</b>の冒険を記し、合計<b style="color:var(--gold)">${sum}XP</b>を獲得。最も伸びたのは<b>${top.n}</b>です。` : 'この期間の記録はまだありません。';
  radar($('#radar2'), t);
  $('#log').innerHTML = state.entries.slice().reverse().map(e => {
    const d = new Date(e.t);
    return `<div class="entry"><small>${d.getMonth() + 1}/${d.getDate()}${e.sample ? '<span class="sample">サンプル</span>' : ''}</small><span class="body">${esc(e.text)}</span>
    <span>${e.gains.map(g => `<span class="tag">${abil(g.k).n} +${g.v}</span>`).join('')}</span></div>`
  }).join('') || '<p class="dim">まだ記録がありません。</p>';
  $('#clearSample').hidden = !state.entries.some(e => e.sample);
}

function show(v) {
  document.querySelectorAll('[data-view]').forEach(s => s.hidden = s.dataset.view !== v);
  document.querySelectorAll('.menu button').forEach(b => b.setAttribute('aria-selected', String((v === 'judge' ? 'record' : v) === b.dataset.tab)));
  const li = lvInfo(), top = sorted(total(state.entries))[0];
  $('#heroName').textContent = hero(); $('#cls').textContent = '〈' + top.cls + '〉'; $('#lv').textContent = 'Lv.' + li.lv;
  $('#lvbar').style.width = li.pct + '\%'; $('#nextxp').textContent = '次まで' + li.rest;
  if (v === 'judge' && last) renderJudge();
  if (v === 'status') renderStatus();
  if (v === 'diary') { renderDiary(); ensureDiaries() }
  if (v === 'review') renderReview();
  window.scrollTo(0, 0);
}

function renderJudge() {
  const loading = !last || last.loading;
  ['#gains', '#reframe', '#next'].forEach(s => $(s).hidden = loading);
  document.querySelector('#toDiary').hidden = document.querySelector('#again').hidden = loading;
  if (loading) { $('#levelup').hidden = true; $('#battle').innerHTML = '<p style="--i:0;opacity:1">ゲームマスターが出来事を読んでいる…</p>'; return }
  const { entry, neg, lvUp } = last, lines = [];
  if (neg) lines.push(`<p class="foe">〈${foeOf(entry)}〉があらわれた！</p>`);
  lines.push(`<p>${esc(hero())}は「${esc(entry.text)}」${neg ? 'に立ち向かった！' : 'をやりとげた！'}</p>`);
  if (neg) lines.push(`<p>〈${foeOf(entry)}〉をたおした！</p>`);
  if (entry.reaction) lines.push(`<p>${esc(entry.reaction)}</p>`);
  lines.push(`<p style="color:var(--gold)">${gStr(entry).replace(/\+/g, ' の経験値 +')}を獲得！</p>`);
  $('#battle').innerHTML = lines.map((l, i) => l.replace('<p', '<p style="--i:' + i + '"')).join('');
  $('#gains').innerHTML = entry.gains.map(g => `<div class="gain"><b>${abil(g.k).n}</b><span class="pt">+${g.v} UP!</span></div>`).join('');
  const lu = $('#levelup'); lu.hidden = !lvUp; if (lvUp) lu.textContent = `レベルアップ！ Lv.${lvUp[0]} → Lv.${lvUp[1]}`;
  const top = abil(entry.gains[0].k).n;
  $('#reframe').textContent = entry.reframe || (neg ? `つらい出来事も、${top}を鍛える材料になりました。向き合って記したこと自体が成長です。` : `今日の積み重ねが${top}に反映されました。続けるほど、数字と図に表れます。`);
  $('#next').textContent = '軍師の提案：' + (entry.next || sorted(total(state.entries)).pop().tip) + ' 日付が変わると、この冒険は日誌になります。';
}

async function submit() {
  const text = $('#text').value.trim();
  if (!text) { $('#text').focus(); return }
  const mood = document.querySelector('[name=mood]:checked').value, before = lvInfo().lv;
  $('#go').disabled = true; last = { loading: true }; show('judge');
  const r = await aiJudge(text, mood);
  const entry = { t: Date.now(), text, mood, gains: r.gains, enemy: r.enemy || '', reaction: r.reaction || '', reframe: r.reframe || '', next: r.next || '' };
  state.entries.push(entry); save();
  const after = lvInfo().lv; last = { entry, neg: r.neg, lvUp: after > before ? [before, after] : null };
  $('#text').value = ''; $('#go').disabled = false; show('judge');
}

// イベントリスナーの追加
$('#examples').innerHTML = EXAMPLES.map(x => `<button type="button">${x}</button>`).join('');
$('#examples').onclick = e => { if (e.target.tagName === 'BUTTON') { $('#text').value = e.target.textContent; $('#text').focus() } };
$('#go').onclick = submit;
$('#diary').onclick = e => { const b = e.target.closest('[data-day]'); if (b) genDay(b.dataset.day) };
$('#again').onclick = () => show('record');
$('#toDiary').onclick = () => show('diary');
document.querySelectorAll('.menu button').forEach(b => b.onclick = () => show(b.dataset.tab));
document.querySelectorAll('[name=period]').forEach(r => r.onchange = renderReview);
$('#nameIn').oninput = e => { state.name = e.target.value.trim(); save(); $('#heroName').textContent = hero() };
$('#clearSample').onclick = () => { state.entries = state.entries.filter(e => !e.sample); save(); show('review') };

// 初期表示
show('diary');
