import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * External-session liveness tracker.
 *
 * The Codex web UI learns thread state exclusively through app-server RPC. A
 * standalone `codex` TUI writes session JSONL files directly, so the app-server
 * materializes those threads as `notLoaded` and marks in-flight turns as
 * `interrupted` — the web UI therefore never shows "working" for them.
 *
 * This tracker overlays "external session activity" on top of the app-server
 * data without mutating it: for each session log under `$CODEX_HOME/sessions`
 * whose `session_meta.originator` is an external origin (codex-tui /
 * codex_cli_rs), it watches for an unclosed `task_started` turn and a recently
 * written file. When both hold, the thread is reported as actively working.
 *
 * Session logs can be several MB, so files are parsed incrementally: only the
 * appended bytes are read on each poll, and each file's byte offset is cached.
 *
 * Env config:
 *   CODEXUI_EXTERNAL_SESSION_TRACKING  master switch, default on
 *   CODEXUI_EXTERNAL_WINDOW_MS         liveness window, default 30000
 *   CODEXUI_EXTERNAL_POLL_MS           poll interval, default 3000
 *   CODEXUI_EXTERNAL_ORIGINS           comma-separated origins, default
 *                                      `codex-tui,codex_cli_rs`
 */

export type ExternalSessionInfo = {
    /** originator value read from the session's `session_meta` line. */
    origin: string;
    /** True when an unclosed turn exists AND the file was written recently. */
    active: boolean;
    /** ISO timestamp of the last observed file write, or null when unknown. */
    lastWriteAt: string | null;
};

export type ExternalSessionChangedEvent = {
    method: "externalSessionChanged";
    params: {
        threadId: string;
        externalSession: ExternalSessionInfo;
    };
    atIso: string;
};

type ExternalSessionListener = (event: ExternalSessionChangedEvent) => void;

type TrackedSession = {
    path: string;
    sessionId: string;
    originator: string;
    threadSource: string | null;
    /** Parent thread id when the session declares one (subagent rollouts). */
    parentThreadId: string | null;
    /** True when originator matches the configured external origins. */
    external: boolean;
    /** Turn ids with `task_started` that have not been closed yet. */
    openTurnIds: Set<string>;
    /** Byte offset into the file that has already been parsed. */
    readOffset: number;
    /** Last observed file size in bytes. */
    size: number;
    /** File mtime in epoch milliseconds (last write). */
    mtimeMs: number;
    /** Partial trailing JSONL line carried over between reads. */
    pendingTail: string;
    /** Last active value emitted to listeners (false on discovery). */
    lastEmittedActive: boolean;
};

export type ExternalSessionTrackerOptions = {
    sessionsDir?: string;
    /** Master switch; defaults to the CODEXUI_EXTERNAL_SESSION_TRACKING env. */
    enabled?: boolean;
    /** Liveness window; active turns older than this (no writes) go idle. */
    windowMs?: number;
    /** Poll interval for appended bytes and directory discovery. */
    pollMs?: number;
    /** Originators treated as external sessions. */
    externalOrigins?: string[];
    /** Injectable clock for deterministic tests. */
    now?: () => number;
};

const DEFAULT_WINDOW_MS = 30_000;
const DEFAULT_POLL_MS = 3_000;
const DEFAULT_EXTERNAL_ORIGINS = ["codex-tui", "codex_cli_rs"];
const ARCHIVED_SESSIONS_DIR = "archived_sessions";

function readEnabledFromEnv(): boolean {
    const raw =
        process.env.CODEXUI_EXTERNAL_SESSION_TRACKING?.trim().toLowerCase();
    if (!raw) return true;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readIntFromEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOriginsFromEnv(): string[] | null {
    const raw = process.env.CODEXUI_EXTERNAL_ORIGINS?.trim();
    if (!raw) return null;
    const origins = raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    return origins.length > 0 ? origins : null;
}

function parseRecord(line: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(line) as unknown;
        if (
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
        ) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Malformed lines are skipped; partial writes are carried in pendingTail.
    }
    return null;
}

function isRolloutFile(fileName: string): boolean {
    return (
        fileName.toLowerCase().startsWith("rollout-") &&
        fileName.toLowerCase().endsWith(".jsonl")
    );
}

function isArchivedPath(relativeDir: string): boolean {
    return relativeDir
        .split(/[\\/]/u)
        .some((segment) => segment.toLowerCase() === ARCHIVED_SESSIONS_DIR);
}

function readNonEmptyString(value: unknown): string {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

export class ExternalSessionTracker {
    private readonly sessionsDir: string;
    private readonly windowMs: number;
    private readonly pollMs: number;
    private readonly enabled: boolean;
    private readonly externalOrigins: ReadonlySet<string>;
    private readonly now: () => number;
    /** Per-file parse state, keyed by absolute path. */
    private readonly sessionsByPath = new Map<string, TrackedSession>();
    /** Lookup index threadId (= session_id) -> tracked session. */
    private readonly sessionByThreadId = new Map<string, TrackedSession>();
    private readonly listeners = new Set<ExternalSessionListener>();
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private ticking = false;
    private tickingPromise: Promise<void> | null = null;
    private disposed = false;

    constructor(options: ExternalSessionTrackerOptions = {}) {
        this.sessionsDir =
            options.sessionsDir ?? join(getCodexHomeDir(), "sessions");
        this.windowMs =
            options.windowMs ??
            readIntFromEnv("CODEXUI_EXTERNAL_WINDOW_MS", DEFAULT_WINDOW_MS);
        this.pollMs =
            options.pollMs ??
            readIntFromEnv("CODEXUI_EXTERNAL_POLL_MS", DEFAULT_POLL_MS);
        this.enabled = options.enabled ?? readEnabledFromEnv();
        const configuredOrigins =
            options.externalOrigins ?? readOriginsFromEnv();
        this.externalOrigins = new Set(
            configuredOrigins ?? DEFAULT_EXTERNAL_ORIGINS,
        );
        this.now = options.now ?? (() => Date.now());
    }

    start(): void {
        if (this.disposed || this.pollTimer) return;
        if (this.enabled) {
            void this.tick();
        }
        this.pollTimer = setTimeout(() => this.pollLoop(), this.pollMs);
    }

    stop(): void {
        this.disposed = true;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.listeners.clear();
        this.sessionsByPath.clear();
        this.sessionByThreadId.clear();
    }

    subscribe(listener: ExternalSessionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    isExternalOrigin(threadId: string): boolean {
        if (!this.enabled) return false;
        return this.sessionByThreadId.get(threadId)?.external === true;
    }

    getExternalSession(threadId: string): ExternalSessionInfo | null {
        if (!this.enabled) return null;
        const session = this.sessionByThreadId.get(threadId);
        if (!session || !session.external) return null;
        return this.buildInfo(session);
    }

    getActiveThreadIds(): string[] {
        if (!this.enabled) return [];
        const active: string[] = [];
        for (const session of this.sessionByThreadId.values()) {
            if (session.external && this.computeActive(session)) {
                active.push(session.sessionId);
            }
        }
        return active;
    }

    /**
     * Thread ids marked as subagent sessions (`thread_source` starts with
     * "subagent"), plus exec-origin sessions that are the recorded parent of a
     * subagent. The latter are the first layer of a nested multi-agent run: the
     * codex exec subprocess spawns them as plain user sessions (`thread_source`
     * "user", no parent link), so they only differ from a top-level user thread
     * by being referenced as `parent_thread_id` by a marked subagent. Returning
     * them alongside subagents lets callers drop the whole two-layer subagent
     * tree from a user-facing thread list without touching real user threads.
     */
    getUserFacingSubagentThreadIds(): string[] {
        if (!this.enabled) return [];
        const parentIds = new Set<string>();
        for (const session of this.sessionByThreadId.values()) {
            if (!this.isSubagent(session)) continue;
            if (session.parentThreadId) parentIds.add(session.parentThreadId);
        }
        const ids: string[] = [];
        for (const session of this.sessionByThreadId.values()) {
            if (this.isSubagent(session)) {
                ids.push(session.sessionId);
                continue;
            }
            // First-layer worker: exec-origin, recorded as the parent of a
            // subagent, and not itself a user-facing top-level thread.
            if (
                session.originator.toLowerCase() === "codex_exec" &&
                parentIds.has(session.sessionId)
            ) {
                ids.push(session.sessionId);
            }
        }
        return ids;
    }

    private isSubagent(session: TrackedSession): boolean {
        return (session.threadSource ?? "").toLowerCase().startsWith("subagent");
    }

    /**
     * Thread ids whose session_meta marks them as subagent sessions
     * (`thread_source` starts with "subagent"). Kept for existing callers;
     * prefer `getUserFacingSubagentThreadIds()` which also drops first-layer
     * exec workers that a two-layer run spawns.
     */
    getSubagentThreadIds(): string[] {
        if (!this.enabled) return [];
        const ids: string[] = [];
        for (const session of this.sessionByThreadId.values()) {
            const source = (session.threadSource ?? "").toLowerCase();
            if (source.startsWith("subagent")) {
                ids.push(session.sessionId);
            }
        }
        return ids;
    }

    /** Run one discovery + parse + transition pass. Exposed for tests. */
    async tick(): Promise<void> {
        if (!this.enabled || this.disposed) return;
        if (this.ticking && this.tickingPromise) {
            // A scan is already running; wait for it so callers observe the
            // freshest index instead of racing past a stale snapshot.
            await this.tickingPromise;
            return;
        }
        this.ticking = true;
        let resolveTick: () => void = () => {};
        this.tickingPromise = new Promise<void>((resolve) => {
            resolveTick = resolve;
        });
        try {
            await this.scanAndUpdate();
        } finally {
            this.ticking = false;
            this.tickingPromise = null;
            resolveTick();
        }
    }

    private buildInfo(session: TrackedSession): ExternalSessionInfo {
        return {
            origin: session.originator,
            active: this.computeActive(session),
            lastWriteAt:
                session.mtimeMs > 0
                    ? new Date(session.mtimeMs).toISOString()
                    : null,
        };
    }

    private computeActive(session: TrackedSession): boolean {
        if (session.openTurnIds.size === 0) return false;
        if (session.mtimeMs <= 0) return false;
        return this.now() - session.mtimeMs <= this.windowMs;
    }

    private async scanAndUpdate(): Promise<void> {
        let discoveredPaths: string[] = [];
        try {
            discoveredPaths = await collectRolloutFiles(this.sessionsDir);
        } catch {
            // Sessions directory missing or unreadable — nothing to track.
            return;
        }

        const discovered = new Set(discoveredPaths);

        for (const filePath of discoveredPaths) {
            const session = this.sessionsByPath.get(filePath);
            if (session) {
                await this.updateExistingSession(session);
                continue;
            }
            await this.discoverSession(filePath);
        }

        // Drop sessions whose rollout file disappeared (archived/compacted/deleted).
        for (const [path, session] of this.sessionsByPath) {
            if (discovered.has(path)) continue;
            this.sessionsByPath.delete(path);
            if (session.sessionId) {
                this.sessionByThreadId.delete(session.sessionId);
            }
            if (session.external) {
                this.emitTransition(session.sessionId, {
                    origin: session.originator,
                    active: false,
                    lastWriteAt:
                        session.mtimeMs > 0
                            ? new Date(session.mtimeMs).toISOString()
                            : null,
                });
            }
        }
    }

    private async discoverSession(filePath: string): Promise<void> {
        let fileStat;
        try {
            fileStat = await stat(filePath);
        } catch {
            return;
        }
        if (!fileStat.isFile()) return;

        const parsed = await this.readAndParse(filePath, 0, fileStat);
        if (!parsed) return;
        const session = parsed.session;
        session.mtimeMs = fileStat.mtimeMs;
        session.size = fileStat.size;
        session.readOffset = parsed.parsedBytes;
        session.pendingTail = parsed.pendingTail;
        this.sessionsByPath.set(filePath, session);
        this.updateSessionMeta(session, parsed.records);
        this.applyTurnRecords(session, parsed.records);
        this.syncThreadIndex(session);

        if (!session.external) return;
        const active = this.computeActive(session);
        session.lastEmittedActive = active;
        if (active) {
            this.emitTransition(session.sessionId, this.buildInfo(session));
        }
    }

    private async updateExistingSession(
        session: TrackedSession,
    ): Promise<void> {
        let fileStat;
        try {
            fileStat = await stat(session.path);
        } catch {
            return;
        }
        if (!fileStat.isFile()) return;

        session.mtimeMs = fileStat.mtimeMs;
        if (fileStat.size < session.readOffset) {
            // File was rewritten or truncated (compaction) — re-parse from scratch.
            session.readOffset = 0;
            session.size = 0;
            session.pendingTail = "";
            session.openTurnIds.clear();
            const parsed = await this.readAndParse(session.path, 0, fileStat);
            if (!parsed) return;
            this.updateSessionMeta(session, parsed.records);
            this.applyTurnRecords(session, parsed.records);
            this.syncThreadIndex(session);
            this.checkTransition(session);
            return;
        }

        if (fileStat.size <= session.readOffset) {
            this.checkTransition(session);
            return;
        }

        const parsed = await this.readAndParse(
            session.path,
            session.readOffset,
            fileStat,
        );
        if (!parsed) return;
        session.readOffset = parsed.parsedBytes;
        session.size = parsed.parsedBytes;
        session.pendingTail = parsed.pendingTail;
        this.updateSessionMeta(session, parsed.records);
        this.applyTurnRecords(session, parsed.records);
        this.syncThreadIndex(session);
        this.checkTransition(session);
    }

    private checkTransition(session: TrackedSession): void {
        if (!session.external) return;
        const active = this.computeActive(session);
        if (active === session.lastEmittedActive) return;
        session.lastEmittedActive = active;
        this.emitTransition(session.sessionId, this.buildInfo(session));
    }

    private emitTransition(
        threadId: string,
        externalSession: ExternalSessionInfo,
    ): void {
        const event: ExternalSessionChangedEvent = {
            method: "externalSessionChanged",
            params: { threadId, externalSession },
            atIso: new Date().toISOString(),
        };
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch {
                // A failing listener must not break the tracker loop.
            }
        }
    }

    private syncThreadIndex(session: TrackedSession): void {
        if (!session.sessionId) return;
        const indexed = this.sessionByThreadId.get(session.sessionId);
        if (indexed !== session) {
            this.sessionByThreadId.set(session.sessionId, session);
        }
    }

    private updateSessionMeta(
        session: TrackedSession,
        records: Array<Record<string, unknown> | null>,
    ): void {
        if (session.originator) return;
        for (const record of records) {
            if (!record || record.type !== "session_meta") continue;
            const payload = asRecord(record.payload);
            if (!payload) continue;
            const originator = readNonEmptyString(payload.originator);
            const threadSource = readNonEmptyString(payload.thread_source);
            if (!originator && !threadSource) continue;
            if (originator) {
                session.originator = originator;
                session.external = this.externalOrigins.has(originator);
            }
            if (threadSource) {
                session.threadSource = threadSource;
            }
            const parentThreadId = readNonEmptyString(payload.parent_thread_id);
            if (parentThreadId) {
                session.parentThreadId = parentThreadId;
            }
            // Subagent rollouts put the parent thread id in `session_id`; their
            // own thread id (the one `thread/list` materializes) is `id`.
            const isSubagent = threadSource
                .toLowerCase()
                .startsWith("subagent");
            const sessionId = isSubagent
                ? readNonEmptyString(payload.id) ||
                  readNonEmptyString(payload.session_id)
                : readNonEmptyString(payload.session_id) ||
                  readNonEmptyString(payload.id);
            if (sessionId) {
                session.sessionId = sessionId;
            }
            return;
        }
    }

    private applyTurnRecords(
        session: TrackedSession,
        records: Array<Record<string, unknown> | null>,
    ): void {
        for (const record of records) {
            if (!record || record.type !== "event_msg") continue;
            const payload = asRecord(record.payload);
            if (!payload) continue;
            const eventType = readNonEmptyString(payload.type);
            const turnId = readNonEmptyString(payload.turn_id);
            if (!turnId) continue;
            if (eventType === "task_started" || eventType === "turn_started") {
                session.openTurnIds.add(turnId);
            } else if (
                eventType === "task_complete" ||
                eventType === "turn_complete" ||
                eventType === "turn_aborted"
            ) {
                session.openTurnIds.delete(turnId);
            }
        }
    }

    /**
     * Read `path` starting at `offset`, splitting into complete JSONL records.
     * The trailing partial line is returned separately so the next read can
     * prepend it. Returns null when the file cannot be read.
     */
    private async readAndParse(
        path: string,
        offset: number,
        fileStat: { size: number },
    ): Promise<{
        session: TrackedSession;
        records: Array<Record<string, unknown> | null>;
        parsedBytes: number;
        pendingTail: string;
    } | null> {
        const existing = this.sessionsByPath.get(path);
        const pendingTail = offset === 0 ? "" : (existing?.pendingTail ?? "");
        const newBytes = fileStat.size - offset;
        if (newBytes <= 0 && pendingTail.length === 0) {
            return {
                session: existing ?? this.createEmptySession(path),
                records: [],
                parsedBytes: offset,
                pendingTail: "",
            };
        }

        let text = pendingTail;
        let bytesReadFromFile = 0;
        if (newBytes > 0) {
            let handle;
            try {
                handle = await open(path, "r");
                const buffer = Buffer.alloc(newBytes);
                const { bytesRead } = await handle.read(
                    buffer,
                    0,
                    newBytes,
                    offset,
                );
                bytesReadFromFile = bytesRead;
                text += buffer.subarray(0, bytesRead).toString("utf8");
            } finally {
                await handle?.close();
            }
        }

        const lines = text.split("\n");
        let pending = "";
        let lastIndex = lines.length - 1;
        const finalLine = lines[lastIndex] ?? "";
        if (finalLine.length === 0) {
            lastIndex -= 1;
        } else {
            pending = finalLine;
            lastIndex -= 1;
        }

        const records: Array<Record<string, unknown> | null> = [];
        for (let index = 0; index <= lastIndex; index += 1) {
            const line = lines[index].replace(/\r$/u, "");
            if (!line) continue;
            records.push(parseRecord(line));
        }

        const session = existing ?? this.createEmptySession(path);
        // Only count bytes read from the file this call; a carried-over
        // pendingTail was already counted in a previous parse pass.
        const parsedBytes = offset + bytesReadFromFile;
        return { session, records, parsedBytes, pendingTail: pending };
    }

    private createEmptySession(path: string): TrackedSession {
        return {
            path,
            sessionId: "",
            originator: "",
            threadSource: null,
            parentThreadId: null,
            external: false,
            openTurnIds: new Set<string>(),
            readOffset: 0,
            size: 0,
            mtimeMs: 0,
            pendingTail: "",
            lastEmittedActive: false,
        };
    }

    private pollLoop(): void {
        this.pollTimer = null;
        if (this.disposed) return;
        void this.tick().finally(() => {
            if (this.disposed) return;
            this.pollTimer = setTimeout(() => this.pollLoop(), this.pollMs);
        });
    }
}

async function collectRolloutFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string, relativeDir: string): Promise<void> => {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            const nextRelative = relativeDir
                ? `${relativeDir}/${entry.name}`
                : entry.name;
            if (isArchivedPath(nextRelative)) continue;
            const nextPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(nextPath, nextRelative);
            } else if (entry.isFile() && isRolloutFile(entry.name)) {
                files.push(nextPath);
            }
        }
    };
    await walk(root, "");
    return files;
}

function getCodexHomeDir(): string {
    const codexHome = process.env.CODEX_HOME?.trim();
    return codexHome && codexHome.length > 0
        ? codexHome
        : join(homedir(), ".codex");
}

export function createExternalSessionTracker(
    options: ExternalSessionTrackerOptions = {},
): ExternalSessionTracker {
    return new ExternalSessionTracker(options);
}
