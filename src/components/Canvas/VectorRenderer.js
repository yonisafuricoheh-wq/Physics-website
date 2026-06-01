const HEAD_SIZE   = 10;
const SHAFT_WIDTH = 2.5;
const DASHED_WIDTH = 1.5;
const LABEL_FONT  = 'italic 14px "Times New Roman", Georgia, serif';
const VALUE_FONT  = '11px "JetBrains Mono", "Courier New", monospace';

export class VectorRenderer {
  constructor(ctx, worldToCanvas) {
    this.ctx = ctx;
    this.w2c = worldToCanvas; // (wx, wy) -> {x, y}
  }

  /* Draw a single force vector arrow ─────────────────────── */
  drawForce(force, objectPos, pixelsPerNewton, opts = {}) {
    const { pulsing = false, showMagnitude = true, showLabel = true } = opts;
    const pivot = this.w2c(objectPos.x, objectPos.y);
    const mag = force.magnitude ?? 0;
    if (mag < 0.001) return;

    const rad = (force.angle_degrees * Math.PI) / 180;
    const len = mag * pixelsPerNewton;

    // Tip in canvas coordinates (y is flipped)
    const tip = {
      x: pivot.x + Math.cos(rad)  * len,
      y: pivot.y - Math.sin(rad)  * len,
    };

    this._drawArrow(pivot, tip, force.color, SHAFT_WIDTH, false, pulsing);

    if (showLabel || showMagnitude) {
      const labelDist = HEAD_SIZE + 8;
      const lx = tip.x + Math.cos(rad)  * labelDist;
      const ly = tip.y - Math.sin(rad)  * labelDist;
      this._drawLabel(force.label, mag, lx, ly, force.color, showLabel, showMagnitude);
    }
  }

  /* Decompose into Fx, Fy dashed arrows ───────────────────── */
  drawComponents(force, objectPos, pixelsPerNewton) {
    const pivot = this.w2c(objectPos.x, objectPos.y);
    const rad = (force.angle_degrees * Math.PI) / 180;
    const mag = force.magnitude ?? 0;
    if (mag < 0.001) return;

    const fx = mag * Math.cos(rad);
    const fy = mag * Math.sin(rad);

    // Horizontal component
    if (Math.abs(fx) > 0.01) {
      const tipX = { x: pivot.x + fx * pixelsPerNewton, y: pivot.y };
      this._drawArrow(pivot, tipX, force.color, DASHED_WIDTH, true, false);
      const ctx = this.ctx;
      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.fillStyle = force.color + 'cc';
      ctx.fillText(force.label + 'ₓ', tipX.x + 4, tipX.y - 4);
      ctx.restore();
    }

    // Vertical component (fy is y-up, so negative in canvas)
    if (Math.abs(fy) > 0.01) {
      const tipY = { x: pivot.x, y: pivot.y - fy * pixelsPerNewton };
      this._drawArrow(pivot, tipY, force.color, DASHED_WIDTH, true, false);
      const ctx = this.ctx;
      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.fillStyle = force.color + 'cc';
      ctx.fillText(force.label + 'ᵧ', tipY.x + 4, tipY.y - 4);
      ctx.restore();
    }
  }

  /* Trajectory dotted line ─────────────────────────────────── */
  drawTrajectory(points, color = '#FFFF88') {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = color + '99';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const p0 = this.w2c(points[0].x, points[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.w2c(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Returns canvas-space tip position for teacher-mode hit testing */
  getTipCanvas(force, objectPos, pixelsPerNewton) {
    const pivot = this.w2c(objectPos.x, objectPos.y);
    const rad = (force.angle_degrees * Math.PI) / 180;
    const len = (force.magnitude ?? 0) * pixelsPerNewton;
    return {
      x: pivot.x + Math.cos(rad) * len,
      y: pivot.y - Math.sin(rad) * len,
    };
  }

  /* ── Private helpers ─────────────────────────────────────── */

  _drawArrow(from, to, color, width, dashed, pulsing) {
    const ctx = this.ctx;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.save();

    if (pulsing) {
      ctx.shadowBlur  = 18 + 6 * Math.sin(Date.now() / 150);
      ctx.shadowColor = color;
    }

    if (dashed) ctx.setLineDash([6, 5]);

    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.lineCap     = 'round';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Arrowhead (filled triangle)
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(to.x, to.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-HEAD_SIZE * 1.8, -HEAD_SIZE * 0.55);
    ctx.lineTo(-HEAD_SIZE * 1.8,  HEAD_SIZE * 0.55);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  _drawLabel(label, mag, x, y, color, showLabel, showMagnitude) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    if (showLabel) {
      ctx.font      = LABEL_FONT;
      ctx.fillStyle = color;
      ctx.fillText(label, x, y);
    }

    if (showMagnitude && mag !== null) {
      ctx.font      = VALUE_FONT;
      ctx.fillStyle = color + 'bb';
      const offset = showLabel ? 14 : 0;
      ctx.fillText(`${mag.toFixed(2)} N`, x, y + offset);
    }

    ctx.restore();
  }
}
