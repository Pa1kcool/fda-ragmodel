// config.js
// After you deploy the Cloudflare Worker (see README), paste its URL here and commit.
// Leave it as "" to run in evidence-only mode (retrieval and citations still work,
// the app just shows the matched sources instead of a model-written answer).
window.CONFIG = {
  WORKER_URL: "https://fda-rag-proxy.fda-rag.workers.dev",          // e.g. "https://fda-rag-proxy.yourname.workers.dev"
  TOP_K: 4                 // how many sources to retrieve per question
};
