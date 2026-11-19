// One request to the Claude API (the Messages API), with nothing installed: Node's own fetch.
//
// Only tools/voice/draft.mjs uses this file, and only when the owner runs it at a terminal
// with a key in the environment. The site's build, its tests and its pages never do: the site
// calls no model (README, "What the site never does"), and tests/voice.test.mjs holds that.
//
// The request shape was read from the API reference on 2026-11-18:
//   POST https://api.anthropic.com/v1/messages
//   headers  x-api-key, anthropic-version: 2026-10-21, content-type: application/json
//   body     model, max_tokens, system, messages, output_config.format (a JSON schema)
// In that API version a request that sets temperature, top_p or top_k is refused, so none is
// sent. If a request starts failing with a 400, read the reference again before changing it.
export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2026-10-21';
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_MAX_TOKENS = 8000;

export class ApiError extends Error {
  constructor({ status = 0, type = 'error', message = '', requestId = '' }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.requestId = requestId;
  }
}

/** A key must never reach a log, a draft file or an error message. */
const scrub = (text, env) => (env.ANTHROPIC_API_KEY ? String(text).split(env.ANTHROPIC_API_KEY).join('[key]') : String(text));

/** The body of the request. The key is not part of it. */
export function buildRequest({ model = DEFAULT_MODEL, system, user, schema, maxTokens = DEFAULT_MAX_TOKENS }) {
  if (!/^claude-[a-z0-9-]+$/.test(model)) throw new Error(`"${model}" is not a model id (they look like ${DEFAULT_MODEL})`);
  for (const [name, value] of [['system', system], ['user', user]]) if (typeof value !== 'string' || !value.trim()) throw new Error(`the request has no ${name} text`);
  return {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  };
}

export function requestHeaders(env) {
  if (!env.ANTHROPIC_API_KEY) throw new ApiError({ type: 'no-key', message: 'ANTHROPIC_API_KEY is not set. Put the key in your shell for this one command; never in a file in this repository.' });
  return {
    'content-type': 'application/json',
    'anthropic-version': API_VERSION,
    'x-api-key': env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
  };
}

const backoff = (attempt) => 1000 * 2 ** attempt;

/**
 * Send one request. A rate limit that says when to come back, and a server error, are tried
 * again (twice by default). A 429 with no retry-after is a spending cap and is not retried.
 * @returns {Promise<{message: object, requestId: string}>}
 */
export async function send(body, { env = process.env, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), retries = 2, timeoutMs = 180000 } = {}) {
  const headers = requestHeaders(env);
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      if (attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new ApiError({ type: 'network', message: `could not reach the API: ${scrub(error?.message || error, env)}` });
    }
    clearTimeout(timer);
    const requestId = response.headers?.get?.('request-id') || '';
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (response.ok && json && json.type !== 'error') return { message: json, requestId };
    const wait = Number(response.headers?.get?.('retry-after'));
    const told = Number.isFinite(wait) && wait > 0;
    const again = response.status >= 500 || (response.status === 429 && told);
    if (again && attempt < retries) {
      await sleep(told ? wait * 1000 : backoff(attempt));
      continue;
    }
    throw new ApiError({ status: response.status, type: json?.error?.type || 'http-error', message: scrub(json?.error?.message || text.slice(0, 300), env), requestId: json?.request_id || requestId });
  }
}

/** The JSON a structured response carries: the first text block, parsed. */
export function readStructured(message) {
  if (message?.stop_reason === 'refusal') throw new ApiError({ status: 200, type: 'refusal', message: 'the model declined the request. Nothing was drafted; read the brief again before sending it again.' });
  if (message?.stop_reason === 'max_tokens') throw new ApiError({ status: 200, type: 'cut-off', message: 'the answer was cut off at the token limit, so it is incomplete. Run again with a higher --max-tokens.' });
  const block = (message?.content || []).find((item) => item?.type === 'text' && typeof item.text === 'string');
  if (!block) throw new ApiError({ status: 200, type: 'no-text', message: 'the answer carried no text block' });
  try {
    return JSON.parse(block.text);
  } catch {
    throw new ApiError({ status: 200, type: 'not-json', message: 'the answer was not the JSON the schema describes' });
  }
}
