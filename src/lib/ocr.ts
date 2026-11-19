import type { OcrLine } from './importers/screenshot'

/**
 * Local OCR with tesseract.js. Images never leave the device. The worker, WASM core and English language data
 * are served from this site's own /ocr folder (copied there at build time), so it also works offline.
 */
let workerPromise: Promise<any> | null = null
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const base = new URL('./ocr/', document.baseURI).toString()
      return createWorker('eng', 1, {
        workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true,
        workerBlobURL: false,
      })
    })()
  }
  return workerPromise
}

export async function downscale(file: Blob, maxSide = 2000): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c
}

export async function ocrImage(file: Blob): Promise<OcrLine[]> {
  const canvas = await downscale(file)
  const w = await getWorker()
  const { data } = await w.recognize(canvas, {}, { blocks: true })
  const out: OcrLine[] = []
  for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    out.push({ text: l.text.replace(/\s+/g, ' ').trim(), conf: l.confidence ?? 60, top: l.bbox.y0, bottom: l.bbox.y1, left: l.bbox.x0 })
  }
  if (!out.length && data.text) {
    let y = 0
    for (const t of String(data.text).split('\n')) { if (t.trim()) out.push({ text: t.trim(), conf: 60, top: y, bottom: y + 20, left: 0 }); y += t.trim() ? 24 : 40 }
  }
  return out
}

export async function jpegBase64(file: Blob, maxSide = 1568): Promise<string> {
  const c = await downscale(file, maxSide)
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}
