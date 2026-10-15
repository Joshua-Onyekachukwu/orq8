import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Proof for audit F.3 (SSE/realtime reconnect storms): the shared client must
// reconnect with bounded exponential backoff — never a tight loop — share one
// connection across subscribers, and stop retrying once nobody listens.

type Handler = () => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: Handler | null = null;
  onmessage: ((raw: { data: string }) => void) | null = null;
  onerror: Handler | null = null;
  close = vi.fn();
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  open() {
    this.onopen?.();
  }
  fail() {
    this.onerror?.();
  }
}

describe("realtime reconnect bounds", () => {
  let delays: number[];

  beforeEach(async () => {
    vi.resetModules();
    MockEventSource.instances = [];
    delays = [];
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    // Capture the fake-timer setTimeout BEFORE spying: calling the spy from
    // inside its own implementation would recurse forever.
    const fakeSetTimeout = global.setTimeout;
    vi.spyOn(global, "setTimeout").mockImplementation(((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
      delays.push(ms ?? 0);
      return fakeSetTimeout(fn, ms, ...rest);
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function load() {
    return import("../lib/realtime-client");
  }

  it("shares one connection across subscribers", async () => {
    const { subscribeRealtime } = await load();
    const un1 = subscribeRealtime(() => {});
    const un2 = subscribeRealtime(() => {});
    const un3 = subscribeRealtime(() => {});
    expect(MockEventSource.instances).toHaveLength(1);
    un1();
    un2();
    un3();
  });

  it("backs off exponentially and caps at 30s", async () => {
    const { subscribeRealtime } = await load();
    const seen: boolean[] = [];
    const un = subscribeRealtime((m) => {
      if (m.kind === "status") seen.push(m.connected);
    });

    // Five consecutive drops, each reconnected via the scheduled timer.
    for (let i = 0; i < 5; i++) {
      MockEventSource.instances[MockEventSource.instances.length - 1]!.fail();
      await vi.advanceTimersByTimeAsync(delays[delays.length - 1]!);
    }

    // 1s, 2s, 4s, 8s, 16s — exponential, and every delay within the cap.
    expect(delays.slice(0, 5)).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(Math.max(...delays)).toBeLessThanOrEqual(30_000);
    // Status went false on drops; a reconnect re-opens on timer fire.
    expect(seen).toContain(false);
    un();
  });

  it("never schedules beyond the 30s cap, however long the outage", async () => {
    const { subscribeRealtime } = await load();
    const un = subscribeRealtime(() => {});
    for (let i = 0; i < 10; i++) {
      MockEventSource.instances[MockEventSource.instances.length - 1]!.fail();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.max(...delays)).toBe(30_000);
    un();
  });

  it("closes the connection when the last subscriber leaves", async () => {
    const { subscribeRealtime } = await load();
    const statuses: boolean[] = [];
    const un = subscribeRealtime((m) => {
      if (m.kind === "status") statuses.push(m.connected);
    });
    MockEventSource.instances[0]!.open();
    expect(statuses).toEqual([true]);
    un();
    expect(MockEventSource.instances[0]!.close).toHaveBeenCalled();
    // A new subscriber after full teardown revives the stream — without
    // this the client stays parked until a page reload.
    const un2 = subscribeRealtime(() => {});
    expect(MockEventSource.instances).toHaveLength(2);
    un2();
  });
});
