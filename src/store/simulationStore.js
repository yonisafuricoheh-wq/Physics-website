import { create } from 'zustand';

const useStore = create((set, get) => ({
  /* ── API ─────────────────────────────────────────────────── */
  geminiApiKey: localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '',
  selectedModelId: localStorage.getItem('gemini_model') || 'gemini-2.0-flash',

  setApiKey: (key) => {
    localStorage.setItem('gemini_api_key', key);
    set({ geminiApiKey: key });
  },
  setSelectedModelId: (id) => {
    localStorage.setItem('gemini_model', id);
    set({ selectedModelId: id });
  },

  /* ── Analysis pipeline ───────────────────────────────────── */
  uploadedImage:  null,   // { base64, mimeType, dataUrl }
  blueprint:      null,
  analysisStatus: 'idle', // idle | analyzing | done | error
  analysisError:  null,
  missingData:    [],

  setUploadedImage:  (img) => set({ uploadedImage: img }),
  setAnalysisStatus: (s, err = null) => set({ analysisStatus: s, analysisError: err }),

  setBlueprint: (bp) => set({
    blueprint:      bp,
    missingData:    bp.missing_data || [],
    analysisStatus: 'done',
    // Reset sim when new blueprint arrives
    simState:       'idle',
    simTime:        0,
    objectStates:   {},
    trajectories:   {},
  }),

  fillMissingField: (path, value) => {
    const { blueprint, missingData } = get();
    if (!blueprint) return;

    // Navigate dotted path and set value
    const updated = JSON.parse(JSON.stringify(blueprint));
    const parts = path.split(/[\.\[\]]+/).filter(Boolean);
    let node = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node[parts[i]];
      if (!node) return;
    }
    const lastKey = parts[parts.length - 1];
    node[lastKey] = isNaN(value) ? value : Number(value);

    const remaining = missingData.filter(d => !d.startsWith(path));
    set({ blueprint: updated, missingData: remaining });
  },

  /* ── Simulation state ────────────────────────────────────── */
  simState:     'idle',   // idle | running | paused
  simTime:      0,
  timeScale:    1.0,
  objectStates: {},       // id -> { position, velocity, angle, speed }
  trajectories: {},       // id -> [{x,y}]

  setSimState:   (s) => set({ simState: s }),
  setTimeScale:  (t) => set({ timeScale: t }),

  tickObjectStates: (states) => set(prev => {
    const trajectories = { ...prev.trajectories };
    Object.entries(states).forEach(([id, s]) => {
      const existing = trajectories[id] || [];
      const last = existing[existing.length - 1];
      const pos = s.position;
      if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 0.02) {
        trajectories[id] = [...existing.slice(-800), { x: pos.x, y: pos.y }];
      }
    });
    return { objectStates: states, trajectories };
  }),

  addSimTime: (dt) => set(prev => ({ simTime: prev.simTime + dt })),

  resetSim: () => set({
    simState: 'idle', simTime: 0,
    objectStates: {}, trajectories: {},
  }),

  /* ── Visual toggles ──────────────────────────────────────── */
  showComponents: false,
  showGrid:       true,
  showLabels:     true,
  showTrajectory: true,
  teacherMode:    false,
  highlightedForces: [],  // force labels to pulse (set by tutor)

  toggleComponents:  () => set(s => ({ showComponents: !s.showComponents })),
  toggleGrid:        () => set(s => ({ showGrid:        !s.showGrid        })),
  toggleLabels:      () => set(s => ({ showLabels:      !s.showLabels      })),
  toggleTrajectory:  () => set(s => ({ showTrajectory:  !s.showTrajectory  })),
  toggleTeacherMode: () => set(s => ({ teacherMode:     !s.teacherMode     })),
  setHighlightedForces: (labels) => set({ highlightedForces: labels }),

  /* ── Camera ──────────────────────────────────────────────── */
  viewScale: 80,   // px per meter
  panX:      0,
  panY:      0,
  setCamera: (scale, px, py) => set({ viewScale: scale, panX: px, panY: py }),

  /* ── Tutor ───────────────────────────────────────────────── */
  tutorHistory:  [],   // { role, content }[]
  tutorLoading:  false,

  addTutorMsg: (role, content) =>
    set(s => ({ tutorHistory: [...s.tutorHistory, { role, content, id: Date.now() }] })),
  setTutorLoading: (v) => set({ tutorLoading: v }),

  /* ── Teacher mode (force overrides) ─────────────────────── */
  forceOverrides: {}, // forceId -> { magnitude, angle_degrees }
  setForceOverride: (id, magnitude, angle) =>
    set(s => ({ forceOverrides: { ...s.forceOverrides, [id]: { magnitude, angle_degrees: angle } } })),
  clearForceOverrides: () => set({ forceOverrides: {} }),
}));

export default useStore;
