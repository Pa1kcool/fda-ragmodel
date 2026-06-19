# Ask the FDA Sources — a tiny RAG demo

A small, real retrieval-augmented generation (RAG) chatbot for the workshop. It searches a set
of **real, public FDA documents**, answers using **only** what it found, and **cites the sources**
so the room can check the answer. The lesson is the habit: in high-stakes work, trust the answer
you can verify, not the one that merely sounds confident.

It is built for the constraint you wanted: the page is **static (GitHub Pages)**, and the model
runs behind a tiny **free proxy** so your API key is never exposed.

## What is in here
- `index.html`, `app.js`, `config.js` — the static site (deploy to GitHub Pages).
- `corpus.js` — the knowledge base. Ships with safe FDA facts; replace with live data (below).
- `scripts/fetch_corpus.mjs` — pulls **real openFDA** drug labels and food recalls into `corpus.js`.
- `cloudflare-worker.js` — the free proxy that holds your key and calls the model.

## How it works
1. You type a question.
2. The page runs **BM25 retrieval** over `corpus.js` and picks the best few sources. (This is real
   retrieval; no key, instant, and explainable.)
3. Those sources are sent to the Worker, which asks a hosted model to answer **using only them**,
   with inline citations like `[1]`.
4. The page shows the answer and the exact sources, with links.

If no model is connected, it runs in **evidence-only mode**: it still retrieves and shows the cited
sources, so the demo never hard-fails in the room.

---

## Setup

### 1. Get real data (optional but recommended)
From the project folder, with Node 18+ and internet:
```
node scripts/fetch_corpus.mjs
```
This overwrites `corpus.js` with live openFDA drug labels (with boxed warnings) and recent food
recalls. Re-run any time for fresh data. openFDA needs no key.

### 2. Deploy the page to GitHub Pages
- Put `index.html`, `app.js`, `config.js`, `corpus.js` in a repo (root or `/docs`).
- Repo → Settings → Pages → deploy from your branch.
- Your site appears at `https://<you>.github.io/<repo>/`.

### 3. Stand up the free model proxy (Cloudflare Worker)
No command line needed.
1. Get a **free API key** from a provider with a free tier (for example Groq at console.groq.com,
   or Google AI Studio). Confirm the current model name in their docs.
2. dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker** → name it
   (e.g. `fda-rag-proxy`) → **Deploy**.
3. **Edit code**: paste the contents of `cloudflare-worker.js`, then **Deploy**.
   - If you are not using Groq, change `API_URL` and `MODEL` at the top first.
4. Worker → **Settings → Variables → Add variable**, type **Secret**, name **`LLM_API_KEY`**,
   paste your key, **Save and deploy**.
5. Copy the Worker URL (looks like `https://fda-rag-proxy.<you>.workers.dev`).

### 4. Connect the page to the proxy
- Open `config.js`, set `WORKER_URL` to your Worker URL, commit. Done.

### Test locally before deploying
Open a terminal in the project folder:
```
python3 -m http.server 8000
```
Then visit `http://localhost:8000`. (Opening the file directly also works because the data is a
plain script, but a local server is closer to production.)

---

## Using it in the workshop
- Drive it on the projector, and share the GitHub Pages link so people can try it on their phones.
- Show a question, read the answer, then **open a cited source** to verify it. That click is the point.
- Ask something the corpus does not cover, and show it say **"the sources do not cover this"** instead
  of inventing an answer. That refusal is the hero.
- Then let groups type their own questions.

### Paired activity: "Cite or accept?"
Each group takes a field (law, medicine, journalism, education) and a short stack of real decisions
in it. For each decision they answer one question: **would you act on the AI's answer without a
source, or not?** They place each decision on a line from "fine to accept" to "must cite or do not
use," then draw their field's line: the level of stakes above which **no AI answer is usable without
a checkable source**. Each group reports its line and the one example that flipped the moment a
citation was required. The takeaway: in high-stakes work, a citation is not a nicety, it is the line
between usable and dangerous.

---

## Safety and limits
- **Not medical advice.** The app only reports what public FDA sources say and refuses personal
  medical decisions. Keep that framing in the room.
- **Retrieval can miss.** BM25 matches words; if it grabs the wrong passage, the answer reflects that.
  This is a useful teaching point, not a bug to hide.
- **Free tiers rate-limit.** With many phones at once you may hit a limit; the app falls back to
  evidence-only mode, which still teaches the lesson.
- **Lock down CORS for real use.** In `cloudflare-worker.js`, replace the `*` origin with your Pages
  origin so only your site can call the Worker.
- Add embeddings later if you want semantic retrieval; BM25 is the robust default for a live demo.
