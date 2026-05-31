export const FORCE_COLORS = {
  gravity:    '#4FC3F7', // sky blue
  normal:     '#66BB6A', // green
  friction:   '#EF5350', // red
  tension:    '#FFA726', // orange
  applied:    '#AB47BC', // purple
  spring:     '#26C6DA', // cyan
  buoyancy:   '#29B6F6', // light blue
  electric:   '#FFD54F', // amber
  magnetic:   '#EC407A', // pink
  net:        '#FFEE58', // yellow
};

const uid = () => Math.random().toString(36).substr(2, 8);

function parseObj(raw) {
  return {
    id:       raw.id || `obj_${uid()}`,
    type:     raw.type || 'rectangle',
    label:    raw.label || 'object',
    mass:     raw.mass ?? null,
    position: { x: raw.position?.x ?? 0, y: raw.position?.y ?? 0 },
    dimensions: { width: raw.dimensions?.width ?? 1, height: raw.dimensions?.height ?? 0.5 },
    angle:    raw.angle ?? 0,
    initial_velocity: { x: raw.initial_velocity?.x ?? 0, y: raw.initial_velocity?.y ?? 0 },
    properties: {
      mu_s:            raw.properties?.mu_s ?? null,
      mu_k:            raw.properties?.mu_k ?? null,
      spring_constant: raw.properties?.spring_constant ?? null,
      is_fixed:        raw.properties?.is_fixed ?? false,
      restitution:     raw.properties?.restitution ?? 0,
    },
  };
}

function parseSurface(raw) {
  return {
    id:     raw.id || `surf_${uid()}`,
    type:   raw.type || 'line',
    label:  raw.label || '',
    points: Array.isArray(raw.points) && raw.points.length >= 2
      ? raw.points
      : [{ x: -5, y: 0 }, { x: 5, y: 0 }],
    angle:  raw.angle ?? 0,
    length: raw.length ?? 10,
    properties: {
      mu_s:           raw.properties?.mu_s ?? 0.3,
      mu_k:           raw.properties?.mu_k ?? 0.25,
      is_frictionless: raw.properties?.is_frictionless ?? false,
    },
  };
}

function parseForce(raw, objects) {
  const colorType = raw.color_type || raw.type || 'applied';
  return {
    id:          raw.id || `force_${uid()}`,
    type:        raw.type || 'applied',
    label:       raw.label || 'F',
    object_id:   raw.object_id || (objects[0]?.id ?? null),
    pivot_point: { x: raw.pivot_point?.x ?? 0, y: raw.pivot_point?.y ?? 0 },
    magnitude:   raw.magnitude ?? null,
    angle_degrees: raw.angle_degrees ?? 0,
    vector:      { x: raw.vector?.x ?? 0, y: raw.vector?.y ?? 0 },
    color:       FORCE_COLORS[colorType] ?? '#FFFFFF',
    known:       raw.known ?? (raw.magnitude !== null && raw.magnitude !== undefined),
    pulsing:     false,
  };
}

function parseConstraint(raw) {
  return {
    id:        raw.id || `cst_${uid()}`,
    type:      raw.type || 'string',
    object_a:  raw.object_a,
    object_b:  raw.object_b,
    length:    raw.length ?? null,
    stiffness: raw.stiffness ?? null,
    label:     raw.label || 'T',
  };
}

export function parseBlueprint(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Blueprint must be a JSON object');

  const objects   = (raw.objects   || []).map(parseObj);
  const surfaces  = (raw.surfaces  || []).map(parseSurface);
  const forces    = (raw.forces    || []).map(r => parseForce(r, objects));
  const constraints = (raw.constraints || []).map(parseConstraint);

  // Merge velocities: initial_conditions.velocities wins, then obj.initial_velocity
  const baseVels   = raw.initial_conditions?.velocities || {};
  const velocities = { ...baseVels };
  objects.forEach(obj => {
    if (!velocities[obj.id]) {
      const iv = obj.initial_velocity;
      if (iv && (Math.abs(iv.x ?? 0) > 0.001 || Math.abs(iv.y ?? 0) > 0.001))
        velocities[obj.id] = { x: iv.x ?? 0, y: iv.y ?? 0 };
    }
  });

  const problemType = raw.problem_type || 'other';
  let missing = Array.isArray(raw.missing_data) ? raw.missing_data : [];

  // Sanitize: default mass to 1 for projectiles (mass doesn't affect trajectory)
  if (problemType === 'projectile') {
    objects.forEach(obj => {
      if (obj.mass === null) obj.mass = 1;
      // Nudge ground-level balls with upward velocity slightly above the floor
      // so Cannon-es contact resolution doesn't interfere with launch
      const iv = obj.initial_velocity;
      if (obj.position.y < 0.5 && iv && iv.y > 0.5) {
        obj.position.y = 0.5;
      }
    });
    missing = missing.filter(d => !d.toLowerCase().includes('.mass'));
  }

  // Sanitize: clamp wild coordinates that would break the 3D scene
  const MAX_C = 200;
  objects.forEach(obj => {
    obj.position.x = Math.max(-MAX_C, Math.min(MAX_C, obj.position.x || 0));
    obj.position.y = Math.max(-0.5,   Math.min(MAX_C, obj.position.y || 0));
    const iv = obj.initial_velocity;
    if (iv) {
      iv.x = Math.max(-300, Math.min(300, iv.x ?? 0));
      iv.y = Math.max(-300, Math.min(300, iv.y ?? 0));
    }
  });
  surfaces.forEach(surf => {
    surf.points = surf.points.map(p => ({
      x: Math.max(-MAX_C, Math.min(MAX_C, p.x || 0)),
      y: Math.max(-2,     Math.min(MAX_C, p.y || 0)),
    }));
  });

  // Sanitize: nudge objects that are horizontally inside a wall surface
  const walls = surfaces.filter(s => {
    const p1 = s.points[0], p2 = s.points[s.points.length - 1];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    return s.type === 'wall' || Math.abs(Math.sin(Math.atan2(dy, dx))) > 0.85;
  });
  const HALF_WALL = 1.25; // matches Building bW/2 (2.4/2) in Scene3D + margin
  objects.forEach(obj => {
    const hw = (obj.dimensions.width ?? 0.8) / 2;
    walls.forEach(wall => {
      const wx = (wall.points[0].x + wall.points[wall.points.length - 1].x) / 2;
      if (Math.abs(obj.position.x - wx) < HALF_WALL + hw) {
        // Preserve which side the object was on; default to right
        const side = obj.position.x >= wx ? 1 : -1;
        obj.position.x = wx + side * (HALF_WALL + hw + 0.15);
      }
    });
  });

  // Spread objects that end up at the same x,y (overlapping → only one visible)
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i], b = objects[j];
      const dx = Math.abs(a.position.x - b.position.x);
      const dy = Math.abs(a.position.y - b.position.y);
      if (dx < 0.6 && dy < 0.6) {
        // Push b to the right so both are visible
        b.position.x = a.position.x + 2.5;
      }
    }
  }

  return {
    problem_type:    problemType,
    description:     raw.description || '',
    coordinate_system: raw.coordinate_system || { origin: { x: 0, y: 0 } },
    environment:     { g: 9.8, medium: 'air', ...(raw.environment || {}) },
    objects,
    surfaces,
    forces,
    constraints,
    initial_conditions: { t0: 0, velocities },
    missing_data:    missing,
    known_results:   raw.known_results || null,
    known_values:    raw.known_values  || {},
  };
}

export function autoComputeForces(bp) {
  const { objects, surfaces, environment, forces, problem_type, constraints } = bp;
  const g = environment.g;
  const result = [...forces];
  const has = (type, objId) => result.some(f => f.type === type && f.object_id === objId);

  const isProjectile = problem_type === 'projectile';
  const isPulley     = problem_type === 'pulley';

  // Identify hanging objects in pulley problems (object_b in string constraints)
  const hangingIds = new Set(
    isPulley ? (constraints || []).filter(c => c.type === 'string').map(c => c.object_b) : []
  );

  objects.forEach(obj => {
    if (obj.mass === null || obj.properties.is_fixed) return;
    const px = obj.position.x, py = obj.position.y;
    const m = obj.mass, weight = m * g;

    if (!has('gravity', obj.id)) {
      result.push({
        id: `auto_gravity_${obj.id}`, type: 'gravity', label: 'mg',
        object_id: obj.id, pivot_point: { x: px, y: py },
        magnitude: weight, angle_degrees: 270,
        vector: { x: 0, y: -weight },
        color: FORCE_COLORS.gravity, known: true, pulsing: false,
      });
    }

    // Projectile: airborne, no surface forces
    if (isProjectile) return;

    // Hanging pulley object: only gravity acts (tension added separately below)
    if (hangingIds.has(obj.id)) return;

    // Only add surface contact forces for surfaces the object is actually resting on
    const restingSurfaces = surfaces.filter(surf => {
      if (surf.type === 'floor') return py < 0.5; // near ground
      if (surf.type === 'wall')  return false;      // never resting on a wall
      // For inclined lines: check if object is close to the surface
      const p1 = surf.points[0], p2 = surf.points[surf.points.length - 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) return false;
      // Distance from point to line
      const dist = Math.abs((dy * px - dx * py + p2.x * p1.y - p2.y * p1.x) / len);
      return dist < 1.5;
    });

    restingSurfaces.forEach(surf => {
      const rad = (surf.angle * Math.PI) / 180;
      const normalMag = weight * Math.cos(rad);
      const normalAngle = surf.angle + 90;

      if (!has('normal', obj.id)) {
        result.push({
          id: `auto_normal_${obj.id}_${surf.id}`, type: 'normal', label: 'N',
          object_id: obj.id, pivot_point: { x: px, y: py },
          magnitude: normalMag,
          angle_degrees: normalAngle,
          vector: { x: -normalMag * Math.sin(rad), y: normalMag * Math.cos(rad) },
          color: FORCE_COLORS.normal, known: true, pulsing: false,
        });
      }

      const mu_k = surf.properties.mu_k;
      if (mu_k > 0 && !has('friction', obj.id)) {
        const frictionMag = mu_k * normalMag;
        result.push({
          id: `auto_friction_${obj.id}_${surf.id}`, type: 'friction', label: 'f',
          object_id: obj.id, pivot_point: { x: px, y: py },
          magnitude: frictionMag,
          angle_degrees: surf.angle,
          vector: {
            x: frictionMag * Math.cos(rad),
            y: frictionMag * Math.sin(rad),
          },
          color: FORCE_COLORS.friction, known: true, pulsing: false,
        });
      }
    });
  });

  // Tension arrows for pulley / string constraints
  if (isPulley) {
    (constraints || []).forEach(c => {
      if (c.type !== 'string') return;
      const objA = objects.find(o => o.id === c.object_a); // table object
      const objB = objects.find(o => o.id === c.object_b); // hanging object
      if (!objA || !objB || objA.mass === null || objB.mass === null) return;
      // Atwood tension (frictionless approximation for display)
      const T = (objA.mass * objB.mass * g) / (objA.mass + objB.mass);
      if (!has('tension', c.object_a)) {
        result.push({
          id: `auto_tension_${c.object_a}`, type: 'tension', label: c.label || 'T',
          object_id: c.object_a, pivot_point: { x: objA.position.x, y: objA.position.y },
          magnitude: T, angle_degrees: 0,
          vector: { x: T, y: 0 },
          color: FORCE_COLORS.tension, known: false, pulsing: false,
        });
      }
      if (!has('tension', c.object_b)) {
        result.push({
          id: `auto_tension_${c.object_b}`, type: 'tension', label: c.label || 'T',
          object_id: c.object_b, pivot_point: { x: objB.position.x, y: objB.position.y },
          magnitude: T, angle_degrees: 90,
          vector: { x: 0, y: T },
          color: FORCE_COLORS.tension, known: false, pulsing: false,
        });
      }
    });
  }

  return { ...bp, forces: result };
}
