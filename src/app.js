/**
 * src/app.js: wiring. Input events, a deferred re-render, the warnings and the download.
 * Nothing is uploaded: the slides are drawn and saved in the browser.
 */

import {
  BOTTOM_LINE_MAX,
  DEFAULT_BOTTOM_LINE,
  DEFAULT_LOOK,
  LAYOUT,
  LOOKS,
  MAX_SLIDES,
  slideFileName,
  slidePlan,
  splitIntoSlides,
} from './plan.js'
import { PREVIEW_SCALE, canShareFiles, drawPreview, loadFonts, renderJpeg } from './render.js'

const PLACEHOLDER = `# 4 ways to post more without burning out

Write five posts in one sitting. Then schedule them all.

Reuse your best post. Give it a new first line.

Keep a list of ideas on your phone. Add one each day.

Pick two apps, not five. Do them well.`

const EXAMPLE_SLIDES = slidePlan(splitIntoSlides(PLACEHOLDER).slides)
const look = LOOKS[DEFAULT_LOOK]

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))

const textEl = /** @type {HTMLTextAreaElement} */ ($('cm-text-input'))
const bottomEl = /** @type {HTMLInputElement} */ ($('cm-bottom-line'))
const countEl = $('cm-count')
const exampleEl = $('cm-example')
const listEl = $('cm-slides')
const warnEl = $('cm-warnings')
const buttonEl = /** @type {HTMLButtonElement} */ ($('cm-download'))
const statusEl = $('cm-status')
const errorEl = $('cm-error')

textEl.placeholder = PLACEHOLDER
bottomEl.maxLength = BOTTOM_LINE_MAX
bottomEl.value = DEFAULT_BOTTOM_LINE
$('cm-max').textContent = String(MAX_SLIDES)

// Probed once with a stand-in file; the real files are checked again before sharing.
const shareable = canShareFiles([new File([new Uint8Array(1)], slideFileName(0), { type: 'image/jpeg' })])
const buttonLabel = shareable ? 'Save to phone' : 'Download all'
buttonEl.textContent = buttonLabel

let busy = false
/** @type {import('./plan.js').SplitResult} */
let split = { slides: [], dropped: 0 }
/** @type {import('./plan.js').SlidePlan[]} */
let slides = []

/** @param {string} msg */
function setStatus(msg) {
  statusEl.textContent = msg
}

/** @param {string} msg */
function setError(msg) {
  errorEl.textContent = msg
  errorEl.hidden = !msg
}

/** @param {string} msg */
function warning(msg) {
  const p = document.createElement('p')
  p.className = 'warn'
  p.textContent = msg
  return p
}

function render() {
  const text = textEl.value
  const isExample = !text.trim()
  split = splitIntoSlides(text, { maxSlides: MAX_SLIDES })
  slides = slidePlan(split.slides)
  const shown = isExample ? EXAMPLE_SLIDES : slides
  const bottomLine = bottomEl.value

  countEl.textContent = isExample ? '' : ` (${slides.length})`
  exampleEl.hidden = !isExample
  listEl.classList.toggle('is-example', isExample)
  listEl.setAttribute('aria-label', isExample ? 'Example slides' : 'Slide preview')

  // Keep one canvas per slide; add or remove only what changed in number.
  while (listEl.children.length > shown.length) listEl.lastElementChild?.remove()
  while (listEl.children.length < shown.length) {
    const li = document.createElement('li')
    const canvas = document.createElement('canvas')
    canvas.width = LAYOUT.w * PREVIEW_SCALE
    canvas.height = LAYOUT.h * PREVIEW_SCALE
    canvas.setAttribute('role', 'img')
    li.appendChild(canvas)
    listEl.appendChild(li)
  }

  /** @type {number[]} */
  const cut = []
  shown.forEach((s, i) => {
    const canvas = /** @type {HTMLCanvasElement} */ (listEl.children[i].firstElementChild)
    canvas.setAttribute('aria-label', `Slide ${i + 1}: ${[s.headline, s.body].filter(Boolean).join(' ')}`)
    if (drawPreview(canvas, s, look, bottomLine)) cut.push(i + 1)
  })

  warnEl.replaceChildren()
  if (!isExample) {
    for (const n of cut) warnEl.appendChild(warning(`Slide ${n} is too long, so the end is cut. Make it shorter, or add a blank line.`))
    if (split.dropped > 0) {
      warnEl.appendChild(warning(`Only the first ${MAX_SLIDES} slides are kept. ${split.dropped} more did not fit.`))
    }
  }

  buttonEl.disabled = busy || isExample || slides.length === 0
}

let frame = 0
function scheduleRender() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    render()
  })
}

/** @returns {Promise<File[]>} */
async function makeFiles() {
  await loadFonts()
  const bottomLine = bottomEl.value
  /** @type {File[]} */
  const files = []
  for (let i = 0; i < slides.length; i++) {
    const blob = await renderJpeg(slides[i], look, bottomLine)
    files.push(new File([blob], slideFileName(i), { type: 'image/jpeg' }))
  }
  return files
}

/** @param {boolean} on */
function setBusy(on) {
  busy = on
  buttonEl.textContent = on ? 'Saving…' : buttonLabel
  buttonEl.disabled = on || !textEl.value.trim() || slides.length === 0
}

async function downloadAll() {
  render()
  if (busy || !textEl.value.trim() || slides.length === 0) return
  setBusy(true)
  setError('')
  setStatus('Making your slides…')
  try {
    const files = await makeFiles()
    if (canShareFiles(files)) {
      try {
        await navigator.share({ files })
        setStatus('')
        return
      } catch (err) {
        // The user closed the sheet: nothing to report. Anything else falls back to downloads.
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus('')
          return
        }
      }
    }
    for (const file of files) {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      // A short gap, so the browser treats them as separate downloads.
      await new Promise((r) => setTimeout(r, 250))
    }
    setStatus(`Sent ${files.length} slide${files.length === 1 ? '' : 's'} to your downloads. If your browser asks, choose Allow.`)
  } catch (err) {
    console.error('[carousel] download failed', err)
    setStatus('')
    setError('We could not make the files. Try again.')
  } finally {
    setBusy(false)
  }
}

textEl.addEventListener('input', scheduleRender)
bottomEl.addEventListener('input', scheduleRender)
buttonEl.addEventListener('click', () => void downloadAll())

render()
// Draw again once the real faces arrive.
void loadFonts().then(() => render())
