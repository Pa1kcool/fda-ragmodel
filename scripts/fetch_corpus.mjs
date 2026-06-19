// scripts/fetch_corpus.mjs
// Builds corpus.js = curated FDA reference facts + live openFDA records.
// Run from the project root:   node scripts/fetch_corpus.mjs   (Node 18+, internet, no key)

import { writeFile } from "node:fs/promises";

const LIMIT_DRUGS = 8;
const LIMIT_FOOD = 8;

// Clean, structural reference facts so definition questions answer crisply.
const CURATED = [
  { id: "fda-openfda", title: "What openFDA provides",
    text: "openFDA offers free public APIs for FDA data, including drug product labeling, drug adverse event reports, and food recall enforcement reports.",
    source: "openFDA", url: "https://open.fda.gov/apis/", type: "reference" },
  { id: "fda-recall-classes", title: "Food and drug recall classes",
    text: "The FDA sorts recalls into three classes. Class I means a reasonable probability of serious harm or death. Class II means temporary or medically reversible harm. Class III is unlikely to cause harm.",
    source: "FDA Recalls", url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", type: "reference" },
  { id: "fda-recall-vs-withdrawal", title: "Recall versus market withdrawal",
    text: "A recall removes or corrects a marketed product that violates FDA law. A market withdrawal involves a minor issue the FDA would not take action on, such as normal stock rotation.",
    source: "FDA Recalls", url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", type: "reference" },
  { id: "fda-boxed-warning", title: "Boxed warning",
    text: "A boxed warning, sometimes called a black box warning, is the strongest warning the FDA requires on a drug label. It flags risks that can lead to serious injury or death.",
    source: "FDA", url: "https://www.fda.gov/drugs", type: "label-section" },
  { id: "fda-label-sections", title: "Sections of a drug label",
    text: "An FDA drug label includes set sections such as Indications and Usage, Dosage and Administration, Contraindications, Warnings and Precautions, Drug Interactions, and Adverse Reactions.",
    source: "FDA", url: "https://www.fda.gov/drugs", type: "label-section" },
  { id: "fda-indications", title: "Indications and Usage",
    text: "The Indications and Usage section states the conditions a drug is FDA approved to treat. Uses outside this section are considered off-label.",
    source: "FDA", url: "https://www.fda.gov/drugs", type: "label-section" },
  { id: "fda-contraindications", title: "Contraindications",
    text: "The Contraindications section lists situations where a drug should not be used because the risk clearly outweighs any possible benefit.",
    source: "FDA", url: "https://www.fda.gov/drugs", type: "label-section" },
  { id: "fda-adverse-reactions", title: "Adverse Reactions",
    text: "The Adverse Reactions section lists unwanted effects reported with a drug. A report does not by itself prove the drug caused the effect.",
    source: "FDA", url: "https://www.fda.gov/drugs", type: "label-section" },
  { id: "fda-faers-medwatch", title: "Reporting side effects (FAERS and MedWatch)",
    text: "The FDA Adverse Event Reporting System, FAERS, collects reports of possible drug side effects. Anyone can submit a report through the FDA MedWatch program.",
    source: "FDA MedWatch", url: "https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program", type: "reference" },
  { id: "fda-allergens", title: "Major food allergen labeling",
    text: "United States law requires major food allergens to be declared on packaged food labels. Sesame became the ninth major allergen that must be labeled, effective January 1, 2023.",
    source: "FDA Food Allergens", url: "https://www.fda.gov/food/food-allergensgluten-free-guidance-documents-regulatory-information/food-allergen-labeling-and-consumer-protection-act-2004-falcpa", type: "reference" },
  { id: "fda-supplements", title: "Drugs versus dietary supplements",
    text: "The FDA approves new drugs before they are sold. Dietary supplements are not FDA approved before reaching the market, and their manufacturers are responsible for safety.",
    source: "FDA Dietary Supplements", url: "https://www.fda.gov/food/dietary-supplements", type: "reference" },
  { id: "fda-interactions", title: "Drug Interactions",
    text: "The Drug Interactions section of a label describes other drugs, foods, or substances that can change how a drug works or raise the chance of side effects.",
    source: "FDA", url: "https://www.fda.gov/drugs", type: "label-section" }
];

function clip(s, n = 320) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).trim() + "\u2026" : s;
}
function first(arr) { return Array.isArray(arr) && arr.length ? arr[0] : ""; }

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}

async function drugLabels() {
  const url = "https://api.fda.gov/drug/label.json?search=_exists_:boxed_warning&limit=" + LIMIT_DRUGS;
  const data = await getJSON(url);
  const out = [];
  for (const r of (data.results || [])) {
    const o = r.openfda || {};
    const name = first(o.brand_name) || first(o.generic_name) || first(o.substance_name) || "FDA-approved drug";
    const text = clip(first(r.boxed_warning) || first(r.indications_and_usage) || first(r.warnings));
    if (!text) continue;
    out.push({
      id: "drug-" + (first(o.spl_set_id) || out.length),
      title: name + " - label excerpt", text,
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
    out.push({
      id: "food-" + (r.recall_number || out.length),
      title: (r.recalling_firm || "Food recall") + " (" + (r.report_date || "") + ")",
      text: clip("Class " + (r.classification || "?") + " recall. " + (r.product_description || "") + " Reason: " + (r.reason_for_recall || "")),
      source: "openFDA food enforcement", url: "https://open.fda.gov/apis/food/enforcement/", type: "food-recall"
    });
  }
  return out;
}

function dedupe(items) {
  const seen = new Set(); const out = [];
  for (const it of items) {
    const key = (it.title + "|" + it.text.slice(0, 80)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

async function main() {
  const live = [];
  try { const d = await drugLabels(); live.push(...d); console.log("drug labels:", d.length); }
  catch (e) { console.warn("drug labels failed:", e.message); }
  try { const f = await foodRecalls(); live.push(...f); console.log("food recalls:", f.length); }
  catch (e) { console.warn("food recalls failed:", e.message); }

  const all = dedupe([...CURATED, ...live]);
  const header = "// corpus.js - curated FDA facts + live openFDA data (scripts/fetch_corpus.mjs)\n" +
    "// Generated: " + new Date().toISOString() + "\n" +
    "window.CORPUS = ";
  await writeFile(new URL("../corpus.js", import.meta.url), header + JSON.stringify(all, null, 2) + ";\n");
  console.log("Wrote corpus.js with", all.length, "records (", CURATED.length, "curated +", live.length, "live ).");
}

main();
