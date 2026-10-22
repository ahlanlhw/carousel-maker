/**
 * src/render.js: the drawing half. src/plan.js splits, fits and places; this file only draws.
 *
 * Fonts, from fonts/ (SIL OFL): Fraunces Poster (800) and Plus Jakarta Sans SemiBold (600)
 * load on every visit. The bold and italic faces (FONT_FACES in src/plan.js) load only when a
 * slide asks for them, under the same two family names, so the weight and style in the font
 * string pick them. Every font string names a system fallback: the preview draws at once and
 * again when a face arrives, and a download waits for every face its slides use, so a JPEG is
 * never drawn in a fallback. Jakarta has no italic file: italic sans is the browser's slant of
 * the upright face.
 */

import { BACKGROUNDS, FONT_FACES, JPEG_QUALITY, LAYOUT, fitSlide, fontSpec, placeLines, slideFaces } from './plan.js'

/** @typedef {import('./plan.js').SlidePlan} SlidePlan */
/** @typedef {import('./plan.js').SlideStyle} SlideStyle */
/** @typedef {import('./plan.js').FontRole} FontRole */
/** @typedef {import('./plan.js').FaceId} FaceId */
/** @typedef {{ bold: boolean, italic: boolean }} TextStyle */

/**
 * @param {FontRole} role
 * @param {number} size
 * @param {TextStyle} [s]
 */
const fontFor = (role, size, s) => fontSpec(role, size, s).font

/** @type {Map<FaceId, Promise<boolean>>} */
const faceLoads = new Map()

/**
 * Has this face been asked for yet?
 * @param {FaceId} id
 */
export const faceRequested = (id) => faceLoads.has(id)

/**
 * Register one face under its family and load it, once. Waits through document.fonts.load,
 * so the next draw at that weight and style finds the face ready. Resolves false (never
 * rejects) when it cannot load; the fallback then stays.
 * @param {FaceId} id
 * @returns {Promise<boolean>}
 */
export function loadFace(id) {
  let loading = faceLoads.get(id)
  if (!loading) {
    loading = (async () => {
      try {
        if (typeof FontFace === 'undefined' || !document.fonts) return false
        const f = FONT_FACES[id]
        // Relative to the page, so it works under a sub-path such as GitHub Pages.
        const url = new URL(`fonts/${f.file}`, document.baseURI).href
        const face = new FontFace(f.family, `url(${url})`, { weight: f.weight, style: f.style })
        document.fonts.add(face)
        await document.fonts.load(`${f.style === 'italic' ? 'italic ' : ''}${f.weight.split(' ')[0]} 40px "${f.family}"`)
        return face.status === 'loaded'
      } catch (err) {
        console.warn(`[carousel] ${FONT_FACES[id].file} did not load, using a system font`, err)
        return false
      }
    })()
    faceLoads.set(id, loading)
  }
  return loading
}

/**
 * The two faces every visit uses.
 * @returns {Promise<boolean>}
 */
export function loadFonts() {
  return Promise.all([loadFace('display'), loadFace('sans')]).then((ok) => ok.every(Boolean))
}

/**
 * Every face these slides draw with (the bold and italic ones on demand).
 * @param {SlideStyle[]} styles
 * @returns {Promise<boolean>}
 */
export function loadSlideFonts(styles) {
  const ids = [...new Set(styles.flatMap(slideFaces))]
  return Promise.all(ids.map(loadFace)).then((ok) => ok.every(Boolean))
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 */
function setTracking(ctx, px) {
  // letterSpacing is newer than the rest of Canvas 2D; without it the line is just untracked.
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}

/**
 * Draw one slide in 1080x1350 space, in its own font, background, bold and italic. The
 * eyebrow and the bottom line stay plain. The caller sets any scale on the context first.
 * Returns true when the slide's end had to be cut (fitSlide's overflow).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {SlidePlan} slide
 * @param {SlideStyle} style
 * @param {string} bottomLine
 * @returns {boolean}
 */
export function drawSlide(ctx, slide, style, bottomLine) {
  const L = LAYOUT
  const x = L.margin
  const look = BACKGROUNDS[style.bg]
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = look.bg
  ctx.fillRect(0, 0, L.w, L.h)

  const fit = fitSlide(
    (text, role, size, tracking) => {
      ctx.font = fontFor(role, size, style)
      setTracking(ctx, tracking)
      return ctx.measureText(text).width
    },
    slide,
    style.font,
  )

  for (const p of placeLines(fit)) {
    if (p.slot === 'eyebrow') {
      ctx.font = fontFor('sans', p.size)
      setTracking(ctx, L.eyebrow.spacing)
      ctx.fillStyle = look.eyebrow
    } else if (p.slot === 'headline') {
      ctx.font = fontFor(style.font, p.size, style)
      setTracking(ctx, 0)
      ctx.fillStyle = look.ink
    } else {
      ctx.font = fontFor('sans', p.size, style)
      setTracking(ctx, 0)
      ctx.fillStyle = look.body
    }
    if (p.text) ctx.fillText(p.text, x, p.y)
  }

  // Amber rule, then the user's bottom line under it (left blank when there is none).
  ctx.fillStyle = look.rule
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, L.rule.y, L.rule.w, L.rule.h, L.rule.h / 2)
  else ctx.rect(x, L.rule.y, L.rule.w, L.rule.h)
  ctx.fill()

  const line = bottomLine.trim()
  if (line) {
    ctx.font = fontFor('sans', L.domain.size)
    setTracking(ctx, L.domain.spacing)
    ctx.fillStyle = look.eyebrow
    ctx.fillText(line, x, L.domain.y, L.w - 2 * x)
  }
  setTracking(ctx, 0)
  return fit.overflow
}

/** The preview is drawn at half size: crisp on a phone, and ten of them stay light. */
export const PREVIEW_SCALE = 0.5

/**
 * @param {HTMLCanvasElement} canvas
 * @param {SlidePlan} slide
 * @param {SlideStyle} style
 * @param {string} bottomLine
 * @returns {boolean}
 */
export function drawPreview(canvas, slide, style, bottomLine) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0)
  return drawSlide(ctx, slide, style, bottomLine)
}

/**
 * One slide at full size, as a JPEG.
 * @param {SlidePlan} slide
 * @param {SlideStyle} style
 * @param {string} bottomLine
 * @returns {Promise<Blob>}
 */
export function renderJpeg(slide, style, bottomLine) {
  const canvas = document.createElement('canvas')
  canvas.width = LAYOUT.w
  canvas.height = LAYOUT.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas 2D is not available'))
  drawSlide(ctx, slide, style, bottomLine)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/jpeg', JPEG_QUALITY),
  )
}

/**
 * Should these files go to the share sheet? Only on a touch-first device (coarse pointer) whose
 * browser can share files. Desktop Chrome on Windows can share files too, but there the sheet is
 * the Windows share box, not a save, so a PC always downloads. Every call guarded: old browsers
 * throw or lack it, and tests have no matchMedia.
 *
 * @param {File[]} files
 * @returns {boolean}
 */
export function canShareFiles(files) {
  try {
    const touch =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      Boolean(window.matchMedia('(pointer: coarse)')?.matches)
    return (
      touch &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      Boolean(navigator.canShare?.({ files }))
    )
  } catch {
    return false
  }
}
