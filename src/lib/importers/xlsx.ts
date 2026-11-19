/**
 * Minimal .xlsx reader (no dependencies): an .xlsx file is a zip of XML parts. We read the first worksheet and the
 * shared-strings table and return rows of text, which then flow through the same CSV-style importers as everything else.
 * Not supported: old binary .xls (ask the user to "Save as .xlsx or .csv"), formulas' computed styles, multiple sheets (first sheet only).
 */
const dec = new TextDecoder('utf-8')

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf)
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('This doesn’t look like an Excel (.xlsx) file.')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true)
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true)
    const lho = dv.getUint32(p + 42, true)
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen))
    p += 46 + nlen + elen + clen
    if (!/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml)$/.test(name)) continue
    const dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true)
    const raw = u8.subarray(dataStart, dataStart + csize)
    out.set(name, method === 0 ? raw : await inflateRaw(raw))
  }
  return out
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&')
const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }

/** Excel stores dates as day counts since 1899-12-30. */
function serialToIso(n: number): string {
  const d = new Date(Math.round((n - 25569) * 86400) * 1000)
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export async function xlsxToRows(buf: ArrayBuffer): Promise<string[][]> {
  const parts = await unzip(buf)
  const sheetName = [...parts.keys()].filter((k) => k.startsWith('xl/worksheets/')).sort()[0]
  if (!sheetName) throw new Error('No worksheet found in this Excel file.')
  const shared = parts.has('xl/sharedStrings.xml')
    ? [...dec.decode(parts.get('xl/sharedStrings.xml')!).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : []
  const xml = dec.decode(parts.get(sheetName)!)
  const rows: string[][] = []
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? ''
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /t="(\w+)"/.exec(attrs)?.[1]
      let val = ''
      if (type === 's') val = shared[+(/<v>(\d+)<\/v>/.exec(body)?.[1] ?? -1)] ?? ''
      else if (type === 'inlineStr') val = textOf(body)
      else { const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]; val = v == null ? '' : unescapeXml(v) }
      const idx = ref ? colIndex(ref) : row.length
      while (row.length < idx) row.push('')
      row[idx] = val
    }
    rows.push(row)
  }
  // turn date serial numbers into readable dates in columns whose header looks like a date
  const head = (rows[0] ?? []).map((h) => h.toLowerCase())
  head.forEach((h, c) => {
    if (!/(date|time|timestamp|borrowed|returned|finished|started)/.test(h)) return
    for (let r = 1; r < rows.length; r++) { const v = rows[r][c]; if (v && /^\d{5}(\.\d+)?$/.test(v) && +v > 20000 && +v < 80000) rows[r][c] = serialToIso(+v) }
  })
  return rows
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export async function xlsxToCsv(buf: ArrayBuffer): Promise<string> { return rowsToCsv(await xlsxToRows(buf)) }
