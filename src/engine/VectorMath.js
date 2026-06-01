import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export class Vec2 {
  constructor(x, y) {
    this.x = x instanceof Decimal ? x : new Decimal(x);
    this.y = y instanceof Decimal ? y : new Decimal(y);
  }

  add(v) { return new Vec2(this.x.plus(v.x), this.y.plus(v.y)); }
  sub(v) { return new Vec2(this.x.minus(v.x), this.y.minus(v.y)); }
  scale(s) { return new Vec2(this.x.times(s), this.y.times(s)); }
  dot(v) { return this.x.times(v.x).plus(this.y.times(v.y)); }
  cross(v) { return this.x.times(v.y).minus(this.y.times(v.x)); }
  mag() { return this.x.pow(2).plus(this.y.pow(2)).sqrt(); }
  magNum() { return this.mag().toNumber(); }

  norm() {
    const m = this.mag();
    if (m.isZero()) return new Vec2(0, 0);
    return new Vec2(this.x.div(m), this.y.div(m));
  }

  rotate(deg) {
    const rad = (deg * Math.PI) / 180;
    const c = new Decimal(Math.cos(rad));
    const s = new Decimal(Math.sin(rad));
    return new Vec2(
      this.x.times(c).minus(this.y.times(s)),
      this.x.times(s).plus(this.y.times(c))
    );
  }

  angleDeg() {
    return (Math.atan2(this.y.toNumber(), this.x.toNumber()) * 180) / Math.PI;
  }

  toJS() { return { x: this.x.toNumber(), y: this.y.toNumber() }; }

  static fromAngleDeg(deg, mag = 1) {
    const rad = (deg * Math.PI) / 180;
    return new Vec2(
      new Decimal(mag).times(Math.cos(rad)),
      new Decimal(mag).times(Math.sin(rad))
    );
  }

  static fromJS({ x, y }) { return new Vec2(x, y); }
  static zero() { return new Vec2(0, 0); }
}

export const PhysicsCalc = {
  weight: (mass, g = 9.8) => new Decimal(mass).times(g).toNumber(),

  normalOnIncline: (mass, g, slopeDeg) => {
    const rad = (slopeDeg * Math.PI) / 180;
    return new Decimal(mass).times(g).times(Math.cos(rad)).toNumber();
  },

  frictionForce: (normal, mu) => new Decimal(normal).times(mu).toNumber(),

  accelerationOnIncline: (mass, g, slopeDeg, mu_k, movingUp = false) => {
    const rad = (slopeDeg * Math.PI) / 180;
    const m = new Decimal(mass);
    const gD = new Decimal(g);
    const sin = new Decimal(Math.sin(rad));
    const cos = new Decimal(Math.cos(rad));
    const mu = new Decimal(mu_k);
    // Net = m*g*sin(θ) - μk*m*g*cos(θ)*sign
    const gravity_parallel = gD.times(sin);
    const friction = mu.times(gD).times(cos);
    const sign = movingUp ? 1 : -1;
    return gravity_parallel.minus(friction.times(sign)).toNumber();
  },

  netForce: (forces) => {
    return forces.reduce(
      (acc, f) => acc.add(Vec2.fromJS(f.vector)),
      Vec2.zero()
    ).toJS();
  },

  decomposeAlongIncline: (forceVec, slopeDeg) => {
    const rad = (slopeDeg * Math.PI) / 180;
    const along = new Vec2(Math.cos(rad), Math.sin(rad));
    const perp = new Vec2(-Math.sin(rad), Math.cos(rad));
    const f = Vec2.fromJS(forceVec);
    return {
      parallel: f.dot(along).toNumber(),
      perpendicular: f.dot(perp).toNumber(),
    };
  },
};
