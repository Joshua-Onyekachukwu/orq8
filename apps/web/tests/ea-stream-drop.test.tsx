import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React, { useEffect } from "react";
import { ExecutiveAgentProvider, useExecutiveAgent } from "../components/executive-agent-context";
import { ExecutiveAgentPanel } from "../components/executive-agent-panel";
import { CommandStreamError } from "../lib/command-stream";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/tasks",
}));

// The stream drops AFTER the pipeline started: work may have run, so the
// thread must offer recovery — never a blind retry.
vi.mock("../lib/command-stream", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../lib/command-stream")>();
  return {
    ...orig,
    runCommandStream: vi.fn().mockRejectedValue(new orig.CommandStreamError("stream cut", true)),
  };
});

function Harness() {
  const { openPanel, sendMessage } = useExecutiveAgent();
  useEffect(() => {
    openPanel();
  }, [openPanel]);
  return (
    <>
      <ExecutiveAgentPanel />
      <button onClick={() => void sendMessage("Do the thing")} aria-label="send-fixture">
        send
      </button>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no layout engine: the panel auto-scrolls on new messages.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("EA stream drop after pipeline start", () => {
  it("shows guided recovery copy and a what-happened action, not a retry", async () => {
    render(
      <ExecutiveAgentProvider userId="test-user" eaName="Iris">
        <Harness />
      </ExecutiveAgentProvider>,
    );

    fireEvent.click(screen.getByLabelText("send-fixture"));

    // Guided copy names the situation and rules out re-sending.
    const guided = await screen.findByText(/did not run it again/i);
    expect(guided).toBeTruthy();
    expect(CommandStreamError).toBeTruthy();

    // Recovery action asks the EA to report on what actually happened.
    const recovery = await screen.findByRole("button", {
      name: /what happened to my last command/i,
    });
    expect(recovery).toBeTruthy();

    // Taking the recovery path clears the drop state (new send in flight).
    fireEvent.click(recovery);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /what happened to my last command/i })).toBeNull();
    });
  });
});
