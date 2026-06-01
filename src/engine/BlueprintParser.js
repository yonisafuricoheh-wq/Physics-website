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
      mu_s:     raw.properties?.mu_s ?? null,
      mu_k:     raw.properties?.mu_k ?? null,
      is_fixed: raw.properties?.is_fixed ?? false,
      restitution: raw.properties?.restitution ?? 0,
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

  return {
    problem_type:    raw.problem_type || 'other',
    description:     raw.description || '',
    coordinate_system: raw.coordinate_system || { origin: { x: 0, y: 0 } },
    environment:     { g: 9.8, medium: 'air', ...(raw.environment || {}) },
    objects,
    surfaces,
    forces,
    constraints,
    initial_conditions: raw.initial_conditions || { t0: 0, velocities: {} },
    missing_data:    Array.isArray(raw.missing_data) ? raw.missing_data : [],
    known_results:   raw.known_results || null,
  };
}

export function autoComputeForces(bp) {
  const { objects, surfaces, environment, forces } = bp;
  const g = environment.g;
  const result = [...forces];
  const has = (type, objId) => result.some(f => f.type === type && f.object_id === objId);

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

    surfaces.forEach(surf => {
      const rad = (surf.angle * Math.PI) / 180;
      const normalMag = weight * Math.cos(rad);
      const normalAngle = surf.angle + 90;

      if (!has('normal', obj.id)) {
        result.push({
          id: `auto_normal_${obj.id}_${surf.id}`, type: 'normal', label: 'N',
          object_id: obj.id, pivot_point: { x: px, y: py },
          magnitude: normalMag,
          angle_degrees: normalAngle,
          vector: {
            x: -normalMag * Math.sin(rad),
            y:  normalMag * Math.cos(rad),
          },
          color: FORCE_COLORS.normal, known: true, pulsing: false,
        });
      }

      const mu_k = surf.properties.mu_k;
      if (mu_k > 0 && !has('friction', obj.id)) {
        const frictionMag = mu_k * normalMag;
        // Friction opposes downward sliding: points UP the slope (same direction as surf.angle).
        // surf.angle + 180 would point DOWN the slope — that was the previous bug.
        const frictionAngle = surf.angle;
        result.push({
          id: `auto_friction_${obj.id}_${surf.id}`, type: 'friction', label: 'f',
          object_id: obj.id, pivot_point: { x: px, y: py },
          magnitude: frictionMag,
          angle_degrees: frictionAngle,
          vector: {
            x: frictionMag * Math.cos(rad),
            y: frictionMag * Math.sin(rad),
          },
          color: FORCE_COLORS.friction, known: true, pulsing: false,
        });
      }
    });
  });

  return { ...bp, forces: result };
}
