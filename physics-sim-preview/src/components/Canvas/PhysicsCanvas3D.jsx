import React from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import Scene3D from './Scene3D';
import useStore from '../../store/simulationStore';

export default function PhysicsCanvas3D() {
  const teacherMode = useStore(s => s.teacherMode);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d0d18' }}>
      <Canvas
        camera={{ position: [0, 8, 18], fov: 48, near: 0.1, far: 5000 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={Math.min(window.devicePixelRatio, 1.5)}
        onCreated={({ gl }) => { gl.setClearColor('#0d0d18'); }}
      >
        <color attach="background" args={['#0d0d18']} />

        {/* Lighting — balanced for both bright balls and visible building */}
        <ambientLight intensity={0.55} />
        <hemisphereLight skyColor="#1a2060" groundColor="#0d0d18" intensity={0.8} />
        {/* Main key light — upper right */}
        <directionalLight position={[8, 20, 12]}  intensity={1.4} />
        {/* Front fill — illuminates building face */}
        <directionalLight position={[0, 5, 15]}   intensity={0.7} color="#c8d4ff" />
        {/* Cool accent from left */}
        <pointLight position={[-10, 15, 8]}  intensity={0.6} color="#4488ff" />
        {/* Warm fill from right */}
        <pointLight position={[12, 3, 10]}   intensity={0.4} color="#ff9944" />

        {/* Ground grid */}
        <Grid
          position={[0, -0.001, 0]}
          args={[60, 60]}
          cellSize={1}
          cellThickness={0.4}
          cellColor="#1a1a3a"
          sectionSize={5}
          sectionThickness={0.7}
          sectionColor="#252555"
          fadeDistance={45}
          fadeStrength={1.0}
          followCamera={false}
          infiniteGrid
        />

        <Scene3D />

        <OrbitControls
          enableRotate={false}
          enablePan={true}
          enableZoom={true}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
          panSpeed={1.5}
          zoomSpeed={1.2}
          minDistance={0.5}
          maxDistance={5000}
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
          TEACHER MODE
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 8, right: 12,
        fontSize: 10, color: 'rgba(255,255,255,0.22)', pointerEvents: 'none',
      }}>
        Drag to pan · Scroll to zoom
      </div>
    </div>
  );
}
