/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form } from "@vector-im/compound-web";
import { describe, expect, it, vi } from "vitest";

import { DeviceSelection } from "./DeviceSelection";
import { constant } from "../state/Behavior";
import {
  type AudioOutputDeviceLabel,
  type DeviceLabel,
  type MediaDevice,
  type SelectedDevice,
} from "../state/MediaDevices";

type Device = MediaDevice<DeviceLabel | AudioOutputDeviceLabel, SelectedDevice>;

function mockDevice(
  available: [string, DeviceLabel][],
  selectedId: string | undefined,
): Device & { select: ReturnType<typeof vi.fn> } {
  return {
    available$: constant(new Map(available)),
    selected$: constant(
      selectedId === undefined ? undefined : { id: selectedId },
    ),
    select: vi.fn(),
  } as unknown as Device & { select: ReturnType<typeof vi.fn> };
}

const twoDevices: [string, DeviceLabel][] = [
  ["a", { type: "name", name: "Mic A" }],
  ["b", { type: "number", number: 2 }],
];

describe("DeviceSelection", () => {
  it("marks the selected device and selects another on click", async () => {
    const device = mockDevice(twoDevices, "a");
    render(
      <Form.Root>
        <DeviceSelection
          device={device}
          title="Microphone"
          numberedLabel={(n) => `Microphone ${n}`}
        />
      </Form.Root>,
    );

    const first = screen.getByRole<HTMLInputElement>("radio", {
      name: "Mic A",
    });
    const second = screen.getByRole<HTMLInputElement>("radio", {
      name: "Microphone 2",
    });
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);

    await userEvent.click(second);
    expect(device.select).toHaveBeenCalledWith("b");
  });

  it("shows nothing when there is no choice to make", () => {
    const device = mockDevice([twoDevices[0]], "a");
    render(
      <Form.Root>
        <DeviceSelection
          device={device}
          title="Microphone"
          numberedLabel={(n) => `Microphone ${n}`}
        />
      </Form.Root>,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("Microphone")).toBeNull();
  });
});
