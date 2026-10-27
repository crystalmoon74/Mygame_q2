'use strict';

/* =========================================================
   랜드마크 수호대 - 세계 도시의 랜드마크를 지켜라!
   ========================================================= */

const W = 480;
const H = 800;
const GROUND = 770;
const LM = { x: 240, top: 500, bottom: GROUND, left: 140, right: 340 }; // 랜드마크 피격 영역
const PLAYER_AREA = { minX: 20, maxX: W - 20, minY: 360, maxY: GROUND - 14 };

// 도시 설정: time = 제한시간(1~3분), waves = 단계별 [일반 적, 폭탄 적]
const CITIES = [
  { city: '서울', country: '대한민국', landmark: 'N서울타워', time: 60,
    sky: ['#1b2a4e', '#5b4a7a', '#f39c6b'], ground: '#1f3326', skyline: '#14203a',
    waves: [[4, 1], [5, 2], [6, 2]], draw: drawSeoul },
  { city: '파리', country: '프랑스', landmark: '에펠탑', time: 90,
    sky: ['#0f1638', '#2d2f6b', '#7a5aa0'], ground: '#232a2f', skyline: '#121836',
    waves: [[6, 2], [7, 3], [9, 4]], draw: drawParis },
  { city: '런던', country: '영국', landmark: '빅벤', time: 120,
    sky: ['#2a3442', '#4b5a6e', '#8796a8'], ground: '#2b3138', skyline: '#232b38',
    waves: [[7, 3], [9, 4], [10, 5]], draw: drawLondon },
  { city: '뉴욕', country: '미국', landmark: '자유의 여신상', time: 150,
    sky: ['#13294b', '#c0567a', '#ffb36b'], ground: '#1d3550', skyline: '#1a2140',
    waves: [[8, 4], [10, 5], [12, 6]], draw: drawNewYork },
  { city: '카이로', country: '이집트', landmark: '기자 피라미드', time: 180,
    sky: ['#3a1f4f', '#c4553a', '#ffcf6b'], ground: '#b98a4a', skyline: '#5a3a3a',
    waves: [[9, 5], [12, 6], [14, 7]], draw: drawCairo },
];

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const overlay = $('overlay');
const banner = $('banner');
const ui = {
  cityName: $('cityName'), landmarkName: $('landmarkName'), timer: $('timer'),
  stageText: $('stageText'), enemyText: $('enemyText'),
  status: $('status'), statusText: $('statusText'),
  playerBar: $('playerBar'), playerHpText: $('playerHpText'),
  landmarkBar: $('landmarkBar'), landmarkHpText: $('landmarkHpText'),
  score: $('scoreText'), bombBtn: $('bombBtn'), bombCount: $('bombCount'),
};

/* ---------- 유틸 ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function loadBest() {
  try { return Number(localStorage.getItem('landmark-best')) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('landmark-best', String(v)); } catch (e) { /* 무시 */ }
}

/* ---------- 게임 상태 ---------- */
let S = null;
let T = 0; // 애니메이션용 누적 시간
let viewScale = 1;
let dpr = 1;

function newGame() {
  S = { cityIdx: 0, score: 0, kills: 0, saved: 0, phase: 'ready' };
  setupCity(0);
  S.phase = 'ready';
  showStartScreen();
}

function setupCity(idx) {
  const c = CITIES[idx];
  S.cityIdx = idx;
  S.timeLeft = c.time;
  S.waveIdx = 0;
  S.queue = [];
  S.spawnTimer = 0;
  S.enemies = [];
  S.bullets = [];
  S.eBullets = [];
  S.particles = [];
  S.pickups = [];
  S.shake = 0;
  S.lmFlash = 0;
  S.flash = 0;
  S.bombs = 2;
  S.bossWarn = 0;
  S.player = { x: W / 2, y: 640, r: 14, hp: 100, maxHp: 100, fireCd: 0, inv: 0 };
  S.landmark = { hp: 100, max: 100 };
  // 예외상황: 랜덤으로 거대한 적 2명이 갑자기 등장 (도시마다 70% 확률, 등장 시점도 랜덤)
  S.boss = Math.random() < 0.7 ? { at: c.time * rand(0.2, 0.55), fired: false } : null;
  S.skyline = makeSkyline();
  S.stars = Array.from({ length: 40 }, () => ({ x: rand(0, W), y: rand(0, 380), s: rand(0.5, 1.8) }));
}

function makeSkyline() {
  const list = [];
  let x = -10;
  while (x < W + 10) {
    const w = rand(26, 60);
    list.push({ x, w, h: rand(60, 190), win: Math.random() < 0.7 });
    x += w + rand(2, 10);
  }
  return list;
}

function beginCity() {
  S.phase = 'play';
  hideOverlay();
  startWave(0);
}

function startWave(i) {
  const c = CITIES[S.cityIdx];
  const [grunts, bombers] = c.waves[i];
  const q = [];
  for (let k = 0; k < grunts; k++) q.push('grunt');
  for (let k = 0; k < bombers; k++) q.push('bomber');
  S.queue = shuffle(q);
  S.waveIdx = i;
  S.spawnTimer = 1.4;
  showBanner(`⚔️ 단계 ${i + 1} / ${c.waves.length}`, 'wave', 1.4);
}

/* ---------- 적 생성 ---------- */
function makeEnemy(type, opts = {}) {
  const lv = S.cityIdx;
  if (type === 'grunt') {
    const hp = 3 + lv;
    return { type, x: rand(40, W - 40), y: -30, r: 18, hp, maxHp: hp, ty: rand(60, 300),
      vx: (Math.random() < 0.5 ? -1 : 1) * rand(35, 60 + lv * 10), t: rand(0, 6),
      fireCd: rand(1.2, 2.6), flash: 0, score: 100 };
  }
  if (type === 'bomber') {
    const hp = 2 + Math.floor(lv / 2);
    return { type, x: rand(40, W - 40), y: -30, r: 16, hp, maxHp: hp,
      speed: 55 + lv * 9, tx: LM.x + rand(-70, 70), ty: rand(600, 700), t: 0, flash: 0, score: 150 };
  }
  // giant (거대한 적)
  const hp = 40 + lv * 18;
  return { type: 'giant', x: opts.x, y: -70, r: 42, hp, maxHp: hp, ty: opts.ty,
    vx: opts.dir * (45 + lv * 6), t: 0, fireCd: rand(1.5, 2.5), bombCd: rand(2.5, 4), flash: 0, score: 1500 };
}

function triggerBoss() {
  S.boss.fired = true;
  S.bossWarn = 1.8;
  S.shake = 10;
  showBanner('⚠️ 거대한 적 2명 출현!', 'boss', 2.2);
}

/* ---------- 업데이트 ---------- */
function update(dt) {
  const c = CITIES[S.cityIdx];

  // 제한 시간
  S.timeLeft -= dt;
  if (S.timeLeft <= 0) {
    S.timeLeft = 0;
    return gameOver('시간 초과! 제한 시간 안에 나쁜놈들을 모두 물리치지 못했어요.');
  }

  // 거대한 적 예외상황
  if (S.boss && !S.boss.fired && c.time - S.timeLeft >= S.boss.at) triggerBoss();
  if (S.bossWarn > 0) {
    S.bossWarn -= dt;
    if (S.bossWarn <= 0) {
      S.enemies.push(makeEnemy('giant', { x: 120, ty: 130, dir: 1 }));
      S.enemies.push(makeEnemy('giant', { x: 360, ty: 210, dir: -1 }));
    }
  }

  // 적 등장
  if (S.queue.length) {
    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0) {
      S.enemies.push(makeEnemy(S.queue.shift()));
      S.spawnTimer = Math.max(0.45, 1.05 - S.cityIdx * 0.12) * rand(0.7, 1.3);
    }
  }

  updatePlayer(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateEffects(dt);

  if (S.player.hp <= 0) return gameOver('당신이 쓰러졌어요. 나쁜놈들의 공격을 너무 많이 받았습니다.');
  if (S.landmark.hp <= 0) return gameOver(`${c.landmark}이(가) 파괴되었어요!`);

  // 단계 진행 / 도시 방어 성공 판정
  const regular = S.enemies.filter((e) => e.type !== 'giant').length;
  if (S.queue.length === 0 && regular === 0) {
    if (S.waveIdx < c.waves.length - 1) {
      startWave(S.waveIdx + 1);
    } else if (S.boss && !S.boss.fired) {
      triggerBoss(); // 단계를 일찍 끝내도 예정된 거대한 적은 등장
    } else if (S.enemies.length === 0 && S.bossWarn <= 0) {
      cityClear();
    }
  }
}

const keys = new Set();
const drag = { active: false, id: null, lx: 0, ly: 0 };

function updatePlayer(dt) {
  const p = S.player;
  let mx = 0, my = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * 300 * dt;
    p.y += (my / len) * 300 * dt;
  }
  p.x = clamp(p.x, PLAYER_AREA.minX, PLAYER_AREA.maxX);
  p.y = clamp(p.y, PLAYER_AREA.minY, PLAYER_AREA.maxY);
  if (p.inv > 0) p.inv -= dt;

  // 자동 사격: 가장 가까운 적을 조준
  p.fireCd -= dt;
  if (p.fireCd <= 0) {
    const lv = S.cityIdx;
    p.fireCd = 0.2 - lv * 0.015;
    let target = null, best = Infinity;
    for (const e of S.enemies) {
      if (e.y < -10) continue;
      const d = dist(p, e);
      if (d < best) { best = d; target = e; }
    }
    let base = -Math.PI / 2;
    if (target) {
      // 적의 이동을 예측해서 조준
      const t = best / 620;
      base = Math.atan2(target.y + (target.mvy || 0) * t - p.y, target.x + (target.mvx || 0) * t - p.x);
    }
    const shots = [1, 2, 2, 3, 3][lv];
    for (let i = 0; i < shots; i++) {
      const a = base + (i - (shots - 1) / 2) * 0.1;
      S.bullets.push({ x: p.x, y: p.y - 10, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, r: 4, dmg: 1 });
    }
  }
}

function enemyShoot(e, target, speed, dmg, r, spread = 0) {
  let tx, ty;
  if (target === 'landmark') { tx = LM.x + rand(-60, 60); ty = rand(600, 720); }
  else { tx = S.player.x; ty = S.player.y; }
  const a = Math.atan2(ty - e.y, tx - e.x) + spread;
  const b = { x: e.x, y: e.y + e.r * 0.5, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, target };
  if (target === 'landmark') b.life = Math.hypot(tx - e.x, ty - e.y) / speed;
  S.eBullets.push(b);
}

function updateEnemies(dt) {
  const lv = S.cityIdx;
  const p = S.player;
  for (const e of S.enemies) {
    const ox = e.x, oy = e.y;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;

    if (e.type === 'grunt') {
      if (e.y < e.ty) e.y += 90 * dt;
      else e.y += Math.sin(e.t * 2) * 20 * dt;
      e.x += e.vx * dt;
      if (e.x < 25 || e.x > W - 25) { e.vx *= -1; e.x = clamp(e.x, 25, W - 25); }
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.y > 0) {
        // 대부분은 나를 공격, 일부는 랜드마크를 공격
        enemyShoot(e, Math.random() < 0.25 ? 'landmark' : 'player', 170 + lv * 15, 7, 5);
        e.fireCd = rand(1.5, 2.6) - lv * 0.15;
      }
    } else if (e.type === 'bomber') {
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        // 랜드마크에 자폭 공격
        damageLandmark(9);
        explode(e.x, e.y, '#ff7a3d', 26);
        e.dead = true;
        continue;
      }
      e.x += (dx / d) * e.speed * dt + Math.sin(e.t * 5) * 30 * dt;
      e.y += (dy / d) * e.speed * dt;
    } else if (e.type === 'giant') {
      if (e.y < e.ty) e.y += 55 * dt;
      else {
        e.x += e.vx * dt;
        if (e.x < 60 || e.x > W - 60) { e.vx *= -1; e.x = clamp(e.x, 60, W - 60); }
      }
      e.fireCd -= dt;
      e.bombCd -= dt;
      if (e.y > 40) {
        if (e.fireCd <= 0) {
          for (let k = -2; k <= 2; k++) enemyShoot(e, 'player', 160 + lv * 10, 9, 6, k * 0.22);
          e.fireCd = rand(2, 2.8) - lv * 0.12;
        }
        if (e.bombCd <= 0) {
          enemyShoot(e, 'landmark', 120, 8, 9);
          e.bombCd = rand(3.5, 5);
        }
      }
    }

    e.mvx = (e.x - ox) / dt;
    e.mvy = (e.y - oy) / dt;

    // 나와 몸통 충돌
    if (!e.dead && dist(e, p) < e.r + p.r) {
      if (p.inv <= 0) hurtPlayer(e.type === 'giant' ? 20 : 14);
      if (e.type !== 'giant') hitEnemy(e, 3);
    }
  }
  S.enemies = S.enemies.filter((e) => !e.dead);
}

function updateBullets(dt) {
  for (const b of S.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
    for (const e of S.enemies) {
      if (!e.dead && Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r) {
        hitEnemy(e, b.dmg);
        b.dead = true;
        sparks(b.x, b.y, '#fff3a0', 3);
        break;
      }
    }
  }
  S.bullets = S.bullets.filter((b) => !b.dead);
  S.enemies = S.enemies.filter((e) => !e.dead);

  const p = S.player;
  for (const b of S.eBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.target === 'landmark') {
      b.life -= dt;
      if (b.life <= 0) {
        damageLandmark(b.dmg);
        explode(b.x, b.y, '#ffb347', 12);
        b.dead = true;
        continue;
      }
    }
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 3) {
      if (p.inv <= 0) hurtPlayer(b.dmg);
      b.dead = true;
      continue;
    }
    if (b.y > H + 20 || b.x < -20 || b.x > W + 20 || b.y < -40) b.dead = true;
  }
  S.eBullets = S.eBullets.filter((b) => !b.dead);
}

function updatePickups(dt) {
  const p = S.player;
  for (const k of S.pickups) {
    k.y += 70 * dt;
    k.t += dt;
    if (dist(k, p) < p.r + 14) {
      p.hp = Math.min(p.maxHp, p.hp + 15);
      sparks(k.x, k.y, '#ff6b8a', 10);
      k.dead = true;
    } else if (k.y > GROUND) k.dead = true;
  }
  S.pickups = S.pickups.filter((k) => !k.dead);
}

function updateEffects(dt) {
  for (const pt of S.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += (pt.g || 0) * dt;
    pt.life -= dt;
  }
  S.particles = S.particles.filter((pt) => pt.life > 0);
  if (S.shake > 0) S.shake = Math.max(0, S.shake - 30 * dt);
  if (S.lmFlash > 0) S.lmFlash -= dt;
  if (S.flash > 0) S.flash -= dt;

  // 랜드마크가 손상되면 연기와 불꽃
  if (S.phase === 'play') {
    const ratio = S.landmark.hp / S.landmark.max;
    if (ratio < 0.6 && Math.random() < (1 - ratio) * 0.5) {
      S.particles.push({ x: LM.x + rand(-70, 70), y: rand(560, 740), vx: rand(-8, 8), vy: rand(-40, -20),
        life: 1.6, max: 1.6, size: rand(6, 14), color: ratio < 0.3 ? '#ff6a2a' : '#777', smoke: true });
    }
  }
}

/* ---------- 전투 처리 ---------- */
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    S.kills++;
    S.score += e.score;
    explode(e.x, e.y, e.type === 'giant' ? '#d36bff' : '#ff5e5e', e.type === 'giant' ? 60 : 18);
    if (e.type === 'giant') S.shake = 14;
    if (e.type !== 'giant' && Math.random() < 0.08) S.pickups.push({ x: e.x, y: e.y, t: 0 });
    if (e.type === 'giant') S.pickups.push({ x: e.x, y: e.y, t: 0 });
  }
}

function hurtPlayer(dmg) {
  S.player.hp = Math.max(0, S.player.hp - dmg);
  S.player.inv = 0.7;
  S.shake = Math.max(S.shake, 7);
  sparks(S.player.x, S.player.y, '#7fd3ff', 12);
  vibrate(40);
}

function damageLandmark(dmg) {
  S.landmark.hp = Math.max(0, S.landmark.hp - dmg);
  S.lmFlash = 0.25;
  S.shake = Math.max(S.shake, 6);
}

function useBomb() {
  if (!S || S.phase !== 'play' || S.bombs <= 0) return;
  S.bombs--;
  S.flash = 0.35;
  S.shake = 12;
  for (const b of S.eBullets) sparks(b.x, b.y, '#ffd166', 2);
  S.eBullets = [];
  for (const e of S.enemies) hitEnemy(e, 8);
  S.enemies = S.enemies.filter((e) => !e.dead);
  vibrate(80);
}

function explode(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 220);
    S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), max: 0.8,
      size: rand(2, 5), color });
  }
}
function sparks(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(30, 120);
    S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.35), max: 0.35,
      size: rand(1.5, 3), color });
  }
}
function vibrate(ms) {
  try {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && active) navigator.vibrate(ms);
  } catch (e) { /* 무시 */ }
}

/* ---------- 종료 / 진행 ---------- */
function remainingEnemies() {
  const c = CITIES[S.cityIdx];
  let n = S.queue.length + S.enemies.length;
  for (let i = S.waveIdx + 1; i < c.waves.length; i++) n += c.waves[i][0] + c.waves[i][1];
  if (S.boss && (!S.boss.fired || S.bossWarn > 0)) n += 2;
  return n;
}

function cityClear() {
  const c = CITIES[S.cityIdx];
  const timeBonus = Math.ceil(S.timeLeft) * 10;
  const lmBonus = Math.ceil(S.landmark.hp) * 20;
  S.score += timeBonus + lmBonus;
  S.saved++;
  S.eBullets = [];
  if (S.cityIdx >= CITIES.length - 1) {
    S.phase = 'win';
    showResult(true, `모든 도시의 랜드마크를 지켜냈어요! 당신은 진정한 세계의 수호자입니다.`);
    return;
  }
  S.phase = 'between';
  const next = CITIES[S.cityIdx + 1];
  overlay.innerHTML = `
    <div class="card">
      <div class="big-emoji">🎉</div>
      <h2>${c.city} · ${c.landmark} 방어 성공!</h2>
      <span class="result-tag clear">랜드마크 안전 · ${S.saved}/${CITIES.length} 도시 수호</span>
      <div class="stats">
        <div><small>남은 시간 보너스</small><b>+${timeBonus}</b></div>
        <div><small>랜드마크 보존 보너스</small><b>+${lmBonus}</b></div>
        <div><small>현재 점수</small><b>${S.score}</b></div>
        <div><small>물리친 적</small><b>${S.kills}</b></div>
      </div>
      ${routeHtml(S.cityIdx + 1)}
      <p>다음 목적지: <b>${next.city}(${next.country})</b>의 <b>${next.landmark}</b><br>
      제한 시간 ${fmtTime(next.time)} · 무기가 강화됩니다!</p>
      <button class="btn" data-action="next">다음 도시로 ✈️</button>
    </div>`;
  showOverlay();
}

function gameOver(reason) {
  S.phase = 'over';
  S.shake = 12;
  showResult(false, reason);
}

function showResult(win, reason) {
  const best = Math.max(loadBest(), S.score);
  saveBest(best);
  const c = CITIES[S.cityIdx];
  overlay.innerHTML = `
    <div class="card">
      <div class="big-emoji">${win ? '🏆' : '💥'}</div>
      <h1>${win ? '세계 수호 성공!' : '방어 실패'}</h1>
      <span class="result-tag ${win ? 'win' : 'fail'}">${win ? '모든 랜드마크를 지켜냈습니다' : `${c.city} · ${c.landmark} 방어 실패`}</span>
      <p>${reason}</p>
      <div class="stats">
        <div><small>최종 점수</small><b>${S.score}</b></div>
        <div><small>최고 점수</small><b>${best}</b></div>
        <div><small>지켜낸 도시</small><b>${S.saved} / ${CITIES.length}</b></div>
        <div><small>물리친 적</small><b>${S.kills}</b></div>
      </div>
      ${routeHtml(win ? CITIES.length : S.cityIdx)}
      <button class="btn retry" data-action="retry">🔄 다시하기</button>
    </div>`;
  showOverlay();
}

function routeHtml(nowIdx) {
  return `<div class="route">${CITIES.map((c, i) =>
    `<span class="${i < nowIdx ? 'done' : i === nowIdx ? 'now' : ''}">${i < nowIdx ? '✅' : i === nowIdx ? '📍' : '🔒'} ${c.city}</span>`
  ).join('')}</div>`;
}

function showStartScreen() {
  overlay.innerHTML = `
    <div class="card">
      <div class="big-emoji">🛡️🌍</div>
      <h1>랜드마크 수호대</h1>
      <p>세계 각 도시의 랜드마크가 나쁜놈들에게 공격받고 있어요!</p>
      <ol class="rules">
        <li>나는 랜드마크 바로 앞에서 싸우고, 나쁜놈들은 <b>나와 랜드마크</b>를 공격해요.</li>
        <li>도시마다 <b>3단계</b>의 적이 몰려와요. 제한 시간(<b>1~3분</b>) 안에 <b>전부</b> 물리치면 방어 성공!</li>
        <li>방어에 성공하면 <b>다음 도시</b>의 랜드마크로 이동해요.</li>
        <li>⚠️ 예외상황: 랜덤으로 <b>거대한 적 2명</b>이 갑자기 나타나요.</li>
        <li>내 체력 또는 랜드마크 체력이 0이 되거나, 시간이 끝나면 실패!</li>
      </ol>
      ${routeHtml(0)}
      <p><b>조작</b> · 화면을 드래그(또는 방향키/WASD)해서 이동, 사격은 자동<br>💥 폭탄(스페이스)은 도시마다 2번: 적 탄환 제거 + 전체 공격</p>
      <button class="btn" data-action="start">게임 시작 ▶</button>
    </div>`;
  showOverlay();
}

function showOverlay() { overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }

let bannerTimer = null;
function showBanner(text, cls, sec) {
  banner.textContent = text;
  banner.className = `banner ${cls} show`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), sec * 1000);
}

overlay.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  if (act === 'start') beginCity();
  else if (act === 'next') { setupCity(S.cityIdx + 1); beginCity(); }
  else if (act === 'retry') { newGame(); setupCity(0); beginCity(); }
});

/* ---------- HUD / 상태 표시 ---------- */
let lastStatus = '';
function computeStatus() {
  if (S.phase === 'ready') return ['ready', '⏸ 대기 중 · 시작 버튼을 눌러주세요'];
  if (S.phase === 'between') return ['clear', '✅ 방어 성공! 랜드마크가 안전해요'];
  if (S.phase === 'win') return ['win', '🏆 모든 랜드마크 수호 완료!'];
  if (S.phase === 'over') return ['fail', '❌ 방어 실패'];
  if (S.bossWarn > 0 || S.enemies.some((e) => e.type === 'giant')) return ['boss', '⚠️ 거대한 적 출현! 집중 공격!'];
  const p = S.player.hp / S.player.maxHp;
  const l = S.landmark.hp / S.landmark.max;
  if (p <= 0.3) return ['danger', '🚨 위험! 내 체력이 부족해요'];
  if (l <= 0.3) return ['danger', '🚨 위험! 랜드마크가 무너지기 직전'];
  if (S.timeLeft <= 15) return ['warn', '⏰ 시간 부족! 서둘러요'];
  if (p <= 0.6 || l <= 0.6) return ['caution', '⚡ 주의 · 피해를 입고 있어요'];
  return ['ok', '🛡️ 전투 중 · 안정적으로 방어 중'];
}

function barColor(r) {
  return r > 0.6 ? 'var(--ok)' : r > 0.3 ? 'var(--caution)' : 'var(--danger)';
}

function updateHud() {
  const c = CITIES[S.cityIdx];
  ui.cityName.textContent = `${c.city}`;
  ui.landmarkName.textContent = `${c.country} · ${c.landmark}`;
  ui.timer.textContent = fmtTime(S.timeLeft);
  ui.timer.classList.toggle('low', S.phase === 'play' && S.timeLeft <= 15);
  ui.stageText.textContent = `단계 ${S.waveIdx + 1}/${c.waves.length}`;
  ui.enemyText.textContent = `남은 적 ${remainingEnemies()}`;

  const pr = S.player.hp / S.player.maxHp;
  const lr = S.landmark.hp / S.landmark.max;
  ui.playerBar.style.width = `${pr * 100}%`;
  ui.playerBar.style.backgroundColor = barColor(pr);
  ui.playerHpText.textContent = Math.ceil(S.player.hp);
  ui.landmarkBar.style.width = `${lr * 100}%`;
  ui.landmarkBar.style.backgroundColor = barColor(lr);
  ui.landmarkHpText.textContent = Math.ceil(S.landmark.hp);
  ui.score.textContent = S.score;
  ui.bombCount.textContent = S.bombs;
  ui.bombBtn.disabled = S.phase !== 'play' || S.bombs <= 0;

  const [cls, text] = computeStatus();
  const key = cls + text;
  if (key !== lastStatus) {
    lastStatus = key;
    ui.status.className = `status s-${cls}`;
    ui.statusText.textContent = text;
  }
}

/* ---------- 그리기 ---------- */
function render() {
  const k = viewScale * dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.save();
  if (S.shake > 0) ctx.translate(rand(-S.shake, S.shake) * 0.5, rand(-S.shake, S.shake) * 0.5);

  const c = CITIES[S.cityIdx];
  drawBackground(c);

  // 랜드마크
  ctx.save();
  if (S.lmFlash > 0) ctx.translate(rand(-3, 3), 0);
  c.draw(ctx, LM.x, GROUND);
  if (S.lmFlash > 0) {
    ctx.globalAlpha = S.lmFlash * 1.6;
    ctx.fillStyle = 'rgba(255,40,40,0.35)';
    ctx.fillRect(LM.left, LM.top, LM.right - LM.left, LM.bottom - LM.top);
  }
  ctx.restore();

  // 바닥
  ctx.fillStyle = c.ground;
  ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);

  for (const pt of S.particles) if (pt.smoke) drawParticle(pt);
  for (const k2 of S.pickups) drawPickup(k2);
  for (const e of S.enemies) drawEnemy(e);
  for (const b of S.bullets) {
    ctx.fillStyle = '#fff6a8';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of S.eBullets) {
    ctx.fillStyle = b.target === 'landmark' ? '#ff8c1a' : '#ff3b5c';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  if (S.phase !== 'over' || S.player.hp > 0) drawPlayer(S.player);
  for (const pt of S.particles) if (!pt.smoke) drawParticle(pt);

  ctx.restore();

  if (S.flash > 0) {
    ctx.fillStyle = `rgba(255,240,200,${S.flash * 2})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (S.bossWarn > 0) {
    ctx.fillStyle = `rgba(200,0,255,${0.15 + Math.sin(T * 20) * 0.1})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground(c) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, c.sky[0]);
  g.addColorStop(0.6, c.sky[1]);
  g.addColorStop(1, c.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, GROUND + 20);

  ctx.fillStyle = '#fff';
  for (const s of S.stars) {
    ctx.globalAlpha = 0.4 + Math.sin(T * 2 + s.x) * 0.3;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // 달/해
  ctx.fillStyle = 'rgba(255,240,200,0.85)';
  ctx.beginPath(); ctx.arc(400, 110, 26, 0, Math.PI * 2); ctx.fill();

  // 도시 스카이라인
  ctx.fillStyle = c.skyline;
  for (const b of S.skyline) {
    ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
  }
  ctx.fillStyle = 'rgba(255,220,130,0.35)';
  for (const b of S.skyline) {
    if (!b.win) continue;
    for (let y = GROUND - b.h + 8; y < GROUND - 10; y += 14) {
      for (let x = b.x + 5; x < b.x + b.w - 6; x += 10) {
        if (((x * 7 + y * 13) | 0) % 5 < 2) ctx.fillRect(x, y, 4, 6);
      }
    }
  }
}

function drawParticle(pt) {
  ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1) * (pt.smoke ? 0.5 : 1);
  ctx.fillStyle = pt.color;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.smoke ? pt.size * (1.6 - pt.life / pt.max) : pt.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawPickup(k) {
  const y = k.y + Math.sin(k.t * 6) * 2;
  ctx.fillStyle = '#ff4f7b';
  ctx.beginPath();
  ctx.moveTo(k.x, y + 8);
  ctx.bezierCurveTo(k.x - 14, y - 2, k.x - 7, y - 12, k.x, y - 4);
  ctx.bezierCurveTo(k.x + 7, y - 12, k.x + 14, y - 2, k.x, y + 8);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPlayer(p) {
  if (p.inv > 0 && Math.floor(T * 20) % 2 === 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  // 보호막
  ctx.strokeStyle = 'rgba(120,200,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
  // 엔진 불꽃
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 22 + Math.sin(T * 40) * 4); ctx.lineTo(5, 12); ctx.fill();
  // 기체
  ctx.fillStyle = '#4fb3ff';
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(16, 12); ctx.lineTo(5, 8); ctx.lineTo(0, 14); ctx.lineTo(-5, 8); ctx.lineTo(-16, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8f6ff';
  ctx.beginPath(); ctx.ellipse(0, -4, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawAngryEyes(x, y, s) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - s, y, s * 0.7, 0, Math.PI * 2); ctx.arc(x + s, y, s * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(x - s, y + 1, s * 0.35, 0, Math.PI * 2); ctx.arc(x + s, y + 1, s * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(2, s * 0.35);
  ctx.beginPath();
  ctx.moveTo(x - s * 1.8, y - s * 1.1); ctx.lineTo(x - s * 0.3, y - s * 0.5);
  ctx.moveTo(x + s * 1.8, y - s * 1.1); ctx.lineTo(x + s * 0.3, y - s * 0.5);
  ctx.stroke();
}

function drawHpBar(e, w, yOff) {
  if (e.hp >= e.maxHp && e.type !== 'giant') return;
  const r = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(e.x - w / 2, e.y - yOff, w, 5);
  ctx.fillStyle = r > 0.5 ? '#2ecc71' : r > 0.25 ? '#f1c40f' : '#ff4757';
  ctx.fillRect(e.x - w / 2, e.y - yOff, w * r, 5);
}

function drawEnemy(e) {
  const white = e.flash > 0;
  if (e.type === 'grunt') {
    ctx.fillStyle = white ? '#fff' : '#d7263d';
    ctx.beginPath(); // 뿔
    ctx.moveTo(e.x - 14, e.y - 8); ctx.lineTo(e.x - 18, e.y - 24); ctx.lineTo(e.x - 6, e.y - 14);
    ctx.moveTo(e.x + 14, e.y - 8); ctx.lineTo(e.x + 18, e.y - 24); ctx.lineTo(e.x + 6, e.y - 14);
    ctx.fill();
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a0a14'; ctx.lineWidth = 2; ctx.stroke();
    drawAngryEyes(e.x, e.y - 2, 5);
    ctx.strokeStyle = '#2a0006'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y + 11, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    drawHpBar(e, 32, 30);
  } else if (e.type === 'bomber') {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.t * 3);
    ctx.fillStyle = white ? '#fff' : '#7b2ff7';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? e.r : e.r + 7;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
    drawAngryEyes(e.x, e.y, 4);
    ctx.fillStyle = Math.floor(T * 10) % 2 ? '#ffde59' : '#ff5e00';
    ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 6, 3, 0, Math.PI * 2); ctx.fill();
    drawHpBar(e, 28, 32);
  } else {
    // 거대한 적
    const x = e.x, y = e.y;
    ctx.fillStyle = 'rgba(200,60,255,0.25)';
    ctx.beginPath(); ctx.arc(x, y, e.r + 10 + Math.sin(T * 6) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = white ? '#fff' : '#3b1d4a';
    ctx.beginPath(); // 뿔
    ctx.moveTo(x - 34, y - 20); ctx.lineTo(x - 48, y - 58); ctx.lineTo(x - 16, y - 34);
    ctx.moveTo(x + 34, y - 20); ctx.lineTo(x + 48, y - 58); ctx.lineTo(x + 16, y - 34);
    ctx.fill();
    roundRect(x - 42, y - 38, 84, 76, 18);
    ctx.fill();
    ctx.strokeStyle = '#c84bff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ff2a2a';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x - 28, y - 14); ctx.lineTo(x - 8, y - 6); ctx.lineTo(x - 26, y - 2); ctx.closePath();
    ctx.moveTo(x + 28, y - 14); ctx.lineTo(x + 8, y - 6); ctx.lineTo(x + 26, y - 2); ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * 8 - 4, y + 14); ctx.lineTo(x + i * 8 + 4, y + 14); ctx.lineTo(x + i * 8, y + 24); ctx.fill();
    }
    drawHpBar(e, 90, 70);
    ctx.fillStyle = '#ffd6ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BOSS', x, y - 74);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 각 도시 랜드마크 재현 ---------- */
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

// 서울: 남산 위 N서울타워
function drawSeoul(g, cx, b) {
  g.fillStyle = '#2f5d3a';
  g.beginPath(); g.ellipse(cx, b + 10, 180, 80, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#3c7149';
  g.beginPath(); g.ellipse(cx - 60, b + 10, 90, 45, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#cfd3dc';
  g.fillRect(cx - 26, b - 92, 52, 24);
  g.fillStyle = '#e8eaf0';
  poly(g, [cx - 9, b - 70, cx + 9, b - 70, cx + 6, b - 190, cx - 6, b - 190]);
  g.fillStyle = '#f4f5f9';
  g.beginPath(); g.ellipse(cx, b - 192, 30, 12, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd166';
  g.fillRect(cx - 26, b - 195, 52, 5);
  g.fillStyle = '#e8eaf0';
  g.beginPath(); g.ellipse(cx, b - 212, 20, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#88c9ff';
  g.fillRect(cx - 16, b - 214, 32, 3);
  g.strokeStyle = '#dfe3ea'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx, b - 220); g.lineTo(cx, b - 262); g.stroke();
  g.fillStyle = Math.floor(T * 2) % 2 ? '#ff3b3b' : '#7a1010';
  g.beginPath(); g.arc(cx, b - 265, 4, 0, Math.PI * 2); g.fill();
}

// 파리: 에펠탑
function drawParis(g, cx, b) {
  g.fillStyle = '#8a5a35';
  g.beginPath();
  g.moveTo(cx - 100, b);
  g.quadraticCurveTo(cx - 40, b - 90, cx - 14, b - 200);
  g.lineTo(cx - 5, b - 250);
  g.lineTo(cx + 5, b - 250);
  g.lineTo(cx + 14, b - 200);
  g.quadraticCurveTo(cx + 40, b - 90, cx + 100, b);
  g.lineTo(cx + 62, b);
  g.quadraticCurveTo(cx, b - 80, cx - 62, b);
  g.closePath();
  g.fill();
  // 격자 무늬
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(255,215,160,0.35)';
  g.lineWidth = 1;
  for (let y = b; y > b - 260; y -= 12) {
    g.beginPath(); g.moveTo(cx - 110, y); g.lineTo(cx + 110, y - 12); g.stroke();
    g.beginPath(); g.moveTo(cx + 110, y); g.lineTo(cx - 110, y - 12); g.stroke();
  }
  g.restore();
  g.fillStyle = '#5c3a20';
  g.fillRect(cx - 64, b - 82, 128, 9);
  g.fillRect(cx - 32, b - 152, 64, 7);
  g.fillRect(cx - 12, b - 208, 24, 6);
  g.strokeStyle = '#5c3a20'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, b - 250); g.lineTo(cx, b - 275); g.stroke();
  // 반짝이는 조명
  g.fillStyle = '#fff2b0';
  for (let i = 0; i < 14; i++) {
    if (Math.sin(T * 8 + i * 1.7) > 0.6) {
      const t = i / 14;
      g.fillRect(cx + (Math.sin(i * 3.3) * (1 - t) * 70), b - t * 240, 2, 2);
    }
  }
}

// 런던: 빅벤과 국회의사당
function drawLondon(g, cx, b) {
  g.fillStyle = '#a3814d';
  g.fillRect(cx - 170, b - 70, 140, 70);
  g.fillRect(cx + 30, b - 62, 140, 62);
  g.fillStyle = '#7f6337';
  for (let x = cx - 165; x < cx - 30; x += 20) poly(g, [x, b - 70, x + 8, b - 70, x + 4, b - 86]);
  for (let x = cx + 36; x < cx + 170; x += 20) poly(g, [x, b - 62, x + 8, b - 62, x + 4, b - 78]);
  g.fillStyle = '#ffe3a0';
  for (let x = cx - 160; x < cx - 36; x += 14) g.fillRect(x, b - 50, 5, 12);
  for (let x = cx + 40; x < cx + 166; x += 14) g.fillRect(x, b - 44, 5, 12);
  // 시계탑
  g.fillStyle = '#c9a66b';
  g.fillRect(cx - 24, b - 185, 48, 185);
  g.fillStyle = '#b08d57';
  for (let y = b - 20; y > b - 180; y -= 16) g.fillRect(cx - 24, y, 48, 2);
  g.fillStyle = '#b8935a';
  g.fillRect(cx - 29, b - 212, 58, 30);
  g.fillStyle = '#7d6138';
  for (let x = cx - 24; x < cx + 24; x += 10) g.fillRect(x, b - 206, 5, 18);
  // 시계
  g.fillStyle = '#f7efd6';
  g.beginPath(); g.arc(cx, b - 160, 19, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a2a10'; g.lineWidth = 2; g.stroke();
  const hA = T * 0.2, mA = T * 2;
  g.beginPath();
  g.moveTo(cx, b - 160); g.lineTo(cx + Math.sin(hA) * 10, b - 160 - Math.cos(hA) * 10);
  g.moveTo(cx, b - 160); g.lineTo(cx + Math.sin(mA) * 15, b - 160 - Math.cos(mA) * 15);
  g.stroke();
  // 첨탑
  g.fillStyle = '#3d4a5c';
  poly(g, [cx - 29, b - 212, cx + 29, b - 212, cx, b - 272]);
  g.fillStyle = '#ffd166';
  g.fillRect(cx - 1.5, b - 284, 3, 14);
}

// 뉴욕: 자유의 여신상
function drawNewYork(g, cx, b) {
  g.fillStyle = '#5d6470';
  poly(g, [cx - 110, b, cx + 110, b, cx + 90, b - 26, cx - 90, b - 26]);
  g.fillStyle = '#a89f8a';
  poly(g, [cx - 44, b - 26, cx + 44, b - 26, cx + 33, b - 108, cx - 33, b - 108]);
  g.fillStyle = '#bdb49d';
  g.fillRect(cx - 38, b - 116, 76, 9);
  g.fillStyle = '#8d846f';
  g.fillRect(cx - 12, b - 90, 24, 30);
  // 몸(로브)
  g.fillStyle = '#5fae96';
  poly(g, [cx - 26, b - 116, cx + 26, b - 116, cx + 15, b - 192, cx - 17, b - 192]);
  g.strokeStyle = '#4a917c'; g.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(cx + i * 8, b - 118); g.lineTo(cx + i * 5, b - 185); g.stroke();
  }
  // 오른팔과 횃불
  g.strokeStyle = '#5fae96'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(cx + 10, b - 186); g.lineTo(cx + 26, b - 244); g.stroke();
  g.fillStyle = '#c7a24a';
  poly(g, [cx + 20, b - 248, cx + 34, b - 248, cx + 30, b - 256, cx + 24, b - 256]);
  g.fillStyle = '#ff9f1a';
  g.beginPath(); g.ellipse(cx + 27, b - 266 + Math.sin(T * 12), 7, 11 + Math.sin(T * 9) * 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe066';
  g.beginPath(); g.ellipse(cx + 27, b - 263, 3.5, 6, 0, 0, Math.PI * 2); g.fill();
  // 서판
  g.fillStyle = '#4e9c85';
  g.save(); g.translate(cx - 22, b - 160); g.rotate(-0.25); g.fillRect(-7, -14, 14, 28); g.restore();
  // 머리와 왕관
  g.fillStyle = '#5fae96';
  g.beginPath(); g.arc(cx, b - 202, 11, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5fae96'; g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i + 0.5) * (Math.PI / 7);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 11, b - 206 + Math.sin(a) * 11);
    g.lineTo(cx + Math.cos(a) * 22, b - 206 + Math.sin(a) * 22);
    g.stroke();
  }
}

// 카이로: 기자 피라미드와 스핑크스
function drawCairo(g, cx, b) {
  const pyr = (px, w, h) => {
    g.fillStyle = '#e3b768';
    poly(g, [px - w / 2, b, px + w * 0.08, b, px, b - h]);
    g.fillStyle = '#b8873f';
    poly(g, [px + w * 0.08, b, px + w / 2, b, px, b - h]);
    g.strokeStyle = 'rgba(120,80,30,0.35)'; g.lineWidth = 1;
    for (let y = b - 12; y > b - h; y -= 12) {
      const t = (b - y) / h;
      g.beginPath(); g.moveTo(px - (w / 2) * (1 - t), y); g.lineTo(px + (w / 2) * (1 - t), y); g.stroke();
    }
  };
  pyr(cx + 125, 140, 95);
  pyr(cx - 120, 160, 110);
  pyr(cx, 250, 195);
  // 스핑크스
  g.fillStyle = '#c99a52';
  g.fillRect(cx - 160, b - 26, 70, 26);
  g.fillRect(cx - 100, b - 50, 22, 30);
  g.fillStyle = '#a77a3a';
  poly(g, [cx - 104, b - 50, cx - 74, b - 50, cx - 78, b - 30, cx - 100, b - 30]);
  g.fillStyle = '#c99a52';
  g.fillRect(cx - 98, b - 46, 18, 16);
}

/* ---------- 입력 ---------- */
stage.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.overlay')) return;
  drag.active = true;
  drag.id = ev.pointerId;
  drag.lx = ev.clientX;
  drag.ly = ev.clientY;
  try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag.active || ev.pointerId !== drag.id || !S || S.phase !== 'play') return;
  const sens = 1.3; // 손가락보다 살짝 더 빠르게 움직임
  S.player.x = clamp(S.player.x + ((ev.clientX - drag.lx) / viewScale) * sens, PLAYER_AREA.minX, PLAYER_AREA.maxX);
  S.player.y = clamp(S.player.y + ((ev.clientY - drag.ly) / viewScale) * sens, PLAYER_AREA.minY, PLAYER_AREA.maxY);
  drag.lx = ev.clientX;
  drag.ly = ev.clientY;
});
const endDrag = (ev) => { if (ev.pointerId === drag.id) drag.active = false; };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (ev) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(ev.code)) ev.preventDefault();
  keys.add(ev.code);
  if (ev.code === 'Space' || ev.code === 'KeyB') useBomb();
  if (ev.code === 'Enter' && overlay.classList.contains('show')) {
    const btn = overlay.querySelector('[data-action]');
    if (btn) btn.click();
  }
});
window.addEventListener('keyup', (ev) => keys.delete(ev.code));
window.addEventListener('blur', () => keys.clear());
ui.bombBtn.addEventListener('click', useBomb);

/* ---------- 화면 크기 ---------- */
function resize() {
  const r = stage.getBoundingClientRect();
  const s = Math.min((r.width - 8) / W, (r.height - 8) / H);
  viewScale = Math.max(0.2, s);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.floor(W * viewScale);
  const ch = Math.floor(H * viewScale);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  viewScale = cw / W;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------- 메인 루프 ---------- */
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  T += dt;
  if (S.phase === 'play') update(dt);
  else updateEffects(dt);
  render();
  updateHud();
  requestAnimationFrame(frame);
}

newGame();
resize();
requestAnimationFrame(frame);
