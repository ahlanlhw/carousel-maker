/**
 * src/plan.js: the pure half of the carousel maker.
 *
 * Text in, a slide plan out. No DOM and no canvas here: src/render.js draws what this module
 * places, and the tests run it with a fake measure function.
 *
 * Every slide is 1080x1350, because TikTok photo posts refuse a set whose images differ in
 * pixel size.
 */

/** The 4x5 card slots, in canvas pixels. */
export const LAYOUT = Object.freeze({
  w: 1080,
  h: 1350,
  margin: 90,
  eyebrow: { size: 36, spacing: 4, y: 420, gap: 40 },
  headline: { size: 96, leading: 112, lines: 3, gap: 60 },
  body: { size: 40, leading: 58, lines: 4 },
  rule: { y: 1180, w: 114, h: 5 },
  domain: { size: 36, spacing: 3, y: 1262 },
})

/** The usable text width: the canvas less a margin on each side. */
export const TEXT_WIDTH = LAYOUT.w - LAYOUT.margin * 2

/**
 * Headline sizes to try, largest first. A headline that does not fit three lines at 96 steps
 * down; leading keeps the 112/96 ratio.
 */
export const HEADLINE_SIZES = Object.freeze([96, 84, 72])

/** Cap height as a fraction of the font size. */
export const CAP_DISPLAY = 0.72
export const CAP_SANS = 0.7

/** JPEG quality for every slide. */
export const JPEG_QUALITY = 0.92

/** The bottom line under the amber rule: the user's @handle or site. Blank until they type one. */
export const DEFAULT_BOTTOM_LINE = ''
export const BOTTOM_LINE_MAX = 40

/**
 * @typedef {Object} Look
 * @property {string} label
 * @property {string} bg
 * @property {string} ink
 * @property {string} rule
 * @property {string} eyebrow
 * @property {string} body
 * @property {string} hairline
 */

const INK = '#1c1b29'
const BODY_INK = 'rgba(28,27,41,0.72)'
const AMBER = '#f59e0b'
const AMBER_TEXT = '#a1560a'
const HAIRLINE = '#e6e1da'

/**
 * The five slide backgrounds, all light. Cream is the default; White, Sand, a pale Amber and
 * a pale Blush follow. The amber eyebrow and bottom line keep at least 4.5:1 on each; ink and
 * body text keep far more.
 */
export const BACKGROUNDS = Object.freeze({
  cream: { label: 'Cream', bg: '#faf9f7', ink: INK, rule: AMBER, eyebrow: AMBER_TEXT, body: BODY_INK, hairline: HAIRLINE },
  white: { label: 'White', bg: '#ffffff', ink: INK, rule: AMBER, eyebrow: AMBER_TEXT, body: BODY_INK, hairline: HAIRLINE },
  sand: { label: 'Sand', bg: '#f1ebe1', ink: INK, rule: AMBER, eyebrow: AMBER_TEXT, body: BODY_INK, hairline: '#ddd4c6' },
  amber: { label: 'Amber', bg: '#fdf0d8', ink: INK, rule: '#d97706', eyebrow: AMBER_TEXT, body: BODY_INK, hairline: '#f3dcb0' },
  blush: { label: 'Blush', bg: '#fde9ec', ink: INK, rule: AMBER, eyebrow: AMBER_TEXT, body: BODY_INK, hairline: '#f4d2d8' },
})

/** @typedef {keyof typeof BACKGROUNDS} BackgroundId */

/** @type {BackgroundId} */
export const DEFAULT_BACKGROUND = 'cream'
export const BACKGROUND_IDS = /** @type {BackgroundId[]} */ (Object.keys(BACKGROUNDS))

/**
 * @param {unknown} v
 * @returns {v is BackgroundId}
 */
export function isBackgroundId(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BACKGROUNDS, v)
}

/**
 * Character budgets for the split. They stand in for a measure the pure split cannot make:
 * Jakarta Semi at 40px averages about 22px a character, so four body lines over 900px hold
 * about 160; the budget keeps 140 for wide letters. Fraunces Poster at 84 to 96px holds about
 * 60 over three lines. fitSlide still wraps by real width and reports any slide whose end is
 * cut, so the maker can say so.
 */
export const BODY_CHAR_BUDGET = 140
export const HEADLINE_CHAR_BUDGET = 60
export const MAX_SLIDES = 10

/**
 * @typedef {Object} SlideText
 * @property {string} headline
 * @property {string} body
 */

/** @typedef {'display' | 'sans'} FontRole Fraunces Poster (serif display) or Jakarta Semi (sans). */

/**
 * @param {unknown} v
 * @returns {v is FontRole}
 */
export function isFontRole(v) {
  return v === 'display' || v === 'sans'
}

/**
 * One slide as the maker holds it: one tab. `text` keeps the user's line breaks. `font` is the
 * headline's font (the body stays the sans); bold and italic apply to the headline and the
 * body. The eyebrow and the bottom line never change.
 *
 * @typedef {Object} Slide
 * @property {string} text
 * @property {FontRole} font
 * @property {BackgroundId} bg
 * @property {boolean} bold
 * @property {boolean} italic
 */

/** @typedef {Omit<Slide, 'text'>} SlideStyle */

/** The default look: serif headline on cream, regular weight, upright. @type {Readonly<SlideStyle>} */
export const DEFAULT_SLIDE_STYLE = Object.freeze({ font: 'display', bg: DEFAULT_BACKGROUND, bold: false, italic: false })

/**
 * @param {string} [text]
 * @param {SlideStyle} [style]
 * @returns {Slide}
 */
export function newSlide(text = '', style = DEFAULT_SLIDE_STYLE) {
  return { text, font: style.font, bg: style.bg, bold: style.bold, italic: style.italic }
}

/** The two family names every font string uses; the extra faces register under them too. */
export const DISPLAY_FAMILY = 'Fraunces Poster'
export const SANS_FAMILY = 'Jakarta Semi'

/** @typedef {'display' | 'sans' | 'displayBold' | 'displayItalic' | 'sansBold'} FaceId */

/**
 * @typedef {Object} FontFaceFile
 * @property {string} family
 * @property {string} file File name in fonts/.
 * @property {string} weight FontFace weight descriptor: one weight, or a range for a variable file.
 * @property {'normal' | 'italic'} style
 */

/**
 * Every face the maker can draw with (SIL OFL, licence files beside them in fonts/).
 * `display` and `sans` load on every visit; the other three load only when a slide asks:
 *   displayBold    Fraunces variable, drawn at 900
 *   displayItalic  Fraunces italic variable, 800, or 900 when bold too
 *   sansBold       Plus Jakarta Sans 800
 * There is no Jakarta italic file: italic sans is the browser's slant of the upright face.
 * @type {Readonly<Record<FaceId, FontFaceFile>>}
 */
export const FONT_FACES = Object.freeze({
  display: { family: DISPLAY_FAMILY, file: 'FrauncesPoster.ttf', weight: '800', style: 'normal' },
  sans: { family: SANS_FAMILY, file: 'JakartaSemi.ttf', weight: '600', style: 'normal' },
  displayBold: { family: DISPLAY_FAMILY, file: 'Fraunces-Variable.ttf', weight: '900', style: 'normal' },
  displayItalic: { family: DISPLAY_FAMILY, file: 'Fraunces-Italic-Variable.ttf', weight: '800 900', style: 'italic' },
  sansBold: { family: SANS_FAMILY, file: 'JakartaXBold.ttf', weight: '800', style: 'normal' },
})

const DISPLAY_FALLBACK = 'Georgia, "Times New Roman", serif'
const SANS_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif'

/**
 * The canvas font string for one role at one size, and the face it draws with. Bold is a real
 * heavier weight (serif 800 to 900, sans 600 to 800); size never changes. Every string names a
 * system fallback, so a slide can be drawn before its face arrives.
 *
 * @param {FontRole} role
 * @param {number} size
 * @param {{ bold: boolean, italic: boolean }} [style]
 * @returns {{ font: string, face: FaceId }}
 */
export function fontSpec(role, size, style = { bold: false, italic: false }) {
  const display = role === 'display'
  const weight = display ? (style.bold ? 900 : 800) : style.bold ? 800 : 600
  /** @type {FaceId} */
  const face = display ? (style.italic ? 'displayItalic' : style.bold ? 'displayBold' : 'display') : style.bold ? 'sansBold' : 'sans'
  const family = display ? `"${DISPLAY_FAMILY}", ${DISPLAY_FALLBACK}` : `"${SANS_FAMILY}", ${SANS_FALLBACK}`
  return { font: `${style.italic ? 'italic ' : ''}${weight} ${size}px ${family}`, face }
}

/**
 * The faces one slide draws with: its headline font and the body sans, both in its style.
 * @param {SlideStyle} style
 * @returns {FaceId[]}
 */
export function slideFaces(style) {
  return [...new Set([fontSpec(style.font, 0, style).face, fontSpec('sans', 0, style).face])]
}

/**
 * @typedef {Object} SplitResult
 * @property {SlideText[]} slides
 * @property {number} dropped Slides cut off by maxSlides.
 */

/**
 * Sentences, each with its end mark and any closing quote or bracket.
 * @param {string} text
 * @returns {string[]}
 */
function sentences(text) {
  return (text.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g) ?? []).map((s) => s.trim()).filter(Boolean)
}

/**
 * Words packed into pieces of at most `budget` characters (a single long word stays whole).
 * @param {string} text
 * @param {number} budget
 * @returns {string[]}
 */
function packWords(text, budget) {
  /** @type {string[]} */
  const out = []
  let cur = ''
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word
    if (cur && next.length > budget) {
      out.push(cur)
      cur = word
    } else {
      cur = next
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * A block over the body budget, split at sentence ends; a sentence over it, at word breaks.
 * A block with line breaks is packed whole lines at a time, so no break moves; a single line
 * over the budget splits at its own sentence ends.
 * @param {string} block
 * @param {number} budget
 * @returns {string[]}
 */
function splitLong(block, budget) {
  if (block.length <= budget) return [block]
  /** @type {string[]} */
  const out = []
  let cur = ''
  if (block.includes('\n')) {
    for (const line of block.split('\n')) {
      if (line.length > budget) {
        if (cur) out.push(cur)
        cur = ''
        out.push(...splitLong(line, budget))
        continue
      }
      const next = cur ? `${cur}\n${line}` : line
      if (cur && next.length > budget) {
        out.push(cur)
        cur = line
      } else {
        cur = next
      }
    }
    if (cur) out.push(cur)
    return out
  }
  for (const s of sentences(block)) {
    if (s.length > budget) {
      if (cur) out.push(cur)
      cur = ''
      out.push(...packWords(s, budget))
      continue
    }
    const next = cur ? `${cur} ${s}` : s
    if (cur && next.length > budget) {
      out.push(cur)
      cur = s
    } else {
      cur = next
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Lines with their spaces tidied, and no blank lines at either end. Blank lines inside stay.
 * @param {string} text
 * @returns {string[]}
 */
function tidyLines(text) {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
  while (lines.length && !lines[0]) lines.shift()
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  return lines
}

/**
 * A slide's text as a headline and body.
 *   - Two or more lines: the first line is the headline when it fits the headline budget, and
 *     the rest (line breaks kept) is the body. A long first line makes it all body.
 *   - One line: short text is all headline; else the first sentence leads.
 * @param {string} text
 * @returns {SlideText}
 */
export function toSlide(text) {
  const lines = tidyLines(text)
  if (lines.length >= 2) {
    const [first, ...rest] = lines
    while (rest.length && !rest[0]) rest.shift()
    if (first.length <= HEADLINE_CHAR_BUDGET) return { headline: first, body: rest.join('\n') }
    return { headline: '', body: lines.join('\n') }
  }
  const chunk = lines[0] ?? ''
  if (chunk.length <= HEADLINE_CHAR_BUDGET) return { headline: chunk, body: '' }
  const [first, ...rest] = sentences(chunk)
  if (first && rest.length && first.length <= HEADLINE_CHAR_BUDGET) return { headline: first, body: rest.join(' ') }
  return { headline: '', body: chunk }
}

/**
 * Pasted text as one string per slide (line breaks kept), and whether the first is a "# " cover.
 * @param {string} text
 * @returns {{ texts: string[], cover: boolean }}
 */
function splitTexts(text) {
  let lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  /** @type {string[]} */
  const texts = []
  let cover = false
  const heading = /^#{1,6}\s+(.*)$/.exec(lines[0]?.trim() ?? '')
  if (heading && heading[1].trim()) {
    texts.push(heading[1].replace(/\s+/g, ' ').trim())
    cover = true
    lines = lines.slice(1)
  }
  for (const block of lines.join('\n').trim().split(/\n[ \t]*\n/)) {
    const clean = tidyLines(block).filter(Boolean).join('\n')
    if (clean) texts.push(...splitLong(clean, BODY_CHAR_BUDGET))
  }
  return { texts, cover }
}

/**
 * Text to slides.
 *
 *   - A first line written as a heading ("# 5 ways to ...") becomes the cover headline.
 *     A bare hashtag ("#tbt") is not a heading and stays as text.
 *   - Blocks between blank lines are slides. A single line break stays inside its slide.
 *   - A block longer than the body budget splits at line or sentence ends.
 *   - At most `maxSlides`; the rest are counted in `dropped`.
 *
 * @param {string} text
 * @param {{ maxSlides?: number }} [opts]
 * @returns {SplitResult}
 */
export function splitIntoSlides(text, { maxSlides = MAX_SLIDES } = {}) {
  const { texts, cover } = splitTexts(text)
  const slides = texts.map((t, i) => (i === 0 && cover ? { headline: t, body: '' } : toSlide(t)))
  const cap = Math.max(1, maxSlides)
  return { slides: slides.slice(0, cap), dropped: Math.max(0, slides.length - cap) }
}

/**
 * The Import text box: the same split, as tabs. Each slide keeps its line breaks and takes
 * `style` (the page passes the open tab's, so a picked background carries over).
 *
 * @param {string} text
 * @param {SlideStyle} [style]
 * @param {{ maxSlides?: number }} [opts]
 * @returns {{ slides: Slide[], dropped: number }}
 */
export function slidesFromText(text, style = DEFAULT_SLIDE_STYLE, { maxSlides = MAX_SLIDES } = {}) {
  const { texts } = splitTexts(text)
  const cap = Math.max(1, maxSlides)
  return { slides: texts.slice(0, cap).map((t) => newSlide(t, style)), dropped: Math.max(0, texts.length - cap) }
}

/**
 * @typedef {Object} WrapResult
 * @property {string[]} lines
 * @property {boolean} overflow True when the text did not fit in maxLines and the last line was cut.
 */

/**
 * Greedy word wrap by measured width. `measure` returns a string's width at the font the
 * caller has set (canvas measureText in the browser, a fake in tests). A line break in the
 * text is kept: each segment wraps on its own and an empty one stays a blank line. A word
 * wider than the line is broken by character. Text past maxLines (blank lines count) ends the
 * last line with an ellipsis.
 *
 * @param {(s: string) => number} measure
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {WrapResult}
 */
export function wrapLines(measure, text, maxWidth, maxLines) {
  /** @type {string[]} */
  const lines = []
  for (const segment of tidyLines(text)) {
    if (!segment) {
      lines.push('')
      continue
    }
    let cur = ''
    /** @param {string} word */
    const pushWord = (word) => {
      if (measure(word) <= maxWidth) {
        cur = word
        return
      }
      // A word wider than the line: break it by character.
      let piece = ''
      for (const ch of word) {
        if (piece && measure(piece + ch) > maxWidth) {
          lines.push(piece)
          piece = ch
        } else {
          piece += ch
        }
      }
      cur = piece
    }
    for (const word of segment.split(' ')) {
      if (!cur) {
        pushWord(word)
        continue
      }
      const next = `${cur} ${word}`
      if (measure(next) <= maxWidth) {
        cur = next
      } else {
        lines.push(cur)
        cur = ''
        pushWord(word)
      }
    }
    if (cur) lines.push(cur)
  }
  if (lines.length <= maxLines) return { lines, overflow: false }

  const kept = lines.slice(0, Math.max(1, maxLines))
  let last = kept[kept.length - 1]
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd()
  kept[kept.length - 1] = `${last}…`
  return { lines: kept, overflow: true }
}

/** @typedef {'cover' | 'body' | 'last'} SlideKind */

/**
 * @typedef {Object} SlidePlan
 * @property {string} headline
 * @property {string} body
 * @property {SlideKind} kind
 * @property {string} eyebrow Amber line over the headline: "SWIPE" on a cover with more to come, a step number after.
 */

/**
 * @param {SlideText[]} slides
 * @returns {SlidePlan[]}
 */
export function slidePlan(slides) {
  const n = slides.length
  return slides.map((s, i) => ({
    ...s,
    kind: i === 0 ? 'cover' : i === n - 1 ? 'last' : 'body',
    eyebrow: i === 0 ? (n > 1 ? 'SWIPE' : '') : String(i).padStart(2, '0'),
  }))
}

/**
 * The carousel's name: the cover headline, or "Carousel".
 * @param {SlideText[]} slides
 * @returns {string}
 */
export function carouselName(slides) {
  return slides[0]?.headline.trim() || 'Carousel'
}

/**
 * A starter caption: the cover's words.
 * @param {SlideText[]} slides
 * @returns {string}
 */
export function carouselCaption(slides) {
  const first = slides[0]
  return first ? (first.headline || first.body).trim() : ''
}

/**
 * File names: carousel-01.jpg, carousel-02.jpg, ...
 * @param {number} i
 * @returns {string}
 */
export function slideFileName(i) {
  return `carousel-${String(i + 1).padStart(2, '0')}.jpg`
}

/**
 * A string's width with a role, size and tracking set. The browser sets ctx.font and
 * letterSpacing, then calls measureText; tests pass a fake.
 * @typedef {(text: string, role: FontRole, size: number, tracking: number) => number} RoleMeasure
 */

/**
 * @typedef {Object} FittedSlide
 * @property {string} eyebrow
 * @property {string[]} headline
 * @property {number} headlineSize
 * @property {string[]} body
 * @property {boolean} overflow True when the headline did not fit at the smallest size, or the body ran past its lines.
 */

/**
 * Wrap a slide into its slots. The headline steps down through HEADLINE_SIZES until it fits
 * three lines; past the smallest size, and for a body past four lines, the end is cut with
 * an ellipsis and `overflow` is set, so the maker can warn instead of cutting silently.
 * `headlineRole` is the slide's font; the body and the eyebrow are always the sans.
 *
 * @param {RoleMeasure} measure
 * @param {SlidePlan} slide
 * @param {FontRole} [headlineRole]
 * @returns {FittedSlide}
 */
export function fitSlide(measure, slide, headlineRole = 'display') {
  const L = LAYOUT
  let overflow = false
  let headlineSize = L.headline.size
  /** @type {string[]} */
  let headline = []
  if (slide.headline) {
    for (const size of HEADLINE_SIZES) {
      const wrapped = wrapLines((s) => measure(s, headlineRole, size, 0), slide.headline, TEXT_WIDTH, L.headline.lines)
      headlineSize = size
      headline = wrapped.lines
      overflow = wrapped.overflow
      if (!wrapped.overflow) break
    }
  }
  /** @type {string[]} */
  let body = []
  if (slide.body) {
    const wrapped = wrapLines((s) => measure(s, 'sans', L.body.size, 0), slide.body, TEXT_WIDTH, L.body.lines)
    body = wrapped.lines
    overflow = overflow || wrapped.overflow
  }
  const eyebrow = slide.eyebrow
    ? wrapLines((s) => measure(s, 'sans', L.eyebrow.size, L.eyebrow.spacing), slide.eyebrow, TEXT_WIDTH, 1).lines[0] ?? ''
    : ''
  return { eyebrow, headline, headlineSize, body, overflow }
}

/**
 * @typedef {Object} PlacedLine
 * @property {'eyebrow' | 'headline' | 'body'} slot
 * @property {string} text
 * @property {number} y Baseline, canvas pixels.
 * @property {number} size
 */

/**
 * Baselines for a slide's wrapped lines:
 *   eyebrow   on LAYOUT.eyebrow.y, always
 *   headline  first baseline from the NOMINAL size, so a stepped-down headline starts on the
 *             same line as its neighbours
 *   body      its capitals `headline.gap` under the last headline baseline; with no headline,
 *             it starts where the headline would have
 * A slot with no lines is skipped and nothing else moves.
 *
 * @param {{ eyebrow: string, headline: string[], headlineSize: number, body: string[] }} lines
 * @returns {PlacedLine[]}
 */
export function placeLines(lines) {
  const L = LAYOUT
  /** @type {PlacedLine[]} */
  const placed = []
  if (lines.eyebrow) placed.push({ slot: 'eyebrow', text: lines.eyebrow, y: L.eyebrow.y, size: L.eyebrow.size })
  const contentTop = L.eyebrow.y + L.eyebrow.gap
  const leading = Math.round((lines.headlineSize * L.headline.leading) / L.headline.size)
  const first = Math.round(contentTop + CAP_DISPLAY * L.headline.size)
  lines.headline.forEach((text, i) => {
    placed.push({ slot: 'headline', text, y: first + i * leading, size: lines.headlineSize })
  })
  const bodyTop = lines.headline.length
    ? Math.round(first + (lines.headline.length - 1) * leading + L.headline.gap + CAP_SANS * L.body.size)
    : Math.round(contentTop + CAP_SANS * L.body.size)
  lines.body.forEach((text, i) => {
    placed.push({ slot: 'body', text, y: bodyTop + i * L.body.leading, size: L.body.size })
  })
  return placed
}
