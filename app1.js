// app.js  -  real retrieval (BM25) over window.CORPUS, optional model answer via the Worker.
(function () {
  "use strict";
  const CORPUS = window.CORPUS || [];
  const CFG = window.CONFIG || { WORKER_URL: "", TOP_K: 4 };
  const STOP = new Set("a an and are as at be by for from has have how in is it its of on or that the this to was what when where which who will with you your do does can could should would about into".split(" "));

  // ---------- tokenizer ----------
  function tokenize(s) {
    return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOP.has(w));
  }

  // ---------- build BM25 index ----------
  const k1 = 1.5, b = 0.75;
  const docs = CORPUS.map(d => ({ ref: d, tokens: tokenize(d.title + " " + d.text) }));
  const N = docs.length;
  const df = Object.create(null);
  let totalLen = 0;
  docs.forEach(d => {
    d.len = d.tokens.length; totalLen += d.len;
    d.tf = Object.create(null);
    const seen = new Set();
    d.tokens.forEach(t => {
      d.tf[t] = (d.tf[t] || 0) + 1;
      if (!seen.has(t)) { df[t] = (df[t] || 0) + 1; seen.add(t); }
    });
  });
  const avgdl = totalLen / Math.max(N, 1);
  function idf(t) { const n = df[t] || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); }

  function retrieve(query, topK) {
    const qt = tokenize(query);
    if (!qt.length) return [];
    const scored = docs.map(d => {
      let score = 0;
      qt.forEach(t => {
        const f = d.tf[t]; if (!f) return;
        score += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgdl));
      });
      return { ref: d.ref, score };
    }).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(x => x.ref);
  }

  // ---------- model answer via Worker (optional) ----------
  async function askModel(question, sources) {
    const res = await fetch(CFG.WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, sources: sources.map((s, i) => ({ n: i + 1, title: s.title, text: s.text })) })
    });
    if (!res.ok) throw new Error("worker " + res.status);
    const data = await res.json();
    if (!data || !data.answer) throw new Error("no answer");
    return data.answer;
  }

  // ---------- rendering ----------
  const $ = s => document.querySelector(s);
  const ansEl = $("#answer"), srcEl = $("#sources"), statusEl = $("#status"), resultEl = $("#result");

  function renderSources(sources) {
    srcEl.innerHTML = "";
    sources.forEach((s, i) => {
      const div = document.createElement("div");
      div.className = "src";
      div.innerHTML =
        '<span class="src-n">' + (i + 1) + '</span>' +
        '<div class="src-body"><div class="src-title">' + esc(s.title) +
        ' <span class="src-tag">' + esc(s.source) + '</span></div>' +
        '<div class="src-text">' + esc(s.text) + '</div>' +
        '<a class="src-link" href="' + esc(s.url) + '" target="_blank" rel="noopener">view source &#8599;</a></div>';
      srcEl.appendChild(div);
    });
  }

  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  async function handle(question) {
    resultEl.hidden = false;
    const sources = retrieve(question, CFG.TOP_K || 4);

    if (!sources.length) {
      statusEl.textContent = "";
      ansEl.className = "answer gap";
      ansEl.textContent = "The FDA sources loaded here do not cover that. Try recalls, drug labels, boxed warnings, allergens, or supplements.";
      srcEl.innerHTML = "";
      return;
    }

    renderSources(sources);
    ansEl.className = "answer";
    ansEl.textContent = "...";

    if (CFG.WORKER_URL) {
      statusEl.innerHTML = '<span class="dot good"></span> Answer written by the model, grounded in the sources below.';
      try {
        const answer = await askModel(question, sources);
        ansEl.innerHTML = linkifyCites(esc(answer), sources.length);
        return;
      } catch (e) {
        statusEl.innerHTML = '<span class="dot warn"></span> Model unavailable, showing the sources directly.';
      }
    } else {
      statusEl.innerHTML = '<span class="dot warn"></span> Model not connected. Showing the matched sources (set WORKER_URL to enable written answers).';
    }
    // evidence-only fallback: lead with the top source, cite it
    ansEl.innerHTML = "Based on the FDA sources: " + esc(sources[0].text) + ' <span class="cite">[1]</span>';
  }

  function linkifyCites(html, n) {
    return html.replace(/\[(\d+)\]/g, (m, d) => (+d >= 1 && +d <= n) ? '<span class="cite">[' + d + ']</span>' : m);
  }

  // ---------- wire up UI ----------
  const SUGGESTED = [
    "What is a boxed warning?",
    "What are the FDA recall classes?",
    "Which foods must be labeled as allergens?",
    "Are dietary supplements FDA approved?",
    "How do I report a drug side effect?",
    "What does the contraindications section mean?"
  ];
  const chips = $("#chips");
  SUGGESTED.forEach(q => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = q;
    b.addEventListener("click", () => { $("#q").value = q; handle(q); });
    chips.appendChild(b);
  });
  $("#ask").addEventListener("click", () => { const v = $("#q").value.trim(); if (v) handle(v); });
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") $("#ask").click(); });

  // corpus viewer
  const list = $("#corpusList");
  CORPUS.forEach(d => {
    const div = document.createElement("div");
    div.className = "src";
    div.innerHTML = '<div class="src-body"><div class="src-title">' + esc(d.title) +
      ' <span class="src-tag">' + esc(d.source) + '</span></div><div class="src-text">' + esc(d.text) + '</div></div>';
    list.appendChild(div);
  });
  $("#count").textContent = CORPUS.length;
})();
