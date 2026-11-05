/**
 * Optional AI Flight Director server. Node.js 18+, one file, no build step.
 *
 *   npm run server
 *
 * The game POSTs a small JSON mission report to /explain. We ask an AI model for a short, friendly
 * explanation and send the text back. The game works without this server: it falls back to its
 * built-in explanations whenever the server is off, slow, or answers with an error.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY           use Claude (default model claude-opus-5, override with ANTHROPIC_MODEL)
 *   OPENAI_API_KEY              use OpenAI (default model gpt-4.1-mini, override with OPENAI_MODEL)
 *   FLIGHT_DIRECTOR_PROVIDER    "anthropic" or "openai" to choose when both keys are set (default: Anthropic first)
 *   PORT                        default 8787
 */
import http from "node:http";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const SYSTEM_PROMPT =
  "You are a friendly NASA flight director talking to a 12-year-old. 4 sentences max. " +
  "Explain why the mission went this way, give one tip, mention one real mission.";

export const DEFAULTS = { anthropicModel: "claude-opus-5", openaiModel: "gpt-4.1-mini", port: 8787, maxTokens: 1024 };

/** Which AI provider to use, from the environment. null when no key is configured. */
export function pickProvider(env = process.env) {
  const wanted = (env.FLIGHT_DIRECTOR_PROVIDER || "").toLowerCase();
  if (wanted === "anthropic" || wanted === "claude") return "anthropic";
  if (wanted === "openai") return "openai";
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return null;
}

/** The user turn: the mission report as JSON plus a few rules for the answer. */
export function userMessage(summary) {
  return (
    "Here is the mission report as JSON. The player is \"you\". Reply in plain text only: no lists, no headings, no markdown.\n\n" +
    JSON.stringify(summary)
  );
}

/** Ask Claude. `client` can be injected for tests. */
export async function explainWithAnthropic(summary, env = process.env, client) {
  const model = env.ANTHROPIC_MODEL || DEFAULTS.anthropicModel;
  const anthropic = client ?? (env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : new Anthropic());
  const response = await anthropic.beta.messages.create(
    {
      model,
      max_tokens: DEFAULTS.maxTokens,
      // If a safety classifier declines the request, the API retries it on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // A four-sentence answer for a child: keep it quick, the game only waits six seconds.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage(summary) }],
    },
    { timeout: 15_000 },
  );
  if (response.stop_reason === "refusal") return { text: null, model, provider: "anthropic" };
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return { text: text || null, model: response.model || model, provider: "anthropic" };
}

/** Ask OpenAI. `client` can be injected for tests. */
export async function explainWithOpenAI(summary, env = process.env, client) {
  const model = env.OPENAI_MODEL || DEFAULTS.openaiModel;
  const openai = client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model,
    max_completion_tokens: DEFAULTS.maxTokens,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage(summary) },
    ],
  });
  const text = (completion.choices?.[0]?.message?.content ?? "").trim();
  return { text: text || null, model: completion.model || model, provider: "openai" };
}

/** Route to the configured provider. Throws when nothing is configured. */
export async function explain(summary, env = process.env, clients = {}) {
  const provider = pickProvider(env);
  if (provider === "openai") return explainWithOpenAI(summary, env, clients.openai);
  if (provider === "anthropic") return explainWithAnthropic(summary, env, clients.anthropic);
  throw new Error("No API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** The HTTP server. `env` and `clients` can be injected for tests. */
export function createFlightDirectorServer(env = process.env, clients = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, provider: pickProvider(env) });
    }
    if (req.method === "POST" && req.url === "/explain") {
      let summary;
      try {
        summary = await readJson(req);
      } catch (error) {
        return send(res, 400, { error: error.message });
      }
      try {
        const result = await explain(summary, env, clients);
        if (!result.text) return send(res, 502, { error: "The model gave no answer." });
        return send(res, 200, result);
      } catch (error) {
        const detail = error instanceof Anthropic.APIError ? `Anthropic API error ${error.status}: ${error.message}` : error.message;
        console.error(`[flight director] ${detail}`);
        return send(res, 502, { error: detail });
      }
    }
    return send(res, 404, { error: "Not found. POST /explain or GET /health." });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT) || DEFAULTS.port;
  const provider = pickProvider();
  createFlightDirectorServer().listen(port, () => {
    console.log(`AI Flight Director listening on http://localhost:${port}/explain`);
    console.log(provider ? `Provider: ${provider}` : "No API key found: set ANTHROPIC_API_KEY or OPENAI_API_KEY. Requests will answer 502 and the game will use its built-in explanations.");
  });
}
