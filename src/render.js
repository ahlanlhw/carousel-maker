/**
 * src/render.js: the drawing half. src/plan.js splits, fits and places; this file only draws.
 *
 * Fonts: Fraunces Poster (headlines) and Plus Jakarta Sans SemiBold (body), from fonts/ (SIL
 * OFL). Every font string names a system fallback, so a slide is drawn at once and drawn again
 * when the faces arrive. If they never load, the fallback stays.
 */

import { JPEG_QUALITY, LAYOUT, fitSlide, placeLines } from './plan.js'

/** @typedef {import('./plan.js').Look} Look */
/** @typedef {import('./plan.js').SlidePlan} SlidePlan */
/** @typedef {import('./plan.js').FontRole} FontRole */

const DISPLAY_FAMILY = 'Fraunces Poster'
const SANS_FAMILY = 'Jakarta Semi'
// Relative to the page, so it works under a sub-path such as GitHub Pages.
const FONT_FILES = [
  { family: DISPLAY_FAMILY, url: 'fonts/FrauncesPoster.ttf', weight: '800' },
  { family: SANS_FAMILY, url: 'fonts/JakartaSemi.ttf', weight: '600' },
]

// The weight in each string matches the FontFace descriptor, so the real face is never
// synthesised bolder, and the fallback lands at a close weight.
/** @param {number} size */
const displayFont = (size) => `800 ${size}px "${DISPLAY_FAMILY}", Georgia, "Times New Roman", serif`
/** @param {number} size */
const sansFont = (size) => `600 ${size}px "${SANS_FAMILY}", system-ui, -apple-system, "Segoe UI", Arial, sans-serif`
/**
 * @param {FontRole} role
 * @param {number} size
 */
const fontFor = (role, size) => (role === 'display' ? displayFont(size) : sansFont(size))

/** @type {Promise<boolean> | null} */
let fontsReady = null

/**
 * Load the two faces once. Resolves false (never rejects) when they cannot load.
 * @returns {Promise<boolean>}
 */
export function loadFonts() {
  if (!fontsReady) {
    fontsReady = (async () => {
      try {
        if (typeof FontFace === 'undefined' || !document.fonts) return false
        const base = document.baseURI
        const faces = FONT_FILES.map((f) => new FontFace(f.family, `url(${new URL(f.url, base).href})`, { weight: f.weight }))
        await Promise.all(faces.map((f) => f.load()))
        for (const f of faces) document.fonts.add(f)
        await Promise.all([document.fonts.load(displayFont(96)), document.fonts.load(sansFont(40))])
        return true
      } catch (err) {
        console.warn('[carousel] fonts did not load, using system fonts', err)
        return false
      }
    })()
  }
  return fontsReady
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
 * Draw one slide in 1080x1350 space. The caller sets any scale on the context first.
 * Returns true when the slide's end had to be cut (fitSlide's overflow).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {SlidePlan} slide
 * @param {Look} look
 * @param {string} bottomLine
 * @returns {boolean}
 */
export function drawSlide(ctx, slide, look, bottomLine) {
  const L = LAYOUT
  const x = L.margin
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = look.bg
  ctx.fillRect(0, 0, L.w, L.h)

  const fit = fitSlide((text, role, size, tracking) => {
    ctx.font = fontFor(role, size)
    setTracking(ctx, tracking)
    return ctx.measureText(text).width
  }, slide)

  for (const p of placeLines(fit)) {
    if (p.slot === 'eyebrow') {
      ctx.font = sansFont(p.size)
      setTracking(ctx, L.eyebrow.spacing)
      ctx.fillStyle = look.eyebrow
    } else if (p.slot === 'headline') {
      ctx.font = displayFont(p.size)
      setTracking(ctx, 0)
      ctx.fillStyle = look.ink
    } else {
      ctx.font = sansFont(p.size)
      setTracking(ctx, 0)
      ctx.fillStyle = look.body
    }
    ctx.fillText(p.text, x, p.y)
  }

  // Amber rule, then the user's bottom line under it (left blank when there is none).
  ctx.fillStyle = look.rule
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, L.rule.y, L.rule.w, L.rule.h, L.rule.h / 2)
  else ctx.rect(x, L.rule.y, L.rule.w, L.rule.h)
  ctx.fill()

  const line = bottomLine.trim()
  if (line) {
    ctx.font = sansFont(L.domain.size)
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
 * @param {Look} look
 * @param {string} bottomLine
 * @returns {boolean}
 */
export function drawPreview(canvas, slide, look, bottomLine) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0)
  return drawSlide(ctx, slide, look, bottomLine)
}

/**
 * One slide at full size, as a JPEG.
 * @param {SlidePlan} slide
 * @param {Look} look
 * @param {string} bottomLine
 * @returns {Promise<Blob>}
 */
export function renderJpeg(slide, look, bottomLine) {
  const canvas = document.createElement('canvas')
  canvas.width = LAYOUT.w
  canvas.height = LAYOUT.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas 2D is not available'))
  drawSlide(ctx, slide, look, bottomLine)
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
