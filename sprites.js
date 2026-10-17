/* ドット絵(勇者・怪物・装備)と、画面最上部の戦闘ステージ */
'use strict';

const HERO_ART = [
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '...khhhhhhhk....',
  '...khssssshk....',
  '...ksskskssk....',
  '...kssssssk.....',
  '....kkssskk.....',
  '...kbbbbbbbk....',
  '..ksbbbbbbbsk...',
  '..ksbbbbbbbsk...',
  '...kbbbbbbbk....',
  '....kppkppk.....',
  '....kppkppk.....',
  '....kwwkwwk.....',
  '....kkkkkkk.....'
];
const HERO_PAL = { k: '#1a1030', s: '#f2c9a0', h: '#c0561c', b: '#4a6fe0', p: '#3a3a6a', w: '#8a5a2a' };

/* 怪物は難易度(報酬XP)で5段階。tierOfXp 参照 */
const MONSTERS = [
  {
    name: 'スライム', pal: { k: '#10301c', g: '#4fd97a', h: '#a8f5c0', e: '#ffffff' },
    art: [
      '................', '................', '................',
      '......kkkk......', '....kkggggkk....', '...kgghggggggk..',
      '..kgggggggggggk.', '..kggekggekgggk.', '..kgggggggggggk.',
      '..kgggkkkkgggk..', '...kgggggggggk..', '....kkkkkkkkk...'
    ]
  },
  {
    name: 'ゴブリン', pal: { k: '#1a2a10', o: '#7fb84a', e: '#ffffff', r: '#c0392b', l: '#6b4a22' },
    art: [
      '................', '................', '...kk......kk...',
      '..kokkkkkkkkok..', '...kooooooook...', '...koekooekook..',
      '...koooooooook..', '....kokkkkokk...', '...kkrrrrrrkk...',
      '..kokrrrrrrkok..', '..kokrrrrrrkok..', '...kkrrrrrrkk...',
      '....kllkkllk....', '....kllkkllk....', '...kkkk..kkkk...'
    ]
  },
  {
    name: 'ゴーレム', pal: { k: '#1c1c28', g: '#8a90a0', m: '#5a8a4a', y: '#ffd34d' },
    art: [
      '................', '....kkkkkkkk....', '...kgggggggggk..',
      '...kgyygggyygk..', '...kgggggggggk..', '..kkkgggggggkkk.',
      '.kgggkkkkkkkgggk', '.kgmgkgggggkgmgk', '.kgggkgggmgkgggk',
      '.kgggkgggggkgggk', '.kkkkkgggggkkkkk', '....kgggkgggk...',
      '....kgmgkgggk...', '...kkkkkkkkkkk..'
    ]
  },
  {
    name: 'ドラゴン', pal: { k: '#2a0a10', r: '#d9473a', y: '#ffd34d', p: '#8a4ad0', w: '#f4f4ff', e: '#ffffff' },
    art: [
      '................', '.......kk.kk....', '......kwk.kwk...',
      '...kk.krrrrrk...', '..kppkrrerrrrk..', '.kpppkrrrrrrrrk.',
      '.kppkkrrrkkkkrk.', '..kkkrrrrrrrrk..', '....krryyyyrrk..',
      '...krryyyyyyrrk.', '...krryyyyyyrk..', '....krrkkkrrk...',
      '....kkk...kkk...'
    ]
  },
  {
    name: '魔王', pal: { k: '#14061e', v: '#7a3ab0', r: '#a8232f', y: '#ffd34d' },
    art: [
      'k..............k', 'kk....kkkk....kk', '.kk..kvvvvk..kk.',
      '..kkkvvvvvvkkk..', '...kvvyvvyvvk...', '...kvvvvvvvvk...',
      '...kvvkkkkvvk...', '..kkkvvvvvvkkk..', '.krrkkvvvvkkrrk.',
      '.krrrkvvvvkrrrk.', '.krrrrkvvkrrrrk.', '.krrrrrkkrrrrrk.',
      '..kkrrrrrrrrkk..', '....kkkkkkkk....'
    ]
  }
];
const MON_SCALE = [4, 4, 5, 5, 6];
const tierOfXp = xp => xp < 30 ? 0 : xp < 60 ? 1 : xp < 100 ? 2 : xp < 160 ? 3 : 4;

function drawGrid(ctx, rows, pal, ox, oy, s, flash) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || !pal[c]) continue;
      ctx.fillStyle = flash ? '#ffffff' : pal[c];
      ctx.fillRect(Math.round(ox + x * s), Math.round(oy + y * s), Math.ceil(s), Math.ceil(s));
    }
  }
}

/* 装備段階(0=なし〜3)に応じた勇者の描画。gear = {weapon, shield, armor, head, cape, aura} */
const GEAR_COLORS = {
  armor: ['#4a6fe0', '#9a6a3a', '#a8b0c0', '#f2c53d'],
  cape: [null, '#b03a3a', '#7a3ab0', '#e8b830'],
  shield: [null, '#8a5a2a', '#b0b8c8', '#f2c53d'],
  blade: ['#8a5a2a', '#c87840', '#dfe8f5', '#fff3a0']
};

function drawHero(ctx, ox, oy, s, gear, t, slash) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox + x * s), Math.round(oy + y * s), Math.ceil(w * s), Math.ceil(h * s)); };
  const g = gear || {};

  if (g.aura === 3) {
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffe680';
    ctx.beginPath(); ctx.arc(ox + 8 * s, oy + 9 * s, 11 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (g.cape) {
    const c = GEAR_COLORS.cape[g.cape];
    R(1, 8, 3, 7, c); R(0, 12, 2, 3, c);
  }

  drawGrid(ctx, HERO_ART, { ...HERO_PAL, b: GEAR_COLORS.armor[g.armor || 0] }, ox, oy, s);
  if (g.armor >= 2) { const c = GEAR_COLORS.armor[g.armor]; R(2, 8, 2, 2, c); R(11, 8, 2, 2, c); }

  if (g.head === 1) R(4, 3, 7, 1, '#d03030');
  if (g.head === 2) { R(3, 1, 9, 3, '#a8b0c0'); R(4, 4, 1, 1, '#a8b0c0'); R(10, 4, 1, 1, '#a8b0c0'); R(7, 1, 1, 3, '#dfe8f5'); }
  if (g.head === 3) {
    R(4, 1, 7, 2, '#f2c53d');
    R(4, 0, 1, 1, '#f2c53d'); R(7, 0, 1, 1, '#f2c53d'); R(10, 0, 1, 1, '#f2c53d');
    R(7, 1, 1, 1, '#d9473a'); R(5, 1, 1, 1, '#7fe8ff'); R(9, 1, 1, 1, '#7fe8ff');
  }

  if (g.shield) {
    const c = GEAR_COLORS.shield[g.shield];
    R(0, 8, 4, 6, '#1a1030'); R(0, 8, 3, 5, c);
    if (g.shield >= 2) R(1, 10, 1, 1, g.shield === 3 ? '#d9473a' : '#1a1030');
  }

  const bc = GEAR_COLORS.blade[g.weapon || 0];
  if (slash) {
    R(13, 9, 7, 1, bc); R(13, 8, 1, 3, '#8a5a2a');
  } else {
    const h = g.weapon ? 8 : 5;
    R(14, 11 - h, 1, h, bc); R(13, 10, 3, 1, '#8a5a2a'); R(14, 11, 1, 2, '#5a3a1a');
    if (g.weapon === 3) R(14, 1, 1, 1, '#ffffff');
  }

  const n = [0, 2, 4, 6][g.aura || 0];
  for (let i = 0; i < n; i++) {
    const a = t / 500 + i * 2 * Math.PI / n;
    ctx.fillStyle = i % 2 ? '#7fe8ff' : '#ffd34d';
    ctx.fillRect(Math.round(ox + 8 * s + Math.cos(a) * 9 * s), Math.round(oy + 8 * s + Math.sin(a) * 8 * s), 3, 3);
  }
}

/* ---------- 戦闘ステージ ---------- */
const Stage = (() => {
  const W = 320, H = 140, GROUND = 126, CYCLE = 2600, HERO_S = 5, HERO_X = 24;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cv, ctx, gear = {}, bosses = [], idx = 0, attacks = 0, lastCycle = 0;
  let t0 = performance.now(), spawnAt = t0, defeat = null, onChange = () => {};

  const cur = () => bosses[idx] || null;
  const notify = () => onChange(cur(), idx, bosses.length);

  function init(canvas, cb) {
    cv = canvas; ctx = cv.getContext('2d'); onChange = cb || onChange;
    ctx.imageSmoothingEnabled = false;
    requestAnimationFrame(frame);
  }
  function setGear(g) { gear = g || {}; }
  function setBosses(list) {
    const prev = cur() && cur().id;
    bosses = list;
    const keep = list.findIndex(b => b.id === prev);
    idx = keep >= 0 ? keep : 0;
    if (keep < 0) spawnAt = performance.now();
    notify();
  }
  function step(d) {
    if (bosses.length < 2) return;
    idx = (idx + d + bosses.length) % bosses.length;
    spawnAt = performance.now(); notify();
  }
  function playDefeat(boss, done) {
    defeat = { boss, start: performance.now(), done };
  }

  function bg(now) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a1050'); grad.addColorStop(1, '#2a3a8a');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 24; i++) {
      const x = (i * 97) % W, y = (i * 53) % 90;
      if ((i + Math.floor(now / 600)) % 5) ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#2d4a22'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#3d6a2e';
    for (let x = 0; x < W; x += 16) ctx.fillRect(x, GROUND, 8, 3);
  }

  function drawMonster(boss, x, y, flash, alpha) {
    const tier = boss.tier ?? tierOfXp(boss.xp), m = MONSTERS[tier], s = MON_SCALE[tier];
    const w = 16 * s, h = m.art.length * s;
    const ox = x ?? (W - 20 - w), oy = (y ?? 0) + GROUND - h;
    ctx.save(); ctx.globalAlpha = alpha ?? 1;
    drawGrid(ctx, m.art, m.pal, ox, oy, s, flash);
    ctx.restore();
    return { ox, oy, w, h, s };
  }

  function text(str, x, y, color, size) {
    ctx.fillStyle = '#05072a'; ctx.font = `${size}px DotGothic16, monospace`; ctx.textAlign = 'center';
    ctx.fillText(str, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!cv.offsetParent || document.hidden) return;
    bg(now);
    const heroY0 = GROUND - 16 * HERO_S;
    let dx = 0, slash = false, flash = false, knock = 0, hy = 0;
    const boss = defeat ? defeat.boss : cur();

    if (defeat) {
      const d = now - defeat.start;
      if (d < 400) { dx = 92; slash = true; flash = d > 120; knock = 4; }
      else { dx = 92; hy = -Math.abs(Math.sin(d / 150)) * 10; }
      drawHero(ctx, HERO_X + dx, heroY0 + hy, HERO_S, gear, now, slash);
      if (boss) {
        if (d < 400) drawMonster(boss, null, 0, flash, 1);
        else if (d < 1300) {
          const k = (d - 400) / 900;
          const r = drawMonster(boss, null, -k * 10, false, 1 - k);
          for (let i = 0; i < 26; i++) {
            const a = i * 0.9, sp = 20 + (i % 5) * 18;
            ctx.fillStyle = i % 2 ? '#ffd34d' : '#ffffff';
            ctx.fillRect(r.ox + r.w / 2 + Math.cos(a) * sp * k, r.oy + r.h / 2 + Math.sin(a) * sp * k - 20 * k, 3, 3);
          }
        }
      }
      if (d > 350) text('撃破!', W / 2, 52, '#ffd34d', 26);
      if (d > 1500) { const f = defeat.done; defeat = null; spawnAt = now; f && f(); }
      return;
    }

    const p = reduce ? 0 : (now - t0) % CYCLE;
    const cyc = reduce ? 0 : Math.floor((now - t0) / CYCLE);
    if (cyc !== lastCycle) {
      lastCycle = cyc; attacks++;
      if (attacks % 3 === 0) step(1);
    }
    if (p >= 900 && p < 1200) dx = 92 * (p - 900) / 300;
    else if (p >= 1200 && p < 1500) { dx = 92; slash = true; }
    else if (p >= 1500 && p < 2000) dx = 92 * (1 - (p - 1500) / 500);
    flash = p >= 1250 && p < 1400;
    knock = flash ? 4 : 0;
    const bob = Math.round(Math.sin(now / 300) * 2);

    drawHero(ctx, HERO_X + Math.round(dx), heroY0 + (dx ? 0 : bob), HERO_S, gear, now, slash);
    if (slash) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) ctx.fillRect(HERO_X + dx + 16 * HERO_S + i * 7, heroY0 + 20 + i * 9, 8, 4);
    }

    if (boss) {
      const s = MON_SCALE[boss.tier ?? tierOfXp(boss.xp)];
      const e = Math.min(1, (now - spawnAt) / 500);
      drawMonster(boss, W - 20 - 16 * s + (1 - e) * 120 + knock, flash ? 0 : bob, flash, e);
    } else {
      text('ボスを えらぼう', W - 90, 70, '#a9b2f0', 14);
    }
  }

  return { init, setGear, setBosses, step, playDefeat };
})();
