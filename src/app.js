/**
 * src/app.js: wiring. The slide tabs, the style bar, a deferred re-render, the warnings and
 * the download. Nothing is uploaded: the slides are drawn and saved in the browser.
 *
 *   - One tab per slide. Each tab holds its own text, where Enter is a line break, and its own
 *     font, background, bold and italic. "+ Slide", Remove, and move left or right edit the
 *     set; at most ten.
 *   - Import text pastes a whole post and splits it into tabs once (blank line = new slide),
 *     replacing what was there.
 */

import {
  BACKGROUNDS,
  BACKGROUND_IDS,
  BOTTOM_LINE_MAX,
  DEFAULT_BOTTOM_LINE,
  LAYOUT,
  MAX_SLIDES,
  newSlide,
  slideFileName,
  slidePlan,
  slidesFromText,
  splitIntoSlides,
  toSlide,
} from './plan.js'
import { PREVIEW_SCALE, canShareFiles, drawPreview, loadFonts, renderJpeg } from './render.js'

/** @typedef {import('./plan.js').Slide} Slide */
/** @typedef {import('./plan.js').SlideStyle} SlideStyle */

const PLACEHOLDER = `# 4 ways to post more without burning out

Write five posts in one sitting. Then schedule them all.

Reuse your best post. Give it a new first line.

Keep a list of ideas on your phone. Add one each day.

Pick two apps, not five. Do them well.`

const EXAMPLE_SLIDES = slidePlan(splitIntoSlides(PLACEHOLDER).slides)

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))

const importToggleEl = /** @type {HTMLButtonElement} */ ($('cm-import-toggle'))
const importEl = $('cm-import')
const importTextEl = /** @type {HTMLTextAreaElement} */ ($('cm-import-input'))
const importGoEl = /** @type {HTMLButtonElement} */ ($('cm-import-go'))
const tabsEl = $('cm-tabs')
const addEl = /** @type {HTMLButtonElement} */ ($('cm-add'))
const noticeEl = $('cm-notice')
const panelEl = $('cm-slide-panel')
const slideLabelEl = $('cm-slide-label')
const slideEl = /** @type {HTMLTextAreaElement} */ ($('cm-slide-input'))
const leftEl = /** @type {HTMLButtonElement} */ ($('cm-left'))
const rightEl = /** @type {HTMLButtonElement} */ ($('cm-right'))
const removeEl = /** @type {HTMLButtonElement} */ ($('cm-remove'))
const fontEls = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('[data-font]')])
const bgsEl = $('cm-bgs')
const boldEl = /** @type {HTMLButtonElement} */ ($('cm-bold'))
const italicEl = /** @type {HTMLButtonElement} */ ($('cm-italic'))
const bottomEl = /** @type {HTMLInputElement} */ ($('cm-bottom-line'))
const countEl = $('cm-count')
const exampleEl = $('cm-example')
const listEl = $('cm-slides')
const warnEl = $('cm-warnings')
const buttonEl = /** @type {HTMLButtonElement} */ ($('cm-download'))
const statusEl = $('cm-status')
const errorEl = $('cm-error')

importTextEl.placeholder = PLACEHOLDER
slideEl.placeholder = 'Your cover line'
bottomEl.maxLength = BOTTOM_LINE_MAX
bottomEl.value = DEFAULT_BOTTOM_LINE
$('cm-max').textContent = String(MAX_SLIDES)

// One swatch per background.
/** @type {HTMLButtonElement[]} */
const bgEls = BACKGROUND_IDS.map((id) => {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'swatch'
  b.setAttribute('role', 'radio')
  b.setAttribute('aria-label', BACKGROUNDS[id].label)
  b.title = BACKGROUNDS[id].label
  b.dataset.bg = id
  b.style.background = BACKGROUNDS[id].bg
  bgsEl.appendChild(b)
  return b
})

// Probed once with a stand-in file; the real files are checked again before sharing.
const shareable = canShareFiles([new File([new Uint8Array(1)], slideFileName(0), { type: 'image/jpeg' })])
const buttonLabel = shareable ? 'Save to phone' : 'Download all'
buttonEl.textContent = buttonLabel

let busy = false
/** @type {Slide[]} */
let slides = [newSlide()]
let active = 0

/** @param {Slide} s @returns {SlideStyle} */
const styleOf = (s) => ({ font: s.font, bg: s.bg, bold: s.bold, italic: s.italic })
const hasText = () => slides.some((s) => s.text.trim())

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
function setNotice(msg) {
  noticeEl.textContent = msg
}

/** @param {string} msg */
function warning(msg) {
  const p = document.createElement('p')
  p.className = 'warn'
  p.textContent = msg
  return p
}

/** The tabs and the editor for the open slide. */
function renderEditor() {
  while (tabsEl.children.length > slides.length) tabsEl.lastElementChild?.remove()
  while (tabsEl.children.length < slides.length) {
    const i = tabsEl.children.length
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip tab'
    b.id = `cm-tab-${i}`
    b.textContent = String(i + 1)
    b.setAttribute('role', 'tab')
    b.setAttribute('aria-controls', 'cm-slide-panel')
    b.setAttribute('aria-label', `Slide ${i + 1}`)
    b.addEventListener('click', () => selectTab(i))
    b.addEventListener('keydown', (e) => onTabKey(e, i))
    tabsEl.appendChild(b)
  }
  ;[...tabsEl.children].forEach((b, i) => {
    b.setAttribute('aria-selected', String(i === active))
    b.setAttribute('tabindex', i === active ? '0' : '-1')
  })
  panelEl.setAttribute('aria-labelledby', `cm-tab-${active}`)

  const s = slides[active]
  slideLabelEl.textContent = `Slide ${active + 1}`
  if (slideEl.value !== s.text) slideEl.value = s.text
  slideEl.placeholder = active === 0 ? 'Your cover line' : 'Type this slide'
  addEl.disabled = slides.length >= MAX_SLIDES
  leftEl.disabled = active === 0
  rightEl.disabled = active >= slides.length - 1
  removeEl.disabled = slides.length <= 1
  for (const b of fontEls) b.setAttribute('aria-checked', String(b.dataset.font === s.font))
  for (const b of bgEls) {
    const on = b.dataset.bg === s.bg
    b.setAttribute('aria-checked', String(on))
    b.textContent = on ? '✓' : ''
  }
  boldEl.setAttribute('aria-pressed', String(s.bold))
  italicEl.setAttribute('aria-pressed', String(s.italic))
}

/** The preview strip, the warnings and the download button. */
function render() {
  renderEditor()
  const isExample = !hasText()
  const shown = isExample ? EXAMPLE_SLIDES : slidePlan(slides.map((s) => toSlide(s.text)))
  // The example takes the open tab's style, so the style bar shows on it before any typing.
  const styles = isExample ? shown.map(() => styleOf(slides[active])) : slides.map(styleOf)
  const bottomLine = bottomEl.value

  countEl.textContent = isExample ? '' : ` (${shown.length})`
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
    const li = listEl.children[i]
    li.classList.toggle('is-active', !isExample && i === active)
    const canvas = /** @type {HTMLCanvasElement} */ (li.firstElementChild)
    canvas.setAttribute('aria-label', `Slide ${i + 1}: ${[s.headline, s.body].filter(Boolean).join(' ').replace(/\s+/g, ' ')}`)
    if (drawPreview(canvas, s, styles[i], bottomLine)) cut.push(i + 1)
  })

  warnEl.replaceChildren()
  if (!isExample) {
    for (const n of cut) warnEl.appendChild(warning(`Slide ${n} is too long, so the end is cut. Make it shorter, or move some to a new slide.`))
    slides.forEach((s, i) => {
      if (!s.text.trim()) warnEl.appendChild(warning(`Slide ${i + 1} is empty. Type in it, or remove it.`))
    })
  }

  buttonEl.disabled = busy || isExample
}

let frame = 0
function scheduleRender() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    render()
  })
}

/** @param {Partial<Slide>} patch */
function updateActive(patch) {
  slides = slides.map((s, i) => (i === active ? { ...s, ...patch } : s))
  scheduleRender()
}

/**
 * @param {number} i
 * @param {boolean} [focus]
 */
function selectTab(i, focus = false) {
  active = i
  render()
  if (focus) /** @type {HTMLElement} */ (tabsEl.children[i])?.focus()
}

/**
 * @param {KeyboardEvent} e
 * @param {number} i
 */
function onTabKey(e, i) {
  const n = slides.length
  const to =
    e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
  if (to < 0) return
  e.preventDefault()
  selectTab(to, true)
}

/** @param {-1 | 1} by */
function moveSlide(by) {
  const to = active + by
  if (to < 0 || to >= slides.length) return
  const next = [...slides]
  ;[next[active], next[to]] = [next[to], next[active]]
  slides = next
  active = to
  render()
}

function importSlides() {
  const made = slidesFromText(importTextEl.value, styleOf(slides[active]), { maxSlides: MAX_SLIDES })
  if (!made.slides.length) {
    setNotice('Paste some text first.')
    return
  }
  slides = made.slides
  active = 0
  importEl.hidden = true
  importToggleEl.setAttribute('aria-expanded', 'false')
  setNotice(
    made.dropped > 0
      ? `Only the first ${MAX_SLIDES} slides are kept. ${made.dropped} more did not fit.`
      : `Made ${made.slides.length} slide${made.slides.length === 1 ? '' : 's'}.`,
  )
  render()
}

/** @returns {Promise<File[]>} */
async function makeFiles() {
  await loadFonts()
  const bottomLine = bottomEl.value
  const plan = slidePlan(slides.map((s) => toSlide(s.text)))
  /** @type {File[]} */
  const files = []
  for (let i = 0; i < plan.length; i++) {
    const blob = await renderJpeg(plan[i], styleOf(slides[i]), bottomLine)
    files.push(new File([blob], slideFileName(i), { type: 'image/jpeg' }))
  }
  return files
}

/** @param {boolean} on */
function setBusy(on) {
  busy = on
  buttonEl.textContent = on ? 'Saving…' : buttonLabel
  buttonEl.disabled = on || !hasText()
}

async function downloadAll() {
  render()
  if (busy || !hasText()) return
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

importToggleEl.addEventListener('click', () => {
  importEl.hidden = !importEl.hidden
  importToggleEl.setAttribute('aria-expanded', String(!importEl.hidden))
  if (!importEl.hidden) importTextEl.focus()
})
importGoEl.addEventListener('click', importSlides)
slideEl.addEventListener('input', () => updateActive({ text: slideEl.value }))
addEl.addEventListener('click', () => {
  if (slides.length >= MAX_SLIDES) return
  slides = [...slides, newSlide('', styleOf(slides[active]))]
  active = slides.length - 1
  setNotice('')
  render()
  slideEl.focus()
})
removeEl.addEventListener('click', () => {
  if (slides.length <= 1) return
  slides = slides.filter((_, i) => i !== active)
  active = Math.min(active, slides.length - 1)
  setNotice('')
  render()
})
leftEl.addEventListener('click', () => moveSlide(-1))
rightEl.addEventListener('click', () => moveSlide(1))
for (const b of fontEls) b.addEventListener('click', () => updateActive({ font: b.dataset.font === 'sans' ? 'sans' : 'display' }))
for (const b of bgEls) b.addEventListener('click', () => updateActive({ bg: /** @type {any} */ (b.dataset.bg) }))
boldEl.addEventListener('click', () => updateActive({ bold: !slides[active].bold }))
italicEl.addEventListener('click', () => updateActive({ italic: !slides[active].italic }))
bottomEl.addEventListener('input', scheduleRender)
buttonEl.addEventListener('click', () => void downloadAll())

render()
// Draw again once the real faces arrive.
void loadFonts().then(() => render())
