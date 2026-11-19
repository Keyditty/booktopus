// Copies the OCR engine + English language data from node_modules into public/ocr so the deployed site
// serves everything itself (no third-party CDN, works offline, images never leave the device).
import { mkdirSync, copyFileSync } from 'node:fs'
const out = 'public/ocr'
mkdirSync(out, { recursive: true })
const core = 'node_modules/tesseract.js-core/'
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) copyFileSync(core + f, `${out}/${f}`)
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
copyFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', `${out}/eng.traineddata.gz`)
console.log('OCR assets copied to', out)
