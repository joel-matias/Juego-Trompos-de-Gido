// game.js
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const ui = {
  time:    document.getElementById('ui-time'),
  score:   document.getElementById('ui-score'),
  best:    document.getElementById('ui-best'),
  btn:     document.getElementById('btn-toggle'),
  overlay: document.getElementById('overlay'),
  help:    document.getElementById('help'),
};

/* ── Fondo ── */
const BG = new Image();
let bgReady = false;
BG.onload = () => { bgReady = true; };
BG.src = 'sources/arena_coliseo.png';

AudioSys.loadBackground('audio/hunterxhunter.mp3').catch(console.error);
AudioSys.setBgVolume(0.05);

/* ── Utilidades ── */
const rnd   = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ── Constantes ── */
const MAX_BULLETS   = 35;
const MAX_PICKUPS   = 4;
const MAX_PARTICLES = 80;

/* ── Caché de Gon (offscreen canvas, se construye al iniciar) ── */
let gonCache = null;
function buildGonCache(radius) {
  const R   = radius * 3;
  const PAD = 6;
  const sz  = Math.ceil(R * 2 + PAD * 2 + 8);
  const oc  = document.createElement('canvas');
  oc.width  = sz;
  oc.height = sz;
  drawGonHead(oc.getContext('2d'), sz / 2, sz / 2, radius);
  return oc;
}

/* ── Screen shake ── */
const shake = { x: 0, y: 0, t: 0, intensity: 0 };
function triggerShake(intensity, dur) {
  shake.intensity = intensity;
  shake.t         = dur;
}

/* ── Partículas ── */
const particles = [];
function spawnParticles(x, y, count, color, speedScale) {
  speedScale = speedScale || 1;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = rnd(0, Math.PI * 2);
    const speed = rnd(60, 190) * speedScale;
    const life  = rnd(0.25, 0.55);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, maxLife: life,
      r: rnd(2, 4.5),
      color,
    });
  }
}

/* ── Anuncio de nivel ── */
let levelMsg = { text: '', t: 0 };
function flashLevel(lvl) {
  levelMsg.text = 'NIVEL  ' + lvl;
  levelMsg.t    = 2.0;
}

/* ── Estado global ── */
const S = {
  running:     false,
  paused:      true,
  time:        0,
  last:        0,
  score:       0,
  best:        Number(localStorage.getItem('zetsu_best') || 0),
  player:      { x: 480, y: 270, r: 12, vx: 0, vy: 0, speed: 300, hp: 100, maxhp: 100, iFrames: 0 },
  bullets:     [],
  pickups:     [],
  spawnTimer:  0,
  spawnEvery:  0.8,
  level:       1,
  prevLevel:   1,
  keys:        {},
  scoreTimer:  0,    // puntaje pasivo (1 pt/seg)
  pickupStreak: 0,   // racha de pickups consecutivos
  damageFlash: 0,    // 0-1, decae rápido
};
ui.best.textContent = S.best;

/* ── Inputs ── */
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
    e.preventDefault();
  S.keys[e.key.toLowerCase()] = true;
  if (e.key === ' ')              togglePause();
  if (e.key.toLowerCase() === 'r') restart();
});
addEventListener('keyup', (e) => { S.keys[e.key.toLowerCase()] = false; });

ui.btn.addEventListener('click', () => {
  if (!S.running && S.paused) start();
  else togglePause();
});

cvs.addEventListener('pointerdown', () => { AudioSys.init(); }, { once: true });

/* ── Ciclo de vida ── */
function start() {
  if (!gonCache) gonCache = buildGonCache(S.player.r);
  S.running = true;
  S.paused  = false;
  S.last    = performance.now();
  ui.overlay.style.display = 'none';
  ui.btn.textContent = 'Pausa';
  AudioSys.init();
  AudioSys.startMusic();
  AudioSys.startBackground();
}

function togglePause() {
  if (!S.running) { start(); return; }
  S.paused = !S.paused;
  ui.btn.textContent = S.paused ? 'Reanudar' : 'Pausa';
  if (S.paused) {
    AudioSys.stopMusic();
    AudioSys.stopBackground();
    ui.overlay.style.display = 'grid';
    ui.help.innerHTML =
      `<h2>Pausa</h2>` +
      `<p>Tiempo: <b>${S.time.toFixed(1)}s</b> &nbsp;·&nbsp; Puntaje: <b>${S.score}</b> &nbsp;·&nbsp; Nivel: <b>${S.level}</b></p>` +
      `<p>Presiona <span class="kbd">Espacio</span> o el botón para continuar.</p>`;
  } else {
    AudioSys.startMusic();
    AudioSys.startBackground();
    ui.overlay.style.display = 'none';
    S.last = performance.now();
  }
}

function gameOver() {
  S.paused  = true;
  S.running = false;
  ui.btn.textContent = 'Reiniciar';
  AudioSys.stopMusic();
  AudioSys.stopBackground();
  ui.overlay.style.display = 'grid';

  const newRecord = S.score > S.best;
  if (newRecord) {
    S.best = S.score;
    localStorage.setItem('zetsu_best', String(S.score));
    ui.best.textContent = S.best;
  }

  ui.help.innerHTML =
    `<h2 class="${newRecord ? 'text-gold' : ''}">${newRecord ? '¡Nuevo récord!' : '¡Derrotado!'}</h2>` +
    `<div class="stats-row">` +
    `<span>Puntaje <b>${S.score}</b></span>` +
    `<span>Tiempo <b>${S.time.toFixed(1)}s</b></span>` +
    `<span>Nivel <b>${S.level}</b></span>` +
    `</div>` +
    `<p><button class="btn" id="btn-restart">Jugar de nuevo</button></p>`;
  document.getElementById('btn-restart').addEventListener('click', restart);
}

function restart() {
  const best = S.best;
  particles.length = 0;
  shake.x = shake.y = shake.t = shake.intensity = 0;
  levelMsg.text = '';
  levelMsg.t    = 0;
  gonCache      = null;

  Object.assign(S, {
    running: false, paused: true,
    time: 0, score: 0,
    bullets: [], pickups: [],
    spawnTimer: 0, spawnEvery: 0.8,
    level: 1, prevLevel: 1,
    last: performance.now(),
    player: { x: 480, y: 270, r: 12, vx: 0, vy: 0, speed: 300, hp: 100, maxhp: 100, iFrames: 0 },
    scoreTimer: 0, pickupStreak: 0, damageFlash: 0,
  });
  S.best = best;

  ui.time.textContent  = '0.0';
  ui.score.textContent = '0';
  ui.btn.textContent   = 'Iniciar';
  ui.overlay.style.display = 'grid';
  showStartScreen();
}

function showStartScreen() {
  ui.help.innerHTML = `
    <h2>¡Trompos de Gido!</h2>
    <p>Mueve a Gon y sobrevive el máximo tiempo posible.<br>
       Los trompos de Gido se vuelven más rápidos con cada nivel.</p>
    <p>
      <span class="kbd">WASD</span> / Flechas &nbsp;·&nbsp;
      <span class="kbd">Espacio</span> Pausa &nbsp;·&nbsp;
      <span class="kbd">R</span> Reiniciar
    </p>
    <p>Recoge las <span style="color:#22c55e;font-weight:700">esferas de Nen</span>
       para recuperar vida y sumar puntos.</p>
    <p style="margin-top:1rem">
      <button class="btn" id="btn-start-overlay">¡Comenzar!</button>
    </p>
  `;
  document.getElementById('btn-start-overlay').addEventListener('click', start);
}

/* ── Spawn ── */
function spawnBullet() {
  if (S.bullets.length >= MAX_BULLETS) return;
  const side = Math.floor(rnd(0, 4));
  let x, y;
  if      (side === 0) { x = -14; y = rnd(0, cvs.height); }
  else if (side === 1) { x = cvs.width + 14; y = rnd(0, cvs.height); }
  else if (side === 2) { x = rnd(0, cvs.width); y = -14; }
  else                 { x = rnd(0, cvs.width); y = cvs.height + 14; }

  const dx    = S.player.x - x;
  const dy    = S.player.y - y;
  const len   = Math.hypot(dx, dy) || 1;
  const speed = rnd(120, 180) + S.level * 6;

  S.bullets.push({
    x, y,
    r:     rnd(6, 10),
    vx:    (dx / len) * speed + rnd(-20, 20),
    vy:    (dy / len) * speed + rnd(-20, 20),
    life:  10,
    angle: rnd(0, Math.PI * 2),
    spin:  rnd(4, 8),
  });
}

function spawnPickup() {
  if (S.pickups.length >= MAX_PICKUPS) return;
  S.pickups.push({
    x:     rnd(40, cvs.width - 40),
    y:     rnd(40, cvs.height - 40),
    r:     8,
    life:  10,
    pulse: rnd(0, Math.PI * 2),
  });
}

/* ── Update ── */
function update(dt) {
  S.time += dt;
  ui.time.textContent = S.time.toFixed(1);

  // Nivel
  const newLevel = 1 + Math.floor(S.time / 10);
  if (newLevel !== S.prevLevel) {
    S.prevLevel = newLevel;
    S.level     = newLevel;
    flashLevel(newLevel);
    AudioSys.levelUp();
  }
  S.spawnEvery = clamp(0.8 - S.time * 0.012, 0.15, 0.8);

  // Puntaje pasivo
  S.scoreTimer += dt;
  if (S.scoreTimer >= 1) {
    S.scoreTimer -= 1;
    S.score++;
    ui.score.textContent = S.score;
  }

  // Spawn
  S.spawnTimer += dt;
  if (S.spawnTimer >= S.spawnEvery) {
    S.spawnTimer = 0;
    spawnBullet();
    if (Math.random() < 0.30) spawnPickup();
  }

  // Jugador
  const p = S.player;
  let ax = 0, ay = 0;
  const k = S.keys;
  if (k['arrowup']    || k['w']) ay -= 1;
  if (k['arrowdown']  || k['s']) ay += 1;
  if (k['arrowleft']  || k['a']) ax -= 1;
  if (k['arrowright'] || k['d']) ax += 1;
  const inv = 1 / (Math.hypot(ax, ay) || 1);
  p.vx = ax * inv * p.speed;
  p.vy = ay * inv * p.speed;
  p.x  = clamp(p.x + p.vx * dt, p.r, cvs.width  - p.r);
  p.y  = clamp(p.y + p.vy * dt, p.r, cvs.height - p.r);
  if (p.iFrames > 0) p.iFrames -= dt;

  // Decae flash de daño
  if (S.damageFlash > 0) S.damageFlash -= dt * 3.5;

  // Balas → jugador
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.x     += b.vx * dt;
    b.y     += b.vy * dt;
    b.angle += b.spin * dt;
    b.life  -= dt;

    if (b.life <= 0 ||
        b.x < -30 || b.x > cvs.width + 30 ||
        b.y < -30 || b.y > cvs.height + 30) {
      S.bullets.splice(i, 1);
      continue;
    }

    const dx = b.x - p.x, dy = b.y - p.y;
    const rSum = b.r + p.r;
    if (dx * dx + dy * dy <= rSum * rSum && p.iFrames <= 0) {
      S.score       = Math.max(0, S.score - 5);
      ui.score.textContent = S.score;
      p.hp          -= 20;
      p.iFrames     = 0.7;
      S.damageFlash = 1;
      S.pickupStreak = 0;
      triggerShake(6, 0.22);
      spawnParticles(p.x, p.y, 12, '#ef4444');
      AudioSys.hit();
      if (p.hp <= 0) { p.hp = 0; gameOver(); return; }
    }
  }

  // Colisiones bala-bala (solo aquí, NO en draw)
  const bl = S.bullets;
  for (let i = 0; i < bl.length; i++) {
    for (let j = i + 1; j < bl.length; j++) {
      const a = bl[i], b = bl[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const md = a.r + b.r;
      if (d2 < md * md) {
        const dist = Math.sqrt(d2) || 1;
        const nx = dx / dist, ny = dy / dist;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          a.vx -= rv * nx; a.vy -= rv * ny;
          b.vx += rv * nx; b.vy += rv * ny;
        }
        const pen = (md - dist) * 0.42;
        a.x -= pen * nx; a.y -= pen * ny;
        b.x += pen * nx; b.y += pen * ny;
      }
    }
  }

  // Pickups → jugador
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const c = S.pickups[i];
    c.life  -= dt;
    c.pulse += dt * 3;
    if (c.life <= 0) { S.pickups.splice(i, 1); continue; }

    const dx = c.x - p.x, dy = c.y - p.y;
    const rSum = c.r + p.r;
    if (dx * dx + dy * dy <= rSum * rSum) {
      S.pickups.splice(i, 1);
      S.pickupStreak++;
      const bonus = S.pickupStreak >= 3 ? 20 : 10;
      S.score += bonus;
      ui.score.textContent = S.score;
      p.hp = clamp(p.hp + 15, 0, p.maxhp);
      spawnParticles(c.x, c.y, 10, '#22c55e', 0.7);
      AudioSys.pickup(S.pickupStreak >= 3);
    }
  }

  // Partículas
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x    += pt.vx * dt;
    pt.y    += pt.vy * dt;
    pt.vx   *= 0.86;
    pt.vy   *= 0.86;
    pt.life -= dt;
    if (pt.life <= 0) particles.splice(i, 1);
  }

  // Shake decay
  if (shake.t > 0) {
    shake.t -= dt;
    const str = shake.intensity * Math.max(0, shake.t / 0.22);
    shake.x   = rnd(-str, str);
    shake.y   = rnd(-str, str);
  } else {
    shake.x = shake.y = 0;
  }

  // Level msg decay
  if (levelMsg.t > 0) levelMsg.t -= dt;
}

/* ── Draw ── */
function draw() {
  ctx.clearRect(0, 0, cvs.width, cvs.height);

  /* — Mundo (con shake) — */
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // Fondo
  if (bgReady) {
    const sc = Math.max(cvs.width / BG.naturalWidth, cvs.height / BG.naturalHeight);
    const dw = BG.naturalWidth * sc, dh = BG.naturalHeight * sc;
    ctx.drawImage(BG, (cvs.width - dw) / 2, (cvs.height - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#0b0f13';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
  }

  const p = S.player;

  // Sombra bajo Gon
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle   = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + p.r * 2.4, p.r * 2.2, p.r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Gon — parpadea en iFrames
  const blink = p.iFrames <= 0 || (Math.floor(p.iFrames * 10) % 2 === 0);
  if (blink) {
    if (gonCache) {
      ctx.drawImage(gonCache, p.x - gonCache.width / 2, p.y - gonCache.height / 2);
    } else {
      drawGonHead(ctx, p.x, p.y, p.r);
    }
  }

  // Trompos
  for (const b of S.bullets) drawTop(ctx, b);

  // Pickups (esferas de Nen animadas)
  for (const c of S.pickups) {
    const pv  = 0.14 * Math.sin(c.pulse);
    const rr  = c.r * (1 + pv);
    ctx.save();
    ctx.shadowColor = 'rgba(34,197,94,.55)';
    ctx.shadowBlur  = 20;
    const g = ctx.createRadialGradient(c.x - rr * 0.3, c.y - rr * 0.35, rr * 0.08, c.x, c.y, rr);
    g.addColorStop(0,   '#bbf7d0');
    g.addColorStop(0.5, '#22c55e');
    g.addColorStop(1,   '#15803d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(c.x - rr * 0.28, c.y - rr * 0.32, rr * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Partículas
  for (const pt of particles) {
    const a = pt.life / pt.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle   = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r * a + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore(); // fin shake

  /* — UI fija (sin shake) — */

  // Flash de daño
  if (S.damageFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, S.damageFlash) * 0.3;
    ctx.fillStyle   = '#ef4444';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.restore();
  }

  // Viñeta de peligro cuando HP < 35%
  const hpRatio = p.hp / p.maxhp;
  if (hpRatio < 0.35) {
    const pulse   = 0.65 + 0.35 * Math.sin(S.time * 5.5);
    const danger  = (1 - hpRatio / 0.35) * 0.55 * pulse;
    ctx.save();
    const vg = ctx.createRadialGradient(
      cvs.width / 2, cvs.height / 2, cvs.height * 0.28,
      cvs.width / 2, cvs.height / 2, cvs.height * 0.85
    );
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, `rgba(200,30,30,${danger})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.restore();
  }

  // HUD
  drawHUD(hpRatio);

  // Anuncio de nivel
  if (levelMsg.t > 0) {
    const alpha = Math.min(1, levelMsg.t * 1.4);
    const pop   = 1 + 0.25 * Math.max(0, levelMsg.t - 1.6);
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.translate(cvs.width / 2, cvs.height / 2);
    ctx.scale(pop, pop);
    ctx.font         = 'bold 54px system-ui, Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.7)';
    ctx.lineWidth    = 7;
    ctx.strokeText(levelMsg.text, 0, 0);
    ctx.fillStyle    = '#fbbf24';
    ctx.fillText(levelMsg.text, 0, 0);
    ctx.restore();
  }
}

/* ── HUD ── */
function drawHUD(hpRatio) {
  const p   = S.player;
  const bw  = 200, bh = 14, bx = 18, by = 18;

  ctx.save();

  // Fondo con borde redondeado
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rrPath(ctx, bx - 3, by - 3, bw + 6, bh + 6, 9);
  ctx.fill();

  // Track
  ctx.fillStyle = '#1a2235';
  rrPath(ctx, bx, by, bw, bh, 6);
  ctx.fill();

  // Fill de HP (color dinámico)
  if (hpRatio > 0) {
    const hpColor =
      hpRatio > 0.5 ? '#22c55e' :
      hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = hpColor;
    rrPath(ctx, bx, by, bw * hpRatio, bh, 6);
    ctx.fill();

    // Brillo sobre la barra
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle   = '#fff';
    rrPath(ctx, bx + 1, by + 1, bw * hpRatio - 2, bh * 0.45, 4);
    ctx.fill();
    ctx.restore();
  }

  // Texto HP
  ctx.fillStyle    = 'rgba(229,231,235,0.9)';
  ctx.font         = 'bold 11px system-ui, Arial';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('HP  ' + p.hp + ' / ' + p.maxhp, bx, by + bh + 5);

  // Nivel (derecha)
  ctx.textAlign  = 'right';
  ctx.fillStyle  = '#fbbf24';
  ctx.fillText('Nv. ' + S.level, bx + bw, by + bh + 5);

  ctx.restore();
}

// Dibuja un path de rectángulo redondeado (sin fill/stroke)
function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

/* ── Loop principal ── */
function loop(now) {
  if (S.running && !S.paused) {
    const dt = Math.min(0.033, (now - S.last) / 1000);
    S.last   = now;
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);
}

showStartScreen();
requestAnimationFrame((t) => { S.last = t; loop(t); });
