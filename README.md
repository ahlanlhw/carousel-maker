# Free carousel maker

Text in, 4:5 slides out.

- Type or paste your text.
- Get 1080 x 1350 JPEG slides for Instagram, TikTok and Threads.
- It all runs in your browser. No account. No server. Nothing is uploaded.

Live: https://ahlanlhw.github.io/carousel-maker/

## Features

- One tab for each slide. Add, remove and move slides. Up to 10.
- Line breaks: press Enter for a new line inside a slide.
- Font for each slide: Serif (Fraunces Poster) or Sans (Plus Jakarta Sans).
- Background for each slide: Cream, White, Sand, Amber or Blush. All light.
- Bold and italic for each slide.
- Import text: paste a whole post and it splits into slides for you.
- Your @handle or site at the bottom of every slide, if you want one.

## How a slide is laid out

1. One line: short text goes big. Long text keeps its first sentence big and the rest small.
2. Two or more lines: a short first line goes big. The rest sits under it, with your line breaks.
3. If a slide is too long to fit, the page tells you which one.

Bold makes the text 8% bigger. The two font files are single weights, and the page never fakes a heavier stroke. Italic slants the upright font.

## How Import text splits

1. A first line that starts with `# ` is the cover.
2. A blank line starts a new slide. A single line break stays inside its slide.
3. Slides that are too long split at the end of a line or a sentence.
4. Up to 10 slides. Any more are left out, and the page says so.

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
- `src/plan.js` splits, wraps and places the text, and holds the slide and background data. It has no DOM, so the tests run it in Node.
- `src/render.js` loads the fonts and draws each slide in its own style.
- `src/app.js` wires up the tabs, the style bar and the download.

## Want to schedule them?

The hosted version at https://sprkly.app/tools/carousel has a "Schedule this" button. It posts your slides to Instagram, TikTok and Threads.

## Licence

MIT. See `LICENSE`. The fonts keep their own licence (SIL OFL 1.1).
