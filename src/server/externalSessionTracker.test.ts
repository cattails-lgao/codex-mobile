import { mkdtemp, mkdir, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    ExternalSessionTracker,
    type ExternalSessionChangedEvent,
} from "./externalSessionTracker";

function metaLine(
    sessionId: string,
    originator: string,
    threadSource?: string,
): string {
    const extra = threadSource ? `,"thread_source":"${threadSource}"` : "";
    return JSON.stringify({
        timestamp: "2026-08-02T00:00:00.000Z",
        type: "session_meta",
        payload: {
            session_id: sessionId,
            id: sessionId,
            originator,
            ...(extra ? { thread_source: threadSource } : {}),
        },
    });
}

function taskStarted(turnId: string): string {
    return JSON.stringify({
        timestamp: "2026-08-02T00:00:01.000Z",
        type: "event_msg",
        payload: {
            type: "task_started",
            turn_id: turnId,
            started_at: 1782213747,
        },
    });
}

function taskComplete(turnId: string): string {
    return JSON.stringify({
        timestamp: "2026-08-02T00:00:02.000Z",
        type: "event_msg",
        payload: {
            type: "task_complete",
            turn_id: turnId,
            completed_at: 1782213749,
        },
    });
}

function turnAborted(turnId: string): string {
    return JSON.stringify({
        timestamp: "2026-08-02T00:00:02.000Z",
        type: "event_msg",
        payload: {
            type: "turn_aborted",
            turn_id: turnId,
            reason: "interrupted",
            completed_at: 1782213749,
        },
    });
}

async function writeSession(
    dir: string,
    fileName: string,
    lines: string[],
): Promise<string> {
    const path = join(dir, fileName);
    await writeFile(path, `${lines.join("\n")}\n`, "utf8");
    return path;
}

describe("externalSessionTracker", () => {
    let sessionsDir: string;
    let now: number;
    const windowMs = 30_000;

    beforeEach(async () => {
        sessionsDir = await mkdtemp(
            join(tmpdir(), "codexapp-external-session-"),
        );
        now = Date.now();
    });

    afterEach(async () => {
        await rm(sessionsDir, { recursive: true, force: true });
    });

    function createTracker(): ExternalSessionTracker {
        return new ExternalSessionTracker({
            sessionsDir,
            enabled: true,
            windowMs,
            pollMs: 3_000,
            externalOrigins: ["codex-tui", "codex_cli_rs"],
            now: () => now,
        });
    }

    it("reports working while a TUI turn is unclosed and the file keeps being written", async () => {
        const path = await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-aaa.jsonl",
            [metaLine("thread-tui-1", "codex-tui"), taskStarted("turn-1")],
        );
        // Touch the file so its mtime is fresh.
        await appendFile(path, "", "utf8");

        const tracker = createTracker();
        await tracker.tick();

        expect(tracker.isExternalOrigin("thread-tui-1")).toBe(true);
        expect(tracker.getExternalSession("thread-tui-1")).toMatchObject({
            origin: "codex-tui",
            active: true,
        });
        expect(tracker.getActiveThreadIds()).toContain("thread-tui-1");
    });

    it("returns to idle once task_complete lands on disk", async () => {
        const path = await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-bbb.jsonl",
            [metaLine("thread-tui-2", "codex-tui"), taskStarted("turn-2")],
        );
        const tracker = createTracker();
        const events: ExternalSessionChangedEvent[] = [];
        tracker.subscribe((event) => events.push(event));
        await tracker.tick();
        expect(tracker.getExternalSession("thread-tui-2")?.active).toBe(true);

        await appendFile(path, `${taskComplete("turn-2")}\n`, "utf8");
        await tracker.tick();

        expect(tracker.getExternalSession("thread-tui-2")).toMatchObject({
            active: false,
        });
        expect(
            events.some(
                (event) =>
                    event.params.threadId === "thread-tui-2" &&
                    event.params.externalSession.active === false,
            ),
        ).toBe(true);
    });

    it("returns to idle after the write window elapses even without task_complete (crashed TUI)", async () => {
        const path = await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-ccc.jsonl",
            [metaLine("thread-tui-3", "codex-tui"), taskStarted("turn-3")],
        );
        await appendFile(path, "", "utf8");

        const tracker = createTracker();
        const events: ExternalSessionChangedEvent[] = [];
        tracker.subscribe((event) => events.push(event));
        await tracker.tick();
        expect(tracker.getExternalSession("thread-tui-3")?.active).toBe(true);

        // TUI crashes: the file stops being written and the window elapses.
        now += windowMs + 1_000;
        await tracker.tick();

        expect(tracker.getExternalSession("thread-tui-3")).toMatchObject({
            active: false,
        });
        expect(tracker.getActiveThreadIds()).not.toContain("thread-tui-3");
        expect(
            events.some(
                (event) =>
                    event.params.threadId === "thread-tui-3" &&
                    event.params.externalSession.active === false,
            ),
        ).toBe(true);
    });

    it("ignores web UI sessions whose originator is not external", async () => {
        await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-ddd.jsonl",
            [
                metaLine("thread-web-1", "codex-web-local"),
                taskStarted("turn-web"),
            ],
        );
        const tracker = createTracker();
        await tracker.tick();

        expect(tracker.isExternalOrigin("thread-web-1")).toBe(false);
        expect(tracker.getExternalSession("thread-web-1")).toBeNull();
        expect(tracker.getActiveThreadIds()).not.toContain("thread-web-1");
    });

    it("tracks TUI subagent threads that inherit the external originator", async () => {
        await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-eee.jsonl",
            [
                metaLine("thread-sub-1", "codex-tui", "subagent"),
                taskStarted("turn-sub"),
            ],
        );
        const tracker = createTracker();
        await tracker.tick();

        expect(tracker.getExternalSession("thread-sub-1")).toMatchObject({
            origin: "codex-tui",
            active: true,
        });
    });

    it("skips sessions under archived_sessions", async () => {
        const archived = join(
            sessionsDir,
            "archived_sessions",
            "2026",
            "08",
            "02",
        );
        await mkdir(archived, { recursive: true });
        await writeSession(archived, "rollout-2026-08-02T00-00-00-fff.jsonl", [
            metaLine("thread-archived-1", "codex-tui"),
            taskStarted("turn-archived"),
        ]);
        const tracker = createTracker();
        await tracker.tick();

        expect(tracker.isExternalOrigin("thread-archived-1")).toBe(false);
        expect(tracker.getExternalSession("thread-archived-1")).toBeNull();
    });

    it("recovers when the session log is compacted (truncated and rewritten)", async () => {
        const path = await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-ggg.jsonl",
            [
                metaLine("thread-compact-1", "codex-tui"),
                taskStarted("turn-old"),
            ],
        );
        const tracker = createTracker();
        await tracker.tick();
        expect(tracker.getExternalSession("thread-compact-1")?.active).toBe(
            true,
        );

        // Compaction rewrites the file with a smaller body and a fresh open turn.
        await writeFile(
            path,
            `${metaLine("thread-compact-1", "codex-tui")}\n${taskStarted("t9")}\n`,
            "utf8",
        );
        await tracker.tick();

        expect(tracker.getExternalSession("thread-compact-1")).toMatchObject({
            active: true,
        });
        // The stale turn id must not leak into the open set after re-parse.
        await appendFile(path, `${taskComplete("t9")}\n`, "utf8");
        await tracker.tick();
        expect(tracker.getExternalSession("thread-compact-1")).toMatchObject({
            active: false,
        });
    });

    it("parses appended lines incrementally without losing state (partial trailing line)", async () => {
        const path = join(sessionsDir, "rollout-2026-08-02T00-00-00-hhh.jsonl");
        await writeFile(
            path,
            `${metaLine("thread-tui-4", "codex-tui")}\n${taskStarted("turn-4")}`,
            "utf8",
        );

        const tracker = createTracker();
        await tracker.tick();
        // The incomplete trailing line has not been parsed yet.
        expect(tracker.getExternalSession("thread-tui-4")).toMatchObject({
            active: false,
        });

        // The TUI finishes the line, then completes the turn.
        await appendFile(path, `\n${taskComplete("turn-4")}\n`, "utf8");
        await tracker.tick();
        expect(tracker.getExternalSession("thread-tui-4")).toMatchObject({
            active: false,
        });

        // A fresh unclosed turn in the appended bytes is still detected.
        await appendFile(path, `${taskStarted("turn-5")}\n`, "utf8");
        await tracker.tick();
        expect(tracker.getExternalSession("thread-tui-4")).toMatchObject({
            active: true,
        });
    });

    it("uses turn_aborted as a turn close marker", async () => {
        const path = await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-iii.jsonl",
            [
                metaLine("thread-tui-5", "codex_cli_rs"),
                taskStarted("turn-abort"),
            ],
        );
        const tracker = createTracker();
        await tracker.tick();
        expect(tracker.getExternalSession("thread-tui-5")?.active).toBe(true);

        await appendFile(path, `${turnAborted("turn-abort")}\n`, "utf8");
        await tracker.tick();
        expect(tracker.getExternalSession("thread-tui-5")).toMatchObject({
            active: false,
        });
    });

    it("keeps origin info for idle external threads and returns consistent snapshots", async () => {
        await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-jjj.jsonl",
            [
                metaLine("thread-tui-6", "codex-tui"),
                taskStarted("turn-6"),
                taskComplete("turn-6"),
            ],
        );
        const tracker = createTracker();
        await tracker.tick();

        const first = tracker.getExternalSession("thread-tui-6");
        const second = tracker.getExternalSession("thread-tui-6");
        expect(first).toMatchObject({ origin: "codex-tui", active: false });
        expect(first).toEqual(second);
    });

    it("emits externalSessionChanged only on active transitions", async () => {
        const path = await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-kkk.jsonl",
            [metaLine("thread-tui-7", "codex-tui"), taskStarted("turn-7")],
        );
        const tracker = createTracker();
        const events: ExternalSessionChangedEvent[] = [];
        tracker.subscribe((event) => events.push(event));

        await tracker.tick();
        await tracker.tick();
        expect(
            events.filter((event) => event.params.threadId === "thread-tui-7")
                .length,
        ).toBe(1);

        await appendFile(path, `${taskComplete("turn-7")}\n`, "utf8");
        await tracker.tick();
        await tracker.tick();
        expect(
            events.filter(
                (event) =>
                    event.params.threadId === "thread-tui-7" &&
                    event.params.externalSession.active === false,
            ).length,
        ).toBe(1);
    });

    it("supports configurable external origins", async () => {
        await writeSession(
            sessionsDir,
            "rollout-2026-08-02T00-00-00-lll.jsonl",
            [
                metaLine("thread-custom-1", "codex_cli_rs"),
                taskStarted("turn-custom"),
            ],
        );
        const tracker = new ExternalSessionTracker({
            sessionsDir,
            enabled: true,
            windowMs,
            pollMs: 3_000,
            externalOrigins: ["codex-tui"],
            now: () => now,
        });
        await tracker.tick();

        expect(tracker.getExternalSession("thread-custom-1")).toBeNull();
    });
});
