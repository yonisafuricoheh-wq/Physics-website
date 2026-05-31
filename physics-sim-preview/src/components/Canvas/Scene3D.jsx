import React, { useRef, useEffect, useMemo, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import useStore from '../../store/simulationStore';

const FORCE_COLORS = {
  gravity:  '#ef5350',
  normal:   '#42a5f5',
  friction: '#ff9800',
  tension:  '#ab47bc',
  applied:  '#66bb6a',
  spring:   '#26c6da',
  buoyancy: '#80deea',
  net:      '#ffee58',
};
const OBJECT_COLORS = ['#4fc3f7', '#ff7043', '#66bb6a', '#ab47bc', '#ffd740', '#26c6da'];
const DEPTH = 0.7;
const MIN_R = 0.42;

/* ── Arrow ─────────────────────────────────────────────────── */
function Arrow({ dir, len, color, label, z = 0.15, thick = 0.045 }) {
  if (len < 0.08) return null;
  const sl  = len * 0.74;
  const hl  = len * 0.26;
  const cos = Math.cos(dir), sin = Math.sin(dir);
  const rot = dir - Math.PI / 2;
  return (
    <group>
      <mesh position={[cos * sl / 2, sin * sl / 2, z]} rotation={[0, 0, rot]}>
        <cylinderGeometry args={[thick, thick, sl, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[cos * (sl + hl / 2), sin * (sl + hl / 2), z]} rotation={[0, 0, rot]}>
        <coneGeometry args={[thick * 2.5, hl, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
      </mesh>
      {label && (
        <Text
          position={[cos * (len + 0.42), sin * (len + 0.42), z + 0.06]}
          fontSize={0.26} color={color}
          anchorX="center" anchorY="middle"
          outlineWidth={0.038} outlineColor="#000014"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

/* ── Static force arrow ─────────────────────────────────────── */
const ForceArrow = memo(function ForceArrow({ force, maxMag }) {
  const mag = force.magnitude ?? 0;
  if (mag < 0.001) return null;
  const color = force.color || FORCE_COLORS[force.type] || '#ffffff';
  const len   = Math.max(0.65, Math.min(4.2, (mag / maxMag) * 3.6));
  const rad   = (force.angle_degrees * Math.PI) / 180;
  return <Arrow dir={rad} len={len} color={color} label={force.label} />;
});

/* ── Initial velocity arrow ─────────────────────────────────── */
const InitialVelocityArrow = memo(function InitialVelocityArrow({ obj }) {
  const vel = obj.initial_velocity;
  if (!vel) return null;
  const speed = Math.sqrt((vel.x ?? 0) ** 2 + (vel.y ?? 0) ** 2);
  if (speed < 0.05) return null;
  const rad = Math.atan2(vel.y ?? 0, vel.x ?? 0);
  const len = Math.max(1.4, Math.min(speed * 0.11, 6.0));
  return (
    <Arrow dir={rad} len={len} color="#ffd740"
      label={`v₀=${speed.toFixed(0)} m/s`} z={0.26} thick={0.055} />
  );
});

/* ── Live velocity arrow (zero re-renders) ──────────────────── */
function VelocityArrow({ objId }) {
  const groupRef = useRef();
  const shaftRef = useRef();
  const headRef  = useRef();

  useFrame(() => {
    const state = useStore.getState().objectStates[objId];
    if (!groupRef.current) return;
    if (!state || state.speed < 0.25) { groupRef.current.visible = false; return; }
    groupRef.current.visible = true;
    const speed = state.speed;
    const vx = state.velocity.x / speed, vy = state.velocity.y / speed;
    const len = Math.min(speed * 0.17, 6.5);
    const rot = Math.atan2(vy, vx) - Math.PI / 2;
    if (shaftRef.current) {
      const sl = len * 0.74;
      shaftRef.current.position.set(vx * sl / 2, vy * sl / 2, 0.26);
      shaftRef.current.rotation.z = rot;
      shaftRef.current.scale.y    = sl;
    }
    if (headRef.current) {
      const sl = len * 0.74, hl = len * 0.26;
      headRef.current.position.set(vx * (sl + hl / 2), vy * (sl + hl / 2), 0.26);
      headRef.current.rotation.z = rot;
      headRef.current.scale.y    = hl;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={shaftRef}>
        <cylinderGeometry args={[0.052, 0.052, 1, 7]} />
        <meshStandardMaterial color="#ffd740" emissive="#ffd740" emissiveIntensity={1.0} />
      </mesh>
      <mesh ref={headRef}>
        <coneGeometry args={[0.13, 1, 7]} />
        <meshStandardMaterial color="#ffd740" emissive="#ffd740" emissiveIntensity={1.0} />
      </mesh>
    </group>
  );
}

/* ── Trajectory ─────────────────────────────────────────────── */
const MAX_TRAJ = 1200;

function Trajectory({ objId, color }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(MAX_TRAJ * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const traj = useStore.getState().trajectories[objId];
    if (!traj || traj.length < 2) { geometry.setDrawRange(0, 0); return; }
    const count = Math.min(traj.length, MAX_TRAJ);
    const arr   = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = traj[i].x;
      arr[i * 3 + 1] = traj[i].y;
      arr[i * 3 + 2] = 0.02;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.setDrawRange(0, count);
  });

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.9} />
    </line>
  );
}

/* ── Height dashed indicator (projectile) ───────────────────── */
function HeightIndicator({ x, y, color }) {
  if (y < 1.5) return null;
  const segs = Math.max(3, Math.floor(y / 1.2));
  const segH = y / segs;
  return (
    <group>
      {Array.from({ length: segs }).map((_, i) => {
        if (i % 2 !== 0) return null;
        return (
          <mesh key={i} position={[x + 0.08, (i + 0.5) * segH, 0.06]}>
            <boxGeometry args={[0.05, segH * 0.42, 0.05]} />
            <meshBasicMaterial color={color} transparent opacity={0.55} />
          </mesh>
        );
      })}
      <Text
        position={[x + 0.35, y / 2, 0.12]}
        fontSize={0.24} color={color}
        anchorX="left" anchorY="middle"
        outlineWidth={0.032} outlineColor="#000"
      >
        {`h=${y.toFixed(0)}m`}
      </Text>
    </group>
  );
}

/* ── Physics object ─────────────────────────────────────────── */
function PhysicsObject({ obj, forces, maxMag, colorIdx, isProjectile, geoScale = 1 }) {
  const groupRef = useRef();
  const meshRef  = useRef();

  const color    = OBJECT_COLORS[colorIdx % OBJECT_COLORS.length];
  const isSphere = ['circle', 'point_mass', 'pulley'].includes(obj.type);
  const w = Math.max(obj.dimensions?.width  ?? 0.8, 0.5);
  const h = Math.max(obj.dimensions?.height ?? 0.8, 0.5);
  const r = Math.max(Math.max(w, h) / 2, MIN_R);

  useFrame(() => {
    const state = useStore.getState().objectStates[obj.id];
    if (!state || !groupRef.current || !meshRef.current) return;
    groupRef.current.position.x = state.position.x;
    groupRef.current.position.y = state.position.y;
    meshRef.current.rotation.z  = -(state.angle * Math.PI) / 180;
  });

  const { x, y } = obj.position;
  const labelY   = -(isSphere ? r : h / 2) - 0.42;

  return (
    <group ref={groupRef} position={[x, y, 0]} scale={[geoScale, geoScale, geoScale]}>
      {/* Drop shadow on ground (for elevated objects) */}
      {y > 0.3 && isSphere && geoScale <= 2 && (
        <mesh
          position={[0, -y + 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[r * 0.65, 14]} />
          <meshBasicMaterial color="#000000" transparent opacity={Math.max(0.05, 0.3 - y * 0.004)} />
        </mesh>
      )}

      {/* Main mesh */}
      <mesh ref={meshRef} castShadow rotation={[0, 0, -(obj.angle * Math.PI) / 180]}>
        {isSphere
          ? <sphereGeometry args={[r, 32, 22]} />
          : <boxGeometry   args={[w, h, DEPTH]} />}
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={0.65}
          metalness={0.08} roughness={0.3}
        />
      </mesh>

      {/* Glow layers */}
      {isSphere && (
        <>
          <mesh scale={1.20}>
            <sphereGeometry args={[r, 14, 10]} />
            <meshBasicMaterial color={color} transparent opacity={0.13} side={THREE.BackSide} />
          </mesh>
          <mesh scale={1.45}>
            <sphereGeometry args={[r, 10, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.05} side={THREE.BackSide} />
          </mesh>
        </>
      )}

      {/* Object label */}
      <Text
        position={[0, labelY, DEPTH / 2 + 0.09]}
        fontSize={0.30} color="#ffffff"
        anchorX="center" anchorY="top"
        outlineWidth={0.042} outlineColor="#000020"
      >
        {obj.label}
      </Text>

      {forces.map(f => <ForceArrow key={f.id} force={f} maxMag={maxMag} />)}
      <InitialVelocityArrow obj={obj} />
      <VelocityArrow objId={obj.id} />
    </group>
  );
}

/* ── Building ───────────────────────────────────────────────── */
function Building({ surf }) {
  const p1 = surf.points[0];
  const p2 = surf.points[surf.points.length - 1];
  const bx     = (p1.x + p2.x) / 2;
  const baseY  = Math.min(p1.y, p2.y);
  const height = Math.max(Math.abs(p2.y - p1.y), surf.length ?? 0, 5);
  const bW     = 2.4;
  const numFloors = Math.max(1, Math.floor(height / 3.2));

  return (
    <group>
      {/* Main body — clearly visible concrete blue-grey */}
      <mesh position={[bx, baseY + height / 2, 0]}>
        <boxGeometry args={[bW, height, 3.4]} />
        <meshStandardMaterial
          color="#3c3c6a" roughness={0.8} metalness={0.06}
          emissive="#1a1a55" emissiveIntensity={0.3}
        />
      </mesh>

      {/* Front face — slightly lighter so building reads clearly */}
      <mesh position={[bx, baseY + height / 2, 1.72]}>
        <planeGeometry args={[bW, height]} />
        <meshStandardMaterial
          color="#484878" roughness={0.85}
          emissive="#24247a" emissiveIntensity={0.2}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Horizontal floor-line dividers */}
      {Array.from({ length: numFloors - 1 }).map((_, i) => {
        const fy = baseY + (i + 1) * (height / numFloors);
        return (
          <mesh key={`fl${i}`} position={[bx, fy, 1.74]}>
            <planeGeometry args={[bW, 0.045]} />
            <meshBasicMaterial color="#28284a" />
          </mesh>
        );
      })}

      {/* Edge columns */}
      {[-bW / 2 + 0.13, bW / 2 - 0.13].map((xOff, ci) => (
        <mesh key={`col${ci}`} position={[bx + xOff, baseY + height / 2, 1.74]}>
          <boxGeometry args={[0.20, height, 0.09]} />
          <meshStandardMaterial color="#26265a" roughness={0.9} emissive="#0f0f40" emissiveIntensity={0.2} />
        </mesh>
      ))}

      {/* Windows — two columns per floor */}
      {Array.from({ length: numFloors }).flatMap((_, row) =>
        [-0.58, 0.58].map((xOff, ci) => {
          const wy  = baseY + (row + 0.5) * (height / numFloors);
          const lit = (row + ci) % 3 !== 2;
          return (
            <mesh key={`w${row}_${ci}`} position={[bx + xOff, wy, 1.76]}>
              <planeGeometry args={[0.55, 0.70]} />
              <meshStandardMaterial
                color={lit ? '#9ad4f0' : '#1a2840'}
                emissive={lit ? '#3a88cc' : '#08101a'}
                emissiveIntensity={lit ? 0.7 : 0.05}
              />
            </mesh>
          );
        })
      )}

      {/* Roof slab */}
      <mesh position={[bx, baseY + height + 0.24, 0]}>
        <boxGeometry args={[bW + 0.40, 0.48, 3.8]} />
        <meshStandardMaterial color="#1c1c3a" roughness={0.82} metalness={0.1}
          emissive="#0a0a28" emissiveIntensity={0.15}
        />
      </mesh>

      {/* Glowing roof edge — marks launch height */}
      <mesh position={[bx, baseY + height + 0.02, 0.28]}>
        <boxGeometry args={[bW + 0.46, 0.09, 0.09]} />
        <meshStandardMaterial color="#ffd740" emissive="#ffd740" emissiveIntensity={2.5} />
      </mesh>

      {/* Height label */}
      <Text
        position={[bx + bW / 2 + 0.65, baseY + height / 2, 1.9]}
        fontSize={0.34} color="#ffd740" anchorX="left" anchorY="middle"
        outlineWidth={0.045} outlineColor="#000"
      >
        {`H = ${height.toFixed(0)} m`}
      </Text>
    </group>
  );
}

/* ── Inclined ramp ──────────────────────────────────────────── */
function Incline({ surf }) {
  const p1 = surf.points[0];
  const p2 = surf.points[surf.points.length - 1];
  const dx    = p2.x - p1.x, dy = p2.y - p1.y;
  const len   = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const cx    = (p1.x + p2.x) / 2;
  const cy    = (p1.y + p2.y) / 2;

  return (
    <group position={[cx, cy, 0]} rotation={[0, 0, angle]}>
      <mesh>
        <boxGeometry args={[len, 0.20, 5.2]} />
        <meshStandardMaterial color="#38385e" roughness={0.88} metalness={0.08}
          emissive="#18183a" emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[0, 0.11, 2.62]}>
        <boxGeometry args={[len, 0.05, 0.05]} />
        <meshBasicMaterial color="#5a60a0" />
      </mesh>
      {surf.label && (
        <Text position={[0, 0.45, 2.7]} fontSize={0.30} color="#ffd54f" anchorX="center">
          {surf.label}
        </Text>
      )}
    </group>
  );
}

/* ── Floor slab ─────────────────────────────────────────────── */
function FloorSlab({ y }) {
  return (
    <group>
      <mesh position={[0, y - 0.11, 0]}>
        <boxGeometry args={[100, 0.22, 9]} />
        <meshStandardMaterial color="#141428" roughness={0.97} />
      </mesh>
      <mesh position={[0, y + 0.001, 0.20]}>
        <boxGeometry args={[100, 0.020, 0.020]} />
        <meshBasicMaterial color="#28285a" />
      </mesh>
    </group>
  );
}

/* ── Surface dispatcher ─────────────────────────────────────── */
const Surface = memo(function Surface({ surf }) {
  if (!surf.points || surf.points.length < 2) return null;
  const p1    = surf.points[0];
  const p2    = surf.points[surf.points.length - 1];
  if (surf.type === 'floor') return <FloorSlab y={p1.y} />;
  const dx    = p2.x - p1.x, dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx);
  const isVert = Math.abs(Math.sin(angle)) > 0.85 || surf.type === 'wall';
  return isVert ? <Building surf={surf} /> : <Incline surf={surf} />;
});

/* ── Horizontal table slab ──────────────────────────────────── */
function TableSlab({ surf }) {
  const p1 = surf.points[0];
  const p2 = surf.points[surf.points.length - 1];
  const cx  = (p1.x + p2.x) / 2;
  const len = Math.abs(p2.x - p1.x) + 1;
  const y   = p1.y;
  return (
    <group>
      <mesh position={[cx, y - 0.18, 0]}>
        <boxGeometry args={[len, 0.36, 3.5]} />
        <meshStandardMaterial color="#2a2a4a" roughness={0.85} metalness={0.05}
          emissive="#12122a" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[cx, y, 1.76]}>
        <boxGeometry args={[len, 0.04, 0.04]} />
        <meshBasicMaterial color="#5a5a9a" />
      </mesh>
    </group>
  );
}

/* ── Pulley wheel ────────────────────────────────────────────── */
function PulleyWheel({ x, y }) {
  return (
    <group position={[x, y, 0]}>
      {/* Wheel */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.11, 10, 24]} />
        <meshStandardMaterial color="#888899" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Axle */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.9, 8]} />
        <meshStandardMaterial color="#555566" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Bracket post */}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[0.14, 0.76, 0.14]} />
        <meshStandardMaterial color="#44445a" roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ── Dynamic rope connecting A → pulley → B ─────────────────── */
function PulleyRope({ objAId, objBId, pulleyX, pulleyY }) {
  const hSegRef = useRef(); // horizontal: A → pulley
  const vSegRef = useRef(); // vertical:   pulley → B

  useFrame(() => {
    const stA = useStore.getState().objectStates[objAId];
    const stB = useStore.getState().objectStates[objBId];
    if (!hSegRef.current || !vSegRef.current) return;

    const ax = stA?.position?.x ?? (pulleyX - 4);
    const by = stB?.position?.y ?? (pulleyY - 1);

    const hLen = Math.max(pulleyX - ax, 0.01);
    hSegRef.current.position.set((ax + pulleyX) / 2, pulleyY, 0);
    hSegRef.current.scale.set(hLen, 1, 1);

    const vLen = Math.max(pulleyY - by, 0.01);
    vSegRef.current.position.set(pulleyX, (pulleyY + by) / 2, 0);
    vSegRef.current.scale.set(1, vLen, 1);
  });

  const ropeMat = <meshStandardMaterial color="#c8a050" emissive="#c8a050" emissiveIntensity={0.25}
    metalness={0.15} roughness={0.6} />;
  return (
    <>
      <mesh ref={hSegRef}>
        <boxGeometry args={[1, 0.055, 0.055]} />
        {ropeMat}
      </mesh>
      <mesh ref={vSegRef}>
        <boxGeometry args={[0.055, 1, 0.055]} />
        {ropeMat}
      </mesh>
    </>
  );
}

/* ── Camera auto-fit (FOV-correct) ──────────────────────────── */
function CameraAutoFit({ blueprint }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!blueprint) return;
    let minX = Infinity, maxX = -Infinity, minY = 0, maxY = 4;

    blueprint.objects.forEach(o => {
      const hw = Math.max((o.dimensions?.width  ?? 1) / 2, MIN_R) + 1;
      const hh = Math.max((o.dimensions?.height ?? 1) / 2, MIN_R) + 1;
      minX = Math.min(minX, o.position.x - hw); maxX = Math.max(maxX, o.position.x + hw);
      minY = Math.min(minY, o.position.y - hh); maxY = Math.max(maxY, o.position.y + hh);
    });
    blueprint.surfaces.forEach(s => s.points?.forEach(p => {
      minX = Math.min(minX, p.x - 1); maxX = Math.max(maxX, p.x + 1);
      minY = Math.min(minY, p.y);     maxY = Math.max(maxY, p.y + 1);
    }));
    if (!isFinite(minX)) return;

    const spanX = Math.max(maxX - minX, 6);
    const spanY = Math.max(maxY - minY, 6);

    // For wide horizontal scenes (two ground objects far apart), fit width
    const isWide = spanX > spanY * 2.5;
    const isTall = spanY > spanX * 3;
    const span   = isWide ? spanX : Math.max(spanX, spanY);

    const fovRad = (camera.fov * Math.PI) / 180;
    const dist   = (span / 2) / Math.tan(fovRad / 2) * 1.35 + 3;

    const cx = (minX + maxX) / 2;
    const cy = isWide ? Math.max((minY + maxY) / 2, spanX * 0.12) : (minY + maxY) / 2;

    const xOffset = isTall ? 1.5 : isWide ? 0 : span * 0.04;
    camera.position.set(cx + xOffset, cy, dist);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();
  }, [blueprint, camera]);

  return null;
}

/* ── Placeholder ────────────────────────────────────────────── */
function Placeholder() {
  return (
    <Text
      position={[0, 1, 0]} fontSize={0.34} color="rgba(200,200,255,0.22)"
      anchorX="center" anchorY="middle" textAlign="center"
    >
      {'Upload a physics problem image\nor click "Load Demo"'}
    </Text>
  );
}

/* ── Main scene ─────────────────────────────────────────────── */
export default function Scene3D() {
  const blueprint      = useStore(s => s.blueprint);
  const showTrajectory = useStore(s => s.showTrajectory);

  if (!blueprint) return <Placeholder />;

  const isProjectile = blueprint.problem_type === 'projectile';
  const isPulley     = blueprint.problem_type === 'pulley';
  const maxMag = Math.max(
    blueprint.forces.reduce((m, f) => Math.max(m, f.magnitude ?? 0), 1), 1,
  );

  // Scale objects up for large scenes so they remain visible when zoomed out
  const allPts = [
    ...blueprint.objects.map(o => o.position),
    ...blueprint.surfaces.flatMap(s => s.points ?? []),
  ];
  const xs = allPts.map(p => p.x), ys = allPts.map(p => p.y);
  const sceneSpan = Math.max(
    xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0,
    ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 0,
    6,
  );
  const geoScale = Math.max(1, sceneSpan / 25);

  const hasFloor = blueprint.surfaces.some(s => s.type === 'floor');
  const minY = Math.min(
    0,
    ...blueprint.surfaces.flatMap(s => (s.points || []).map(p => p.y)),
    ...blueprint.objects.map(o => o.position.y - (o.dimensions?.height ?? 0.5) / 2),
  );

  // Pulley geometry: find rope constraint to place pulley wheel + rope
  let pulleyX = null, pulleyY = null, ropeConstraint = null;
  if (isPulley) {
    ropeConstraint = blueprint.constraints?.find(c => c.type === 'string');
    if (ropeConstraint) {
      const tableObj = blueprint.objects.find(o => o.id === ropeConstraint.object_a);
      const hangObj  = blueprint.objects.find(o => o.id === ropeConstraint.object_b);
      // Auto-detect: table object is the one with higher y
      const tObj = (tableObj?.position?.y ?? 0) >= (hangObj?.position?.y ?? 0) ? tableObj : hangObj;
      const hObj = tObj === tableObj ? hangObj : tableObj;
      if (tObj && hObj) {
        pulleyX = hObj.position.x;
        pulleyY = tObj.position.y;
      }
    }
  }

  return (
    <>
      <CameraAutoFit blueprint={blueprint} />

      {/* Floor slab */}
      {!hasFloor && <FloorSlab y={minY} />}

      {/* Surfaces — table gets special renderer in pulley mode */}
      {blueprint.surfaces.map(s => {
        if (s.type === 'floor') return <FloorSlab key={s.id} y={s.points[0].y} />;
        if (isPulley && s.type === 'line') return <TableSlab key={s.id} surf={s} />;
        return <Surface key={s.id} surf={s} />;
      })}

      {/* Pulley wheel + rope */}
      {isPulley && pulleyX !== null && (
        <>
          <PulleyWheel x={pulleyX} y={pulleyY} />
          {ropeConstraint && (
            <PulleyRope
              objAId={ropeConstraint.object_a}
              objBId={ropeConstraint.object_b}
              pulleyX={pulleyX}
              pulleyY={pulleyY}
            />
          )}
        </>
      )}

      {/* Physics objects */}
      {blueprint.objects.map((obj, i) => {
        const color = OBJECT_COLORS[i % OBJECT_COLORS.length];
        return (
          <React.Fragment key={obj.id}>
            <PhysicsObject
              obj={obj}
              forces={blueprint.forces.filter(f => f.object_id === obj.id)}
              maxMag={maxMag}
              colorIdx={i}
              isProjectile={isProjectile}
              geoScale={geoScale}
            />
            {isProjectile && obj.position.y > 1.5 && geoScale <= 2 && (
              <HeightIndicator
                x={obj.position.x + Math.max((obj.dimensions?.width ?? 0.6) / 2, MIN_R)}
                y={obj.position.y}
                color={color}
              />
            )}
          </React.Fragment>
        );
      })}

      {showTrajectory && blueprint.objects.map((obj, i) => (
        <Trajectory
          key={obj.id + '_t'}
          objId={obj.id}
          color={OBJECT_COLORS[i % OBJECT_COLORS.length]}
        />
      ))}
    </>
  );
}
