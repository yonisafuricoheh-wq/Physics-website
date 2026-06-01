import { GoogleGenerativeAI } from '@google/generative-ai';

const ANALYSIS_PROMPT = `You are a Physics Expert AI. Analyze this physics problem image and output a SINGLE valid JSON object.

DO NOT output any text before or after the JSON.
DO NOT wrap in markdown code fences.

Return this exact schema:
{
  "problem_type": "inclined_plane|pulley|projectile|circular_motion|collision|spring|pendulum|electrostatics|other",
  "description": "one-sentence description",
  "coordinate_system": {
    "origin": {"x": 0, "y": 0},
    "x_positive": "right",
    "y_positive": "up"
  },
  "environment": { "g": 9.8, "medium": "air" },
  "objects": [
    {
      "id": "block_1",
      "type": "rectangle|circle|point_mass|pulley|wall",
      "label": "m",
      "mass": 5.0,
      "position": {"x": 0.0, "y": 2.5},
      "dimensions": {"width": 0.6, "height": 0.4},
      "angle": 30.0,
      "initial_velocity": {"x": 0, "y": 0},
      "properties": {"mu_s": 0.3, "mu_k": 0.2, "is_fixed": false}
    }
  ],
  "surfaces": [
    {
      "id": "incline_1",
      "type": "line|arc|floor|wall",
      "label": "θ = 30°",
      "points": [{"x": -4, "y": 0}, {"x": 4, "y": 4.619}],
      "angle": 30.0,
      "length": 8.0,
      "properties": {"mu_s": 0.3, "mu_k": 0.2, "is_frictionless": false}
    }
  ],
  "forces": [
    {
      "id": "gravity_block1",
      "type": "gravity|normal|friction|tension|applied|spring|buoyancy",
      "label": "mg",
      "object_id": "block_1",
      "pivot_point": {"x": 0.0, "y": 2.5},
      "magnitude": 49.0,
      "angle_degrees": 270,
      "vector": {"x": 0, "y": -49.0},
      "color_type": "gravity",
      "known": true
    }
  ],
  "constraints": [],
  "initial_conditions": {"t0": 0, "velocities": {}},
  "missing_data": [],
  "known_results": {"acceleration": null, "description": ""}
}

COORDINATE RULES:
- Origin at ground reference; y+ is UP, x+ is RIGHT
- Positions in meters, forces in Newtons
- angle_degrees measured CCW from +x axis:
  gravity=270, upward=90, rightward=0, leftward=180
  normal on 30° slope = 90+30 = 120
  friction opposing downward motion on 30° slope = 30+180? No: if block slides DOWN the 30° slope, friction points UP the slope = 30° direction = angle 30
- Force pivot_point MUST equal the object's position (center of mass)
- Compute magnitudes from visible values (m*g, μ*N, etc.)
- If a value is not stated in the image, set it null and add its path to missing_data
  Example missing_data entry: "objects[0].mass: Mass of the block is not specified"`;

const TUTOR_SYSTEM = `You are a Socratic Physics Tutor embedded in a 2D physics simulation.
The student is analyzing a live simulation. Guide them with questions, not direct answers.
When you mention a specific force by its label (like "mg", "N", "f", "T"), wrap it in double-asterisks so the visualization can highlight it: **mg**
Keep responses to 3-4 sentences. Be precise with numbers when referencing simulation data.`;

// Each model lives on a specific API version endpoint.
// Gemini 2.0 → v1beta  |  Gemini 1.5 → stable v1
const MODEL_API_VERSION = {
  'gemini-2.0-flash':        'v1beta',
  'gemini-2.0-flash-lite':   'v1beta',
  'gemini-1.5-flash':        'v1',
  'gemini-1.5-flash-8b':     'v1',
  'gemini-1.5-pro':          'v1',
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
        if (isZeroQuota(err)) { lastErr = err; continue; }
        throw new Error(friendlyError(err, modelId));
      }
    }
    throw new Error(
      `All models have zero free-tier quota on this project.\n` +
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
        if (isZeroQuota(err)) {
          lastErr = err;
          continue; // try next model
        }
        throw new Error(friendlyError(err, modelId));
      }
    }

    // Every model in the chain had limit=0
    throw new Error(
      `All models exhausted — every model in the fallback chain has zero free-tier quota on this project.\n` +
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
