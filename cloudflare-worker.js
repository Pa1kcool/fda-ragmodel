// cloudflare-worker.js
// Proxy so your API key never lives in the public page. Now supports TWO modes:
//   mode "memory"   -> answers from the model's own knowledge, no sources, no citations
//   mode "grounded" -> answers ONLY from the provided sources, with citations (RAG)
// SET ONE SECRET in the Worker:  LLM_API_KEY
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"; // confirm current model name in your provider docs

const GROUNDED_SYSTEM = [
  "You are a careful assistant for an educational demo about public FDA data.",
  "Answer ONLY using the numbered sources provided. Cite them inline like [1], [2].",
  "If the sources do not contain the answer, reply exactly: The provided FDA sources do not cover this.",
  "Do not give personal medical advice, diagnoses, or dosing. If asked for a personal medical decision,",
  "say to consult a licensed professional. Keep answers to a few clear sentences."
].join(" ");

const MEMORY_SYSTEM = [
  "You are a general-knowledge assistant. Answer the question about FDA, food, or public health",
  "from your own training knowledge, in three or four sentences. You have no documents, so do not",
  "cite sources. Do not give personal medical advice, diagnoses, or specific dosing; for a personal",
  "medical decision, say to consult a licensed professional."
].join(" ");

function cors(extra) {
  return Object.assign({
    "Access-Control-Allow-Origin": "*",
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
    const mode = body.mode === "memory" ? "memory" : "grounded";
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, 8) : [];
    if (!question) return json({ error: "missing question" }, 400);
    if (mode === "grounded" && !sources.length) return json({ error: "missing sources" }, 400);

    let system, userMsg;
    if (mode === "memory") {
      system = MEMORY_SYSTEM;
      userMsg = "Question: " + question;
    } else {
      system = GROUNDED_SYSTEM;
      userMsg = "Question: " + question + "\n\nSources:\n" +
        sources.map(s => "[" + s.n + "] " + s.title + ": " + s.text).join("\n");
    }

    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LLM_API_KEY },
        body: JSON.stringify({
          model: MODEL, temperature: mode === "memory" ? 0.4 : 0.2, max_tokens: 300,
          messages: [{ role: "system", content: system }, { role: "user", content: userMsg }]
        })
      });
      if (!r.ok) return json({ error: "model error " + r.status }, 502);
      const data = await r.json();
      const answer = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content.trim()
        : (mode === "grounded" ? "The provided FDA sources do not cover this." : "");
      return json({ answer, mode });
    } catch (e) {
      return json({ error: "upstream failure" }, 502);
    }

    function json(obj, status) {
      return new Response(JSON.stringify(obj), { status: status || 200, headers: cors({ "Content-Type": "application/json" }) });
    }
  }
};
