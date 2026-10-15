import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UnifiedKnowledgeSearch } from "../components/work/unified-knowledge-search";

// Proof for AUD-007 "single search": one box queries the graph, files and
// memory stores together and groups the hits — never three separate hunts.

const graphPayload = {
  data: {
    entities: [{ id: "e1", type: "customer", name: "Acme onboarding" }],
    relations: [],
    decisions: [{ id: "d1", title: "Onboarding call script", outcome: "approved" }],
  },
};

const memoryPayload = {
  data: [
    { id: "m1", category: "learning", content: "Customer onboarding takes two calls" },
    { id: "m2", category: "fact", content: "Office closes Fridays" },
  ],
};

const filesPayload = {
  data: [{ id: "f1", name: "onboarding-checklist.pdf" }],
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (String(url).startsWith("/api/knowledge")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(graphPayload) });
    }
    if (String(url).startsWith("/api/memory")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(memoryPayload) });
    }
    if (String(url).startsWith("/api/files")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(filesPayload) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch());
});

describe("unified knowledge search", () => {
  it("queries all three stores from one box and groups the hits", async () => {
    render(<UnifiedKnowledgeSearch />);

    fireEvent.change(screen.getByLabelText(/search knowledge/i), {
      target: { value: "onboarding" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    // Graph hits.
    expect(await screen.findByText("Acme onboarding")).toBeTruthy();
    expect(await screen.findByText("Onboarding call script")).toBeTruthy();
    // Memory match (client-filtered), non-match excluded.
    expect(await screen.findByText(/takes two calls/)).toBeTruthy();
    expect(screen.queryByText(/closes Fridays/)).toBeNull();
    // File match.
    expect(await screen.findByText("onboarding-checklist.pdf")).toBeTruthy();
    // One fan-out per store.
    const calls: string[] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      ([url]) => String(url),
    );
    expect(calls.some((u) => u.startsWith("/api/knowledge"))).toBe(true);
    expect(calls.some((u) => u.startsWith("/api/memory"))).toBe(true);
    expect(calls.some((u) => u.startsWith("/api/files"))).toBe(true);
  });

  it("names a store it could not check instead of dropping it silently", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      String(url).startsWith("/api/files")
        ? Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        : String(url).startsWith("/api/knowledge")
          ? Promise.resolve({ ok: true, json: () => Promise.resolve(graphPayload) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve(memoryPayload) }),
    );
    render(<UnifiedKnowledgeSearch />);

    fireEvent.change(screen.getByLabelText(/search knowledge/i), {
      target: { value: "onboarding" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not check files/i)).toBeTruthy();
    });
  });
});
