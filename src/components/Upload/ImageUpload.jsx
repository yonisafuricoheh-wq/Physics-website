import React, { useRef, useCallback, useState } from 'react';
import useStore from '../../store/simulationStore';
import { GeminiVision, AVAILABLE_MODELS } from '../../engine/GeminiVision';
import { parseBlueprint, autoComputeForces } from '../../engine/BlueprintParser';
import { DEMO_BLUEPRINT } from '../../data/demoBlueprint';

export default function ImageUpload() {
  const fileRef  = useRef(null);
  const [dragging,    setDragging]    = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState(null); // null | 'ok' | 'fail'
  const [errorFull,   setErrorFull]   = useState(false);
  const [usedModel,   setUsedModel]   = useState(null); // model that actually succeeded

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

  // Sync input with stored key on first render
  useState(() => { setApiKeyInput(geminiApiKey); });

  const saveKey = useCallback(() => {
    setApiKey(apiKeyInput.trim());
    setTestResult(null);
  }, [apiKeyInput, setApiKey]);

  const testKey = useCallback(async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const v = new GeminiVision(key, modelId);
      const { modelId: workingModel } = await v.testConnection();
      setApiKey(key);
      // Auto-switch dropdown to whichever model actually responded
      if (workingModel !== modelId) setModelId(workingModel);
      const note = workingModel !== modelId ? ` (auto-switched from ${modelId})` : '';
      setTestResult('ok:' + workingModel + note);
    } catch (err) {
      setTestResult('fail:' + err.message);
    } finally {
      setTesting(false);
    }
  }, [apiKeyInput, modelId, setApiKey]);

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

      try {
        const vision = new GeminiVision(geminiApiKey, modelId);
        setUsedModel(null);
        const { data: raw, usedModel: actualModel } = await vision.analyzeImage(
          base64,
          mimeType,
          (fb) => setUsedModel(fb) // called if fallback kicked in
        );
        setUsedModel(actualModel);
        const parsed     = parseBlueprint(raw);
        const withForces = autoComputeForces(parsed);
        setBlueprint(withForces);
      } catch (err) {
        setAnalysisStatus('error', err.message);
      }
    };
    reader.readAsDataURL(file);
  }, [geminiApiKey, modelId, setUploadedImage, setAnalysisStatus, setBlueprint]);

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
        <div className="section-title">Gemini API Key</div>
        <div style={{ display:'flex', gap:4 }}>
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => { setApiKeyInput(e.target.value); setTestResult(null); }}
            placeholder="AIza…"
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
          <p style={{ fontSize:11, color:'#ff7043', marginTop:4 }}>
            Required for analysis.{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
               style={{ color:'#4fc3f7' }}>Get a key →</a>
          </p>
        )}
        {geminiApiKey && !testResult && (
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
          {AVAILABLE_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p style={{ fontSize:10, color:'#8888aa', marginTop:3 }}>
          Free-tier keys work with Flash models. Pro requires billing.
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
          <div className="status-msg analyzing">
            <span className="spinner" /> Analyzing with {modelId} (v{modelId.startsWith('gemini-2') ? '1beta' : '1'})…
          </div>
        )}

        {analysisStatus === 'error' && analysisError && (
          <div className="status-msg error" style={{ flexDirection:'column', alignItems:'flex-start', cursor:'pointer' }}
               onClick={() => setErrorFull(p => !p)}>
            <div style={{ display:'flex', alignItems:'center', gap:6, width:'100%' }}>
              <span>Analysis failed</span>
              <span style={{ marginLeft:'auto', fontSize:10, opacity:.6 }}>{errorFull ? '▲ collapse' : '▼ details'}</span>
            </div>
            {errorFull && (
              <pre style={{
                marginTop:6, fontSize:10, whiteSpace:'pre-wrap', wordBreak:'break-word',
                color:'#ffab91', lineHeight:1.5, maxHeight:180, overflowY:'auto',
                background:'rgba(0,0,0,0.25)', padding:6, borderRadius:4, width:'100%',
              }}>
                {analysisError}
              </pre>
            )}
            {!errorFull && (
              <span style={{ fontSize:11, opacity:.8 }}>
                {analysisError.split('\n')[0].substring(0, 90)}{analysisError.length > 90 ? '…' : ''}
              </span>
            )}
          </div>
        )}

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

function BlueprintSummary() {
  const blueprint = useStore(s => s.blueprint);
  if (!blueprint) return null;

  return (
    <div className="section" style={{ paddingBottom:12 }}>
      <div className="section-title">Parsed Blueprint</div>
      <div className="bp-summary">
        <div className="bp-row"><span>Type</span><span className="val">{blueprint.problem_type}</span></div>
        <div className="bp-row"><span>Objects</span><span className="val">{blueprint.objects.length}</span></div>
        <div className="bp-row"><span>Forces</span><span className="val">{blueprint.forces.length}</span></div>
        <div className="bp-row"><span>g</span><span className="val">{blueprint.environment.g} m/s²</span></div>
        {blueprint.objects[0]?.mass != null && (
          <div className="bp-row">
            <span>Mass</span>
            <span className="val">{blueprint.objects[0].mass} kg</span>
          </div>
        )}
        {blueprint.known_results?.acceleration != null && (
          <div className="bp-row">
            <span>Expected a</span>
            <span className="val">{Number(blueprint.known_results.acceleration).toFixed(2)} m/s²</span>
          </div>
        )}
        {blueprint.description && (
          <p style={{ fontSize:11, color:'#8888aa', marginTop:6, lineHeight:1.5 }}>
            {blueprint.description}
          </p>
        )}
      </div>
    </div>
  );
}
