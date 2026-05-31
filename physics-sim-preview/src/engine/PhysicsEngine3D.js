import * as CANNON from 'cannon-es';

export class PhysicsEngine3D {
  constructor() {
    this.world     = null;
    this.bodies    = {};
    this.blueprint = null;
    this._extraForces = {};
    this._materials   = {};
  }

  init(blueprint) {
    this.blueprint = blueprint;
    this.bodies    = {};
    this._extraForces = {};
    this._materials   = {};

    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -blueprint.environment.g, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = false;

    // Default material — used when no specific ContactMaterial pair exists
    const def = new CANNON.Material('default');
    this._defaultMat = def;
    const defContact = new CANNON.ContactMaterial(def, def, { friction: 0.3, restitution: 0 });
    this.world.addContactMaterial(defContact);
    this.world.defaultContactMaterial = defContact;

    blueprint.surfaces.forEach(s => this._addSurface(s));
    blueprint.objects.forEach(o => this._addObject(o));

    // Per-pair ContactMaterials
    const objEntries = Object.entries(this._materials).filter(([id]) => this.bodies[id]);
    const surfEntries = Object.entries(this._materials).filter(([id]) => !this.bodies[id]);
    objEntries.forEach(([oid, om]) => {
      surfEntries.forEach(([, sm]) => {
        const cm = new CANNON.ContactMaterial(om.mat, sm.mat, {
          friction: Math.sqrt(om.mu_k * sm.mu_k),
          restitution: om.restitution ?? 0,
        });
        this.world.addContactMaterial(cm);
      });
    });

    // Initial velocities
    const vels = blueprint.initial_conditions?.velocities || {};
    Object.entries(vels).forEach(([id, v]) => {
      const b = this.bodies[id];
      if (b) b.velocity.set(v.x, v.y, 0);
    });
  }

  _mat(props) {
    const mat = new CANNON.Material();
    return { mat, mu_k: props.mu_k ?? 0.2, mu_s: props.mu_s ?? 0.25, restitution: props.restitution ?? 0 };
  }

  _addSurface(surf) {
    if (!surf.points || surf.points.length < 2) return;
    const entry = this._mat(surf.properties);
    this._materials[surf.id] = entry;

    const p1 = surf.points[0];
    const p2 = surf.points[surf.points.length - 1];

    if (surf.type === 'floor') {
      const body = new CANNON.Body({ mass: 0, material: entry.mat });
      body.addShape(new CANNON.Plane());
      body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // normal → +Y
      body.position.set(0, p1.y, 0);
      this.world.addBody(body);
      return;
    }

    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const body = new CANNON.Body({ mass: 0, material: entry.mat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, 0.04, 2)));
    body.position.set(cx, cy, 0);
    body.quaternion.setFromEuler(0, 0, angle);
    this.world.addBody(body);
  }

  _addObject(obj) {
    const entry = this._mat({ ...obj.properties, restitution: obj.properties.restitution ?? 0 });
    this._materials[obj.id] = entry;

    const isFixed  = obj.properties.is_fixed;
    const mass     = isFixed ? 0 : Math.max(obj.mass ?? 1, 0.001);
    const isCircle = obj.type === 'circle' || obj.type === 'pulley';

    let shape;
    if (isCircle) {
      const r = Math.max((Math.max(obj.dimensions.width, obj.dimensions.height)) / 2, 0.05);
      shape = new CANNON.Sphere(r);
    } else {
      const hw = Math.max(obj.dimensions.width  / 2, 0.05);
      const hh = Math.max(obj.dimensions.height / 2, 0.05);
      shape = new CANNON.Box(new CANNON.Vec3(hw, hh, 0.25));
    }

    const body = new CANNON.Body({ mass, material: entry.mat, linearDamping: 0, angularDamping: 0.1 });
    body.addShape(shape);
    body.position.set(obj.position.x, obj.position.y, 0);
    const rad = (obj.angle * Math.PI) / 180;
    body.quaternion.setFromEuler(0, 0, -rad);
    this.world.addBody(body);
    this.bodies[obj.id] = body;
  }

  applyExtraForce(objectId, fx, fy) { this._extraForces[objectId] = { x: fx, y: fy }; }
  clearExtraForces() { this._extraForces = {}; }

  step(dtSeconds) {
    Object.entries(this._extraForces).forEach(([id, f]) => {
      const b = this.bodies[id];
      if (b && b.mass > 0) b.applyForce(new CANNON.Vec3(f.x, f.y, 0));
    });
    this.world.fixedStep(dtSeconds);
  }

  getState() {
    const out = {};
    Object.entries(this.bodies).forEach(([id, b]) => {
      out[id] = {
        position:   { x: b.position.x,   y: b.position.y,   z: b.position.z },
        velocity:   { x: b.velocity.x,   y: b.velocity.y,   z: b.velocity.z },
        quaternion: { x: b.quaternion.x,  y: b.quaternion.y,  z: b.quaternion.z,  w: b.quaternion.w },
        angle:      this._getAngleZ(b),
        speed:      b.velocity.length(),
      };
    });
    return out;
  }

  _getAngleZ(body) {
    // Extract Z-rotation from quaternion in degrees
    const { x, y, z, w } = body.quaternion;
    const sinz = 2 * (w * z + x * y);
    const cosz = 1 - 2 * (y * y + z * z);
    return (-Math.atan2(sinz, cosz) * 180) / Math.PI;
  }

  reset()   { if (this.blueprint) this.init(this.blueprint); }
  destroy() { this.world = null; }
}
