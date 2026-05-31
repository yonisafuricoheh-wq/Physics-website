import React, { useRef, useCallback, useState, useEffect } from 'react';
import useStore from '../../store/simulationStore';
import { createVisionEngine, detectProvider, defaultModelForProvider, modelsForProvider } from '../../engine/visionEngine';
import { parseBlueprint, autoComputeForces } from '../../engine/BlueprintParser';
import { DEMO_BLUEPRINT } from '../../data/demoBlueprint';

export default function ImageUpload() {
  const fileRef    = useRef(null);
  const cancelRef  = useRef(false); // set to true to abort in-flight analysis
  const [dragging,    setDragging]    = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState(null); // null | 'ok' | 'fail'
  const [errorFull,   setErrorFull]   = useState(false);
  const [usedModel,    setUsedModel]    = useState(null);
  const [tryingModel,  setTryingModel]  = useState(null);
  const [tryingIndex,  setTryingIndex]  = useState(0);
  const [totalModels,  setTotalModels]  = useState(0);
  const [analysisPass, setAnalysisPass] = useState({ pass: 0, label: '' });

  const geminiApiKey      = useStore(s => s.geminiApiKey);
  const modelId           = useStore(s => s.selectedModelId);
  const setModelId        = useStore(s => s.setSelectedModelId);
  const setApiKey         = useStore(s => s.setApiKey);
  const uploadedImage     = useStore(s => s.uploadedImage);
  const analysisStatus    = useStore(s => s.analysisStatus);
  const analysisError     = useStore(s => s.analysisError);
  const setUploadedImage  = useStore(s => s.setUploadedImage);
  const setAnalysisStatus = useStore(s => s.setAnalysisStatus);
  const setBlueprint      = useStore(s => s.setBlueprint);

  // Key field starts empty every session

  const provider = detectProvider(apiKeyInput.trim());
  const availableModels = modelsForProvider(provider);

  // Auto-switch model when provider changes or when a better default is available
  useEffect(() => {
    const found = availableModels.find(m => m.id === modelId);
    // Switch to best default if model not found OR if still on old Llama default
    if (!found || modelId === 'meta-llama/llama-4-scout') {
      setModelId(defaultModelForProvider(provider));
    }
  }, [provider]);

  // Strip any non-ASCII characters that would break HTTP headers
  const sanitizeKey = (raw) => raw.trim().replace(/[^\x20-\x7E]/g, '');

  const saveKey = useCallback(() => {
    const key = sanitizeKey(apiKeyInput);
    const p = detectProvider(key);
    const currentProvider = detectProvider(geminiApiKey);
    if (p !== currentProvider) setModelId(defaultModelForProvider(p));
    setApiKey(key);
    setApiKeyInput(key); // update field to show cleaned key
    setTestResult(null);
  }, [apiKeyInput, geminiApiKey, setApiKey, setModelId]);

  const testKey = useCallback(async () => {
    const key = sanitizeKey(apiKeyInput);
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const v = createVisionEngine(key, modelId);
      const { modelId: workingModel } = await v.testConnection();
      setApiKey(key);
      setApiKeyInput(key);
      if (workingModel !== modelId) setModelId(workingModel);
      const note = workingModel !== modelId ? ` (auto-switched from ${modelId})` : '';
      setTestResult('ok:' + workingModel + note);
    } catch (err) {
      setTestResult('fail:' + err.message);
    } finally {
      setTesting(false);
    }
  }, [apiKeyInput, modelId, setApiKey, setModelId]);

  const processImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (!geminiApiKey) {
      setAnalysisStatus('error', 'No API key saved. Enter your Gemini API key and click Save.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl  = e.target.result;
      const base64   = dataUrl.split(',')[1];
      const mimeType = file.type;

      setUploadedImage({ dataUrl, base64, mimeType });
      setAnalysisStatus('analyzing');
      setErrorFull(false);
      cancelRef.current = false;
      const chain = modelsForProvider(detectProvider(geminiApiKey));
      setTotalModels(chain.length);
      setTryingIndex(1);
      setTryingModel(modelId);
      setAnalysisPass({ pass: 0, label: '' });

      try {
        const vision = createVisionEngine(geminiApiKey, modelId);
        setUsedModel(null);
        let attempt = 0;
        const { data: raw, usedModel: actualModel } = await vision.analyzeImage(
          base64,
          mimeType,
          (fb) => {
            if (!cancelRef.current) {
              attempt++;
              setTryingModel(fb);
              setTryingIndex(attempt + 1);
              setAnalysisPass({ pass: 0, label: '' });
            }
          },
          (pass, label) => {
            if (!cancelRef.current) setAnalysisPass({ pass, label });
          }
        );
        if (cancelRef.current) return;
        setUsedModel(actualModel);
        const parsed     = parseBlueprint(raw);
        const withForces = autoComputeForces(parsed);
        setBlueprint(withForces);
      } catch (err) {
        if (!cancelRef.current) setAnalysisStatus('error', err.message);
      } finally {
        setTryingModel(null);
        setAnalysisPass({ pass: 0, label: '' });
      }
    };
    reader.readAsDataURL(file);
  }, [geminiApiKey, modelId, setUploadedImage, setAnalysisStatus, setBlueprint]);

  const cancelAnalysis = useCallback(() => {
    cancelRef.current = true;
    setTryingModel(null);
    setAnalysisStatus('idle');
  }, [setAnalysisStatus]);

  const loadDemo = useCallback(() => {
    setUploadedImage(null);
    setBlueprint(parseBlueprint(DEMO_BLUEPRINT));
  }, [setUploadedImage, setBlueprint]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    processImage(e.dataTransfer.files[0]);
  }, [processImage]);

  const isTestFail = testResult?.startsWith('fail');

  return (
    <div className="upload-panel">

      {/* ── API Key ──────────────────────────────────────── */}
      <div className="section">
        <div className="section-title">AI Vision API Key</div>
        <div style={{ display:'flex', gap:4 }}>
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => { setApiKeyInput(e.target.value); setTestResult(null); }}
            placeholder="AIza… (Gemini)  or  sk-or-… (OpenRouter)"
            className="input-field"
            style={{ flex:1 }}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
          />
          <button className="btn-secondary" onClick={saveKey} title="Save without testing">Save</button>
          <button
            className="btn-secondary"
            onClick={testKey}
            disabled={!apiKeyInput.trim() || testing}
            title="Send a quick ping to verify key + model"
          >
            {testing ? '…' : 'Test'}
          </button>
        </div>

        {/* Key status */}
        {testResult?.startsWith('ok') && (
          <p style={{ fontSize:11, color:'#66bb6a', marginTop:4 }}>
            ✓ Key valid — {testResult.slice(3)} responds correctly
          </p>
        )}
        {isTestFail && (
          <p style={{ fontSize:11, color:'#ef5350', marginTop:4, lineHeight:1.4 }}>
            ✗ {testResult.slice(5)}
          </p>
        )}
        {!geminiApiKey && !testResult && (
          <div style={{ fontSize:11, color:'#ff7043', marginTop:4, lineHeight:1.6 }}>
            Paste a free API key:<br/>
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
               style={{ color:'#ffd740', fontWeight:600 }}>⚡ console.groq.com — Groq (fastest, recommended)</a><br/>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
               style={{ color:'#4fc3f7' }}>openrouter.ai — OpenRouter (slower)</a>
          </div>
        )}
        {provider === 'groq' && !testResult && (
          <p style={{ fontSize:11, color:'#ffd740', marginTop:4 }}>⚡ Groq key detected — fast mode</p>
        )}
        {provider === 'openrouter' && !testResult && (
          <p style={{ fontSize:11, color:'#66bb6a', marginTop:4 }}>OpenRouter key detected ✓</p>
        )}
        {provider === 'gemini' && !testResult && (
          <p style={{ fontSize:11, color:'#66bb6a', marginTop:4 }}>
            ✓ Google AI Studio key detected — Gemma 4 31B selected by default.
          </p>
        )}
        {provider === 'unknown' && apiKeyInput.trim() && !testResult && (
          <div style={{ fontSize:11, color:'#ef5350', marginTop:4, lineHeight:1.6,
            background:'rgba(239,83,80,0.08)', border:'1px solid rgba(239,83,80,0.25)',
            borderRadius:6, padding:'6px 8px' }}>
            ✗ Key not recognized. Expected:<br/>
            <span style={{ color:'#ffd740' }}>gsk_...</span> for Groq &nbsp;|&nbsp;
            <span style={{ color:'#4fc3f7' }}>sk-or-...</span> for OpenRouter<br/>
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
               style={{ color:'#ffd740', fontWeight:700 }}>⚡ Get a free Groq key →</a>
          </div>
        )}
        {geminiApiKey && (provider === 'groq' || provider === 'openrouter') && !testResult && (
          <p style={{ fontSize:11, color:'#8888aa', marginTop:4 }}>Key saved. Click Test to verify.</p>
        )}
      </div>

      {/* ── Model selector ───────────────────────────────── */}
      <div className="section">
        <div className="section-title">Model</div>
        <select
          className="input-field"
          value={modelId}
          onChange={e => { setModelId(e.target.value); setTestResult(null); }}
          style={{ width:'100%' }}
        >
          {availableModels.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p style={{ fontSize:10, color:'#8888aa', marginTop:3 }}>
          {provider === 'groq'       ? '⚡ Groq — usually under 5 seconds.' :
           provider === 'openrouter' ? 'OpenRouter free models — may be slow (12s timeout per model).' :
           'Free-tier Gemini keys work with Flash models.'}
        </p>
      </div>

      {/* ── Drop zone ────────────────────────────────────── */}
      <div className="section">
        <div className="section-title">Upload Problem Image</div>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          {uploadedImage ? (
            <img
              src={uploadedImage.dataUrl}
              alt="Problem"
              style={{ width:'100%', borderRadius:6, maxHeight:130, objectFit:'contain' }}
            />
          ) : (
            <div className="drop-hint">
              <span style={{ fontSize:26 }}>🖼</span>
              <span>Drop image or click to browse</span>
              <span style={{ fontSize:11, opacity:.55 }}>PNG · JPG · WEBP</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef} type="file" accept="image/*"
          style={{ display:'none' }} onChange={e => processImage(e.target.files[0])}
        />

        {/* Status bar */}
        {analysisStatus === 'analyzing' && (
          <div className="status-msg analyzing" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" />
                {(tryingModel || modelId).split('/').pop()}
              </span>
              <button
                onClick={cancelAnalysis}
                style={{ background: 'none', border: '1px solid #ff7043', color: '#ff7043',
                         borderRadius: 4, padding: '1px 7px', fontSize: 11, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            {analysisPass.pass > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[1,2,3].map(p => (
                    <div key={p} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: p < analysisPass.pass ? '#66bb6a' : p === analysisPass.pass ? '#ffd740' : '#333355',
                      transition: 'background 0.3s',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 10, opacity: 0.85 }}>
                  Pass {analysisPass.pass}/3 — {analysisPass.label}
                </span>
              </div>
            )}
          </div>
        )}

        {analysisStatus === 'error' && analysisError && (() => {
          const isDailyLimit = analysisError.includes('free-models-per-day') || analysisError.includes('per-day');
          return (
            <div className="status-msg error" style={{ flexDirection:'column', alignItems:'flex-start', gap:6 }}>
              {isDailyLimit ? (
                <>
                  <span style={{ fontWeight:600 }}>OpenRouter daily limit reached</span>
                  <span style={{ fontSize:11, lineHeight:1.5 }}>
                    Free OpenRouter models are capped per day.<br/>
                    Switch to <strong>Groq</strong> — it's free with no daily cap and 10× faster:
                  </span>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display:'block', textAlign:'center', width:'100%',
                      background:'#ffd740', color:'#000', fontWeight:700,
                      padding:'5px 0', borderRadius:5, fontSize:12,
                      textDecoration:'none',
                    }}
                  >
                    ⚡ Get Free Groq Key → console.groq.com
                  </a>
                  <span style={{ fontSize:10, opacity:.6 }}>Paste the key (starts with gsk_) above and click Save</span>
                </>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:6, width:'100%', cursor:'pointer' }}
                       onClick={() => setErrorFull(p => !p)}>
                    <span>Analysis failed</span>
                    <span style={{ marginLeft:'auto', fontSize:10, opacity:.6 }}>{errorFull ? '▲ collapse' : '▼ details'}</span>
                  </div>
                  {errorFull ? (
                    <pre style={{
                      fontSize:10, whiteSpace:'pre-wrap', wordBreak:'break-word',
                      color:'#ffab91', lineHeight:1.5, maxHeight:160, overflowY:'auto',
                      background:'rgba(0,0,0,0.25)', padding:6, borderRadius:4, width:'100%',
                    }}>
                      {analysisError}
                    </pre>
                  ) : (
                    <span style={{ fontSize:11, opacity:.8 }}>
                      {analysisError.split('\n')[0].substring(0, 90)}{analysisError.length > 90 ? '…' : ''}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {analysisStatus === 'done' && (
          <div className="status-msg done" style={{ flexDirection:'column', alignItems:'flex-start', gap:2 }}>
            <span>✓ Blueprint extracted successfully</span>
            {usedModel && usedModel !== modelId && (
              <span style={{ fontSize:10, opacity:.75 }}>
                (fell back to {usedModel} — {modelId} had zero free-tier quota)
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Demo ─────────────────────────────────────────── */}
      <div className="section">
        <button className="btn-primary" style={{ width:'100%' }} onClick={loadDemo}>
          Load Demo — 30° Inclined Plane
        </button>
        <p style={{ fontSize:10, color:'#8888aa', marginTop:4, textAlign:'center' }}>
          No API key needed for demo
        </p>
      </div>

      <BlueprintSummary />
    </div>
  );
}

const TYPE_META = {
  projectile:     { label: 'Projectile',     color: '#4fc3f7', icon: '🎯' },
  inclined_plane: { label: 'Inclined Plane', color: '#ffd740', icon: '📐' },
  pulley:         { label: 'Pulley',         color: '#ab47bc', icon: '⚙️' },
  collision:      { label: 'Collision',      color: '#ff7043', icon: '💥' },
  spring:         { label: 'Spring',         color: '#66bb6a', icon: '🌀' },
  other:          { label: 'Other',          color: '#8888aa', icon: '📊' },
};

const OBJ_COLORS = ['#4fc3f7', '#ff7043', '#66bb6a', '#ab47bc', '#ffd740', '#26c6da'];

function DataRow({ label, value, accent }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '2.5px 0', fontSize: 11, borderBottom: '1px solid #12122a',
    }}>
      <span style={{ color: '#7777aa' }}>{label}</span>
      <span style={{ color: accent || '#d0d0e8', fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function SectionHead({ title }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: '#555577', letterSpacing: '0.08em',
      textTransform: 'uppercase', padding: '8px 0 3px',
      borderBottom: '1px solid #1f1f40',
    }}>
      {title}
    </div>
  );
}

function BlueprintSummary() {
  const blueprint = useStore(s => s.blueprint);
  if (!blueprint) return null;

  const meta = TYPE_META[blueprint.problem_type] || TYPE_META.other;
  const kv   = { ...(blueprint.known_results || {}), ...(blueprint.known_values || {}) };
  const g    = blueprint.environment?.g ?? 9.8;

  // Collect all scalar given-values for display
  const scalars = [
    { label: 'g', value: `${g} m/s²` },
    kv.time            != null && { label: 't  (time)',         value: `${kv.time} s` },
    kv.spring_constant != null && { label: 'k  (spring)',       value: `${kv.spring_constant} N/m` },
    kv.tension         != null && { label: 'T  (tension)',      value: `${kv.tension} N` },
    kv.mu_k            != null && { label: 'μₖ (kinetic)',      value: kv.mu_k },
    kv.mu_s            != null && { label: 'μₛ (static)',       value: kv.mu_s },
    kv.distance        != null && { label: 'D  (distance)',     value: `${kv.distance} m` },
    kv.height          != null && { label: 'H  (height)',       value: `${kv.height} m` },
    kv.angle_degrees   != null && { label: 'θ  (angle)',        value: `${kv.angle_degrees}°` },
    kv.acceleration    != null && { label: 'a  (acceleration)', value: `${Number(kv.acceleration).toFixed(2)} m/s²` },
  ].filter(Boolean);

  const frictionSurfs = blueprint.surfaces.filter(
    s => !s.properties?.is_frictionless && (s.properties?.mu_k ?? 0) > 0
  );

  return (
    <div className="section" style={{ paddingBottom: 12 }}>
      <div className="section-title">Extracted Data</div>
      <div className="bp-summary" style={{ padding: '0 2px' }}>

        {/* ── Problem type + description ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
          background: `${meta.color}14`, border: `1px solid ${meta.color}38`,
          borderRadius: 7, marginBottom: 4,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1.1 }}>{meta.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: meta.color, fontSize: 12.5 }}>{meta.label}</div>
            {blueprint.description && (
              <div style={{ fontSize: 9.5, color: '#8888b8', lineHeight: 1.45, marginTop: 2 }}>
                {blueprint.description.length > 90
                  ? blueprint.description.slice(0, 90) + '…'
                  : blueprint.description}
              </div>
            )}
          </div>
        </div>

        {/* ── Objects ── */}
        <SectionHead title="Objects" />
        {blueprint.objects.map((obj, i) => {
          const clr  = OBJ_COLORS[i % OBJ_COLORS.length];
          const vx   = obj.initial_velocity?.x ?? 0;
          const vy   = obj.initial_velocity?.y ?? 0;
          const spd  = Math.sqrt(vx * vx + vy * vy);
          const hasV = spd > 0.01;
          const hasBothComponents = hasV && Math.abs(vx) > 0.01 && Math.abs(vy) > 0.01;
          const mu   = obj.properties?.mu_k;
          const k    = obj.properties?.spring_constant;

          return (
            <div key={obj.id} style={{
              borderLeft: `3px solid ${clr}`,
              background: `${clr}0d`,
              borderRadius: '0 5px 5px 0',
              padding: '5px 8px', marginTop: 5,
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: clr, fontSize: 12.5 }}>
                  {obj.label || obj.id}
                </span>
                <span style={{ fontSize: 9.5, color: '#666688' }}>
                  {obj.type === 'circle' ? 'sphere' : obj.type === 'rectangle' ? 'block' : obj.type}
                </span>
              </div>

              {obj.mass != null && (
                <DataRow label="mass" value={`${obj.mass} kg`} accent={clr} />
              )}
              {obj.position.y > 0.6 && (
                <DataRow label="height y" value={`${obj.position.y.toFixed(1)} m`} />
              )}
              {Math.abs(obj.position.x) > 0.01 && (
                <DataRow label="x pos" value={`${obj.position.x.toFixed(0)} m`} />
              )}
              {hasV && (
                <DataRow label="v₀" value={`${spd.toFixed(1)} m/s`} accent={clr} />
              )}
              {hasBothComponents && (
                <div style={{ fontSize: 9.5, color: '#666699', paddingLeft: 4, paddingBottom: 2, lineHeight: 1.9 }}>
                  {Math.abs(vx) > 0.01 && <span>vₓ = {vx.toFixed(1)} m/s</span>}
                  {Math.abs(vx) > 0.01 && Math.abs(vy) > 0.01 && <span style={{ margin: '0 5px', color: '#33334a' }}>|</span>}
                  {Math.abs(vy) > 0.01 && <span>vᵧ = {vy.toFixed(1)} m/s</span>}
                </div>
              )}
              {mu != null && mu > 0 && (
                <DataRow label="μₖ (surface)" value={mu} />
              )}
              {k != null && (
                <DataRow label="k (spring)" value={`${k} N/m`} />
              )}
            </div>
          );
        })}

        {/* ── Surfaces with friction ── */}
        {frictionSurfs.length > 0 && (
          <>
            <SectionHead title="Surfaces" />
            {frictionSurfs.map(s => (
              <div key={s.id} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, padding: '3px 0', borderBottom: '1px solid #12122a',
              }}>
                <span style={{ color: '#7777aa' }}>
                  {s.type}{s.angle ? ` (${s.angle}°)` : ''}
                  {s.label ? ` — ${s.label}` : ''}
                </span>
                <span style={{ color: '#ffb74d', fontWeight: 600 }}>μₖ = {s.properties.mu_k}</span>
              </div>
            ))}
          </>
        )}

        {/* ── Scalar given values ── */}
        <SectionHead title="Given Values" />
        {scalars.map((entry, i) => (
          <DataRow key={i} label={entry.label} value={entry.value} />
        ))}
        <DataRow label="force arrows" value={blueprint.forces.length} />
        {blueprint.constraints?.length > 0 && (
          <DataRow label="constraints" value={blueprint.constraints.length} />
        )}

      </div>
    </div>
  );
}
