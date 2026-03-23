import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const iconsDir = path.join(rootDir, 'public', 'icons')
const tmpDir = path.join(rootDir, '.tmp', 'icon-render')
const chromePath = process.env.CHROME_BIN || '/usr/bin/google-chrome'
const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let c = index
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  return c >>> 0
})

const renderJobs = [
  { source: 'pwa-icon.svg', output: 'pwa-512x512.png', size: 512 },
  { source: 'pwa-maskable.svg', output: 'maskable-512x512.png', size: 512 },
]

function htmlFor(svgMarkup) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #020617;
      }

      svg {
        display: block;
        width: 100vw;
        height: 100vh;
      }
    </style>
  </head>
  <body>
    ${svgMarkup}
  </body>
</html>`
}

await mkdir(tmpDir, { recursive: true })

for (const job of renderJobs) {
  const sourcePath = path.join(iconsDir, job.source)
  const htmlPath = path.join(tmpDir, `${job.output}.html`)
  const outputPath = path.join(iconsDir, job.output)
  const svgMarkup = await readFile(sourcePath, 'utf8')

  await writeFile(htmlPath, htmlFor(svgMarkup), 'utf8')

  await execFileAsync(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${job.size},${job.size}`,
      `--screenshot=${outputPath}`,
      htmlPath,
    ],
    { cwd: rootDir },
  )
}

const baseIcon = decodePng(await readFile(path.join(iconsDir, 'pwa-512x512.png')))

await writeFile(
  path.join(iconsDir, 'pwa-192x192.png'),
  encodePng(resizeImage(baseIcon, 192, 192)),
)

await writeFile(
  path.join(iconsDir, 'apple-touch-icon.png'),
  encodePng(resizeImage(baseIcon, 180, 180)),
)

console.log('Generated icons: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png, maskable-512x512.png')

function decodePng(buffer) {
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const idatParts = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    offset += 4
    const type = buffer.toString('ascii', offset, offset + 4)
    offset += 4
    const data = buffer.subarray(offset, offset + length)
    offset += length + 4

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const colorType = data[9]
      if (colorType !== 2) {
        throw new Error(`Unsupported PNG color type: ${colorType}`)
      }
      channels = 3
    } else if (type === 'IDAT') {
      idatParts.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  const raw = zlib.inflateSync(Buffer.concat(idatParts))
  const stride = width * channels
  const pixels = new Uint8Array(width * height * channels)
  let src = 0
  let dst = 0
  let prev = new Uint8Array(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[src]
    src += 1
    const row = Uint8Array.from(raw.subarray(src, src + stride))
    src += stride

    if (filter === 1) {
      for (let x = channels; x < stride; x += 1) row[x] = (row[x] + row[x - channels]) & 255
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + prev[x]) & 255
    } else if (filter === 3) {
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? row[x - channels] : 0
        row[x] = (row[x] + Math.floor((left + prev[x]) / 2)) & 255
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x += 1) {
        const a = x >= channels ? row[x - channels] : 0
        const b = prev[x]
        const c = x >= channels ? prev[x - channels] : 0
        row[x] = (row[x] + paeth(a, b, c)) & 255
      }
    }

    pixels.set(row, dst)
    dst += stride
    prev = row
  }

  return { width, height, channels, pixels }
}

function resizeImage(image, targetWidth, targetHeight) {
  const output = new Uint8Array(targetWidth * targetHeight * image.channels)
  const scaleX = image.width / targetWidth
  const scaleY = image.height / targetHeight

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y + 0.5) * scaleY - 0.5
    const y0 = clamp(Math.floor(sourceY), 0, image.height - 1)
    const y1 = clamp(y0 + 1, 0, image.height - 1)
    const wy = sourceY - y0

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x + 0.5) * scaleX - 0.5
      const x0 = clamp(Math.floor(sourceX), 0, image.width - 1)
      const x1 = clamp(x0 + 1, 0, image.width - 1)
      const wx = sourceX - x0

      const topLeft = (y0 * image.width + x0) * image.channels
      const topRight = (y0 * image.width + x1) * image.channels
      const bottomLeft = (y1 * image.width + x0) * image.channels
      const bottomRight = (y1 * image.width + x1) * image.channels
      const dest = (y * targetWidth + x) * image.channels

      for (let c = 0; c < image.channels; c += 1) {
        const top = image.pixels[topLeft + c] * (1 - wx) + image.pixels[topRight + c] * wx
        const bottom = image.pixels[bottomLeft + c] * (1 - wx) + image.pixels[bottomRight + c] * wx
        output[dest + c] = Math.round(top * (1 - wy) + bottom * wy)
      }
    }
  }

  return { width: targetWidth, height: targetHeight, channels: image.channels, pixels: output }
}

function encodePng(image) {
  const stride = image.width * image.channels
  const raw = Buffer.alloc((stride + 1) * image.height)

  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (stride + 1)
    raw[rowOffset] = 0
    raw.set(image.pixels.subarray(y * stride, (y + 1) * stride), rowOffset + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(image.width, 0)
  ihdr.writeUInt32BE(image.height, 4)
  ihdr[8] = 8
  ihdr[9] = image.channels === 3 ? 2 : 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crcBuffer = Buffer.concat([typeBuffer, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBuffer), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
