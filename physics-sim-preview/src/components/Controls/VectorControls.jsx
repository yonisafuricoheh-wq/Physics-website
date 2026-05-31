import React from 'react';
import useStore from '../../store/simulationStore';
import { FORCE_COLORS } from '../../engine/BlueprintParser';

export default function VectorControls() {
  const showComponents  = useStore(s => s.showComponents);
  const showGrid        = useStore(s => s.showGrid);
  const showLabels      = useStore(s => s.showLabels);
  const showTrajectory  = useStore(s => s.showTrajectory);
  const teacherMode     = useStore(s => s.teacherMode);
  const blueprint       = useStore(s => s.blueprint);
  const clearForceOverrides = useStore(s => s.clearForceOverrides);

  const toggleComponents  = useStore(s => s.toggleComponents);
  const toggleGrid        = useStore(s => s.toggleGrid);
  const toggleLabels      = useStore(s => s.toggleLabels);
  const toggleTrajectory  = useStore(s => s.toggleTrajectory);
  const toggleTeacherMode = useStore(s => s.toggleTeacherMode);

  const handleTeacherToggle = () => {
    if (teacherMode) clearForceOverrides();
    toggleTeacherMode();
  };

  return (
    <div className="vector-controls">
      <Toggle label="Grid"       active={showGrid}       onClick={toggleGrid} />
      <Toggle label="Labels"     active={showLabels}     onClick={toggleLabels} />
      <Toggle label="Trajectory" active={showTrajectory} onClick={toggleTrajectory} />
      <Toggle label="Fₓ Fᵧ"     active={showComponents} onClick={toggleComponents} />

      <div style={{ width: 1, background: '#2a2a4a', alignSelf:'stretch' }} />

      <button
        className={`ctrl-btn ${teacherMode ? 'active teacher' : ''}`}
        onClick={handleTeacherToggle}
        title="Teacher Mode — drag vector tips to adjust forces"
        disabled={!blueprint}
      >
        ✏ Teacher
      </button>

      {/* Force legend */}
      {blueprint && <ForceLegend forces={blueprint.forces} />}
    </div>
  );
}

function Toggle({ label, active, onClick }) {
  return (
    <button
      className={`toggle-btn ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {active ? '◉' : '○'} {label}
    </button>
  );
}

function ForceLegend({ forces }) {
  const seen = new Set();
  const unique = forces.filter(f => {
    if (seen.has(f.type)) return false;
    seen.add(f.type);
    return true;
  });

  return (
    <div className="force-legend">
      {unique.map(f => (
        <div key={f.type} className="legend-item">
          <span style={{
            display:'inline-block', width:14, height:3,
            background: f.color, borderRadius:2, verticalAlign:'middle', marginRight:4
          }} />
          <span style={{ textTransform:'capitalize' }}>{f.type}</span>
        </div>
      ))}
    </div>
  );
}
