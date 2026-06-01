import Matter from 'matter-js';

const { Engine, World, Bodies, Body, Constraint, Composite } = Matter;

const SCALE = 100; // pixels per meter in Matter world (we use 1px = 1m internally)

export class PhysicsEngine {
  constructor() {
    this.engine    = null;
    this.world     = null;
    this.bodies    = {};   // id -> Matter body
    this.staticBodies = {};
    this.constraints = {};
    this.blueprint = null;
    this._extraForces = {}; // objectId -> {x, y} extra Newtons
  }

  init(blueprint) {
    this.blueprint = blueprint;
    this.bodies = {};
    this.staticBodies = {};
    this.constraints = {};
    this._extraForces = {};

    if (this.engine) Engine.clear(this.engine);

    this.engine = Engine.create({
      gravity: {
        x: 0,
        y: blueprint.environment.g,
        // Matter.js uses ms for dt internally; our world coords are in meters.
        // For Verlet: a_eff·dt_ms² = ½·g·dt_s²  →  scale = 1e-6 (exact for Euler; ~2% over for Verlet, acceptable).
        scale: 0.000001,
      },
    });
    this.world = this.engine.world;

    blueprint.surfaces.forEach(s => this._addSurface(s));
    blueprint.objects.forEach(o => this._addObject(o));
    blueprint.constraints.forEach(c => this._addConstraint(c));

    const vels = blueprint.initial_conditions?.velocities || {};
    Object.entries(vels).forEach(([id, v]) => {
      const b = this.bodies[id];
      if (b) Body.setVelocity(b, { x: v.x, y: -v.y });
    });
  }

  _addSurface(surf) {
    if (!surf.points || surf.points.length < 2) return;
    const p1 = surf.points[0];
    const p2 = surf.points[surf.points.length - 1];
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const body = Bodies.rectangle(cx, -cy, len, 0.08, {
      isStatic:      true,
      angle:         -angle,
      friction:      surf.properties.mu_k ?? 0.2,
      frictionStatic: surf.properties.mu_s ?? 0.25,
      restitution:   0,
      label:         surf.id,
    });

    this.staticBodies[surf.id] = body;
    World.add(this.world, body);
  }

  _addObject(obj) {
    const x = obj.position.x;
    const y = -obj.position.y; // flip y for Matter (y-down)
    const angleMatter = -(obj.angle * Math.PI) / 180;

    const opts = {
      mass:          Math.max(obj.mass ?? 1, 0.001),
      isStatic:      obj.properties.is_fixed,
      friction:      obj.properties.mu_k  ?? 0.2,
      frictionStatic: obj.properties.mu_s ?? 0.25,
      restitution:   obj.properties.restitution ?? 0,
      angle:         angleMatter,
      label:         obj.id,
      frictionAir:   0,
    };

    let body;
    if (obj.type === 'circle' || obj.type === 'pulley') {
      const r = Math.max(obj.dimensions.width, obj.dimensions.height) / 2;
      body = Bodies.circle(x, y, Math.max(r, 0.05), opts);
    } else {
      body = Bodies.rectangle(
        x, y,
        Math.max(obj.dimensions.width, 0.05),
        Math.max(obj.dimensions.height, 0.05),
        opts
      );
    }

    this.bodies[obj.id] = body;
    World.add(this.world, body);
  }

  _addConstraint(c) {
    const bA = this.bodies[c.object_a] || this.staticBodies[c.object_a];
    const bB = this.bodies[c.object_b] || this.staticBodies[c.object_b];
    if (!bA || !bB) return;

    const isSpring = c.type === 'spring';
    const constraint = Constraint.create({
      bodyA:     bA,
      bodyB:     bB,
      length:    c.length ?? undefined,
      stiffness: isSpring ? Math.min((c.stiffness ?? 100) / 1000, 0.5) : 1.0,
      damping:   isSpring ? 0.05 : 0,
      label:     c.id,
    });

    this.constraints[c.id] = constraint;
    World.add(this.world, constraint);
  }

  applyExtraForce(objectId, fx, fy) {
    this._extraForces[objectId] = { x: fx, y: -fy };
  }

  clearExtraForces() { this._extraForces = {}; }

  step(dtSeconds) {
    Object.entries(this._extraForces).forEach(([id, f]) => {
      const b = this.bodies[id];
      if (b && !b.isStatic) {
        Body.applyForce(b, b.position, { x: f.x, y: f.y });
      }
    });
    Engine.update(this.engine, dtSeconds * 1000);
  }

  getState() {
    const out = {};
    Object.entries(this.bodies).forEach(([id, b]) => {
      out[id] = {
        position: { x: b.position.x, y: -b.position.y },
        velocity: { x: b.velocity.x, y: -b.velocity.y },
        angle:    (-b.angle * 180) / Math.PI,
        speed:    Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2),
      };
    });
    return out;
  }

  reset() {
    if (this.blueprint) this.init(this.blueprint);
  }

  destroy() {
    if (this.engine) {
      Engine.clear(this.engine);
      this.engine = null;
    }
  }
}
