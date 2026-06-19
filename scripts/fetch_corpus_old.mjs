// scripts/fetch_corpus.mjs
// Pulls REAL records from the public openFDA API and writes ../corpus.js
// Run from the project root:   node scripts/fetch_corpus.mjs
// Needs Node 18+ (built-in fetch) and an internet connection. No API key required
// (openFDA works without one; you may add &api_key=... for higher rate limits).

import { writeFile } from "node:fs/promises";

const LIMIT_DRUGS = 12;   // how many drug labels to pull
const LIMIT_FOOD = 12;    // how many food recalls to pull

function clip(s, n = 320) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).trim() + "\u2026" : s;
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}

async function drugLabels() {
  // recent labels that have a boxed warning, so the demo shows real safety text
  const url = "https://api.fda.gov/drug/label.json?search=_exists_:boxed_warning&limit=" + LIMIT_DRUGS;
  const data = await getJSON(url);
  const out = [];
  for (const r of (data.results || [])) {
    const name = (r.openfda && (r.openfda.brand_name || r.openfda.generic_name) || ["Unknown drug"])[0];
    const id = (r.openfda && r.openfda.spl_set_id && r.openfda.spl_set_id[0]) || ("drug-" + out.length);
    const text = clip((r.boxed_warning && r.boxed_warning[0]) || (r.indications_and_usage && r.indications_and_usage[0]) || (r.warnings && r.warnings[0]) || "");
    if (!text) continue;
    out.push({
      id: "drug-" + id, title: name + " - label excerpt", text,
      source: "openFDA drug label", url: "https://open.fda.gov/apis/drug/label/", type: "drug-label"
    });
  }
  return out;
}

async function foodRecalls() {
  const url = "https://api.fda.gov/food/enforcement.json?sort=report_date:desc&limit=" + LIMIT_FOOD;
  const data = await getJSON(url);
  const out = [];
  for (const r of (data.results || [])) {
    const text = clip("Class " + (r.classification || "?") + " recall. " + (r.product_description || "") + " Reason: " + (r.reason_for_recall || ""));
    out.push({
      id: "food-" + (r.recall_number || out.length),
      title: (r.recalling_firm || "Food recall") + " (" + (r.report_date || "") + ")",
      text,
      source: "openFDA food enforcement", url: "https://open.fda.gov/apis/food/enforcement/", type: "food-recall"
    });
  }
  return out;
}

async function main() {
  const all = [];
  try { all.push(...await drugLabels()); console.log("drug labels:", all.length); }
  catch (e) { console.warn("drug labels failed:", e.message); }
  try { const f = await foodRecalls(); all.push(...f); console.log("food recalls:", f.length); }
  catch (e) { console.warn("food recalls failed:", e.message); }

  if (!all.length) { console.error("No data fetched. Keeping existing corpus.js."); process.exit(1); }

  const header = "// corpus.js - generated from live openFDA data by scripts/fetch_corpus.mjs\n" +
    "// Generated: " + new Date().toISOString() + "\n" +
    "window.CORPUS = ";
  await writeFile(new URL("../corpus.js", import.meta.url), header + JSON.stringify(all, null, 2) + ";\n");
  console.log("Wrote corpus.js with", all.length, "real FDA records.");
}

main();
