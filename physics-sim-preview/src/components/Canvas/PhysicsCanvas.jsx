import React, { useRef, useEffect, useCallback, useState } from 'react';
import useStore from '../../store/simulationStore';
import { VectorRenderer } from './VectorRenderer';
import { ObjectRenderer } from './ObjectRenderer';

const MIN_SCALE = 20, MAX_SCALE = 400;

export default function PhysicsCanvas() {
  const canvasRef  = useRef(null);
  const dprRef     = useRef(1);
  const sizeRef    = useRef({ w: 800, h: 600 });

  // Drag state refs (avoid re-renders)
  const dragRef    = useRef(null); // { type:'pan'|'force', forceId, startX, startY }
  const [hoveredForce, setHoveredForce] = useState(null);

  const blueprint        = useStore(s => s.blueprint);
  const objectStates     = useStore(s => s.objectStates);
  const trajectories     = useStore(s => s.trajectories);
  const showComponents   = useStore(s => s.showComponents);
  const showGrid         = useStore(s => s.showGrid);
  const showLabels       = useStore(s => s.showLabels);
  const showTrajectory   = useStore(s => s.showTrajectory);
  const teacherMode      = useStore(s => s.teacherMode);
  const highlightedForces = useStore(s => s.highlightedForces);
  const viewScale        = useStore(s => s.viewScale);
  const panX             = useStore(s => s.panX);
  const panY             = useStore(s => s.panY);
  const forceOverrides   = useStore(s => s.forceOverrides);
  const setCamera        = useStore(s => s.setCamera);
  const setForceOverride = useStore(s => s.setForceOverride);

  /* World → Canvas coordinate transform ──────────────────── */
  const w2c = useCallback((wx, wy) => {
    const { w, h } = sizeRef.current;
    return {
      x: w / 2 + wx * viewScale + panX,
      y: h / 2 - wy * viewScale + panY,
    };
  }, [viewScale, panX, panY]);

  const c2w = useCallback((cx, cy) => {
    const { w, h } = sizeRef.current;
    return {
      x: (cx - w / 2 - panX) / viewScale,
      y: -(cy - h / 2 - panY) / viewScale,
    };
  }, [viewScale, panX, panY]);

  /* Auto-fit camera to blueprint ─────────────────────────── */
  const fitCamera = useCallback(() => {
    if (!blueprint) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    blueprint.objects.forEach(o => {
      minX = Math.min(minX, o.position.x - o.dimensions.width);
      maxX = Math.max(maxX, o.position.x + o.dimensions.width);
      minY = Math.min(minY, o.position.y - o.dimensions.height);
      maxY = Math.max(maxY, o.position.y + o.dimensions.height);
    });
    blueprint.surfaces.forEach(s => {
      s.points.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
    });
    if (!isFinite(minX)) return;

    const { w, h } = sizeRef.current;
    const worldW = maxX - minX + 4;
    const worldH = maxY - minY + 4;
    const scaleX = w / worldW, scaleY = h / worldH;
    const scale  = Math.min(scaleX, scaleY, MAX_SCALE);

    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setCamera(
      Math.max(scale, MIN_SCALE),
      -cx * scale,
      cy  * scale
    );
  }, [blueprint, setCamera]);

  useEffect(() => { fitCamera(); }, [blueprint, fitCamera]);

  /* Main render loop ─────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      const { w, h } = sizeRef.current;

      ctx.clearRect(0, 0, w * dprRef.current, h * dprRef.current);

      // Background
      ctx.fillStyle = '#0d0d18';
      ctx.fillRect(0, 0, w * dprRef.current, h * dprRef.current);

      if (!blueprint) {
        drawPlaceholder(ctx, w, h);
        rafId = requestAnimationFrame(draw);
        return;
      }

      const objRenderer = new ObjectRenderer(ctx, w2c, viewScale);
      const vecRenderer = new VectorRenderer(ctx, w2c);

      // Pixels-per-Newton scale: auto-size so max force = 120px
      const forces = blueprint.forces;
      const maxMag = forces.reduce((m, f) => Math.max(m, f.magnitude ?? 0), 1);
      const pxPerN = Math.min(120 / maxMag, 8);

      if (showGrid) objRenderer.drawGrid(w, h, { x: 0, y: 0 }, viewScale);

      // Surfaces
      blueprint.surfaces.forEach(s => objRenderer.drawSurface(s));

      // Trajectories
      if (showTrajectory) {
        blueprint.objects.forEach(obj => {
          const traj = trajectories[obj.id];
          if (traj?.length > 1) vecRenderer.drawTrajectory(traj);
        });
      }

      // Objects (use physics state if available, else blueprint initial)
      try {
        blueprint.objects.forEach(obj => {
          const state = objectStates[obj.id] || null;
          objRenderer.drawObject(obj, state);
          if (state) objRenderer.drawVelocityVector(state);
        });
      } catch (err) {
        console.error('[PhysicsCanvas] object render error:', err);
      }

      // Force vectors
      try {
        forces.forEach(force => {
          const obj = blueprint.objects.find(o => o.id === force.object_id);
          if (!obj) return;

          const state = objectStates[obj.id];
          const pos   = state ? state.position : obj.position;

          const override = forceOverrides[force.id];
          const effectiveForce = override
            ? { ...force, magnitude: override.magnitude, angle_degrees: override.angle_degrees }
            : force;

          const isHighlighted = highlightedForces.includes(force.label) || hoveredForce === force.id;

          vecRenderer.drawForce(effectiveForce, pos, pxPerN, {
            pulsing:       isHighlighted,
            showMagnitude: showLabels,
            showLabel:     showLabels,
          });

          if (showComponents) {
            vecRenderer.drawComponents(effectiveForce, pos, pxPerN);
          }

          // Teacher mode: draw drag handle on tip
          if (teacherMode) {
            const tip = vecRenderer.getTipCanvas(effectiveForce, pos, pxPerN);
            ctx.save();
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHighlighted ? force.color : force.color + '88';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
            ctx.restore();
          }
        });
      } catch (err) {
        console.error('[PhysicsCanvas] force render error:', err);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [
    blueprint, objectStates, trajectories,
    showComponents, showGrid, showLabels, showTrajectory,
    teacherMode, highlightedForces, forceOverrides,
    viewScale, panX, panY, w2c, hoveredForce,
  ]);

  /* Canvas resize observer ───────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        const dpr = window.devicePixelRatio || 1;
        dprRef.current = dpr;
        sizeRef.current = { w: width, h: height };
        canvas.width  = width  * dpr;
        canvas.height = height * dpr;
        canvas.style.width  = width  + 'px';
        canvas.style.height = height + 'px';
        canvas.getContext('2d').scale(dpr, dpr);
      }
    });

    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  /* Mouse events ─────────────────────────────────────────── */
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const { w, h } = sizeRef.current;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewScale * factor));
    // Keep world point under cursor fixed
    const wx = (mx - w / 2 - panX) / viewScale;
    const wy = -(my - h / 2 - panY) / viewScale;
    const newPanX = mx - w / 2 - wx * newScale;
    const newPanY = my - h / 2 + wy * newScale;
    setCamera(newScale, newPanX, newPanY);
  }, [viewScale, panX, panY, setCamera]);

  const getForceAtCanvas = useCallback((cx, cy) => {
    if (!blueprint) return null;
    const forces = blueprint.forces;
    const maxMag = forces.reduce((m, f) => Math.max(m, f.magnitude ?? 0), 1);
    const pxPerN = Math.min(120 / maxMag, 8);

    for (const force of forces) {
      const obj = blueprint.objects.find(o => o.id === force.object_id);
      if (!obj) continue;
      const state = objectStates[obj.id];
      const pos   = state ? state.position : obj.position;
      const override = forceOverrides[force.id];
      const eff = override ? { ...force, ...override } : force;

      const tip = new VectorRenderer(null, w2c).getTipCanvas(eff, pos, pxPerN);
      const d = Math.hypot(cx - tip.x, cy - tip.y);
      if (d < 12) return force;
    }
    return null;
  }, [blueprint, objectStates, forceOverrides, w2c]);

  const onMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    if (teacherMode) {
      const hit = getForceAtCanvas(cx, cy);
      if (hit) {
        dragRef.current = { type: 'force', forceId: hit.id, startX: cx, startY: cy };
        return;
      }
    }
    dragRef.current = { type: 'pan', startX: cx, startY: cy, startPanX: panX, startPanY: panY };
  }, [teacherMode, getForceAtCanvas, panX, panY]);

  const onMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    // Hover detection
    if (teacherMode) {
      const hit = getForceAtCanvas(cx, cy);
      setHoveredForce(hit?.id ?? null);
    }

    const d = dragRef.current;
    if (!d) return;

    if (d.type === 'pan') {
      setCamera(viewScale, d.startPanX + cx - d.startX, d.startPanY + cy - d.startY);
    } else if (d.type === 'force') {
      const force = blueprint?.forces.find(f => f.id === d.forceId);
      if (!force) return;
      const obj   = blueprint.objects.find(o => o.id === force.object_id);
      if (!obj) return;
      const state = objectStates[obj.id];
      const pos   = state ? state.position : obj.position;
      const pivot = w2c(pos.x, pos.y);

      const dx = cx - pivot.x, dy = -(cy - pivot.y); // y flipped
      const newAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const maxMag = blueprint.forces.reduce((m, f) => Math.max(m, f.magnitude ?? 0), 1);
      const pxPerN = Math.min(120 / maxMag, 8);
      const newMag = Math.sqrt(dx * dx + dy * dy) / pxPerN;
      setForceOverride(d.forceId, Math.max(0, newMag), newAngle);
    }
  }, [viewScale, panX, panY, blueprint, objectStates, w2c, setCamera, setForceOverride, teacherMode, getForceAtCanvas]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d0d18' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: teacherMode ? 'crosshair' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      {/* Teacher mode badge */}
      {teacherMode && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(171,71,188,0.85)', color: '#fff',
          padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          pointerEvents: 'none',
        }}>
          TEACHER MODE — drag vector tips to adjust forces
        </div>
      )}
    </div>
  );
}

function drawPlaceholder(ctx, w, h) {
  ctx.save();
  ctx.fillStyle   = 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 8]);
  ctx.strokeRect(w / 2 - 180, h / 2 - 120, 360, 240);

  ctx.font        = '15px "Inter", system-ui, sans-serif';
  ctx.fillStyle   = 'rgba(255,255,255,0.25)';
  ctx.textAlign   = 'center';
  ctx.fillText('Upload a physics problem image', w / 2, h / 2 - 16);
  ctx.fillText('or click "Load Demo"', w / 2, h / 2 + 12);
  ctx.restore();
}
