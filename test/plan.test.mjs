/**
 * The pure planner: split, wrap and fit (with a fake measure, no canvas), the slide plan and
 * the placement. Plus canShareFiles, the Save to phone vs Download all choice.
 * Run with `node --test`.
 */
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BODY_CHAR_BUDGET,
  LAYOUT,
  MAX_SLIDES,
  carouselName,
  fitSlide,
  newSlide,
  placeLines,
  slideFileName,
  slidePlan,
  slidesFromText,
  splitIntoSlides,
  toSlide,
  wrapLines,
} from '../src/plan.js'
import { canShareFiles } from '../src/render.js'

/** Every character 10px wide. */
const measure = (s) => s.length * 10

describe('splitIntoSlides', () => {
  it('a first line written as a heading is the cover; blank lines split slides', () => {
    const { slides } = splitIntoSlides('# Five ways to post more\n\nWrite in batches.\n\nReuse your best post.')
    assert.deepEqual(slides, [
      { headline: 'Five ways to post more', body: '' },
      { headline: 'Write in batches.', body: '' },
      { headline: 'Reuse your best post.', body: '' },
    ])
  })

  it('a bare hashtag is not a heading', () => {
    assert.deepEqual(splitIntoSlides('#tbt to our first shop').slides[0], { headline: '#tbt to our first shop', body: '' })
  })

  it('a single line break stays inside the slide; only a blank line splits', () => {
    assert.deepEqual(splitIntoSlides('One\nTwo\nThree').slides, [{ headline: 'One', body: 'Two\nThree' }])
    assert.equal(splitIntoSlides('line\nline').slides.length, 1)
    assert.deepEqual(splitIntoSlides('a\n\nb').slides, [
      { headline: 'a', body: '' },
      { headline: 'b', body: '' },
    ])
  })

  it('a long block of short lines splits between lines, never inside one', () => {
    const line = 'Twenty-five characters ok'
    const { slides } = splitIntoSlides(Array(8).fill(line).join('\n'))
    assert.ok(slides.length > 1)
    for (const s of slides) for (const l of [s.headline, ...s.body.split('\n')]) assert.equal(l, line)
  })

  it('a long block leads with its first sentence', () => {
    const { slides } = splitIntoSlides(
      'Batch your writing. Sit down once a week and write five posts, then schedule them all so the week runs itself.',
    )
    assert.deepEqual(slides, [
      { headline: 'Batch your writing.', body: 'Sit down once a week and write five posts, then schedule them all so the week runs itself.' },
    ])
  })

  it('a paragraph over the body budget splits at sentence ends', () => {
    const sentence = 'This sentence is about fifty characters long, ok.'
    const { slides } = splitIntoSlides(Array(8).fill(sentence).join(' '))
    assert.ok(slides.length > 1)
    for (const s of slides) {
      const text = [s.headline, s.body].filter(Boolean).join(' ')
      assert.ok(text.length <= BODY_CHAR_BUDGET)
      assert.equal(text.endsWith('ok.'), true)
    }
  })

  it('keeps at most 10 slides and counts the rest', () => {
    const text = Array.from({ length: 13 }, (_, i) => `Slide ${i + 1}`).join('\n\n')
    const { slides, dropped } = splitIntoSlides(text)
    assert.equal(slides.length, 10)
    assert.equal(dropped, 3)
    assert.deepEqual(splitIntoSlides(''), { slides: [], dropped: 0 })
  })
})

describe("toSlide (one tab's text)", () => {
  it('two or more lines: a short first line is the headline, the rest the body; a long first line is all body', () => {
    assert.deepEqual(toSlide('Title\nLine one\nLine two'), { headline: 'Title', body: 'Line one\nLine two' })
    const long = 'A first line that is much too long to sit in the headline slot.'
    assert.deepEqual(toSlide(long + '\nNext'), { headline: '', body: long + '\nNext' })
    assert.deepEqual(toSlide('Short one line'), { headline: 'Short one line', body: '' })
  })
})

describe('slidesFromText (Import text)', () => {
  it('splits once into styled tabs, keeping line breaks and the cover, capped at ten', () => {
    const style = { font: 'sans', bg: 'sand', bold: true, italic: false }
    const { slides, dropped } = slidesFromText('# Cover\n\nOne\nTwo\n\nThree', style)
    assert.deepEqual(slides, [
      { text: 'Cover', ...style },
      { text: 'One\nTwo', ...style },
      { text: 'Three', ...style },
    ])
    assert.equal(dropped, 0)
    const many = slidesFromText(Array.from({ length: 12 }, (_, i) => 'S' + i).join('\n\n'))
    assert.deepEqual([many.slides.length, many.dropped], [MAX_SLIDES, 2])
    assert.deepEqual(many.slides[0], newSlide('S0'))
  })
})

describe('wrapLines', () => {
  it('honours line breaks: each segment wraps on its own, a blank line stays, all count against maxLines', () => {
    assert.deepEqual(wrapLines(measure, 'aaa bbb ccc\nddd\n\neee', 70, 6), { lines: ['aaa bbb', 'ccc', 'ddd', '', 'eee'], overflow: false })
    assert.deepEqual(wrapLines(measure, 'a\nb\nc', 70, 2), { lines: ['a', 'b…'], overflow: true })
  })

  it('wraps by measured width', () => {
    assert.deepEqual(wrapLines(measure, 'aaa bbb ccc ddd', 70, 4), { lines: ['aaa bbb', 'ccc ddd'], overflow: false })
  })

  it('ends the last kept line with an ellipsis that still fits', () => {
    const r = wrapLines(measure, 'aaa bbb ccc ddd eee fff', 70, 2)
    assert.equal(r.overflow, true)
    assert.equal(r.lines.length, 2)
    assert.equal(r.lines[1].endsWith('…'), true)
    assert.ok(measure(r.lines[1]) <= 70)
  })

  it('breaks a word wider than the line', () => {
    assert.deepEqual(wrapLines(measure, 'abcdefghij', 40, 5).lines, ['abcd', 'efgh', 'ij'])
  })
})

describe('slidePlan', () => {
  it('cover, body, last, with step eyebrows and no counter', () => {
    const plan = slidePlan([
      { headline: 'Cover', body: '' },
      { headline: 'Two', body: '' },
      { headline: 'Three', body: '' },
    ])
    assert.deepEqual(
      plan.map((p) => [p.kind, p.eyebrow]),
      [
        ['cover', 'SWIPE'],
        ['body', '01'],
        ['last', '02'],
      ],
    )
    assert.equal(plan.every((p) => !('counter' in p)), true)
  })

  it('a single slide has no SWIPE', () => {
    const [only] = slidePlan([{ headline: 'Solo', body: '' }])
    assert.equal(only.kind, 'cover')
    assert.equal(only.eyebrow, '')
  })

  it('names the carousel after the cover headline, else "Carousel"; files are carousel-01.jpg on', () => {
    assert.equal(carouselName([{ headline: 'Five ways', body: '' }]), 'Five ways')
    assert.equal(carouselName([{ headline: '', body: 'Only body' }]), 'Carousel')
    assert.deepEqual([0, 9].map(slideFileName), ['carousel-01.jpg', 'carousel-10.jpg'])
  })
})

describe('fitSlide', () => {
  /** Width = characters x half the font size: 96px fits 18 a line, 72px 25, body 40px 45. */
  const roleMeasure = (s, _role, size) => s.length * size * 0.5
  const plan = (headline, body = '') => slidePlan([{ headline, body }])[0]

  it('a headline that fits sets no overflow; one that needs a smaller size steps down', () => {
    const short = fitSlide(roleMeasure, plan('Short headline'))
    assert.equal(short.headlineSize, 96)
    assert.equal(short.overflow, false)
    const stepped = fitSlide(roleMeasure, plan('A cover line that runs a little bit too long for the biggest size here'))
    assert.equal(stepped.overflow, false)
    assert.ok(stepped.headlineSize < 96)
  })

  it('a headline past three lines at the smallest size, or a body past four lines, is flagged', () => {
    assert.equal(fitSlide(roleMeasure, plan('word '.repeat(40).trim())).overflow, true)
    assert.equal(fitSlide(roleMeasure, plan('', 'word '.repeat(60).trim())).overflow, true)
  })

  it('the split keeps every slide inside the 140-character body budget', () => {
    assert.equal(BODY_CHAR_BUDGET, 140)
  })
})

describe('placeLines', () => {
  it('keeps a full headline and body above the amber rule', () => {
    const placed = placeLines({ eyebrow: '01', headline: ['a', 'b', 'c'], headlineSize: 96, body: ['1', '2', '3', '4'] })
    assert.equal(placed[0].slot, 'eyebrow')
    assert.equal(placed[0].y, LAYOUT.eyebrow.y)
    assert.ok(placed[placed.length - 1].y < LAYOUT.rule.y)
  })
})

describe('canShareFiles (Save to phone vs Download all)', () => {
  const files = [new File([new Uint8Array(1)], 'carousel-01.jpg', { type: 'image/jpeg' })]
  /** @type {[string, PropertyDescriptor | undefined][]} */
  let saved = []

  /** Replace a global for one test; afterEach puts the original back. */
  function stubGlobal(name, value) {
    saved.push([name, Object.getOwnPropertyDescriptor(globalThis, name)])
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }

  function device(pointer) {
    stubGlobal('navigator', { share: () => {}, canShare: () => true })
    stubGlobal('window', { matchMedia: (q) => ({ matches: q === `(pointer: ${pointer})` }) })
  }

  afterEach(() => {
    for (const [name, desc] of saved.reverse()) {
      if (desc) Object.defineProperty(globalThis, name, desc)
      else delete globalThis[name]
    }
    saved = []
  })

  it('a PC that can share files still downloads (fine pointer)', () => {
    device('fine')
    assert.equal(canShareFiles(files), false)
  })

  it('a touch device that can share files gets the share sheet (coarse pointer)', () => {
    device('coarse')
    assert.equal(canShareFiles(files), true)
  })

  it('no matchMedia means download', () => {
    stubGlobal('navigator', { share: () => {}, canShare: () => true })
    stubGlobal('window', {})
    assert.equal(canShareFiles(files), false)
  })
})
