// Classic inclined-plane problem:
// 5 kg block on a 30° slope, μk = 0.20, μs = 0.25
// N = mg·cos30 ≈ 42.4 N, f = μk·N ≈ 8.49 N
// a = g(sin30 – μk·cos30) ≈ 3.20 m/s²

export const DEMO_BLUEPRINT = {
  problem_type: 'inclined_plane',
  description:  'A 5 kg block slides down a 30° frictionful inclined plane. Find the acceleration.',
  coordinate_system: { origin: { x: 0, y: 0 }, x_positive: 'right', y_positive: 'up' },
  environment: { g: 9.8, medium: 'air' },

  objects: [
    {
      id:    'block_1',
      type:  'rectangle',
      label: 'm = 5 kg',
      mass:  5.0,
      position:   { x: 0, y: 2.887 },
      dimensions: { width: 0.55, height: 0.38 },
      angle:  30,
      initial_velocity: { x: 0, y: 0 },
      properties: { mu_s: 0.25, mu_k: 0.2, is_fixed: false, restitution: 0 },
    },
  ],

  surfaces: [
    {
      id:    'incline_1',
      type:  'line',
      label: 'θ = 30°',
      points: [{ x: -4.0, y: 0 }, { x: 4.0, y: 4.619 }],
      angle:  30,
      length: 9.238,
      properties: { mu_s: 0.25, mu_k: 0.2, is_frictionless: false },
    },
    {
      id:    'ground_1',
      type:  'floor',
      label: 'ground',
      points: [{ x: -5, y: 0 }, { x: 5, y: 0 }],
      angle:  0,
      length: 10,
      properties: { mu_s: 0.5, mu_k: 0.4, is_frictionless: false },
    },
  ],

  forces: [
    {
      id: 'w_block1', type: 'gravity', label: 'mg',
      object_id: 'block_1',
      pivot_point: { x: 0, y: 2.887 },
      magnitude: 49.0, angle_degrees: 270,
      vector: { x: 0, y: -49.0 },
      color_type: 'gravity', known: true,
    },
    {
      id: 'n_block1', type: 'normal', label: 'N',
      object_id: 'block_1',
      pivot_point: { x: 0, y: 2.887 },
      magnitude: 42.44, angle_degrees: 120,
      vector: { x: -21.22, y: 36.75 },
      color_type: 'normal', known: true,
    },
    {
      id: 'f_block1', type: 'friction', label: 'fₖ',
      object_id: 'block_1',
      pivot_point: { x: 0, y: 2.887 },
      magnitude: 8.49, angle_degrees: 30,
      vector: { x: 7.35, y: 4.25 },
      color_type: 'friction', known: true,
    },
  ],

  constraints: [],
  initial_conditions: { t0: 0, velocities: {} },
  missing_data: [],
  known_results: {
    acceleration: 3.2,
    description:  'a = g(sin30° − μk·cos30°) ≈ 3.20 m/s² down the slope',
  },
};
