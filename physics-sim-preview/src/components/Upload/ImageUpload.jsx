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

  const saveKey = useCallback(() => {
    const key = apiKeyInput.trim();
    const p = detectProvider(key);
    const currentProvider = detectProvider(geminiApiKey);
    if (p !== currentProvider) setModelId(defaultModelForProvider(p));
    setApiKey(key);
    setTestResult(null);
  }, [apiKeyInput, geminiApiKey, setApiKey, setModelId]);

  const testKey = useCallback(async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const v = createVisionEngine(key, modelId);
      const { modelId: workingModel } = await v.testConnection();
      setApiKey(key);
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
            }
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
                Model {tryingIndex}/{totalModels}: {(tryingModel || modelId).split('/').pop()}
              </span>
              <button
                onClick={cancelAnalysis}
                style={{ background: 'none', border: '1px solid #ff7043', color: '#ff7043',
                         borderRadius: 4, padding: '1px 7px', fontSize: 11, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            <span style={{ fontSize: 10, opacity: 0.6 }}>12s timeout per model — auto-tries next if slow</span>
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
