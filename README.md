# 🕵️ Imposter Challenge

A party game inspired by the OG Crew "Imposter" segment. Five players get the **real** question. One — the imposter — gets a sneaky variant. Discuss, defend, deceive, and figure out who's lying.

**100% client-side.** No backend, no accounts, no data leaves the device. Hash-based routing, so it runs cleanly on **GitHub Pages**.

## How it plays

1. **Host** opens the page, adds player names (host included), picks a **vibe**, sets the number of **rounds** and a **discussion timer**, and hits **Start**.
2. The game secretly assigns one random player the imposter question each round — **the host doesn't know who**.
3. The host gets a unique **link per player** (with Copy / Share / Copy-all buttons) and sends each one out via SMS, WhatsApp, etc.
4. Each player opens their link and sees **only** their name, the round, and their question — nothing else. The question is obfuscated in the URL hash so the host can't casually read it.
5. Everyone discusses in real life while the host runs the timer.
6. The host taps in **who the group voted for** (still not told if it's right).
7. **Reveal** (host screen only): who the imposter actually was, both questions, and the score. If the imposter escaped the vote, they bank a point.
8. Repeat for all rounds, then see the **final podium**.

## Vibes

| | Vibe | |
|---|---|---|
| 🧊 | **Icebreaker** | Safe, fun, getting-to-know-you |
| 🍹 | **Tipsy** | Personal but playful |
| 🚫 | **No Filter** | Dark humour, oversharing territory |
| 💀 | **Blackout** | Absolute chaos, no survivors |

18 paired questions per vibe; no question repeats within a game.

## Files

- `index.html` — all screens (host setup, links, timer, vote, reveal, final, plus the player view)
- `style.css` — mobile-first dark theme
- `app.js` — routing, question obfuscation, game planning, scoring
- `questions.json` — questions grouped by vibe, each with a paired imposter variant

## Run locally

It fetches `questions.json`, so serve it over HTTP (don't open the file directly):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

Push to GitHub, then **Settings → Pages → Deploy from branch → `main` / root**. The included `.nojekyll` keeps Pages from interfering. Done.

## URL structure

- **Player link:** `…/#player=Sam&round=2&q=ENCODED` — the question is XOR-scrambled + base64url-encoded in the hash (not plaintext; obfuscation, not encryption).
- **Host view:** the default page with no `player=` in the hash. The imposter is **never** shown on the host's screen until the reveal — since the host is a player too.
