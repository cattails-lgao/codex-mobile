// 项目 ZIP 打包/解析核心（D 批）。从 codexAppServerBridge.ts 平移导出流 + 底层
// parse 的原生 ZIP（store 风格）实现；会话编排（importProjectZip /
// collectProjectChatZipEntries）依赖 session/thread 状态，留待 E 批 session 切片
// 一并迁移。共享路径工具 isSameOrDescendantPath 划归 ./core.js。
import { createReadStream } from 'node:fs'
import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { once } from 'node:events'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isSameOrDescendantPath, runCommandCapture, runCommandCaptureRaw } from './core.js'

export const PROJECT_ZIP_SKIPPED_NAMES = new Set([
  '.build',
  '.cache',
  '.coverage',
  '.DS_Store',
  '.eggs',
  '.eslintcache',
  '.gradle',
  '.git',
  '.ipynb_checkpoints',
  '.mypy_cache',
  '.next',
  '.nox',
  '.nuxt',
  '.nyc_output',
  '.parcel-cache',
  '.pytest_cache',
  '.ruff_cache',
  '.svelte-kit',
  '.turbo',
  '.tox',
  '.venv',
  '.vite',
  '__pycache__',
  'bin',
  'build',
  'coverage',
  'DerivedData',
  'dist',
  'htmlcov',
  'node_modules',
  'obj',
  'target',
  'venv',
])

export type ZipCentralDirectoryEntry = {
  path: string
  crc32: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
  dosTime: number
  dosDate: number
  externalAttributes: number
  isDirectory: boolean
}

export type ProjectZipVirtualEntry = {
  path: string
  data?: Buffer
  filePath?: string
  mtime: Date
}

export type ParsedProjectZipEntry = {
  path: string
  data: Buffer
  isDirectory: boolean
}

const ZIP_CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < ZIP_CRC_TABLE.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
  }
  ZIP_CRC_TABLE[index] = value >>> 0
}

function updateZipCrc32(crc: number, chunk: Buffer): number {
  let value = crc
  for (let index = 0; index < chunk.length; index += 1) {
    value = (value >>> 8) ^ ZIP_CRC_TABLE[(value ^ chunk[index]) & 0xff]
  }
  return value >>> 0
}

function toDosDateTime(date: Date): { dosDate: number; dosTime: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)
  return {
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
    dosTime: (hours << 11) | (minutes << 5) | seconds,
  }
}

function assertZipUInt32(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} is too large for ZIP export`)
  }
}

function assertZipEntryCount(value: number): void {
  if (value > 0xffff) {
    throw new Error('Project has too many files for ZIP export')
  }
}

function addZipOffset(offset: number, size: number): number {
  const next = offset + size
  assertZipUInt32(next, 'ZIP archive')
  return next
}

function writeZipUInt32(buffer: Buffer, value: number, offset: number): void {
  buffer.writeUInt32LE(value >>> 0, offset)
}

function buildZipLocalHeader(path: string, timestamp: Date): Buffer {
  const name = Buffer.from(path, 'utf8')
  const { dosDate, dosTime } = toDosDateTime(timestamp)
  const header = Buffer.alloc(30 + name.length)
  writeZipUInt32(header, 0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x0808, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt16LE(dosTime, 10)
  header.writeUInt16LE(dosDate, 12)
  header.writeUInt16LE(name.length, 26)
  name.copy(header, 30)
  return header
}

function buildZipDataDescriptor(crc32: number, size: number): Buffer {
  assertZipUInt32(size, 'Project file')
  const descriptor = Buffer.alloc(16)
  writeZipUInt32(descriptor, 0x08074b50, 0)
  writeZipUInt32(descriptor, crc32, 4)
  writeZipUInt32(descriptor, size, 8)
  writeZipUInt32(descriptor, size, 12)
  return descriptor
}

function buildZipCentralHeader(entry: ZipCentralDirectoryEntry): Buffer {
  assertZipUInt32(entry.localHeaderOffset, 'ZIP local header offset')
  const name = Buffer.from(entry.path, 'utf8')
  const header = Buffer.alloc(46 + name.length)
  writeZipUInt32(header, 0x02014b50, 0)
  header.writeUInt16LE(0x0314, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0808, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(entry.dosTime, 12)
  header.writeUInt16LE(entry.dosDate, 14)
  writeZipUInt32(header, entry.crc32, 16)
  writeZipUInt32(header, entry.compressedSize, 20)
  writeZipUInt32(header, entry.uncompressedSize, 24)
  header.writeUInt16LE(name.length, 28)
  writeZipUInt32(header, entry.externalAttributes, 38)
  writeZipUInt32(header, entry.localHeaderOffset, 42)
  name.copy(header, 46)
  return header
}

function buildZipEndOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  assertZipUInt32(centralSize, 'ZIP central directory')
  assertZipUInt32(centralOffset, 'ZIP central directory offset')
  assertZipEntryCount(entryCount)
  const footer = Buffer.alloc(22)
  writeZipUInt32(footer, 0x06054b50, 0)
  footer.writeUInt16LE(entryCount, 8)
  footer.writeUInt16LE(entryCount, 10)
  writeZipUInt32(footer, centralSize, 12)
  writeZipUInt32(footer, centralOffset, 16)
  return footer
}

function toZipEntryPath(root: string, absolutePath: string, isDirectory: boolean): string {
  const path = relative(root, absolutePath).split(sep).join('/')
  return isDirectory && !path.endsWith('/') ? `${path}/` : path
}

async function writeZipChunk(res: ServerResponse, chunk: Buffer): Promise<void> {
  if (res.destroyed || res.writableEnded) {
    throw new Error('Response closed during ZIP export')
  }
  if (!res.write(chunk)) {
    await Promise.race([
      once(res, 'drain'),
      once(res, 'close').then(() => {
        throw new Error('Response closed during ZIP export')
      }),
      once(res, 'error').then(([error]) => {
        throw error instanceof Error ? error : new Error('Response failed during ZIP export')
      }),
    ])
  }
}

type ProjectZipIgnoreMatcher = {
  isIgnored: (path: string) => boolean
}

async function createProjectZipIgnoreMatcher(root: string): Promise<ProjectZipIgnoreMatcher> {
  try {
    const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: root })
    const rawIgnored = await runCommandCaptureRaw(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
      { cwd: gitRoot },
    )
    const ignoredPaths = rawIgnored
      .split('\0')
      .filter(Boolean)
      .map((entry) => resolve(gitRoot, entry))
    return {
      isIgnored(path) {
        return ignoredPaths.some((ignoredPath) => isSameOrDescendantPath(path, ignoredPath))
      },
    }
  } catch {
    return { isIgnored: () => false }
  }
}

async function* walkProjectZipEntries(
  root: string,
  ignoreMatcher: ProjectZipIgnoreMatcher,
  current = root,
): AsyncGenerator<{ path: string; isDirectory: boolean; mtime: Date }> {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (PROJECT_ZIP_SKIPPED_NAMES.has(entry.name)) continue
    const absolutePath = join(current, entry.name)
    if (ignoreMatcher.isIgnored(absolutePath)) continue
    const info = await lstat(absolutePath)
    if (info.isSymbolicLink()) continue
    if (info.isDirectory()) {
      yield { path: absolutePath, isDirectory: true, mtime: info.mtime }
      yield* walkProjectZipEntries(root, ignoreMatcher, absolutePath)
    } else if (info.isFile()) {
      yield { path: absolutePath, isDirectory: false, mtime: info.mtime }
    }
  }
}

async function writeProjectZipEntry(
  res: ServerResponse,
  centralEntries: ZipCentralDirectoryEntry[],
  offset: number,
  entry: { zipPath: string; mtime: Date; isDirectory: boolean; chunks: AsyncIterable<Buffer> },
): Promise<number> {
  if (!entry.zipPath) return offset
  const localHeaderOffset = offset
  const localHeader = buildZipLocalHeader(entry.zipPath, entry.mtime)
  await writeZipChunk(res, localHeader)
  offset = addZipOffset(offset, localHeader.length)

  let crc = 0xffffffff
  let size = 0
  if (!entry.isDirectory) {
    for await (const buffer of entry.chunks) {
      crc = updateZipCrc32(crc, buffer)
      size += buffer.length
      assertZipUInt32(size, 'Project file')
      await writeZipChunk(res, buffer)
      offset = addZipOffset(offset, buffer.length)
    }
  }

  const crc32 = (crc ^ 0xffffffff) >>> 0
  const descriptor = buildZipDataDescriptor(crc32, size)
  await writeZipChunk(res, descriptor)
  offset = addZipOffset(offset, descriptor.length)

  assertZipEntryCount(centralEntries.length + 1)
  const { dosDate, dosTime } = toDosDateTime(entry.mtime)
  centralEntries.push({
    path: entry.zipPath,
    crc32,
    compressedSize: size,
    uncompressedSize: size,
    localHeaderOffset,
    dosDate,
    dosTime,
    externalAttributes: entry.isDirectory ? 0x10 : 0,
    isDirectory: entry.isDirectory,
  })
  return offset
}

async function* singleZipBufferChunk(data: Buffer): AsyncGenerator<Buffer> {
  yield data
}

export async function streamProjectZip(root: string, res: ServerResponse, virtualEntries: ProjectZipVirtualEntry[] = []): Promise<void> {
  const centralEntries: ZipCentralDirectoryEntry[] = []
  let offset = 0
  const ignoreMatcher = await createProjectZipIgnoreMatcher(root)

  for await (const entry of walkProjectZipEntries(root, ignoreMatcher)) {
    const zipPath = toZipEntryPath(root, entry.path, entry.isDirectory)
    if (zipPath === '.codex-project/manifest.json') continue
    offset = await writeProjectZipEntry(res, centralEntries, offset, {
      zipPath,
      mtime: entry.mtime,
      isDirectory: entry.isDirectory,
      chunks: entry.isDirectory ? singleZipBufferChunk(Buffer.alloc(0)) : createReadStream(entry.path) as AsyncIterable<Buffer>,
    })
  }

  for (const entry of virtualEntries) {
    offset = await writeProjectZipEntry(res, centralEntries, offset, {
      zipPath: entry.path,
      mtime: entry.mtime,
      isDirectory: false,
      chunks: entry.filePath ? createReadStream(entry.filePath) as AsyncIterable<Buffer> : singleZipBufferChunk(entry.data ?? Buffer.alloc(0)),
    })
  }

  const centralOffset = offset
  let centralSize = 0
  for (const entry of centralEntries) {
    const header = buildZipCentralHeader(entry)
    await writeZipChunk(res, header)
    centralSize = addZipOffset(centralSize, header.length)
    offset = addZipOffset(offset, header.length)
  }
  const footer = buildZipEndOfCentralDirectory(centralEntries.length, centralSize, centralOffset)
  await writeZipChunk(res, footer)
}

export function toProjectZipFileName(cwd: string): string {
  const rawName = basename(cwd) || 'project'
  const safeName = rawName.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
  return `${safeName}.zip`
}

export function setProjectZipHeaders(res: ServerResponse, fileName: string): void {
  const encodedName = encodeURIComponent(fileName)
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`)
  res.setHeader('Cache-Control', 'private, no-store')
}

export async function resolveAllowedProjectZipCwd(rawCwd: string): Promise<string> {
  const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
  const cwdInfo = await stat(cwd)
  if (!cwdInfo.isDirectory()) {
    throw new Error('cwd is not a directory')
  }
  return await realpath(cwd)
}

function readZipUInt16(buffer: Buffer, offset: number): number {
  if (offset + 2 > buffer.length) throw new Error('Invalid project ZIP')
  return buffer.readUInt16LE(offset)
}

function readZipUInt32(buffer: Buffer, offset: number): number {
  if (offset + 4 > buffer.length) throw new Error('Invalid project ZIP')
  return buffer.readUInt32LE(offset)
}

export function normalizeImportedZipPath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/u, '')
  const segments = normalized.endsWith('/') ? normalized.slice(0, -1).split('/') : normalized.split('/')
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Project ZIP contains an unsafe path')
  }
  return normalized
}

export function parseStoredProjectZip(buffer: Buffer): ParsedProjectZipEntry[] {
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const eocdOffset = buffer.lastIndexOf(eocdSignature)
  if (eocdOffset < 0) throw new Error('Project ZIP is missing a central directory')
  const entryCount = readZipUInt16(buffer, eocdOffset + 10)
  const centralOffset = readZipUInt32(buffer, eocdOffset + 16)
  const entries: ParsedProjectZipEntry[] = []
  let cursor = centralOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (readZipUInt32(buffer, cursor) !== 0x02014b50) throw new Error('Project ZIP central directory is invalid')
    const method = readZipUInt16(buffer, cursor + 10)
    if (method !== 0) throw new Error('Project ZIP import only supports stored entries')
    const compressedSize = readZipUInt32(buffer, cursor + 20)
    const fileNameLength = readZipUInt16(buffer, cursor + 28)
    const extraLength = readZipUInt16(buffer, cursor + 30)
    const commentLength = readZipUInt16(buffer, cursor + 32)
    const externalAttributes = readZipUInt32(buffer, cursor + 38)
    const localHeaderOffset = readZipUInt32(buffer, cursor + 42)
    const rawPath = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8')
    const path = normalizeImportedZipPath(rawPath)
    const isDirectory = path.endsWith('/') || ((externalAttributes >>> 4) & 0x10) === 0x10

    if (readZipUInt32(buffer, localHeaderOffset) !== 0x04034b50) throw new Error('Project ZIP local header is invalid')
    const localNameLength = readZipUInt16(buffer, localHeaderOffset + 26)
    const localExtraLength = readZipUInt16(buffer, localHeaderOffset + 28)
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
    entries.push({
      path,
      data: isDirectory ? Buffer.alloc(0) : buffer.subarray(dataOffset, dataOffset + compressedSize),
      isDirectory,
    })
    cursor += 46 + fileNameLength + extraLength + commentLength
  }
  return entries
}