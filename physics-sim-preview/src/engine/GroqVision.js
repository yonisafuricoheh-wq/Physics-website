import { ANALYSIS_PROMPT, CRITIQUE_PROMPT, VELOCITY_FINAL_CHECK, extractJson, TUTOR_SYSTEM } from './GeminiVision.js';

const BASE = 'https://api.groq.com/openai/v1/chat/completions';

export const GROQ_MODELS = [
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B (recommended · fast)' },
  { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B (more capable)' },
];
export const GROQ_FALLBACK_CHAIN  = GROQ_MODELS.map(m => m.id);
export const GROQ_DEFAULT_MODEL   = GROQ_MODELS[0].id;

function isUnavailable(status) {
  return status === 404 || status === 400 || status === 429 || status === 408;
}

export class GroqVision {
  constructor(apiKey, modelId = GROQ_DEFAULT_MODEL) {
    if (!apiKey) throw new Error('Groq API key is required.');
    // Strip non-ASCII chars that would break HTTP headers
    this._apiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim();
    this.modelId = modelId;
  }

  async _post(modelId, body, timeoutMs = 20000) {
    const controller = new AbortController();

    // Promise.race guarantees timeout even if AbortController is ignored
    const timeout = new Promise((_, reject) =>
      setTimeout(() => {
        controller.abort();
        const e = new Error(`${modelId} timed out after ${timeoutMs / 1000}s`);
        e.status = 408;
        reject(e);
      }, timeoutMs)
    );

    const request = fetch(BASE, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelId, ...body }),
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || res.statusText;
        const e   = new Error(`Groq ${res.status}: ${msg}`);
        e.status  = res.status;
        if (res.status === 401) e.message = `Invalid Groq API key — get one free at console.groq.com\n\n${msg}`;
        throw e;
      }
      return res.json();
    });

    return Promise.race([request, timeout]);
  }

  async testConnection() {
    const chain = [this.modelId, ...GROQ_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;
    for (const modelId of chain) {
      try {
        await this._post(modelId, {
          messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
          max_tokens: 5,
        });
        return { ok: true, modelId };
      } catch (err) {
        if (isUnavailable(err.status)) { lastErr = err; continue; }
        throw err;
      }
    }
    throw new Error(`All Groq models unavailable.\n${lastErr?.message}`);
  }

  async analyzeImage(imageBase64, mimeType = 'image/jpeg', onFallback, onPass) {
    const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const chain    = [this.modelId, ...GROQ_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;

    for (const modelId of chain) {
      if (onFallback) onFallback(modelId);
      try {
        // ── Pass 1: extract raw data ──────────────────────────────────
        if (onPass) onPass(1, 'Extracting data…');
        const imageMsg = {
          role: 'user',
          content: [
            { type: 'text',      text: ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}` } },
          ],
        };
        const res1 = await this._post(modelId, { messages: [imageMsg], max_tokens: 2048 }, 30000);
        const raw1 = res1?.choices?.[0]?.message?.content;
        if (!raw1) { const e = new Error(`${modelId} empty response`); e.status = 400; throw e; }
        const json1 = extractJson(raw1);
        if (!json1) { const e = new Error(`${modelId} returned non-JSON`); e.status = 400; throw e; }

        // ── Pass 2: self-critique (image stays in context via history) ─
        if (onPass) onPass(2, 'Self-checking…');
        const history2 = [
          imageMsg,
          { role: 'assistant', content: raw1 },
          { role: 'user',      content: CRITIQUE_PROMPT },
        ];
        let json2 = json1;
        let raw2  = '';
        try {
          const res2 = await this._post(modelId, { messages: history2, max_tokens: 2048 }, 25000);
          raw2  = res2?.choices?.[0]?.message?.content || '';
          json2 = extractJson(raw2) ?? json1;
        } catch { /* pass 2 failure is non-fatal — keep pass 1 result */ }

        // ── Pass 3: velocity-only final check ─────────────────────────
        if (onPass) onPass(3, 'Validating velocities…');
        let json3 = json2;
        try {
          const history3 = [
            ...history2,
            { role: 'assistant', content: raw2 },
            { role: 'user',      content: VELOCITY_FINAL_CHECK },
          ];
          const res3 = await this._post(modelId, { messages: history3, max_tokens: 1024 }, 20000);
          const raw3 = res3?.choices?.[0]?.message?.content || '';
          json3 = extractJson(raw3) ?? json2;
        } catch { /* pass 3 failure is non-fatal — keep pass 2 result */ }

        return { data: json3, usedModel: modelId };

      } catch (err) {
        if (isUnavailable(err.status)) { lastErr = err; continue; }
        throw err;
      }
    }
    throw new Error(`All Groq models failed.\nLast: ${lastErr?.message}`);
  }

  async chat(userMessage, blueprintSummary, history = []) {
    const systemMsg = `${TUTOR_SYSTEM}\n\nCurrent simulation:\n${blueprintSummary}`;
    const messages  = [
      { role: 'system', content: systemMsg },
      ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: userMessage },
    ];
    const chain = [this.modelId, ...GROQ_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;
    for (const modelId of chain) {
      try {
        const data = await this._post(modelId, { messages });
        const reply = data?.choices?.[0]?.message?.content;
        if (!reply) { const e = new Error('empty reply'); e.status = 400; throw e; }
        return reply;
      } catch (err) {
        if (isUnavailable(err.status)) { lastErr = err; continue; }
        throw err;
      }
    }
    throw new Error(`Groq chat failed.\n${lastErr?.message}`);
  }

  static extractHighlightedForces(text) {
    const matches = text.match(/\*\*([^*]+)\*\*/g) || [];
    return matches.map(m => m.replace(/\*\*/g, '').trim());
  }
}
