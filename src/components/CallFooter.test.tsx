/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BehaviorSubject } from "rxjs";
import { Root as Form, TooltipProvider } from "@vector-im/compound-web";
import { type JSX, type ReactNode } from "react";

import { CallFooter } from "./CallFooter";
import { DeviceSelection } from "../settings/DeviceSelection";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import {
  type AudioOutputDeviceLabel,
  type MediaDevices,
  type SelectedAudioOutputDevice,
} from "../state/MediaDevices";
import { constant } from "../state/Behavior";
import { mockMediaDevices } from "../utils/test";
import {
  soundEffectVolume as soundEffectVolumeSetting,
  useSetting,
} from "../settings/settings";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local } from "../utils/test-fixtures";

describe("CallFooter", () => {
  afterEach(() => soundEffectVolumeSetting.setValue(0.5));

  test("sound effects volume from the menu applies to the next effect", async () => {
    const user = userEvent.setup();
    renderFooter(mediaDevicesWithOutputs());

    await user.click(screen.getByRole("button", { name: "Microphone" }));
    await screen.findByRole("menu");
    await user.keyboard("[ArrowDown]");
    await user.tab();
    await user.tab();
    await user.keyboard("[ArrowRight]");

    // The committed value lands in the setting the sound-effect player reads,
    // so the next effect plays at the new level.
    expect(soundEffectVolumeSetting.value$.value).toBe(0.51);
  });

  test("sound effects volume is shared between menu and settings", async () => {
    const user = userEvent.setup();
    renderFooter(mediaDevicesWithOutputs(), <SettingsVolume />);

    // Set from the menu, shown in settings.
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    await screen.findByRole("menu");
    await user.keyboard("[ArrowDown]");
    await user.tab();
    await user.tab();
    await user.keyboard("[ArrowRight]");
    await user.keyboard("[Escape]");
    expect(screen.getByRole("status")).toHaveTextContent("51%");

    // Set from settings, shown in the menu.
    await user.click(screen.getByRole("button", { name: "Set to 20%" }));
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    expect(
      await screen.findByRole("slider", { name: /Sound effect volume/ }),
    ).toHaveAttribute("aria-valuenow", "0.2");
  });

  test("audio menu is headed Audio controls", async () => {
    const user = userEvent.setup();
    renderFooter(mediaDevicesWithOutputs());

    await user.click(screen.getByRole("button", { name: "Microphone" }));

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("heading", { name: "Audio controls" }),
    ).toBeInTheDocument();
  });

  test("audio output selection is shared between menu and settings", async () => {
    const user = userEvent.setup();
    const mediaDevices = mediaDevicesWithOutputs();
    renderFooter(
      mediaDevices,
      <Form>
        <DeviceSelection
          device={mediaDevices.audioOutput}
          title="Speaker"
          numberedLabel={(n) => `Speaker ${n}`}
        />
      </Form>,
    );

    // Chosen in the menu, shown in settings. The open menu hides the rest of
    // the page from assistive technology, so it closes before settings is read.
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Headset" }),
    );
    await user.keyboard("[Escape]");
    expect(screen.getByRole("radio", { name: "Headset" })).toBeChecked();

    // Chosen in settings, shown in the menu.
    await user.click(screen.getByRole("radio", { name: "Built-in Speakers" }));
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Built-in Speakers" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  /** The in-call footer over its real view model, with settings beside it. */
  function renderFooter(
    mediaDevices: MediaDevices,
    settings?: ReactNode,
  ): void {
    const { footerVm } = getBasicCallViewModelEnvironment(
      [local, alice],
      undefined,
      mediaDevices,
    );
    render(
      <TooltipProvider>
        <MediaDevicesContext value={mediaDevices}>
          <ReactionsSenderContext
            value={{
              supportsReactions: false,
              toggleRaisedHand: async (): Promise<void> => Promise.resolve(),
              sendReaction: async (): Promise<void> => Promise.resolve(),
            }}
          >
            <CallFooter vm={footerVm} />
            {settings}
          </ReactionsSenderContext>
        </MediaDevicesContext>
      </TooltipProvider>,
    );
  }

  /** Reads and writes the volume the way the settings dialog does. */
  function SettingsVolume(): JSX.Element {
    const [volume, setVolume] = useSetting(soundEffectVolumeSetting);
    return (
      <>
        <output>{Math.round(volume * 100)}%</output>
        <button onClick={() => setVolume(0.2)}>Set to 20%</button>
      </>
    );
  }

  /** Two outputs whose selection is one shared value, as in MediaDevices. */
  function mediaDevicesWithOutputs(): MediaDevices {
    const selected$ = new BehaviorSubject<
      SelectedAudioOutputDevice | undefined
    >({ id: "out-1", virtualEarpiece: false });
    return mockMediaDevices({
      requestDeviceNames: vi.fn(),
      audioOutput: {
        available$: constant(
          new Map<string, AudioOutputDeviceLabel>([
            ["out-1", { type: "name", name: "Built-in Speakers" }],
            ["out-2", { type: "name", name: "Headset" }],
          ]),
        ),
        selected$,
        select: (id: string): void =>
          selected$.next({ id, virtualEarpiece: false }),
      },
    });
  }
});
