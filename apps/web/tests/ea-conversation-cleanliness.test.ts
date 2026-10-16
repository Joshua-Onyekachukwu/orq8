import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { WorkCard, EmployeeCard, ActivityStream } from "../components/os/primitives";

/**
 * C-08 regression: routine EA-adjacent surfaces must not show per-response
 * money, token, model, or credit figures. Full accounting lives on the
 * details pages (usage, employee Work & cost, execution history, billing).
 * Approval cards are the deliberate exception — a spend decision needs its
 * cost — and are covered by that rule, not this test.
 *
 * NOTE: written with React.createElement (not JSX) because the web vitest
 * harness has no JSX transform (tsconfig jsx:preserve, no react plugin —
 * see vitest.config.ts). When @vitejs/plugin-react lands, this can go .tsx.
 */
const now = new Date().toISOString();

describe("EA conversation cleanliness (C-08)", () => {
  it("WorkCard shows work and state, never cost", () => {
    const { container } = render(
      React.createElement(WorkCard, {
        task: {
          id: "t1",
          title: "Draft the launch post",
          status: "in_progress",
          priority: "high",
          agentId: "a1",
          cost: 250,
          createdAt: now,
        },
        agentName: "Nova",
        href: "/app/tasks/t1",
      }),
    );
    expect(screen.getByText("Draft the launch post")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$/);
    expect(container.textContent).not.toMatch(/credit/i);
  });

  it("EmployeeCard shows record, never credit totals", () => {
    const { container } = render(
      React.createElement(EmployeeCard, {
        agent: {
          id: "a1",
          name: "Nova",
          role: "market_researcher",
          status: "active",
          currentTask: "Research competitors",
          autonomyLevel: "execute_with_approval",
          tasksCompleted: 12,
          tasksFailed: 1,
          creditsUsed: 480,
          lastActiveAt: now,
        },
        href: "/app/agents/a1",
      }),
    );
    expect(screen.getByText("Nova")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$/);
    expect(container.textContent).not.toMatch(/480/);
    expect(container.textContent).not.toMatch(/credit/i);
  });

  it("ActivityStream shows what happened, never what it cost", () => {
    const { container } = render(
      React.createElement(ActivityStream, {
        items: [
          {
            id: 1,
            type: "task.completed",
            summary: "Nova finished the competitive brief",
            reason: null,
            cost: 320,
            agentId: "a1",
            occurredAt: now,
          },
        ],
        agentNameById: new Map([["a1", "Nova"]]),
      }),
    );
    expect(screen.getByText("Nova finished the competitive brief")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$/);
    expect(container.textContent).not.toMatch(/3\.20/);
  });
});
