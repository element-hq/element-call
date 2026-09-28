/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type MatrixClient } from "matrix-js-sdk";
import { TooltipProvider } from "@vector-im/compound-web";

import { SettingsModal } from "./SettingsModal";
import { backgroundEffect } from "./settings";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { mockMediaDevices } from "../utils/test";

vi.mock("../livekit/TrackProcessorContext", () => ({
  useTrackProcessor: (): ProcessorState => ({
    supported: true,
    processor: undefined,
  }),
}));

function renderVideoTab(): void {
  render(
    <TooltipProvider>
      <MediaDevicesContext
        value={mockMediaDevices({ requestDeviceNames: vi.fn() })}
      >
        <SettingsModal
          open
          onDismiss={vi.fn()}
          tab="video"
          onTabChange={vi.fn()}
          client={
            {
              getUserId: () => "@user:example.org",
              getUser: () => null,
            } as unknown as MatrixClient
          }
        />
      </MediaDevicesContext>
    </TooltipProvider>,
  );
}

const blurControl = (): HTMLElement =>
  screen.getByRole("checkbox", { name: "Blur the background of the video" });

describe("SettingsModal", () => {
  afterEach(() => backgroundEffect.setValue("none"));

  it("blur control turns blur on and off", async () => {
    const user = userEvent.setup();
    renderVideoTab();
    expect(blurControl()).not.toBeChecked();

    await user.click(blurControl());
    expect(backgroundEffect.getValue()).toBe("blur");
    expect(blurControl()).toBeChecked();

    await user.click(blurControl());
    expect(backgroundEffect.getValue()).toBe("none");
    expect(blurControl()).not.toBeChecked();
  });

  it("blur control reflects and replaces an image background", async () => {
    const user = userEvent.setup();
    backgroundEffect.setValue("image:arc");
    renderVideoTab();
    expect(blurControl()).not.toBeChecked();

    await user.click(blurControl());
    expect(backgroundEffect.getValue()).toBe("blur");
  });
});
