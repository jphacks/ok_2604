/* --- 重み付け(pts)対応アビリティマスター --- */
const ABIL = [
  { k: 'mental', n: '精神力', cls: '不屈の戦士', day: '不屈の日', kw: [
      { w: '怒られ', pts: 2 }, { w: '失敗', pts: 2 }, { w: 'ミス', pts: 2 },
      { w: '乗り越え', pts: 3 }, { w: '耐えた', pts: 3 }, { w: '克服', pts: 4 }, { w: '面接', pts: 3 }
    ], tip: '嫌なことがあった日は、5分だけ散歩して気持ちを書き出しましょう。' },
  { k: 'intel', n: '知力', cls: '見習い賢者', day: '修行の日', kw: [
      { w: '勉強', pts: 1 }, { w: '読書', pts: 1 }, { w: '復習', pts: 1 },
      { w: 'プログラミング', pts: 2 }, { w: 'レポート', pts: 2 }, { w: '課題', pts: 2 },
      { w: '資格', pts: 3 }, { w: '試験', pts: 3 }, { w: '論文', pts: 4 }, { w: '研究', pts: 4 }
    ], tip: '今日学んだことを1行でまとめると、知識が定着します。' },
  { k: 'body', n: '体力', cls: '鍛錬の闘士', day: '鍛錬の日', kw: [
      { w: '散歩', pts: 1 }, { w: 'ストレッチ', pts: 1 },
      { w: 'ランニング', pts: 2 }, { w: '筋トレ', pts: 2 }, { w: 'ジム', pts: 2 },
      { w: 'マラソン', pts: 4 }, { w: '追い込んだ', pts: 3 }
    ], tip: '10分だけ歩く、ストレッチをする。小さな運動から始めましょう。' },
  { k: 'act', n: '行動力', cls: '旅立ちの剣士', day: '旅立ちの日', kw: [
      { w: '調べた', pts: 1 }, { w: '片付け', pts: 1 },
      { w: '申し込んだ', pts: 2 }, { w: '参加した', pts: 2 }, { w: '予約した', pts: 2 },
      { w: '提出した', pts: 3 }, { w: '応募した', pts: 3 }, { w: '登壇した', pts: 4 }, { w: '発表した', pts: 4 }
    ], tip: '気になっていたことを、2分でできる最初の一歩に分けて動いてみましょう。' },
  { k: 'social', n: '社交力', cls: '絆の吟遊詩人', day: '出会いの日', kw: [
      { w: '会話', pts: 1 }, { w: '挨拶', pts: 1 },
      { w: '相談した', pts: 2 }, { w: 'お礼', pts: 2 }, { w: '連絡した', pts: 2 },
      { w: '交渉した', pts: 3 }, { w: '謝罪した', pts: 3 }, { w: '幹事をやった', pts: 4 }
    ], tip: '誰か1人に「ありがとう」を伝えてみましょう。' },
  { k: 'create', n: '創造力', cls: '創造の魔導士', day: '創造の日', kw: [
      { w: '考えた', pts: 1 }, { w: 'メモした', pts: 1 },
      { w: '作った', pts: 2 }, { w: '描いた', pts: 2 }, { w: '書いた', pts: 2 },
      { w: '企画した', pts: 3 }, { w: 'デザインした', pts: 3 }, { w: '完成させた', pts: 4 }, { w: 'リリースした', pts: 4 }
    ], tip: 'うまくなくていいので、何か1つ作ってみましょう。' }
];

const ACTION_MODIFIERS = [
  { kw: ['完成', '解決', '達成', '合格', '採用', '内定', 'リリース', '登壇'], mult: 2.0 },
  { kw: ['提出', '公開', '応募', '仕上げた', 'やりきった', '乗り越えた'], mult: 1.5 },
  { kw: ['始めた', '挑戦', '試した', '着手'], mult: 1.2 }
];

const NEG = ['怒られ', '叱られ', '失敗', '落ち込', '嫌', 'つらい', '辛い', 'ミス', '断られ', '振られ', '疲', '最悪', '意味がな', '泣'];
const FOES = ['モヤモヤ', '自己否定スライム', '不安ゴースト', '後悔ドラゴン', '先延ばしゴブリン'];
const EXAMPLES = ['上司に怒られた。でも最後まで資料を直した', 'サークルの友達と話して気持ちが楽になった', '3kmランニングして、夜に英語を30分勉強した', '面接で緊張して失敗した', '初めて企画書を作って提出した'];

const KEY = 'liferpg.v2';
const $ = s => document.querySelector(s);
const abil = k => ABIL.find(a => a.k === k);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNeg = e => e.mood === 'bad' || NEG.some(w => e.text.includes(w));
const foeOf = e => e.enemy || FOES[[...e.text].reduce((a, c) => a + c.charCodeAt(0), 0) % FOES.length];

let state = load();
state.obtainedCerts ??= [];
state.selectedJobId ??= 'engineer';
state.unlockedJobs ??= [];
state.currentJob ??= '';
state.diaries ??= {};

let last = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.entries) return s;
  } catch (e) {}

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
  ].map(([d, h, text, mood]) => ({
    t: at(d, h),
    text,
    mood,
    gains: judge(text, mood).gains,
    sample: true
  }));

  return { name: '', entries: sample, diaries: {}, obtainedCerts: [], selectedJobId: 'engineer', unlockedJobs: [], currentJob: '' };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

const hero = () => state.name || '勇者';

/* 内容に応じた重み付け判定ロジック */
function judge(text, mood) {
  const neg = isNeg({ text, mood });
  const rawGains = {};

  ABIL.forEach(a => {
    let score = 0;
    a.kw.forEach(item => {
      if (text.includes(item.w)) {
        score += item.pts;
      }
    });
    if (score > 0) rawGains[a.k] = score;
  });

  let actionMultiplier = 1.0;
  for (const mod of ACTION_MODIFIERS) {
    if (mod.kw.some(w => text.includes(w))) {
      actionMultiplier = Math.max(actionMultiplier, mod.mult);
    }
  }

  if (neg) {
    rawGains.mental = (rawGains.mental || 0) + 3;
  }

  if (Object.keys(rawGains).length === 0) {
    rawGains[mood === 'bad' ? 'mental' : 'act'] = 1;
  }

  const finalGains = Object.entries(rawGains).map(([k, basePts]) => {
    let calculated = Math.round(basePts * actionMultiplier);
    return {
      k,
      v: Math.max(1, Math.min(15, calculated))
    };
  });

  return {
    neg,
    gains: finalGains.sort((a, b) => b.v - a.v).slice(0, 3)
  };
}

const total = es => {
  const t = {};
  ABIL.forEach(a => t[a.k] = 0);
  es.forEach(x => x.gains.forEach(g => t[g.k] += g.v));
  return t;
};

const sorted = t => ABIL.slice().sort((a, b) => t[b.k] - t[a.k]);
const gStr = e => e.gains.map(g => `${abil(g.k).n}+${g.v}`).join('、');

function lvInfo() {
  const n = Object.values(total(state.entries)).reduce((a, b) => a + b, 0);
  const lv = Math.floor(Math.sqrt(n / 4)) + 1, base = (lv - 1) ** 2 * 4, nxt = lv ** 2 * 4;
  return { n, lv, pct: Math.round((n - base) / (nxt - base) * 100), rest: nxt - n };
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function calcJobStats(jobId) {
  const job = JOBS.find(j => j.id === jobId) || JOBS[0] || {};
  const currentTotal = total(state.entries);
  const userSum = Object.values(currentTotal).reduce((a, b) => a + b, 0);
  const currentLv = lvInfo().lv;

  const matchDetails = {};
  let weightedProgressSum = 0;

  ABIL.forEach(a => {
    const target = (job.targets && job.targets[a.k]) || 0;
    const current = currentTotal[a.k] || 0;
    const ratio = target > 0 ? Math.min(1.0, current / target) : 1.0;
    matchDetails[a.k] = {
      current,
      target,
      pct: target > 0 ? Math.round((current / target) * 100) : 100
    };
    if (target > 0) {
      weightedProgressSum += ratio * ((job.weights && job.weights[a.k]) || 0);
    }
  });

  const totalMatchPct = Math.round(weightedProgressSum * 100);
  const canEmployed = currentLv >= (job.reqLevel || 1) && totalMatchPct >= 80;

  const twoWeeksAgo = Date.now() - 14 * 864e5;
  const recentEntries = state.entries.filter(e => e.t >= twoWeeksAgo);
  const recentDays = Math.max(1, new Set(recentEntries.map(e => dayKey(e.t))).size);
  const recentGains = Object.values(total(recentEntries)).reduce((a, b) => a + b, 0);
  const dailyPace = recentGains / recentDays;

  const remainingXP = Math.max(0, (job.targetTotal || 500) - userSum);
  const estimatedDaysLeft = dailyPace > 0 ? Math.ceil(remainingXP / dailyPace) : Infinity;

  return {
    job,
    totalMatchPct,
    matchDetails,
    canEmployed,
    currentLv,
    dailyPace: dailyPace.toFixed(1),
    estimatedDaysLeft
  };
}

function radar(svg, t) {
  const cx = 180, cy = 165, R = 105, N = 6, max = Math.max(10, Math.ceil(Math.max(...Object.values(t)) / 5) * 5);
  const pt = (i, r) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / N;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = r => ABIL.map((_, i) => pt(i, r).join(',')).join(' ');
  let h = '';
  [.25, .5, .75, 1].forEach(f => h += `<polygon points="${poly(R * f)}" fill="none" stroke="var(--dim)" stroke-opacity=".5" stroke-width="1"/>`);
  ABIL.forEach((a, i) => {
    const [x, y] = pt(i, R);
    h += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--dim)" stroke-opacity=".5"/>`;
  });
  h += `<polygon points="${ABIL.map((a, i) => pt(i, R * t[a.k] / max).join(',')).join(' ')}" fill="var(--gold)" fill-opacity=".3" stroke="var(--gold)" stroke-width="3" stroke-linejoin="miter"/>`;
  ABIL.forEach((a, i) => {
    const [px, py] = pt(i, R * t[a.k] / max);
    h += `<rect x="${px - 4}" y="${py - 4}" width="8" height="8" fill="var(--gold)"/>`;
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

  renderJobSelectOptions();
  renderJobAnalysis();
  renderCertifications();
}

function renderJobSelectOptions() {
  const select = $('#jobSelect');
  if (!select) return;

  select.innerHTML = JOBS.map(j => {
    const isEmployed = state.currentJob === j.id;
    return `<option value="${j.id}" ${j.id === state.selectedJobId ? 'selected' : ''}>${isEmployed ? '★ ' : ''}${esc(j.name)} (必要Lv.${j.reqLevel})</option>`;
  }).join('');

  select.onchange = e => {
    state.selectedJobId = e.target.value;
    save();
    renderJobAnalysis();
    renderCertifications();
  };
}

function renderJobAnalysis() {
  const res = calcJobStats(state.selectedJobId);
  if (!res.job || !res.job.id) return;

  const isCurrentEmployed = state.currentJob === res.job.id;

  let unlockBanner = '';
  if (isCurrentEmployed) {
    unlockBanner = `
      <div class="job-unlocked">
        <h3>★ 現在の職業：${esc(res.job.name)}</h3>
        <p class="dim">この職業として歩み始めています！</p>
      </div>
    `;
  } else if (res.canEmployed) {
    unlockBanner = `
      <div class="job-unlocked">
        <h3>🎉 就職条件クリア！</h3>
        <p class="dim" style="margin-bottom:8px;">レベル条件(Lv.${res.job.reqLevel})と資質条件を達成しました！</p>
        <button class="btn primary" onclick="employJob('${res.job.id}')">この職業に就く！</button>
      </div>
    `;
  } else {
    unlockBanner = `
      <p class="dim" style="border:1px dashed var(--dim); padding:6px 8px; border-radius:4px; margin-bottom:8px;">
        🔒 就職条件：<b>Lv.${res.job.reqLevel}</b> 以上 (現在: Lv.${res.currentLv}) ＆ 適合度 <b>80%</b> 以上
      </p>
    `;
  }

  $('#jobAnalysisResult').innerHTML = `
    ${unlockBanner}
    <p style="font-size:18px; color:var(--gold);">
      <b>職業適合度：${res.totalMatchPct}%</b>
    </p>
    <p class="dim">現在のペース：1日平均 <b>${res.dailyPace} XP</b></p>
    <p class="dim">目標到達予測：${res.estimatedDaysLeft === Infinity ? '判定不能' : `あと約 <b>${res.estimatedDaysLeft} 日</b>`}</p>
    <hr style="border:0; border-top:1px dashed var(--dim); margin:10px 0;">
    <div style="display:grid; gap:4px;">
      ${ABIL.map(a => {
        const d = res.matchDetails[a.k];
        return d.target > 0 ? `
          <div style="display:flex; justify-content:space-between; font-size:13px;">
            <span>${a.n} (目標: ${d.target}XP)</span>
            <span>${d.current} XP (${d.pct}%)</span>
          </div>
        ` : '';
      }).join('')}
    </div>
  `;
}

window.employJob = function(jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job) return;

  state.currentJob = jobId;
  if (!state.unlockedJobs.includes(jobId)) {
    state.unlockedJobs.push(jobId);
  }

  state.entries.push({
    t: Date.now(),
    text: `【祝】目標職業【${job.name}】に就職した！`,
    mood: 'good',
    gains: [{ k: 'mental', v: 3 }]
  });

  save();
  renderStatus();
  show('status');
};

function renderCertifications() {
  const job = JOBS.find(j => j.id === state.selectedJobId) || JOBS[0] || {};
  const certs = job.certifications || {};
  let html = '';

  html += `<p style="color:var(--foe); font-size:14px; margin-bottom:4px;"><b>【必須・前提資格】</b></p>`;
  if (!certs.required || certs.required.length === 0) {
    html += `<p class="dim" style="font-size:13px;">※この職業には必須資格はありません（実務・作品重視）。</p>`;
  } else {
    html += certs.required.map(c => renderCertItem(c)).join('');
  }

  html += `<p style="color:var(--cyan); font-size:14px; margin:10px 0 4px;"><b>【持っておくと有利な資格】</b></p>`;
  if (!certs.recommended || certs.recommended.length === 0) {
    html += `<p class="dim" style="font-size:13px;">※特に推奨資格はありません。</p>`;
  } else {
    html += certs.recommended.map(c => renderCertItem(c)).join('');
  }

  $('#certList').innerHTML = html;
}

function renderCertItem(cert) {
  const isChecked = state.obtainedCerts.includes(cert.name);
  const statName = abil(cert.stat).n;

  return `
    <label style="display:block; background:#050830; border:1px solid ${isChecked ? 'var(--gold)' : 'var(--frame)'}; border-radius:4px; padding:8px 10px; cursor:pointer;">
      <div style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" onchange="toggleCert('${esc(cert.name)}', '${cert.stat}', ${cert.exp})" ${isChecked ? 'checked' : ''} style="accent-color:var(--gold);">
        <span style="color:${isChecked ? 'var(--gold)' : 'var(--text)'}; font-weight:bold; font-size:14px;">
          ${esc(cert.name)}
        </span>
        <span style="font-size:11px; border:1px solid var(--dim); padding:0 4px; color:var(--dim); margin-left:auto;">
          ${statName} +${cert.exp}XP
        </span>
      </div>
      <p class="dim" style="font-size:12px; margin-top:4px; line-height:1.4;">${esc(cert.desc)}</p>
    </label>
  `;
}

window.toggleCert = function(certName, statKey, expVal) {
  const idx = state.obtainedCerts.indexOf(certName);
  const logKey = `資格・スキル【${certName}】を取得した！`;

  if (idx === -1) {
    state.obtainedCerts.push(certName);
    state.entries.push({
      t: Date.now(),
      text: logKey,
      mood: 'good',
      gains: [{ k: statKey, v: expVal }]
    });
  } else {
    state.obtainedCerts.splice(idx, 1);
    state.entries = state.entries.filter(e => e.text !== logKey);
  }

  save();
  renderStatus();
  show('status');
};

function renderDiary() {
  const groupDays = () => {
    const g = {};
    state.entries.slice().sort((a, b) => a.t - b.t).forEach(e => (g[dayKey(e.t)] ??= []).push(e));
    return g;
  };
  const groups = groupDays(), keys = Object.keys(groups), today = dayKey(Date.now());
  $('#diary').innerHTML = keys.reverse().map((k, i) => {
    const es = groups[k], t = total(es), sum = Object.values(t).reduce((a, b) => a + b, 0);
    const head = `<div class="day">冒険の記録 第${keys.length - i}日 ${k}${k === today ? ' （今日）' : ''}</div>`;
    const loot = `<div class="loot"><span>獲得経験値 ${sum}XP</span>${ABIL.filter(a => t[a.k]).map(a => `<span>${a.n} +${t[a.k]}</span>`).join('')}</div>`;
    return `<article class="page">${head}<h3>${k === today ? '今日の冒険' : '冒険の記録'}</h3>
      <p>${es.map(e => '「' + esc(e.text) + '」').join('')}</p>${loot}</article>`;
  }).join('') || '<div class="win"><p class="dim">まだ日誌はありません。最初の冒険を記しましょう。</p></div>';
}

function renderReview() {
  const days = +document.querySelector('[name=period]:checked').value, since = Date.now() - days * 864e5;
  const es = state.entries.filter(e => e.t >= since), t = total(es), sum = Object.values(t).reduce((a, b) => a + b, 0), top = sorted(t)[0];
  $('#sumline').innerHTML = es.length ? `${days === 7 ? 'この1週間' : 'この1か月'}で<b>${es.length}件</b>の冒険を記し、合計<b style="color:var(--gold)">${sum}XP</b>を獲得。最も伸びたのは<b>${top.n}</b>です。` : 'この期間の記録はまだありません。';
  radar($('#radar2'), t);
  $('#log').innerHTML = state.entries.slice().reverse().map(e => {
    const d = new Date(e.t);
    return `<div class="entry"><small>${d.getMonth() + 1}/${d.getDate()}${e.sample ? '<span class="sample">サンプル</span>' : ''}</small><span class="body">${esc(e.text)}</span>
    <span>${e.gains.map(g => `<span class="tag">${abil(g.k).n} +${g.v}</span>`).join('')}</span></div>`;
  }).join('') || '<p class="dim">まだ記録がありません。</p>';
  $('#clearSample').hidden = !state.entries.some(e => e.sample);
}

function show(v) {
  document.querySelectorAll('[data-view]').forEach(s => s.hidden = s.dataset.view !== v);
  document.querySelectorAll('.menu button').forEach(b => b.setAttribute('aria-selected', String((v === 'judge' ? 'record' : v) === b.dataset.tab)));
  const li = lvInfo(), top = sorted(total(state.entries))[0];
  const currentJobObj = JOBS.find(j => j.id === state.currentJob);

  $('#heroName').textContent = hero();
  $('#cls').textContent = currentJobObj ? `〈${currentJobObj.name}〉` : `〈${top.cls}〉`;
  $('#lv').textContent = 'Lv.' + li.lv;
  $('#lvbar').style.width = li.pct + '%';
  $('#nextxp').textContent = '次まで' + li.rest;

  if (v === 'judge' && last) renderJudge();
  if (v === 'status') renderStatus();
  if (v === 'diary') renderDiary();
  if (v === 'review') renderReview();
  window.scrollTo(0, 0);
}

function renderJudge() {
  const loading = !last || last.loading;
  ['#gains', '#reframe', '#next'].forEach(s => $(s).hidden = loading);
  document.querySelector('#toDiary').hidden = document.querySelector('#again').hidden = loading;

  const { entry, neg, lvUp } = last;
  const lines = [];
  if (neg) lines.push(`<p class="foe">〈${foeOf(entry)}〉があらわれた！</p>`);
  lines.push(`<p>${esc(hero())}は「${esc(entry.text)}」${neg ? 'に立ち向かった！' : 'をやりとげた！'}</p>`);
  if (neg) lines.push(`<p>〈${foeOf(entry)}〉をたおした！</p>`);
  lines.push(`<p style="color:var(--gold)">${gStr(entry).replace(/\+/g, ' の経験値 +')}を獲得！</p>`);

  $('#battle').innerHTML = lines.map((l, i) => l.replace('<p', '<p style="--i:' + i + '"')).join('');
  $('#gains').innerHTML = entry.gains.map(g => `<div class="gain"><b>${abil(g.k).n}</b><span class="pt">+${g.v} UP!</span></div>`).join('');
  const lu = $('#levelup');
  lu.hidden = !lvUp;
  if (lvUp) lu.textContent = `レベルアップ！ Lv.${lvUp[0]} → Lv.${lvUp[1]}`;

  const top = abil(entry.gains[0].k).n;
  $('#reframe').textContent = neg ? `つらい出来事も、${top}を鍛える材料になりました。向き合って記したこと自体が成長です。` : `今日の積み重ねが${top}に反映されました。続けるほど、数字と図に表れます。`;
  $('#next').textContent = '軍師の提案：' + sorted(total(state.entries)).pop().tip;
}

function submit() {
  const text = $('#text').value.trim();
  if (!text) { $('#text').focus(); return; }

  const mood = document.querySelector('[name=mood]:checked').value;
  const before = lvInfo().lv;

  const r = judge(text, mood);
  const entry = { t: Date.now(), text, mood, gains: r.gains };

  state.entries.push(entry);
  save();

  const after = lvInfo().lv;
  last = { entry, neg: r.neg, lvUp: after > before ? [before, after] : null };

  $('#text').value = '';
  show('judge');
}

/* アプリ起動処理 */
function startApp() {
  $('#examples').innerHTML = EXAMPLES.map(x => `<button type="button">${esc(x)}</button>`).join('');
  $('#examples').onclick = e => {
    if (e.target.tagName === 'BUTTON') {
      $('#text').value = e.target.textContent;
      $('#text').focus();
    }
  };
  $('#go').onclick = submit;
  $('#again').onclick = () => show('record');
  $('#toDiary').onclick = () => show('diary');
  document.querySelectorAll('.menu button').forEach(b => b.onclick = () => show(b.dataset.tab));
  document.querySelectorAll('[name=period]').forEach(r => r.onchange = renderReview);
  $('#nameIn').oninput = e => {
    state.name = e.target.value.trim();
    save();
    $('#heroName').textContent = hero();
  };
  $('#clearSample').onclick = () => {
    state.entries = state.entries.filter(e => !e.sample);
    save();
    show('review');
  };

  show('record');
}

startApp();
