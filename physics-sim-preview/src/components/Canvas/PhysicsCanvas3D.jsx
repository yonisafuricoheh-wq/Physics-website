import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import Scene3D from './Scene3D';
import useStore from '../../store/simulationStore';

export default function PhysicsCanvas3D() {
  const teacherMode = useStore(s => s.teacherMode);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d0d18' }}>
      <Canvas
        camera={{ position: [0, 4, 9], fov: 48, near: 0.1, far: 200 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        dpr={Math.min(window.devicePixelRatio, 1.5)}
        onCreated={({ gl }) => { gl.setClearColor('#0d0d18'); }}
      >
        {/* Background */}
        <color attach="background" args={['#0d0d18']} />

        {/* Lighting — no shadow maps for performance */}
        <ambientLight intensity={0.8} />
        <hemisphereLight skyColor="#1a1a4a" groundColor="#0d0d18" intensity={0.7} />
        <directionalLight position={[8, 14, 6]} intensity={1.0} />
        <pointLight position={[-6, 6, 4]} intensity={0.3} color="#4488ff" />

        {/* Infinite grid on the XZ plane (floor level y=0) */}
        <Grid
          position={[0, -0.001, 0]}
          args={[30, 30]}
          cellSize={0.5}
          cellThickness={0.4}
          cellColor="#1a1a3a"
          sectionSize={1}
          sectionThickness={0.8}
          sectionColor="#252550"
          fadeDistance={22}
          fadeStrength={1.2}
          followCamera={false}
          infiniteGrid
        />

        {/* Physics scene */}
        <Scene3D />

        {/* Camera controls */}
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          panSpeed={0.8}
          zoomSpeed={1.0}
          rotateSpeed={0.6}
          minDistance={1}
          maxDistance={40}
          maxPolarAngle={Math.PI / 1.8}
          target={[0, 1, 0]}
          makeDefault
        />
      </Canvas>

      {teacherMode && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(171,71,188,0.85)', color: '#fff',
          padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          pointerEvents: 'none',
        }}>
          TEACHER MODE — 3D view active
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 8, right: 12,
        fontSize: 10, color: 'rgba(255,255,255,0.25)', pointerEvents: 'none',
      }}>
        Drag to rotate · Scroll to zoom · Right-drag to pan
      </div>
    </div>
  );
}
