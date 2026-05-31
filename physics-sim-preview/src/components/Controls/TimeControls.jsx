import React from 'react';
import useStore from '../../store/simulationStore';
import { useSimulationContext } from '../../contexts/SimulationContext';

const TIMESCALES = [
  { label: '0.1×', val: 0.1 },
  { label: '0.25×', val: 0.25 },
  { label: '0.5×', val: 0.5 },
  { label: '1×',   val: 1   },
  { label: '2×',   val: 2   },
];

export default function TimeControls() {
  const blueprint  = useStore(s => s.blueprint);
  const simState   = useStore(s => s.simState);
  const timeScale  = useStore(s => s.timeScale);
  const setTimeScale = useStore(s => s.setTimeScale);

  const missingData = useStore(s => s.missingData);
  const { play, pause, reset, stepFrame } = useSimulationContext();

  const canRun = !!blueprint && missingData.length === 0;

  return (
    <div className="time-controls">
      {/* Playback */}
      <div className="ctrl-group">
        <button className="ctrl-btn" onClick={reset} title="Reset (R)" disabled={!blueprint}>
          ⏮
        </button>
        <button
          className={`ctrl-btn ${simState === 'running' ? 'active' : ''}`}
          onClick={simState === 'running' ? pause : play}
          disabled={!canRun}
          title={simState === 'running' ? 'Pause (Space)' : 'Play (Space)'}
        >
          {simState === 'running' ? '⏸' : '▶'}
        </button>
        <button
          className="ctrl-btn"
          onClick={stepFrame}
          disabled={simState === 'running' || !blueprint}
          title="Step one frame (→)"
        >
          ⏭
        </button>
      </div>

      {/* Time scale */}
      <div className="ctrl-group" style={{ gap: 2 }}>
        {TIMESCALES.map(ts => (
          <button
            key={ts.val}
            className={`timescale-btn ${timeScale === ts.val ? 'active' : ''}`}
            onClick={() => setTimeScale(ts.val)}
          >
            {ts.label}
          </button>
        ))}
      </div>

      {/* Missing data warning */}
      {blueprint && missingData.length > 0 && (
        <div className="missing-warning">
          ⚠ {missingData.length} missing value(s)
        </div>
      )}
    </div>
  );
}
