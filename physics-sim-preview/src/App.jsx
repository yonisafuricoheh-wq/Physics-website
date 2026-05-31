import React, { useEffect, useCallback } from 'react';
import useStore from './store/simulationStore';
import { useSimulation } from './hooks/useSimulation';

import PhysicsCanvas     from './components/Canvas/PhysicsCanvas3D';
import ImageUpload       from './components/Upload/ImageUpload';
import TimeControls      from './components/Controls/TimeControls';
import VectorControls    from './components/Controls/VectorControls';
import SocraticPanel     from './components/Tutor/SocraticPanel';
import MissingDataModal  from './components/MissingData/MissingDataModal';

export default function App() {
  const { play, pause, reset, stepFrame } = useSimulation();
  const simState = useStore(s => s.simState);

  /* Global keyboard shortcuts */
  const onKey = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); simState === 'running' ? pause() : play(); }
    if (e.key === 'r' || e.key === 'R') reset();
    if (e.key === 'ArrowRight') stepFrame();
  }, [simState, play, pause, reset, stepFrame]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-logo">Physics<span>Sim</span></div>
        <div className="app-subtitle">
          AI-Powered 3D Physics Laboratory
        </div>
        <KeyboardHints />
      </header>

      {/* ── Main body ──────────────────────────────────────── */}
      <div className="app-body">
        {/* Left: upload + blueprint info */}
        <aside className="left-panel">
          <ImageUpload />
        </aside>

        {/* Center: canvas */}
        <main className="canvas-wrapper">
          <PhysicsCanvas />
        </main>

        {/* Right: AI tutor */}
        <aside className="right-panel">
          <SocraticPanel />
        </aside>
      </div>

      {/* ── Bottom bar ─────────────────────────────────────── */}
      <footer className="bottom-bar">
        <TimeControls />
        <div style={{ width: 1, background: '#252545', alignSelf: 'stretch', margin: '6px 0' }} />
        <VectorControls />
      </footer>

      {/* ── Missing data modal ─────────────────────────────── */}
      <MissingDataModal />
    </div>
  );
}

function KeyboardHints() {
  return (
    <div style={{ display:'flex', gap:12, marginLeft:'auto', alignItems:'center' }}>
      {[
        ['Space', 'Play/Pause'],
        ['R',     'Reset'],
        ['→',     'Step frame'],
        ['Scroll','Zoom'],
      ].map(([key, label]) => (
        <span key={key} style={{ fontSize:11, color:'#8888aa', display:'flex', alignItems:'center', gap:4 }}>
          <kbd style={{
            background:'#1a1a3a', border:'1px solid #252545', borderRadius:4,
            padding:'1px 5px', fontFamily:'monospace', fontSize:11, color:'#ccc'
          }}>{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
