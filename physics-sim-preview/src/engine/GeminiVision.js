import { GoogleGenerativeAI } from '@google/generative-ai';

export const ANALYSIS_PROMPT = `You are a Physics Expert AI. Analyze this physics diagram and output ONLY a valid JSON object — no markdown, no code fences, no explanation whatsoever.

STEP 1 — Classify the scene (look at the big picture first):
• Inclined plane: tilted ramp/slope with block(s) on it
• Projectile: object(s) flying/thrown through air, velocity arrows shown
• Pulley: rope over a wheel/drum with hanging masses
• Spring: coil connecting objects
• Collision: two objects about to hit or bouncing
• If you see a tall building, tower, or cliff → it is a WALL surface (not an object)

STEP 2 — Read every label carefully:
• The image may contain Hebrew text. Copy all labels EXACTLY as shown.
  Hebrew letters like מ, כ, ש, ג are variable names — keep them as-is.
• Read every number visible: mass (kg), speed (m/s), angle (°), height (m), distance (m)
• Read the direction of every arrow (velocity arrows, force arrows)

STEP 3 — Output this JSON structure:
{
  "problem_type": "inclined_plane|pulley|projectile|spring|pendulum|collision|other",
  "description": "one-sentence description of exactly what the problem shows",
  "environment": {"g": 9.8},
  "objects": [
    {
      "id": "obj_1",
      "type": "circle|rectangle|point_mass",
      "label": "<label from image>",
      "mass": <number or null>,
      "position": {"x": <meters from left>, "y": <meters above ground>},
      "dimensions": {"width": 0.5, "height": 0.5},
      "angle": 0,
      "initial_velocity": {"x": <rightward m/s>, "y": <upward m/s>},
      "properties": {"mu_k": null, "is_fixed": false}
    }
  ],
  "surfaces": [
    {
      "id": "ground",
      "type": "floor|wall|line",
      "label": "",
      "points": [{"x": -8, "y": 0}, {"x": 8, "y": 0}],
      "angle": 0,
      "length": 16,
      "properties": {"mu_k": 0, "is_frictionless": true}
    }
  ],
  "forces": [],
  "constraints": [],
  "known_results": {"acceleration": null, "description": ""}
}

SPECIFIC RULES:
• Always include a floor surface at y=0 (unless the scene is entirely mid-air)
• Estimate all distances/heights in meters from diagram proportions
• x+ = rightward, y+ = upward; place origin at lower-left of the scene

For PROJECTILE problems:
  - Set initial_velocity.x and initial_velocity.y from the velocity arrow shown
  - Set position.y = launch height above ground (estimate in meters)
  - If thrown from a building: add the building as a wall surface (type="wall")
  - If two objects are thrown from different heights: include BOTH as separate objects

For INCLINED PLANE:
  - Add the slope as a surface with type="line" and angle = slope angle in degrees
  - Points: from base [x1,0] to top [x2, x1+length*sin(angle)]

For PULLEY:
  - Add both hanging masses as objects
  - Add a pulley object (type="circle") at the top where the rope bends
  - Add a constraint between them

For BUILDING / WALL:
  - Surface type="wall", points from [bx, 0] to [bx, building_height]
  - Do NOT include the building as an "object"

For FRICTION:
  - Set properties.mu_k from the μ value shown in the image (e.g. μ=0.3 → mu_k: 0.3)

If any value is not shown in the image, set it to null.`;

export const TUTOR_SYSTEM = `You are a Socratic Physics Tutor embedded in a 2D physics simulation.
The student is analyzing a live simulation. Guide them with questions, not direct answers.
When you mention a specific force by its label (like "mg", "N", "f", "T"), wrap it in double-asterisks so the visualization can highlight it: **mg**
Keep responses to 3-4 sentences. Be precise with numbers when referencing simulation data.`;

// Each model lives on a specific API version endpoint.
// Gemini 2.0 → v1beta  |  Gemini 1.5 → stable v1
const MODEL_API_VERSION = {
  'gemini-2.0-flash':        'v1beta',
  'gemini-2.0-flash-lite':   'v1beta',
  'gemini-1.5-flash':        'v1beta',
  'gemini-1.5-flash-8b':     'v1beta',
  'gemini-1.5-pro':          'v1beta',
};

// Ordered fallback chain: if a model returns limit=0 we try the next one.
export const FALLBACK_CHAIN = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

export const AVAILABLE_MODELS = [
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash  (recommended · free tier)' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite  (fastest · free tier)' },
  { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash  (free tier)' },
  { id: 'gemini-1.5-flash-8b',   label: 'Gemini 1.5 Flash 8B  (lightest)' },
  { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro  (paid tier)' },
];

// "limit: 0" in the error body means the project has NO quota for that model —
// waiting won't help. Must switch to a different model.
function isZeroQuota(err) {
  const msg = err?.message || '';
  return msg.includes('429') && (msg.includes('"limit": 0') || msg.includes('limit: 0'));
}

function isModelUnavailable(err) {
  const msg = err?.message || '';
  return msg.includes('404') || msg.toLowerCase().includes('not found');
}

function friendlyError(err, modelId) {
  const msg = err?.message || String(err);
  if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID'))
    return `Invalid API key — generate a fresh one at https://aistudio.google.com/app/apikey\n\n${msg}`;
  if (msg.includes('403'))
    return `Access denied (403). Billing may not be enabled, or this key lacks permission for "${modelId}".\n\n${msg}`;
  if (msg.includes('404') || msg.includes('not found'))
    return `Model "${modelId}" not found (404). It may not be available in your region or API tier.\n\n${msg}`;
  if (isZeroQuota(err))
    return `"${modelId}" has zero free-tier quota on this project (limit: 0) — switching models will fix this.\n\n${msg}`;
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))
    return `Rate limit hit (429) — retry in ~1 min, or switch to a lighter model.\n\n${msg}`;
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_'))
    return `Network error — cannot reach Google's servers. Check internet / VPN.\n\n${msg}`;
  return msg;
}

function buildModel(genAI, modelId) {
  const apiVersion = MODEL_API_VERSION[modelId] ?? 'v1beta';
  return genAI.getGenerativeModel({ model: modelId }, { apiVersion });
}

export class GeminiVision {
  constructor(apiKey, modelId = 'gemini-2.0-flash') {
    if (!apiKey) throw new Error('Gemini API key is required. Enter it in the left panel.');
    this._apiKey  = apiKey;
    this.modelId  = modelId;
    this.genAI    = new GoogleGenerativeAI(apiKey);
    this.model    = buildModel(this.genAI, modelId);
  }

  /* Text-only ping — walks the fallback chain until a model responds */
  async testConnection() {
    const chain = [this.modelId, ...FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;
    for (const modelId of chain) {
      const model = buildModel(this.genAI, modelId);
      try {
        await model.generateContent('Reply with the single word: OK');
        return { ok: true, modelId }; // caller should update selected model to this
      } catch (err) {
        if (isZeroQuota(err) || isModelUnavailable(err)) { lastErr = err; continue; }
        throw new Error(friendlyError(err, modelId));
      }
    }
    throw new Error(
      `All models are unavailable on this project/region.\n` +
      `Enable billing at https://console.cloud.google.com/billing or use a different API key.\n\n` +
      `Last error:\n${lastErr?.message}`
    );
  }

  /* Analyze image, auto-falling back through FALLBACK_CHAIN on limit=0 */
  async analyzeImage(imageBase64, mimeType = 'image/jpeg', onFallback) {
    const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const chain = [this.modelId, ...FALLBACK_CHAIN.filter(m => m !== this.modelId)];

    let lastErr;
    for (const modelId of chain) {
      const model = buildModel(this.genAI, modelId);
      try {
        const result = await model.generateContent([
          ANALYSIS_PROMPT,
          { inlineData: { data: imageBase64, mimeType: safeMime } },
        ]);

        if (modelId !== this.modelId && onFallback) onFallback(modelId);

        const raw = result.response.text().trim();
        const jsonStr = raw
          .replace(/^```(?:json)?\s*/im, '')
          .replace(/\s*```\s*$/im, '')
          .trim();

        try {
          return { data: JSON.parse(jsonStr), usedModel: modelId };
        } catch (e) {
          throw new Error(
            `${modelId} returned text that is not valid JSON.\n` +
            `Parse error: ${e.message}\n\nFirst 800 chars:\n${raw.substring(0, 800)}`
          );
        }
      } catch (err) {
        if (isZeroQuota(err) || isModelUnavailable(err)) {
          lastErr = err;
          continue; // try next model
        }
        throw new Error(friendlyError(err, modelId));
      }
    }

    throw new Error(
      `All models exhausted — none are available on this project/region.\n` +
      `Enable billing at https://console.cloud.google.com/billing, or use a different API key.\n\n` +
      `Last error:\n${lastErr?.message}`
    );
  }

  async chat(userMessage, blueprintSummary, history = []) {
    const systemMsg = `${TUTOR_SYSTEM}\n\nCurrent simulation:\n${blueprintSummary}`;
    const geminiHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    try {
      const session = this.model.startChat({
        history: [
          { role: 'user',  parts: [{ text: systemMsg }] },
          { role: 'model', parts: [{ text: 'Understood. I am ready to guide the student.' }] },
          ...geminiHistory,
        ],
      });
      const result = await session.sendMessage(userMessage);
      return result.response.text();
    } catch (err) {
      // Auto-fallback for chat too
      if (isZeroQuota(err)) {
        const next = FALLBACK_CHAIN.find(m => m !== this.modelId);
        if (next) {
          const fb = new GeminiVision(this._apiKey, next);
          return fb.chat(userMessage, blueprintSummary, history);
        }
      }
      throw new Error(friendlyError(err, this.modelId));
    }
  }

  static extractHighlightedForces(tutorText) {
    const matches = tutorText.match(/\*\*([^*]+)\*\*/g) || [];
    return matches.map(m => m.replace(/\*\*/g, '').trim());
  }
}
