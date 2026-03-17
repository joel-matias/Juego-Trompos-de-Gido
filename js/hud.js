// hud.js — HUD canvas drawing helpers
(function (g) {
  // Dibuja un path de rectángulo redondeado (sin fill/stroke)
  function rrPath(ctx, x, y, w, h, r) {
    if (w <= 0) return;
    r = Math.min(r, w / 2, h / 2);
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

  function drawHUD(ctx, S, cvs) {
    const p       = S.player;
    const hpRatio = p.hp / p.maxhp;
    const bw = 200, bh = 14, bx = 18, by = 18;

    ctx.save();

    // Fondo
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rrPath(ctx, bx - 3, by - 3, bw + 6, bh + 6, 9);
    ctx.fill();

    // Track
    ctx.fillStyle = '#1a2235';
    rrPath(ctx, bx, by, bw, bh, 6);
    ctx.fill();

    // Fill de HP
    if (hpRatio > 0) {
      const hpColor =
        hpRatio > 0.5  ? '#22c55e' :
        hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillStyle = hpColor;
      rrPath(ctx, bx, by, bw * hpRatio, bh, 6);
      ctx.fill();

      // Brillo
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
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Nv. ' + S.level, bx + bw, by + bh + 5);

    ctx.restore();
  }

  g.rrPath  = rrPath;
  g.drawHUD = drawHUD;
})(window);
