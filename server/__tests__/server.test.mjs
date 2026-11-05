/**
 * The Flight Director server without any network calls to the AI providers: fake clients are injected.
 */
import { describe, it, expect } from "vitest";
import {
  pickProvider, explainWithAnthropic, explainWithOpenAI, createFlightDirectorServer, SYSTEM_PROMPT, DEFAULTS,
} from "../index.mjs";

const summary = { scenario: { id: "moon" }, flight: { outcome: "orbit" } };

function fakeAnthropic(reply) {
  const calls = [];
  return { calls, client: { beta: { messages: { create: async (req, opts) => { calls.push({ req, opts }); return reply; } } } } };
}
function fakeOpenAI(reply) {
  const calls = [];
  return { calls, client: { chat: { completions: { create: async (req) => { calls.push(req); return reply; } } } } };
}
async function withServer(env, clients, fn) {
  const server = createFlightDirectorServer(env, clients);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("provider choice", () => {
  it("follows the keys, Anthropic first, and an explicit setting wins", () => {
    expect(pickProvider({})).toBeNull();
    expect(pickProvider({ OPENAI_API_KEY: "o" })).toBe("openai");
    expect(pickProvider({ ANTHROPIC_API_KEY: "a" })).toBe("anthropic");
    expect(pickProvider({ ANTHROPIC_AUTH_TOKEN: "t" })).toBe("anthropic");
    expect(pickProvider({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })).toBe("anthropic");
    expect(pickProvider({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", FLIGHT_DIRECTOR_PROVIDER: "openai" })).toBe("openai");
    expect(pickProvider({ FLIGHT_DIRECTOR_PROVIDER: "claude" })).toBe("anthropic");
  });
});

describe("Claude", () => {
  it("sends the system prompt, the report, low effort and the refusal fallback, and returns the text", async () => {
    const { calls, client } = fakeAnthropic({ stop_reason: "end_turn", content: [{ type: "text", text: " Great flight! " }, { type: "thinking", thinking: "" }] });
    const result = await explainWithAnthropic(summary, { ANTHROPIC_API_KEY: "k" }, client);
    expect(result).toEqual({ text: "Great flight!", model: "claude-opus-5", provider: "anthropic" });
    const { req, opts } = calls[0];
    expect(req.model).toBe("claude-opus-5");
    expect(req.max_tokens).toBe(DEFAULTS.maxTokens);
    expect(req.system).toBe(SYSTEM_PROMPT);
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.fallbacks).toBe("default");
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe("user");
    expect(req.messages[0].content).toContain('"id":"moon"');
    expect(opts.timeout).toBe(15_000);
  });

  it("uses ANTHROPIC_MODEL when set and reports the model the API answered with", async () => {
    const { calls, client } = fakeAnthropic({ stop_reason: "end_turn", model: "claude-opus-4-8", content: [{ type: "text", text: "Hi" }] });
    const result = await explainWithAnthropic(summary, { ANTHROPIC_MODEL: "claude-opus-4-8" }, client);
    expect(calls[0].req.model).toBe("claude-opus-4-8");
    expect(result.model).toBe("claude-opus-4-8");
  });

  it("returns no text on a refusal", async () => {
    const { client } = fakeAnthropic({ stop_reason: "refusal", stop_details: { type: "refusal", category: null }, content: [] });
    expect((await explainWithAnthropic(summary, {}, client)).text).toBeNull();
  });
});

describe("OpenAI", () => {
  it("sends system and user messages and returns the text", async () => {
    const { calls, client } = fakeOpenAI({ model: "gpt-4.1-mini", choices: [{ message: { content: " Nice. " } }] });
    const result = await explainWithOpenAI(summary, { OPENAI_API_KEY: "k" }, client);
    expect(result).toEqual({ text: "Nice.", model: "gpt-4.1-mini", provider: "openai" });
    const req = calls[0];
    expect(req.model).toBe("gpt-4.1-mini");
    expect(req.max_completion_tokens).toBe(DEFAULTS.maxTokens);
    expect(req.messages).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: expect.stringContaining('"id":"moon"') },
    ]);
  });

  it("uses OPENAI_MODEL when set and returns no text for an empty answer", async () => {
    const { calls, client } = fakeOpenAI({ choices: [{ message: { content: "" } }] });
    const result = await explainWithOpenAI(summary, { OPENAI_MODEL: "gpt-x" }, client);
    expect(calls[0].model).toBe("gpt-x");
    expect(result).toEqual({ text: null, model: "gpt-x", provider: "openai" });
  });
});

describe("HTTP", () => {
  const good = () => fakeAnthropic({ stop_reason: "end_turn", content: [{ type: "text", text: "Great flight!" }] }).client;

  it("answers preflight, health and explain requests with CORS headers", async () => {
    await withServer({ ANTHROPIC_API_KEY: "k" }, { anthropic: good() }, async (base) => {
      const pre = await fetch(`${base}/explain`, { method: "OPTIONS" });
      expect(pre.status).toBe(204);
      expect(pre.headers.get("access-control-allow-origin")).toBe("*");

      const health = await fetch(`${base}/health`);
      expect(await health.json()).toEqual({ ok: true, provider: "anthropic" });

      const res = await fetch(`${base}/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(summary) });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(await res.json()).toEqual({ text: "Great flight!", provider: "anthropic", model: "claude-opus-5" });
    });
  });

  it("routes to OpenAI when that is the provider", async () => {
    const openai = fakeOpenAI({ choices: [{ message: { content: "Well done." } }] }).client;
    await withServer({ OPENAI_API_KEY: "k" }, { openai }, async (base) => {
      const res = await fetch(`${base}/explain`, { method: "POST", body: JSON.stringify(summary) });
      expect((await res.json()).provider).toBe("openai");
    });
  });

  it("rejects bad JSON, reports provider errors, and 404s elsewhere", async () => {
    const broken = { beta: { messages: { create: async () => { throw new Error("boom"); } } } };
    await withServer({ ANTHROPIC_API_KEY: "k" }, { anthropic: broken }, async (base) => {
      const bad = await fetch(`${base}/explain`, { method: "POST", body: "{not json" });
      expect(bad.status).toBe(400);
      const err = await fetch(`${base}/explain`, { method: "POST", body: "{}" });
      expect(err.status).toBe(502);
      expect((await err.json()).error).toContain("boom");
      const missing = await fetch(`${base}/nope`);
      expect(missing.status).toBe(404);
    });
  });

  it("answers 502 when no API key is configured, so the game falls back", async () => {
    await withServer({}, {}, async (base) => {
      expect((await fetch(`${base}/health`).then((r) => r.json())).provider).toBeNull();
      const res = await fetch(`${base}/explain`, { method: "POST", body: "{}" });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toContain("No API key");
    });
  });
});
