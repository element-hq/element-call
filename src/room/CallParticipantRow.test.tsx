/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type JSX, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@vector-im/compound-web";

import { CallParticipantRow } from "./CallParticipantRow";
import { type CallParticipant } from "./useCallParticipants";

// Mock the Avatar component to avoid MXC URL resolution side effects
vi.mock("../Avatar", () => ({
  Avatar: ({
    id,
    name,
    size,
  }: {
    id: string;
    name: string;
    size: number;
  }): JSX.Element => (
    <div data-testid={`avatar-${id}`} data-name={name} data-size={size} />
  ),
  Size: { SM: "sm", MD: "md", LG: "lg", XL: "xl" },
}));

function renderWithProviders(children: ReactNode): ReturnType<typeof render> {
  return render(<TooltipProvider>{children}</TooltipProvider>);
}

function makeParticipants(count: number): CallParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `@user${i}:example.org`,
    displayName: `User ${i}`,
    avatarUrl: null,
  }));
}

describe("CallParticipantRow", () => {
  test("renders nothing when no participants", () => {
    const { container } = renderWithProviders(
      <CallParticipantRow participants={[]} />,
    );
    expect(container.textContent).toBe("");
  });

  test("renders single participant", () => {
    const participants = makeParticipants(1);
    renderWithProviders(<CallParticipantRow participants={participants} />);

    expect(screen.getByText("User 0")).toBeInTheDocument();
    expect(screen.getByTestId("avatar-@user0:example.org")).toBeInTheDocument();
  });

  test("renders multiple participants up to limit", () => {
    const participants = makeParticipants(5);
    renderWithProviders(<CallParticipantRow participants={participants} />);

    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(`User ${i}`)).toBeInTheDocument();
    }
    // No overflow
    expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
  });

  test("renders overflow when exceeding default limit", () => {
    const participants = makeParticipants(10);
    renderWithProviders(<CallParticipantRow participants={participants} />);

    // First 8 are visible
    for (let i = 0; i < 8; i++) {
      expect(screen.getByText(`User ${i}`)).toBeInTheDocument();
    }
    // Users 8 and 9 are in overflow (only visible in tooltip, not rendered in DOM)
    expect(screen.queryByText("User 8")).not.toBeInTheDocument();
    expect(screen.queryByText("User 9")).not.toBeInTheDocument();
    // Overflow count shown
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  test("renders overflow with custom display limit", () => {
    const participants = makeParticipants(5);
    renderWithProviders(
      <CallParticipantRow participants={participants} displayLimit={3} />,
    );

    // First 3 are visible
    for (let i = 0; i < 3; i++) {
      expect(screen.getByText(`User ${i}`)).toBeInTheDocument();
    }
    // 4th and 5th in overflow
    expect(screen.queryByText("User 3")).not.toBeInTheDocument();
    expect(screen.queryByText("User 4")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  test("overflow element shows ellipsis", () => {
    const participants = makeParticipants(10);
    renderWithProviders(<CallParticipantRow participants={participants} />);

    expect(screen.getByText("…")).toBeInTheDocument();
  });

  test("has accessible list role", () => {
    const participants = makeParticipants(3);
    renderWithProviders(<CallParticipantRow participants={participants} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  test("overflow adds an additional listitem", () => {
    const participants = makeParticipants(10);
    renderWithProviders(<CallParticipantRow participants={participants} />);

    // 8 visible + 1 overflow = 9 listitems
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
  });

  test("assigns correct screen reader label", () => {
    const participants: CallParticipant[] = [
      { userId: "@alice:example.org", displayName: "Alice", avatarUrl: null },
      { userId: "@bob:example.org", displayName: "Bob", avatarUrl: null },
    ];
    renderWithProviders(<CallParticipantRow participants={participants} />);

    const list = screen.getByRole("list");
    expect(list.getAttribute("aria-label")).toContain("Alice");
    expect(list.getAttribute("aria-label")).toContain("Bob");
  });
});
