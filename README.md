# Free carousel maker

Text in, 4:5 slides out.

- Type or paste your text.
- Get 1080 x 1350 JPEG slides for Instagram, TikTok and Threads.
- It all runs in your browser. No account. No server. Nothing is uploaded.

Live: https://ahlanlhw.github.io/carousel-maker/

## How the split works

1. A first line that starts with `# ` is the cover.
2. A blank line starts a new slide. Text with no blank lines splits per line.
3. A short slide goes big. A long one keeps its first sentence big and the rest small. Slides that are too long split at the end of a sentence.
4. Up to 10 slides. Any more are left out, and the page says so.

If a slide is still too long to fit, the page tells you which one.

## Run it locally

The fonts load with `fetch`, so opening `index.html` from disk (`file://`) will not work. Serve the folder:

```bash
npx serve .
# or
python -m http.server 8787
```

Then open the URL it prints (for example http://localhost:3000/ or http://localhost:8787/).

Run the tests (Node 20 or newer, no install needed):

```bash
npm test
```

## How it draws

- Canvas 2D in the browser. No build step, no dependencies.
- Headlines: Fraunces Poster. Body: Plus Jakarta Sans SemiBold.
- Both fonts are SIL Open Font License. Their licence files sit next to them in `fonts/`.
- `src/plan.js` splits, wraps and places the text. It has no DOM, so the tests run it in Node.
- `src/render.js` loads the fonts and draws each slide.
- `src/app.js` wires up the page and the download.

## Want to schedule them?

The hosted version at https://sprkly.app/tools/carousel has a "Schedule this" button. It posts your slides to Instagram, TikTok and Threads.

## Licence

MIT. See `LICENSE`. The fonts keep their own licence (SIL OFL 1.1).
