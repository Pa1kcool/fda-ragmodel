// cloudflare-worker.js
// A tiny proxy so your API key never lives in the public page.
// Deploy this as a Cloudflare Worker (free). It receives { question, sources } from the
// page, asks a hosted model to answer using only those sources, and returns { answer }.
//
// SET ONE SECRET in the Worker:  LLM_API_KEY
// Default provider below is Groq (free tier, OpenAI-compatible). To use a different
// provider, change API_URL and MODEL. Confirm the current model name in the provider docs.

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant"; // check your provider's current model list

const SYSTEM = [
  "You are a careful assistant for an educational demo about public FDA data.",
  "Answer ONLY using the numbered sources provided. Cite them inline like [1], [2].",
  "If the sources do not contain the answer, reply exactly: The provided FDA sources do not cover this.",
  "Do not give personal medical advice, diagnoses, or dosing. If asked for a personal medical decision,",
  "say to consult a licensed professional. Keep answers to a few clear sentences."
].join(" ");

function cors(extra) {
  return Object.assign({
    "Access-Control-Allow-Origin": "*",            // for production, set to your Pages origin
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }, extra || {});
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: cors() });

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const question = (body.question || "").toString().slice(0, 500);
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, 8) : [];
    if (!question || !sources.length) return json({ error: "missing question or sources" }, 400);

    const sourceText = sources.map(s => "[" + s.n + "] " + s.title + ": " + s.text).join("\n");
    const userMsg = "Question: " + question + "\n\nSources:\n" + sourceText;

    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LLM_API_KEY },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          max_tokens: 300,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }]
        })
      });
      if (!r.ok) return json({ error: "model error " + r.status }, 502);
      const data = await r.json();
      const answer = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content.trim()
        : "The provided FDA sources do not cover this.";
      return json({ answer });
    } catch (e) {
      return json({ error: "upstream failure" }, 502);
    }

    function json(obj, status) {
      return new Response(JSON.stringify(obj), { status: status || 200, headers: cors({ "Content-Type": "application/json" }) });
    }
  }
};
