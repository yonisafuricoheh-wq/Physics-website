const LABEL_FONT = '13px "Inter", system-ui, sans-serif';

// Polyfill for ctx.roundRect (added in Chrome 99 / Firefox 112 / Safari 15.4)
function _roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rx = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rx);
  ctx.lineTo(x + w, y + h - rx);
  ctx.arcTo(x + w, y + h, x,     y + h, rx);
  ctx.lineTo(x + rx, y + h);
  ctx.arcTo(x,     y + h, x,     y,     rx);
  ctx.lineTo(x, y + rx);
  ctx.arcTo(x,     y,     x + w, y,     rx);
  ctx.closePath();
}

export class ObjectRenderer {
  constructor(ctx, worldToCanvas, viewScale) {
    this.ctx   = ctx;
    this.w2c   = worldToCanvas;
    this.scale = viewScale; // pixels per meter (for sizing)
  }

  /* Background grid ────────────────────────────────────────── */
  drawGrid(canvasW, canvasH, worldOrigin, viewScale) {
    const ctx = this.ctx;
    ctx.save();

    // Minor gridlines (every 0.5 m)
    const step = 0.5;
    const stepPx = step * viewScale;

    const oCanvas = this.w2c(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;

    // Vertical lines
    let x = oCanvas.x % stepPx;
    while (x < canvasW) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke(); x += stepPx; }

    // Horizontal lines
    let y = oCanvas.y % stepPx;
    while (y < canvasH) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke(); y += stepPx; }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(oCanvas.x, 0); ctx.lineTo(oCanvas.x, canvasH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, oCanvas.y); ctx.lineTo(canvasW, oCanvas.y); ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font      = '11px "JetBrains Mono", monospace';
    ctx.fillText('x', canvasW - 16, oCanvas.y - 8);
    ctx.fillText('y', oCanvas.x + 6, 14);
    ctx.fillText('O', oCanvas.x + 5, oCanvas.y - 5);

    ctx.restore();
  }

  /* Inclined / flat surfaces ──────────────────────────────── */
  drawSurface(surf) {
    if (!surf.points || surf.points.length < 2) return;
    const ctx = this.ctx;
    const p1  = this.w2c(surf.points[0].x, surf.points[0].y);
    const p2  = this.w2c(surf.points[surf.points.length - 1].x, surf.points[surf.points.length - 1].y);

    ctx.save();
    ctx.strokeStyle = '#8888aa';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Hatch pattern below surface (indicates fixed ground)
    this._drawHatch(p1, p2);

    // Angle arc annotation
    if (surf.angle > 1 && surf.label) {
      this._drawAngleArc(p1, surf.angle, surf.label);
    }

    ctx.restore();
  }

  /* Physics objects ────────────────────────────────────────── */
  drawObject(obj, overrideState = null) {
    const state = overrideState;
    const pos   = state ? state.position : obj.position;
    const angle = state ? state.angle    : obj.angle;

    const center = this.w2c(pos.x, pos.y);

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(-(angle * Math.PI) / 180); // canvas y is flipped

    if (obj.type === 'circle' || obj.type === 'pulley') {
      this._drawCircle(obj);
    } else {
      this._drawRect(obj);
    }

    ctx.restore();

    // Label outside transform
    this._drawObjectLabel(obj, center);
  }

  /* Velocity vector ───────────────────────────────────────── */
  drawVelocityVector(objState, color = '#FFD700') {
    if (!objState?.velocity) return;
    const v = objState.velocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y);
    if (speed < 0.05) return;

    const from = this.w2c(objState.position.x, objState.position.y);
    const scale = 25;
    const to = {
      x: from.x + v.x * scale,
      y: from.y - v.y * scale, // y flipped
    };

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.font      = '12px "Inter", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`v = ${speed.toFixed(2)} m/s`, to.x + 6, to.y - 6);
    ctx.restore();
  }

  /* ── Private helpers ─────────────────────────────────────── */

  _drawRect(obj) {
    const ctx = this.ctx;
    const w = Math.max(obj.dimensions.width  * this.scale, 4);
    const h = Math.max(obj.dimensions.height * this.scale, 4);

    // Shadow glow
    ctx.shadowBlur  = 8;
    ctx.shadowColor = 'rgba(100,200,255,0.3)';

    // Fill
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, 'rgba(76,140,210,0.95)');
    grad.addColorStop(1, 'rgba(40,90,160,0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    _roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(150,200,255,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  _drawCircle(obj) {
    const ctx = this.ctx;
    const r = Math.max(
      Math.min(obj.dimensions.width, obj.dimensions.height) / 2 * this.scale,
      5
    );
    ctx.shadowBlur  = 8;
    ctx.shadowColor = 'rgba(100,200,255,0.3)';

    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, 'rgba(120,180,240,0.95)');
    grad.addColorStop(1, 'rgba(40, 90,160,0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,200,255,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Pulley cross-hair
    if (obj.type === 'pulley') {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(-r, 0);  ctx.lineTo(r, 0);   ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,  -r); ctx.lineTo(0, r);   ctx.stroke();
    }
  }

  _drawObjectLabel(obj, center) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font         = LABEL_FONT;
    ctx.fillStyle    = '#e0e8ff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 4;
    ctx.shadowColor  = '#000';
    const h = obj.dimensions.height * this.scale;
    ctx.fillText(obj.label, center.x, center.y + h / 2 + 14);
    ctx.restore();
  }

  _drawHatch(p1, p2) {
    const ctx = this.ctx;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx  = dy / len, ny = -dx / len; // normal pointing "into" the ground
    const hatchLen = 10, hatchSpacing = 12;
    const steps = Math.floor(len / hatchSpacing);

    ctx.strokeStyle = 'rgba(128,128,160,0.4)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= steps; i++) {
      const t  = i / steps;
      const sx = p1.x + t * dx;
      const sy = p1.y + t * dy;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + nx * hatchLen, sy + ny * hatchLen);
      ctx.stroke();
    }
  }

  _drawAngleArc(cornerPt, angleDeg, label) {
    const ctx = this.ctx;
    const r   = 28;
    ctx.save();
    ctx.strokeStyle = '#FFD54F';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(cornerPt.x, cornerPt.y, r, -angleDeg * Math.PI / 180, 0);
    ctx.stroke();

    const midAngle = -angleDeg / 2 * Math.PI / 180;
    ctx.fillStyle  = '#FFD54F';
    ctx.font       = 'italic 13px "Times New Roman", serif';
    ctx.textAlign  = 'left';
    ctx.fillText(label, cornerPt.x + (r + 6) * Math.cos(midAngle), cornerPt.y + (r + 6) * Math.sin(midAngle));
    ctx.restore();
  }
}
