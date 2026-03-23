import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const iconsDir = path.join(rootDir, 'public', 'icons')

const jobs = [
  { source: 'pwa-icon.svg', output: 'pwa-192x192.png', size: 192 },
  { source: 'pwa-icon.svg', output: 'pwa-512x512.png', size: 512 },
  { source: 'pwa-icon.svg', output: 'apple-touch-icon.png', size: 180 },
  { source: 'pwa-maskable.svg', output: 'maskable-512x512.png', size: 512 },
]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.setContent('<!doctype html><html><body></body></html>')

for (const job of jobs) {
  const svgMarkup = await readFile(path.join(iconsDir, job.source), 'utf8')
  const pngBase64 = await page.evaluate(async ({ svgMarkup, size }) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable')

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to load SVG into canvas'))
        img.src = url
      })

      context.clearRect(0, 0, size, size)
      context.drawImage(image, 0, 0, size, size)

      return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
    } finally {
      URL.revokeObjectURL(url)
    }
  }, { svgMarkup, size: job.size })

  await writeFile(path.join(iconsDir, job.output), Buffer.from(pngBase64, 'base64'))
}

await browser.close()

console.log('Generated icons:', jobs.map((job) => job.output).join(', '))
