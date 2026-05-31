import { GeminiVision, AVAILABLE_MODELS } from './GeminiVision.js';
import { OpenRouterVision, OPENROUTER_MODELS, OPENROUTER_DEFAULT_MODEL } from './OpenRouterVision.js';
import { GroqVision, GROQ_MODELS, GROQ_DEFAULT_MODEL } from './GroqVision.js';

export { AVAILABLE_MODELS, OPENROUTER_MODELS, GROQ_MODELS };

export function detectProvider(key) {
  if (!key) return 'none';
  if (key.startsWith('gsk_'))   return 'groq';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('AIza'))   return 'gemini';
  return 'unknown';
}

export function defaultModelForProvider(provider) {
  if (provider === 'groq')       return GROQ_DEFAULT_MODEL;
  if (provider === 'openrouter') return OPENROUTER_DEFAULT_MODEL;
  return 'gemini-2.0-flash';
}

export function modelsForProvider(provider) {
  if (provider === 'groq')       return GROQ_MODELS;
  if (provider === 'openrouter') return OPENROUTER_MODELS;
  return AVAILABLE_MODELS;
}

export function createVisionEngine(apiKey, modelId) {
  const provider = detectProvider(apiKey);
  if (provider === 'groq')       return new GroqVision(apiKey, modelId);
  if (provider === 'openrouter') return new OpenRouterVision(apiKey, modelId);
  return new GeminiVision(apiKey, modelId);
}

export function extractHighlightedForces(text) {
  return GeminiVision.extractHighlightedForces(text);
}
