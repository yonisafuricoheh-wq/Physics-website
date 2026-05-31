import { GoogleGenerativeAI } from '@google/generative-ai';

export const ANALYSIS_PROMPT = `Output ONLY a valid JSON object. No markdown. No code fences. No explanation. Start directly with {

You are reading a Hebrew high-school (Bagrut) physics problem image and extracting data into JSON.
Read ONLY what is visible. Do not calculate. Do not guess. Set null for anything not labeled.

━━━ STEP 1: CLASSIFY THE PROBLEM ━━━
Choose ONE problem_type by looking at the diagram:

  "projectile"      Ball/object flying through air: thrown up, dropped, or thrown horizontally.
                    Hebrew: זריקה, נפילה חופשית, גוף נזרק
  "inclined_plane"  Block sitting on a ramp/slope, may have applied force or friction.
                    Hebrew: מישור משופע, גוף על מישור
  "pulley"          Rope over a pulley (גלגלת) connecting two objects — one on table, one hanging.
                    Hebrew: גלגלת, חבל, גוף תלוי
  "collision"       Two objects that hit each other. Hebrew: התנגשות
  "spring"          Spring (קפיץ) attached to a mass. Hebrew: קפיץ
  "other"           Circular motion, pendulum, or anything else.

⚠ KEY CLASSIFICATION RULES (read before anything else):
  • Rope + pulley visible → ALWAYS "pulley", never "projectile"
  • Block on a slope → ALWAYS "inclined_plane"
  • Free fall (dropped, v₀=0) → "projectile" with initial_velocity={x:0,y:0}
  • Horizontal throw → "projectile" with initial_velocity={x:+v,y:0}
  • Upward throw → "projectile" with initial_velocity={x:0,y:+v}

━━━ STEP 2: READ OBJECTS & POSITIONS ━━━
Count every ball / block / mass in the image → one entry per body.
Walls, buildings, floors, ramps → surfaces only, NEVER objects.

For each object:
  label      — text printed next to it (copy Hebrew letters exactly)
  mass       — kg value if labeled, else null
  position.x — horizontal position in meters:
               • If a horizontal distance D is labeled between two ground objects
                 → place left object at x=0, right object at x=D
                 → e.g. "330 m" between B(left) and A(right): B.x=0, A.x=330
               • Building/cliff on left at x=bx: ball on roof at x=bx+2
  position.y — height above ground in meters (read H=, h=, or dimension labels)
               • Object at ground level → position.y = 0.5
               • Object on roof/cliff of height H → position.y = H

━━━ STEP 3: READ VELOCITIES ━━━
ALWAYS read from the ARROWHEAD TIP direction, NOT from where the speed label is printed.

  ↑ straight up    → {x:0,   y:+v}
  ↓ straight down  → {x:0,   y:-v}
  → straight right → {x:+v,  y:0}
  ← straight left  → {x:-v,  y:0}
  ↗ angle θ above horizontal, going RIGHT → {x:+v·cos(θ), y:+v·sin(θ)}
  ↖ angle θ above horizontal, going LEFT  → {x:-v·cos(θ), y:+v·sin(θ)}
  no arrow → {x:0, y:0}

COMMON ANGLES (memorize these exact values):
  30°    cos=0.866  sin=0.500
  37°    cos=0.800  sin=0.600
  45°    cos=0.707  sin=0.707
  53°    cos=0.600  sin=0.800   ← very common in Israeli physics
  53.13° cos=0.600  sin=0.800
  60°    cos=0.500  sin=0.866

SPEED UNKNOWN (מהירות מסוימת / not labeled):
  If angle is shown but speed is not given → use 60 as placeholder speed and set mass=null
  e.g. angle 53° unknown speed → {x:0.6*60, y:0.8*60} = {x:36, y:48}

⚠ "80 m/s" to the RIGHT of an UPWARD arrow → still {x:0, y:80}. Label position ≠ direction.
⚠ Two objects on the ground separated by distance D → they are D meters apart horizontally.

━━━ STEP 4: EXTRACT ALL LABELED QUANTITIES ━━━
After reading velocities, scan EVERY remaining label for numbers.
Write each into known_values — set null for anything not visible:

  t / זמן           → time (seconds)
  k / קפיץ          → spring_constant (N/m)  [also set objects[].properties.spring_constant]
  T / מתח חבל       → tension (N)  — only if a number is written next to T
  μk / מקדם חיכוך   → mu_k (also copy value to the relevant surface's properties.mu_k)
  μs                 → mu_s
  g                  → set environment.g = 10 if image shows "g=10", else 9.8
  a                  → acceleration (m/s²)
  D / horizontal dist → distance (m)  [same as what you put in object positions]
  H / h / גובה       → height (m)
  θ / angle          → angle_degrees

━━━ STEP 5: PROBLEM-SPECIFIC RULES ━━━

▸ PROJECTILE — two ground-level objects, horizontal separation:
  Pattern: A on right thrown up, B on left thrown at angle toward A.
  - Read horizontal distance D between them → A.position.x = D, B.position.x = 0
  - A thrown straight up → A.initial_velocity = {x:0, y:vA}
  - B thrown at angle θ toward right → B.initial_velocity = {x:vB·cos(θ), y:vB·sin(θ)}
  - If B's speed unknown → use placeholder 60 m/s
  - EXAMPLE for this pattern:
    A: {"position":{"x":330,"y":0.5},"initial_velocity":{"x":0,"y":80}}
    B: {"position":{"x":0,"y":0.5},"initial_velocity":{"x":36,"y":48}}  ← 53° placeholder

▸ PROJECTILE — building + 2 balls pattern:
  Building on left at x=bx, height H. Ball A on roof, Ball B at ground.
  ⚠ Read each ball's arrow SEPARATELY. Both usually thrown UPWARD.
  wall: points=[{x:bx,y:0},{x:bx,y:H}], ball_a at x=bx+2, ball_b at x=bx-2

▸ INCLINED PLANE (מישור משופע):
  Block → type="rectangle" on ramp. Ramp → type="line", angle=slope°, mu_k from image.
  Applied force → add to forces[] with magnitude and angle_degrees.

▸ PULLEY (גלגלת):
  Object A on table → initial_velocity={x:0,y:0}. Object B hanging → initial_velocity={x:0,y:0}.
  Constraint → {"type":"string","object_a":"<A>","object_b":"<B>","label":"T"}
  ⚠ NEVER classify as "projectile". Both start at REST.

▸ COLLISION (התנגשות):
  Object moving right → initial_velocity.x = +v. Moving left → initial_velocity.x = -v.

▸ SPRING (קפיץ):
  k (N/m) → known_values.spring_constant AND objects[].properties.spring_constant.
  Natural length / extension if labeled → objects[].dimensions.

━━━ STEP 6: SURFACES ━━━
Always include a floor: {"id":"floor","type":"floor","points":[{"x":-5,"y":0},{"x":30,"y":0}],"angle":0,"length":35,"properties":{"mu_k":0,"is_frictionless":true}}
Inclined ramp → type="line", angle=slope degrees, mu_k from image.
Building/cliff → type="wall", points from base to top.

━━━ OUTPUT SCHEMA ━━━
{
  "problem_type": "projectile|inclined_plane|pulley|collision|spring|other",
  "description": "one sentence: what you see — objects, speeds, heights, angles",
  "environment": {"g": 9.8},
  "objects": [
    {"id":"obj_a","type":"circle|rectangle","label":"A","mass":null,
     "position":{"x":7,"y":45},"dimensions":{"width":0.8,"height":0.6},"angle":0,
     "initial_velocity":{"x":0,"y":40},
     "properties":{"mu_k":null,"mu_s":null,"spring_constant":null,"is_fixed":false}}
  ],
  "surfaces": [
    {"id":"floor","type":"floor","label":"","points":[{"x":-5,"y":0},{"x":30,"y":0}],"angle":0,"length":35,"properties":{"mu_k":0,"is_frictionless":true}}
  ],
  "forces": [],
  "constraints": [],
  "known_values": {
    "time": null,
    "spring_constant": null,
    "tension": null,
    "mu_k": null,
    "mu_s": null,
    "distance": null,
    "height": null,
    "angle_degrees": null,
    "acceleration": null
  }
}
`;

/* ── Pass 2: self-critique ──────────────────────────────────── */
export const CRITIQUE_PROMPT = `Re-examine the image carefully and fix your JSON. Check each point:

1. PROBLEM TYPE
   • Rope + pulley → "pulley" (never "projectile")
   • Block on slope → "inclined_plane"
   • Objects flying/thrown → "projectile"
   • Two objects colliding → "collision"

2. OBJECT COUNT
   Count every ball/block/mass — "objects" must have exactly that many.
   Buildings/walls/ramps belong in "surfaces" only.

3. HORIZONTAL POSITIONS (most commonly wrong!)
   • Is there a horizontal distance label (e.g. "330 m") between two ground objects?
     → left object x=0, right object x=330. Are your positions correct?
   • Are two separate ground objects placed far apart, not at the same x?

4. VELOCITY DIRECTIONS (second most common error)
   Look at the ARROWHEAD TIP — not where the number is written.
   • Straight up arrow → {x:0, y:+speed}
   • Arrow at angle θ going right → {x:+speed·cos(θ), y:+speed·sin(θ)}
   • Arrow at angle θ going left  → {x:-speed·cos(θ), y:+speed·sin(θ)}
   Common: 53° → cos=0.6, sin=0.8. Check that diagonal arrows have BOTH x and y components.
   ⚠ Speed label to the right of an upward arrow = upward velocity, NOT rightward.

5. HEIGHTS — position.y must match labeled height. Ground level = 0.5.

6. MASSES — exact values from labels. null if not shown.

7. KNOWN VALUES — scan the image once more for:
   t (time), k (spring constant N/m), T (tension N), μk, μs, g value,
   horizontal distance D, height H, angle θ, acceleration a.
   Fill known_values with each quantity found. Do not leave discoverable data as null.

8. FRICTION — if μk or μs is labeled, copy the value into both known_values AND the relevant
   surface's properties.mu_k. Check surfaces[] has correct mu_k, not 0 when friction exists.

Output the corrected JSON only. No explanation.`;

/* ── Pass 3: final position + velocity verification ─────────── */
export const VELOCITY_FINAL_CHECK = `Final check — three things only:

A. POSITIONS: If a horizontal distance D is labeled between two objects at ground level,
   one must be at x=0 and the other at x=D. Verify this.

B. VELOCITIES: For each object look at its arrow one last time:
   • Straight up   → {x:0, y:+speed}
   • Straight right → {x:+speed, y:0}
   • Diagonal at angle θ going RIGHT → {x:+speed·cos(θ), y:+speed·sin(θ)}
   • Diagonal at angle θ going LEFT  → {x:-speed·cos(θ), y:+speed·sin(θ)}
   53.13° → cos=0.6 sin=0.8 | 37° → cos=0.8 sin=0.6 | 45° → cos=0.707 sin=0.707
   ⚠ A diagonal arrow MUST have both x≠0 and y≠0.

C. KNOWN VALUES: Verify known_values contains every labeled quantity from the image.
   Missing any of: t, k, T, μk, μs, g, a, D, H, θ? Add them now.
   masses of all objects must be filled in if labeled (not null).

Output the final corrected JSON. JSON only.`;

/* ── Shared JSON extractor ──────────────────────────────────── */
export function extractJson(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  if (!s.startsWith('{')) {
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i !== -1 && j !== -1) s = s.slice(i, j + 1);
  }
  try { return JSON.parse(s); } catch { return null; }
}

export const TUTOR_SYSTEM = `You are a Socratic Physics Tutor embedded in a 2D physics simulation.
The student is analyzing a live simulation. Guide them with questions, not direct answers.
When you mention a specific force by its label (like "mg", "N", "f", "T"), wrap it in double-asterisks so the visualization can highlight it: **mg**
Keep responses to 3-4 sentences. Be precise with numbers when referencing simulation data.`;

const MODEL_API_VERSION = {
  'gemma-4-31b-it':          'v1beta',
  'gemma-4-9b-it':           'v1beta',
  'gemini-2.0-flash':        'v1beta',
  'gemini-2.0-flash-lite':   'v1beta',
  'gemini-1.5-flash':        'v1beta',
  'gemini-1.5-pro':          'v1beta',
};

export const FALLBACK_CHAIN = [
  'gemma-4-31b-it',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export const AVAILABLE_MODELS = [
  { id: 'gemma-4-31b-it',        label: 'Gemma 4 31B  (recommended)' },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
  { id: 'gemma-4-9b-it',         label: 'Gemma 4 9B  (fastest)' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
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
    return `Invalid Gemini API key.\n\nRecommendation: switch to a free Groq key (gsk_...) from console.groq.com — it's faster and more reliable.\n\nIf you want to keep using Gemini, generate a new key at aistudio.google.com/app/apikey\n\n${msg}`;
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
      `All Gemini models unavailable (404 — models may be removed or your project lacks access).\n` +
      `Switch to a free Groq key (gsk_...) from console.groq.com — it's faster and has no daily limit.\n\n` +
      `Last error:\n${lastErr?.message}`
    );
  }

  /* Analyze image — 3-pass self-correction via chat session */
  async analyzeImage(imageBase64, mimeType = 'image/jpeg', onFallback, onPass) {
    const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const chain = [this.modelId, ...FALLBACK_CHAIN.filter(m => m !== this.modelId)];

    let lastErr;
    for (const modelId of chain) {
      const model = buildModel(this.genAI, modelId);
      try {
        // ── Pass 1: extract raw data ──────────────────────────────────
        if (onPass) onPass(1, 'Extracting data…');
        const session = model.startChat({ history: [] });
        const res1 = await session.sendMessage([
          ANALYSIS_PROMPT,
          { inlineData: { data: imageBase64, mimeType: safeMime } },
        ]);
        const raw1 = res1.response.text().trim();
        const json1 = extractJson(raw1);
        if (!json1) throw new Error(
          `${modelId} returned text that is not valid JSON.\nFirst 800 chars:\n${raw1.substring(0, 800)}`
        );

        if (modelId !== this.modelId && onFallback) onFallback(modelId);

        // ── Pass 2: self-critique ─────────────────────────────────────
        if (onPass) onPass(2, 'Self-checking…');
        let json2 = json1;
        let raw2  = '';
        try {
          const res2 = await session.sendMessage(CRITIQUE_PROMPT);
          raw2  = res2.response.text().trim();
          json2 = extractJson(raw2) ?? json1;
        } catch { /* pass 2 failure non-fatal */ }

        // ── Pass 3: velocity-only final check ─────────────────────────
        if (onPass) onPass(3, 'Validating velocities…');
        let json3 = json2;
        try {
          const res3 = await session.sendMessage(VELOCITY_FINAL_CHECK);
          const raw3 = res3.response.text().trim();
          json3 = extractJson(raw3) ?? json2;
        } catch { /* pass 3 failure non-fatal */ }

        return { data: json3, usedModel: modelId };

      } catch (err) {
        if (isZeroQuota(err) || isModelUnavailable(err)) {
          lastErr = err;
          continue; // try next model
        }
        throw new Error(friendlyError(err, modelId));
      }
    }

    throw new Error(
      `All Gemini models unavailable (404 — models may be removed or your project lacks access).\n` +
      `Switch to a free Groq key (gsk_...) from console.groq.com — it's faster and has no daily limit.\n\n` +
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
