import React, { useState } from 'react';
import useStore from '../../store/simulationStore';

function inferType(path) {
  const p = path.toLowerCase();
  if (p.includes('mass'))    return { type: 'number', unit: 'kg',    placeholder: 'e.g. 5.0',  min: 0 };
  if (p.includes('mu_s'))    return { type: 'number', unit: '',      placeholder: 'e.g. 0.3',  min: 0, max: 1 };
  if (p.includes('mu_k'))    return { type: 'number', unit: '',      placeholder: 'e.g. 0.2',  min: 0, max: 1 };
  if (p.includes('angle'))   return { type: 'number', unit: '°',    placeholder: 'e.g. 30',   min: 0, max: 90 };
  if (p.includes('velocity'))return { type: 'number', unit: 'm/s',  placeholder: 'e.g. 0',    min: -1000 };
  if (p.includes('g'))       return { type: 'number', unit: 'm/s²', placeholder: 'e.g. 9.8',  min: 0 };
  if (p.includes('length'))  return { type: 'number', unit: 'm',    placeholder: 'e.g. 2.0',  min: 0 };
  if (p.includes('stiffness'))return { type: 'number', unit: 'N/m', placeholder: 'e.g. 100',  min: 0 };
  return { type: 'number', unit: '', placeholder: 'value', min: undefined };
}

export default function MissingDataModal() {
  const missingData    = useStore(s => s.missingData);
  const fillMissingField = useStore(s => s.fillMissingField);
  const [values, setValues] = useState({});

  if (!missingData || missingData.length === 0) return null;

  const handleChange = (path, val) => {
    setValues(prev => ({ ...prev, [path]: val }));
  };

  const handleFill = (rawEntry) => {
    const colonIdx = rawEntry.indexOf(':');
    const path = colonIdx >= 0 ? rawEntry.substring(0, colonIdx).trim() : rawEntry.trim();
    const val  = values[path];
    if (val === undefined || val === '') return;
    fillMissingField(path, val);
    setValues(prev => { const n = { ...prev }; delete n[path]; return n; });
  };

  const handleSkip = (rawEntry) => {
    const colonIdx = rawEntry.indexOf(':');
    const path = colonIdx >= 0 ? rawEntry.substring(0, colonIdx).trim() : rawEntry.trim();
    fillMissingField(path, 0);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span>⚠ Missing Simulation Data</span>
          <span style={{ fontSize:12, color:'#8888aa' }}>
            Fill in the values before starting the simulation
          </span>
        </div>

        <div className="modal-body">
          {missingData.map((entry) => {
            const colonIdx = entry.indexOf(':');
            const path  = colonIdx >= 0 ? entry.substring(0, colonIdx).trim()  : entry.trim();
            const desc  = colonIdx >= 0 ? entry.substring(colonIdx + 1).trim() : entry.trim();
            const meta  = inferType(path);

            return (
              <div key={path} className="missing-field">
                <div className="field-desc">{desc || path}</div>
                <div className="field-path">{path}</div>
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  <div style={{ position:'relative', flex:1 }}>
                    <input
                      type={meta.type}
                      min={meta.min}
                      max={meta.max}
                      placeholder={meta.placeholder}
                      className="input-field"
                      style={{ width:'100%', paddingRight: meta.unit ? 36 : 8 }}
                      value={values[path] ?? ''}
                      onChange={e => handleChange(path, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleFill(entry)}
                    />
                    {meta.unit && (
                      <span style={{
                        position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                        color:'#8888aa', fontSize:12, pointerEvents:'none'
                      }}>{meta.unit}</span>
                    )}
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => handleFill(entry)}
                    disabled={!values[path]}
                  >
                    Set
                  </button>
                  <button
                    className="btn-secondary"
                    title="Use 0 / skip this field"
                    onClick={() => handleSkip(entry)}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <span style={{ fontSize:11, color:'#8888aa' }}>
            Fields marked "Skip" will default to 0 — the simulation may be inaccurate.
          </span>
        </div>
      </div>
    </div>
  );
}
