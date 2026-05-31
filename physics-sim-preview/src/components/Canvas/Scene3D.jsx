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
};
const OBJECT_COLORS = ['#4c8cd2', '#66bb6a', '#ff7043', '#ab47bc', '#26c6da', '#ffd740'];
const DEPTH = 0.5;

/* ── Arrow helper (shaft + head, no React re-render overhead) ── */
function Arrow({ dir, len, color, label, z = 0.1 }) {
  if (len < 0.1) return null;
  const shaftL  = len * 0.75;
  const headL   = len * 0.25;
  const rad     = dir;            // angle in radians from +X, CCW
  const axisRot = rad - Math.PI / 2;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  return (
    <group>
      <mesh position={[cos * shaftL / 2, sin * shaftL / 2, z]} rotation={[0, 0, axisRot]}>
        <cylinderGeometry args={[0.04, 0.04, shaftL, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[cos * (shaftL + headL / 2), sin * (shaftL + headL / 2), z]} rotation={[0, 0, axisRot]}>
        <coneGeometry args={[0.09, headL, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      {label && (
        <Text
          position={[cos * (len + 0.28), sin * (len + 0.28), z]}
          fontSize={0.22} color={color}
          anchorX="center" anchorY="middle"
          outlineWidth={0.025} outlineColor="#000"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

/* ── Static force arrow from blueprint ──────────────────── */
const ForceArrow = memo(function ForceArrow({ force, maxMag }) {
  const mag = force.magnitude ?? 0;
  if (mag < 0.001) return null;
  const color  = force.color || '#ffffff';
  const len    = Math.max(0.6, Math.min(3.0, (mag / maxMag) * 2.5));
  const rad    = (force.angle_degrees * Math.PI) / 180;
  return <Arrow dir={rad} len={len} color={color} label={force.label} />;
});

/* ── Initial velocity arrow ─────────────────────────────── */
const InitialVelocityArrow = memo(function InitialVelocityArrow({ obj }) {
  const vel = obj.initial_velocity;
  if (!vel) return null;
  const speed = Math.sqrt((vel.x ?? 0) ** 2 + (vel.y ?? 0) ** 2);
  if (speed < 0.1) return null;
  const rad = Math.atan2(vel.y, vel.x);
  const len = Math.max(1.0, Math.min(speed * 0.06, 4.0));
  return <Arrow dir={rad} len={len} color="#ffd740" label={`${speed.toFixed(0)} m/s`} z={0.15} />;
});

/* ── Live velocity arrow — imperative, no re-render ──────── */
function VelocityArrow({ objId }) {
  const groupRef = useRef();
  const shaftRef = useRef();
  const headRef  = useRef();

  useFrame(() => {
    const state = useStore.getState().objectStates[objId];
    if (!groupRef.current) return;
    if (!state || state.speed < 0.15) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    const vx  = state.velocity.x / state.speed;
    const vy  = state.velocity.y / state.speed;
    const len = Math.min(state.speed * 0.12, 4.0);
    const rot = Math.atan2(vy, vx) - Math.PI / 2;

    if (shaftRef.current) {
      const sl = len * 0.75;
      shaftRef.current.position.set(vx * sl / 2, vy * sl / 2, 0.15);
      shaftRef.current.rotation.z = rot;
      shaftRef.current.scale.y    = sl;
    }
    if (headRef.current) {
      const sl = len * 0.75, hl = len * 0.25;
      headRef.current.position.set(vx * (sl + hl / 2), vy * (sl + hl / 2), 0.15);
      headRef.current.rotation.z = rot;
      headRef.current.scale.y    = hl;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={shaftRef}>
        <cylinderGeometry args={[0.045, 0.045, 1, 6]} />
        <meshStandardMaterial color="#ffd740" emissive="#ffd740" emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={headRef}>
        <coneGeometry args={[0.11, 1, 6]} />
        <meshStandardMaterial color="#ffd740" emissive="#ffd740" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

/* ── Trajectory — fully imperative, zero React re-renders ── */
const MAX_TRAJ = 400;

function Trajectory({ objId }) {
  const lineRef = useRef();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(MAX_TRAJ * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  // cleanup on unmount
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const traj = useStore.getState().trajectories[objId];
    if (!traj || traj.length < 2) { geometry.setDrawRange(0, 0); return; }
    const count = Math.min(traj.length, MAX_TRAJ);
    const arr   = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3]     = traj[i].x;
      arr[i * 3 + 1] = traj[i].y;
      arr[i * 3 + 2] = 0;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.setDrawRange(0, count);
  });

  return (
    <line ref={lineRef}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#ffff88" transparent opacity={0.7} />
    </line>
  );
}

/* ── Physics object ──────────────────────────────────────── */
function PhysicsObject({ obj, forces, maxMag, colorIdx }) {
  const groupRef = useRef();
  const meshRef  = useRef();

  const color    = OBJECT_COLORS[colorIdx % OBJECT_COLORS.length];
  const isSphere = obj.type === 'circle' || obj.type === 'point_mass' || obj.type === 'pulley';
  const w = Math.max(obj.dimensions?.width  ?? 0.5, 0.1);
  const h = Math.max(obj.dimensions?.height ?? 0.4, 0.1);
  const r = Math.max(w, h) / 2;

  useFrame(() => {
    const state = useStore.getState().objectStates[obj.id];
    if (!state || !groupRef.current || !meshRef.current) return;
    groupRef.current.position.x = state.position.x;
    groupRef.current.position.y = state.position.y;
    meshRef.current.rotation.z  = -(state.angle * Math.PI) / 180;
  });

  const { x, y } = obj.position;

  return (
    <group ref={groupRef} position={[x, y, 0]}>
      <mesh ref={meshRef} rotation={[0, 0, -(obj.angle * Math.PI) / 180]}>
        {isSphere
          ? <sphereGeometry args={[r, 16, 12]} />
          : <boxGeometry   args={[w, h, DEPTH]} />}
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Object label */}
      <Text
        position={[0, -(isSphere ? r : h / 2) - 0.28, DEPTH / 2 + 0.02]}
        fontSize={0.22} color="#e0e8ff"
        anchorX="center" anchorY="top"
        outlineWidth={0.025} outlineColor="#000"
      >
        {obj.label}
      </Text>

      {forces.map(f => <ForceArrow key={f.id} force={f} maxMag={maxMag} />)}
      <InitialVelocityArrow obj={obj} />
      <VelocityArrow objId={obj.id} />
    </group>
  );
}

/* ── Surface ─────────────────────────────────────────────── */
const Surface = memo(function Surface({ surf }) {
  if (!surf.points || surf.points.length < 2) return null;
  const p1 = surf.points[0];
  const p2 = surf.points[surf.points.length - 1];

  if (surf.type === 'floor') {
    return (
      <mesh position={[0, p1.y - 0.06, 0]}>
        <boxGeometry args={[30, 0.12, 6]} />
        <meshStandardMaterial color="#2a2a4a" roughness={0.9} />
      </mesh>
    );
  }

  const dx    = p2.x - p1.x;
  const dy    = p2.y - p1.y;
  const len   = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const isVertical = Math.abs(Math.sin(angle)) > 0.85 || surf.type === 'wall';

  if (isVertical) {
    const bx     = (p1.x + p2.x) / 2;
    const baseY  = Math.min(p1.y, p2.y);
    const height = len || Math.abs(p2.y - p1.y) || 10;
    return (
      <group>
        <mesh position={[bx, baseY + height / 2, 0]}>
          <boxGeometry args={[1.5, height, 3]} />
          <meshStandardMaterial color="#5a5a8a" metalness={0.2} roughness={0.7} />
        </mesh>
        {surf.label && (
          <Text position={[bx + 1.2, baseY + height * 0.3, 2]} fontSize={0.6} color="#ffd54f" anchorX="left">
            {surf.label}
          </Text>
        )}
      </group>
    );
  }

  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  return (
    <group position={[cx, cy, 0]} rotation={[0, 0, angle]}>
      <mesh>
        <boxGeometry args={[len, 0.12, 4]} />
        <meshStandardMaterial color="#4a4a7a" roughness={0.8} />
      </mesh>
      {surf.label && (
        <Text position={[-len / 2 + 0.5, 0.3, 2.1]} fontSize={0.25} color="#ffd54f" anchorX="left">
          {surf.label}
        </Text>
      )}
    </group>
  );
});

/* ── Camera auto-fit ─────────────────────────────────────── */
function CameraAutoFit({ blueprint }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!blueprint) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    blueprint.objects.forEach(o => {
      const hw = (o.dimensions?.width  ?? 1) / 2;
      const hh = (o.dimensions?.height ?? 1) / 2;
      minX = Math.min(minX, o.position.x - hw); maxX = Math.max(maxX, o.position.x + hw);
      minY = Math.min(minY, o.position.y - hh); maxY = Math.max(maxY, o.position.y + hh);
    });
    blueprint.surfaces.forEach(s => s.points?.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }));
    if (!isFinite(minX)) return;

    const spanX = (maxX - minX) * 1.3 || 10;
    const spanY = (maxY - minY) * 1.3 || 10;
    const span  = Math.max(spanX, spanY, 6);
    const cx    = (minX + maxX) / 2;
    const cy    = (minY + maxY) / 2;

    camera.position.set(cx + span * 0.12, cy, span * 1.05);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();
  }, [blueprint, camera]);

  return null;
}

/* ── Placeholder ─────────────────────────────────────────── */
function Placeholder() {
  return (
    <Text position={[0, 0.5, 0]} fontSize={0.28} color="rgba(255,255,255,0.22)"
          anchorX="center" anchorY="middle" textAlign="center">
      {'Upload a physics problem image\nor click "Load Demo"'}
    </Text>
  );
}

/* ── Main scene ──────────────────────────────────────────── */
export default function Scene3D() {
  const blueprint      = useStore(s => s.blueprint);
  const showTrajectory = useStore(s => s.showTrajectory);

  if (!blueprint) return <Placeholder />;

  const maxMag = Math.max(blueprint.forces.reduce((m, f) => Math.max(m, f.magnitude ?? 0), 1), 1);
  const hasFloor = blueprint.surfaces.some(s => s.type === 'floor');
  const minY = Math.min(
    0,
    ...blueprint.surfaces.flatMap(s => (s.points || []).map(p => p.y)),
    ...blueprint.objects.map(o => o.position.y - (o.dimensions?.height ?? 0.5) / 2),
  );

  return (
    <>
      <CameraAutoFit blueprint={blueprint} />

      {!hasFloor && (
        <mesh position={[0, minY - 0.06, 0]}>
          <boxGeometry args={[30, 0.12, 6]} />
          <meshStandardMaterial color="#2a2a4a" roughness={0.9} />
        </mesh>
      )}

      {blueprint.surfaces.map(s => <Surface key={s.id} surf={s} />)}

      {blueprint.objects.map((obj, i) => (
        <PhysicsObject
          key={obj.id}
          obj={obj}
          forces={blueprint.forces.filter(f => f.object_id === obj.id)}
          maxMag={maxMag}
          colorIdx={i}
        />
      ))}

      {showTrajectory && blueprint.objects.map(obj => (
        <Trajectory key={obj.id + '_t'} objId={obj.id} />
      ))}
    </>
  );
}
