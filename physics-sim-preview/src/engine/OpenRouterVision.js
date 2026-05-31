import { ANALYSIS_PROMPT, TUTOR_SYSTEM } from './GeminiVision.js';

const BASE = 'https://openrouter.ai/api/v1/chat/completions';

export const OPENROUTER_MODELS = [
  { id: 'google/gemma-4-31b-it:free',                       label: 'Gemma 4 31B (free · recommended)' },
  { id: 'deepseek/deepseek-v4-flash:free',                  label: 'DeepSeek V4 Flash (free · fast)' },
  { id: 'google/gemma-4-26b-a4b-it:free',                   label: 'Gemma 4 26B (free)' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nvidia Nemotron (free)' },
];

export const OPENROUTER_FALLBACK_CHAIN = OPENROUTER_MODELS.map(m => m.id);
export const OPENROUTER_DEFAULT_MODEL  = OPENROUTER_MODELS[0].id;

function isUnavailable(status) { return status === 404 || status === 400 || status === 429 || status === 408; }

export class OpenRouterVision {
  constructor(apiKey, modelId = OPENROUTER_DEFAULT_MODEL) {
    if (!apiKey) throw new Error('OpenRouter API key is required.');
    this._apiKey = apiKey;
    this.modelId = modelId;
  }

  async _post(modelId, body, timeoutMs = 12000) {
    const controller = new AbortController();

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
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Physics Sim',
      },
      body: JSON.stringify({ model: modelId, ...body }),
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || res.statusText;
        const e   = new Error(`OpenRouter ${res.status}: ${msg}`);
        e.status  = res.status;
        if (res.status === 401) e.message = `Invalid OpenRouter API key — get one at openrouter.ai/keys\n\n${msg}`;
        if (res.status === 402) e.message = `OpenRouter account out of credits.\n\n${msg}`;
        throw e;
      }
      return res.json();
    });

    return Promise.race([request, timeout]);
  }

  async testConnection() {
    const chain = [this.modelId, ...OPENROUTER_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
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
    throw new Error(`All ${chain.length} models failed (timeout, rate-limit, or non-JSON).\nLast error: ${lastErr?.message}`);
  }

  async analyzeImage(imageBase64, mimeType = 'image/jpeg', onFallback) {
    const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const chain = [this.modelId, ...OPENROUTER_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;

    for (const modelId of chain) {
      if (onFallback) onFallback(modelId); // notify UI which model we're trying right now
      try {
        const data = await this._post(modelId, {
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: ANALYSIS_PROMPT },
              { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}` } },
            ],
          }],
        });

        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
          const e = new Error(`${modelId} returned an empty response`);
          e.status = 400;
          throw e;
        }
        const raw = content.trim();
        // Strip markdown fences
        let jsonStr = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
        // If still not starting with {, find the first { ... } block
        if (!jsonStr.startsWith('{')) {
          const start = jsonStr.indexOf('{');
          const end   = jsonStr.lastIndexOf('}');
          if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1);
        }
        try {
          return { data: JSON.parse(jsonStr), usedModel: modelId };
        } catch (e) {
          // Non-JSON response → treat as unavailable and try next model
          const err = new Error(`${modelId} returned non-JSON`);
          err.status = 400;
          throw err;
        }
      } catch (err) {
        if (isUnavailable(err.status)) { lastErr = err; continue; }
        throw err;
      }
    }
    throw new Error(`All ${chain.length} models failed (timeout, rate-limit, or non-JSON).\nLast error: ${lastErr?.message}`);
  }

  async chat(userMessage, blueprintSummary, history = []) {
    const systemMsg = `${TUTOR_SYSTEM}\n\nCurrent simulation:\n${blueprintSummary}`;
    const messages = [
      { role: 'system', content: systemMsg },
      ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: userMessage },
    ];
    const chain = [this.modelId, ...OPENROUTER_FALLBACK_CHAIN.filter(m => m !== this.modelId)];
    let lastErr;
    for (const modelId of chain) {
      try {
        const data = await this._post(modelId, { messages });
        const reply = data?.choices?.[0]?.message?.content;
        if (!reply) { const e = new Error(`${modelId} empty reply`); e.status = 400; throw e; }
        return reply;
      } catch (err) {
        if (isUnavailable(err.status)) { lastErr = err; continue; }
        throw err;
      }
    }
    throw new Error(`All ${chain.length} models failed (timeout, rate-limit, or non-JSON).\nLast error: ${lastErr?.message}`);
  }

  static extractHighlightedForces(text) {
    const matches = text.match(/\*\*([^*]+)\*\*/g) || [];
    return matches.map(m => m.replace(/\*\*/g, '').trim());
  }
}
