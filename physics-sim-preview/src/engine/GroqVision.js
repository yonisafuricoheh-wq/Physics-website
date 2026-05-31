import { ANALYSIS_PROMPT, TUTOR_SYSTEM } from './GeminiVision.js';

const BASE = 'https://api.groq.com/openai/v1/chat/completions';

export const GROQ_MODELS = [
  { id: 'llama-3.2-90b-vision-preview',  label: 'Llama 3.2 90B Vision (best · fast)' },
  { id: 'llama-3.2-11b-vision-preview',  label: 'Llama 3.2 11B Vision (fastest)' },
];
export const GROQ_FALLBACK_CHAIN  = GROQ_MODELS.map(m => m.id);
export const GROQ_DEFAULT_MODEL   = GROQ_MODELS[0].id;

function isUnavailable(status) {
  return status === 404 || status === 400 || status === 429 || status === 408;
}

export class GroqVision {
  constructor(apiKey, modelId = GROQ_DEFAULT_MODEL) {
    if (!apiKey) throw new Error('Groq API key is required.');
    this._apiKey = apiKey;
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

  async analyzeImage(imageBase64, mimeType = 'image/jpeg', onFallback) {
    const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const chain    = [this.modelId, ...GROQ_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;

    for (const modelId of chain) {
      if (onFallback) onFallback(modelId);
      try {
        const data = await this._post(modelId, {
          messages: [{
            role: 'user',
            content: [
              { type: 'text',      text: ANALYSIS_PROMPT },
              { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}` } },
            ],
          }],
          max_tokens: 2048,
        });

        const content = data?.choices?.[0]?.message?.content;
        if (!content) { const e = new Error(`${modelId} empty response`); e.status = 400; throw e; }

        const raw = content.trim();
        let jsonStr = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
        if (!jsonStr.startsWith('{')) {
          const s = jsonStr.indexOf('{'), e2 = jsonStr.lastIndexOf('}');
          if (s !== -1 && e2 !== -1) jsonStr = jsonStr.slice(s, e2 + 1);
        }
        try {
          return { data: JSON.parse(jsonStr), usedModel: modelId };
        } catch {
          const e = new Error(`${modelId} returned non-JSON`); e.status = 400; throw e;
        }
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
