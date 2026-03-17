// game.js
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const ui = {
  time:    document.getElementById('ui-time'),
  score:   document.getElementById('ui-score'),
  best:    document.getElementById('ui-best'),
  level:   document.getElementById('ui-level'),
  levelBar:document.getElementById('ui-level-bar'),
  btn:     document.getElementById('btn-toggle'),
  overlay: document.getElementById('overlay'),
  help:    document.getElementById('help'),
  mods:    document.getElementById('modifiers-strip'),
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
const MAX_BULLETS   = 30;   // techo firme de entidades en pantalla
const MAX_PICKUPS   = 4;
const MAX_PARTICLES = 60;
const LEVEL_SECS    = 10;

/* ── Caché de Gon ── */
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

/* ── Modificadores de dificultad ──
   Todas las mecánicas que escalan son de comportamiento, no de cantidad.
   Esto mantiene el número de entidades constante y acotado.
   Lv 3  → trompos guiados (% sube con el nivel)
   Lv 5  → daño por golpe aumentado  (+5 hp)
   Lv 7  → Gon corre más lento
   Lv 9  → iFrames reducidos (ventana de invencibilidad más corta)
   Lv 10 → pickups curan menos
   Lv 12 → iFrames casi nulos
── */
function getModifiers(level) {
  return {
    speedBonus:   Math.min((level - 1) * 6, 66),
    homingChance: level >= 3 ? clamp((level - 2) * 0.08, 0, 0.70) : 0,
    bulletDmg:    level >= 8 ? 30 : level >= 5 ? 25 : 20,
    playerSpeed:  level >= 10 ? 215 : level >= 7 ? 255 : 300,
    iFramesDur:   level >= 12 ? 0.32 : level >= 9 ? 0.48 : 0.70,
    pickupHeal:   level >= 10 ? 8   : level >= 6 ? 12  : 15,
  };
}

/* ── Subtítulo que acompaña el anuncio de nivel ── */
function getLevelSubtitle(lvl) {
  const events = {
    2:  'Trompos más rápidos',
    3:  '¡Trompos guiados!',
    4:  'Trompos más rápidos',
    5:  '¡+25% daño por golpe!',
    6:  '¡Pickups curan menos!',
    7:  '¡Gon más lento!',
    8:  '¡+50% daño por golpe!',
    9:  '¡Menos invencibilidad!',
    10: '¡Gon aún más lento!',
    11: 'Trompos muy rápidos',
    12: '¡Casi sin invencibilidad!',
  };
  return events[lvl] || 'Trompos aún más rápidos';
}

/* ── Anuncio de nivel ── */
let levelMsg = { text: '', subtitle: '', t: 0 };
function flashLevel(lvl) {
  levelMsg.text     = 'NIVEL  ' + lvl;
  levelMsg.subtitle = getLevelSubtitle(lvl);
  levelMsg.t        = 2.4;
}

/* ── UI de modificadores (DOM) ── */
function updateModifiersUI(level) {
  if (!ui.mods) return;
  const m = getModifiers(level);
  const homingPct  = Math.round(m.homingChance * 100);
  const dmgBonus   = m.bulletDmg - 20;
  const speedLoss  = 300 - m.playerSpeed;
  const iLoss      = Math.round((1 - m.iFramesDur / 0.70) * 100);

  const items = [
    { active: true,        label: `⚡ Vel. +${m.speedBonus}`,
      title: 'Velocidad de trompos aumentada' },
    { active: level >= 3,  label: `🎯 Guiados${level >= 3 ? ' ' + homingPct + '%' : ''}`,
      title: 'Trompos guiados — activa en Lv 3' },
    { active: level >= 5,  label: `💥 Daño${level >= 5 ? ' +' + dmgBonus : ''}`,
      title: 'Golpes hacen más daño — activa en Lv 5' },
    { active: level >= 7,  label: `🐢 Gon${level >= 7 ? ' -' + speedLoss : ''}`,
      title: 'Gon se mueve más lento — activa en Lv 7' },
    { active: level >= 9,  label: `🛡 iF${level >= 9 ? ' -' + iLoss + '%' : ''}`,
      title: 'Menos invencibilidad tras golpe — activa en Lv 9' },
  ];

  ui.mods.innerHTML = items.map(it =>
    `<div class="mod-pill${it.active ? ' active accent' : ''}" title="${it.title}">${it.label}</div>`
  ).join('');
}

/* ── Estado global ── */
const S = {
  running:      false,
  paused:       true,
  time:         0,
  last:         0,
  score:        0,
  best:         Number(localStorage.getItem('zetsu_best') || 0),
  player:       { x: 480, y: 270, r: 12, vx: 0, vy: 0, hp: 100, maxhp: 100, iFrames: 0 },
  bullets:      [],
  pickups:      [],
  spawnTimer:   0,
  spawnEvery:   0.8,
  level:        1,
  prevLevel:    1,
  keys:         {},
  scoreTimer:   0,
  pickupStreak: 0,
  damageFlash:  0,
};
ui.best.textContent = S.best;

/* ── Inputs ── */
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
    e.preventDefault();
  S.keys[e.key.toLowerCase()] = true;
  if (e.key === ' ')               togglePause();
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
  levelMsg.text = levelMsg.subtitle = '';
  levelMsg.t    = 0;
  gonCache      = null;

  Object.assign(S, {
    running: false, paused: true,
    time: 0, score: 0,
    bullets: [], pickups: [],
    spawnTimer: 0, spawnEvery: 0.8,
    level: 1, prevLevel: 1,
    last: performance.now(),
    player: { x: 480, y: 270, r: 12, vx: 0, vy: 0, hp: 100, maxhp: 100, iFrames: 0 },
    scoreTimer: 0, pickupStreak: 0, damageFlash: 0,
  });
  S.best = best;

  ui.time.textContent     = '0.0';
  ui.score.textContent    = '0';
  ui.level.textContent    = '1';
  ui.levelBar.style.width = '0%';
  ui.btn.textContent      = 'Iniciar';
  ui.overlay.style.display = 'grid';
  updateModifiersUI(1);
  showStartScreen();
}

function showStartScreen() {
  ui.help.innerHTML = `
    <h2>¡Trompos de Gido!</h2>
    <p>Mueve a Gon y sobrevive el máximo tiempo posible.<br>
       Cada nivel agrega una nueva amenaza.</p>
    <p>
      <span class="kbd">WASD</span> / Flechas &nbsp;·&nbsp;
      <span class="kbd">Espacio</span> Pausa &nbsp;·&nbsp;
      <span class="kbd">R</span> Reiniciar
    </p>
    <p>Recoge las <span style="color:#22c55e;font-weight:700">esferas de Nen</span>
       para recuperar vida y sumar puntos.</p>
    <div class="start-mods">
      <div class="start-mod"><b>Lv 3</b> Guiados</div>
      <div class="start-mod"><b>Lv 5</b> +daño</div>
      <div class="start-mod"><b>Lv 7</b> Gon lento</div>
      <div class="start-mod"><b>Lv 9</b> -iFrames</div>
    </div>
    <p style="margin-top:1rem">
      <button class="btn" id="btn-start-overlay">¡Comenzar!</button>
    </p>
  `;
  document.getElementById('btn-start-overlay').addEventListener('click', start);
}

/* ── Spawn ── */
function spawnBullet(m) {
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
  const speed = rnd(120, 180) + m.speedBonus;

  S.bullets.push({
    x, y,
    r:      rnd(6, 10),
    vx:     (dx / len) * speed + rnd(-20, 20),
    vy:     (dy / len) * speed + rnd(-20, 20),
    life:   10,
    angle:  rnd(0, Math.PI * 2),
    spin:   rnd(4, 8),
    homing: Math.random() < m.homingChance,
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
  const newLevel = 1 + Math.floor(S.time / LEVEL_SECS);
  if (newLevel !== S.prevLevel) {
    S.prevLevel = newLevel;
    S.level     = newLevel;
    flashLevel(newLevel);
    updateModifiersUI(newLevel);
    AudioSys.levelUp();
  }
  const levelProgress = ((S.time % LEVEL_SECS) / LEVEL_SECS) * 100;
  ui.level.textContent    = S.level;
  ui.levelBar.style.width = levelProgress.toFixed(1) + '%';

  S.spawnEvery = clamp(0.8 - S.time * 0.012, 0.18, 0.8);

  // Puntaje pasivo
  S.scoreTimer += dt;
  if (S.scoreTimer >= 1) {
    S.scoreTimer -= 1;
    S.score++;
    ui.score.textContent = S.score;
  }

  const m = getModifiers(S.level);

  // Spawn — un único trompo por tick, limitado por MAX_BULLETS
  S.spawnTimer += dt;
  if (S.spawnTimer >= S.spawnEvery) {
    S.spawnTimer = 0;
    spawnBullet(m);
    if (Math.random() < 0.28) spawnPickup();
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
  p.vx = ax * inv * m.playerSpeed;
  p.vy = ay * inv * m.playerSpeed;
  p.x  = clamp(p.x + p.vx * dt, p.r, cvs.width  - p.r);
  p.y  = clamp(p.y + p.vy * dt, p.r, cvs.height - p.r);
  if (p.iFrames > 0) p.iFrames -= dt;

  if (S.damageFlash > 0) S.damageFlash -= dt * 3.5;

  // Balas
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];

    // Guiado: gira suavemente hacia el jugador
    if (b.homing) {
      const spd  = Math.hypot(b.vx, b.vy);
      const hdx  = p.x - b.x, hdy = p.y - b.y;
      const hlen = Math.hypot(hdx, hdy) || 1;
      const tr   = Math.min(1, 2.4 * dt);
      b.vx += ((hdx / hlen) * spd - b.vx) * tr;
      b.vy += ((hdy / hlen) * spd - b.vy) * tr;
    }

    b.x     += b.vx * dt;
    b.y     += b.vy * dt;
    b.angle += b.spin * dt;
    b.life  -= dt;

    if (b.life <= 0 ||
        b.x < -30 || b.x > cvs.width  + 30 ||
        b.y < -30 || b.y > cvs.height + 30) {
      S.bullets.splice(i, 1);
      continue;
    }

    const dx   = b.x - p.x, dy = b.y - p.y;
    const rSum = b.r + p.r;
    if (dx * dx + dy * dy <= rSum * rSum && p.iFrames <= 0) {
      S.score = Math.max(0, S.score - 5);
      ui.score.textContent = S.score;
      p.hp          -= m.bulletDmg;
      p.iFrames     = m.iFramesDur;
      S.damageFlash = 1;
      S.pickupStreak = 0;
      triggerShake(6, 0.22);
      spawnParticles(p.x, p.y, 12, '#ef4444');
      AudioSys.hit();
      if (p.hp <= 0) { p.hp = 0; gameOver(); return; }
    }
  }

  // Colisiones bala-bala
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

  // Pickups
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const c = S.pickups[i];
    c.life  -= dt;
    c.pulse += dt * 3;
    if (c.life <= 0) { S.pickups.splice(i, 1); continue; }

    const dx   = c.x - p.x, dy = c.y - p.y;
    const rSum = c.r + p.r;
    if (dx * dx + dy * dy <= rSum * rSum) {
      S.pickups.splice(i, 1);
      S.pickupStreak++;
      const bonus = S.pickupStreak >= 3 ? 20 : 10;
      S.score += bonus;
      ui.score.textContent = S.score;
      p.hp = clamp(p.hp + m.pickupHeal, 0, p.maxhp);
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

  if (levelMsg.t > 0) levelMsg.t -= dt;
}

/* ── Draw ── */
function draw() {
  ctx.clearRect(0, 0, cvs.width, cvs.height);

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

  // Sombra de Gon
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
    if (gonCache) ctx.drawImage(gonCache, p.x - gonCache.width / 2, p.y - gonCache.height / 2);
    else          drawGonHead(ctx, p.x, p.y, p.r);
  }

  // Trompos (aura roja para guiados)
  for (const b of S.bullets) {
    if (b.homing) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(S.time * 8);
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur  = 16;
      ctx.strokeStyle = 'rgba(239,68,68,0.55)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawTop(ctx, b);
  }

  // Pickups
  for (const c of S.pickups) {
    const pv = 0.14 * Math.sin(c.pulse);
    const rr = c.r * (1 + pv);
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

  // Viñeta de peligro hp < 35%
  const hpRatio = p.hp / p.maxhp;
  if (hpRatio < 0.35) {
    const pulse  = 0.65 + 0.35 * Math.sin(S.time * 5.5);
    const danger = (1 - hpRatio / 0.35) * 0.55 * pulse;
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

  drawHUD(ctx, S, cvs);

  // Anuncio de nivel con subtítulo
  if (levelMsg.t > 0) {
    const alpha = Math.min(1, levelMsg.t * 1.4);
    const pop   = 1 + 0.25 * Math.max(0, levelMsg.t - 1.9);
    // Subir el texto principal si hay subtítulo
    const cy = levelMsg.subtitle ? cvs.height / 2 - 22 : cvs.height / 2;

    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.translate(cvs.width / 2, cy);
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

    if (levelMsg.subtitle) {
      ctx.save();
      ctx.globalAlpha  = alpha * 0.92;
      ctx.font         = 'bold 20px system-ui, Arial';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle  = 'rgba(0,0,0,0.85)';
      ctx.lineWidth    = 5;
      ctx.strokeText(levelMsg.subtitle, cvs.width / 2, cy + 48);
      ctx.fillStyle    = '#f3f4f6';
      ctx.fillText(levelMsg.subtitle, cvs.width / 2, cy + 48);
      ctx.restore();
    }
  }
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

updateModifiersUI(1);
showStartScreen();
requestAnimationFrame((t) => { S.last = t; loop(t); });
