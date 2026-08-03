/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { act, render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState, type ReactNode } from "react";
import { TooltipProvider } from "@vector-im/compound-web";

import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";

interface RenderOptions {
  requestDeviceNames: () => void;
}

function renderComponent(
  component: ReactNode,
  { requestDeviceNames = (): void => {} }: Partial<RenderOptions> = {},
): RenderResult {
  return render(
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames } as unknown as MediaDevices}
      >
        {component}
      </MediaDevicesContext>
    </TooltipProvider>,
  );
}

describe("MediaMuteAndSwitchButton", () => {
  test("renders", () => {
    const { container } = renderComponent(
      <TooltipProvider>
        <MediaMuteAndSwitchButton title={"Switcher"} iconsAndLabels={"audio"} />
      </TooltipProvider>,
    );
    expect(container).toMatchSnapshot();
  });

  test("renders correct audio and video labels", () => {
    const renderLabels = (
      type: "video" | "audio",
      enabled: boolean,
    ): RenderResult => {
      return renderComponent(
        <MediaMuteAndSwitchButton
          title={"Switcher"}
          iconsAndLabels={type}
          enabled={enabled}
        />,
      );
    };
    const renderAudioEndabled = renderLabels("audio", true);
    const renderAudioDisabled = renderLabels("audio", false);
    const renderVideoEnabled = renderLabels("video", true);
    const renderVideoDisabled = renderLabels("video", false);

    expect(
      renderAudioEndabled.getByRole("switch", { name: "Mute microphone" }),
    ).toBeInTheDocument();
    expect(
      renderAudioDisabled.getByRole("switch", { name: "Unmute microphone" }),
    ).toBeInTheDocument();
    expect(
      renderVideoEnabled.getByRole("switch", { name: "Start video" }),
    ).toBeInTheDocument();
    expect(
      renderVideoDisabled.getByRole("switch", { name: "Stop video" }),
    ).toBeInTheDocument();
  });

  test("calls mute on mute press", async () => {
    const user = userEvent.setup();
    const onMute = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title={"Switcher"}
        onMuteClick={onMute}
        iconsAndLabels="audio"
        enabled={true}
      />,
    );

    await user.click(getByRole("switch", { name: "Mute microphone" }));

    expect(onMute).toHaveBeenCalled();
  });

  test("disables mute button while busy", async () => {
    const user = userEvent.setup();
    const onMute = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title={"Switcher"}
        onMuteClick={onMute}
        iconsAndLabels="audio"
        enabled={true}
        busy={true}
      />,
    );

    const muteButton = getByRole("switch", { name: "Mute microphone" });
    expect(muteButton).toHaveAttribute("aria-disabled", "true");
    expect(muteButton).toHaveAttribute("aria-busy", "true");

    await user.click(muteButton);
    expect(onMute).not.toHaveBeenCalled();
  });

  test("disables video button while busy", async () => {
    const user = userEvent.setup();
    const onMute = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title={"Switcher"}
        onMuteClick={onMute}
        iconsAndLabels="video"
        enabled={true}
        busy={true}
      />,
    );

    const videoButton = getByRole("switch", { name: "Stop video" });
    expect(videoButton).toHaveAttribute("aria-disabled", "true");
    expect(videoButton).toHaveAttribute("aria-busy", "true");

    await user.click(videoButton);
    expect(onMute).not.toHaveBeenCalled();
  });

  test("requests device names when opened", async () => {
    const user = userEvent.setup();
    const requestDeviceNames = vi.fn();
    renderComponent(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled
      />,
      { requestDeviceNames },
    );

    expect(requestDeviceNames).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    expect(requestDeviceNames).toHaveBeenCalled();
  });

  test("shows numbered devices correctly", async () => {
    const user = userEvent.setup();
    renderComponent(
      <>
        <MediaMuteAndSwitchButton
          title="Switcher"
          iconsAndLabels="audio"
          enabled
          options={[
            { label: { type: "number", number: 1 }, id: "mic1" },
            { label: { type: "number", number: 2 }, id: "mic2" },
          ]}
          selectedOption="mic1"
        />
        <MediaMuteAndSwitchButton
          title="Switcher"
          iconsAndLabels="video"
          enabled
          options={[
            { label: { type: "number", number: 1 }, id: "cam1" },
            { label: { type: "number", number: 2 }, id: "cam2" },
          ]}
          selectedOption="cam1"
        />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Microphone" }));
    screen.getByRole("menuitemradio", { name: "Microphone 1" });
    screen.getByRole("menuitemradio", { name: "Microphone 2" });
    await user.keyboard("[Escape]");
    await user.click(screen.getByRole("button", { name: "Camera" }));
    screen.getByRole("menuitemradio", { name: "Camera 1" });
    screen.getByRole("menuitemradio", { name: "Camera 2" });
  });

  test("calls select callback on menu click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={onSelect}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    expect(onSelect).toHaveBeenCalledWith("mic2");
  });
  test("does not call select callback on already selected menu click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={onSelect}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Microphone 1" }),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  test("renders menu spinner until selection updates for the component", async () => {
    const user = userEvent.setup();
    const { promise, resolve } = Promise.withResolvers<void>();
    const onSelectPressed = vi.fn();
    const onOptionUpdated = vi.fn();
    function Wrapper(): JSX.Element {
      const [selectedOption, setSelectedOption] = useState("mic1");
      return (
        <MediaMuteAndSwitchButton
          title="Switcher"
          iconsAndLabels="audio"
          enabled={true}
          options={[
            { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
            { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
          ]}
          selectedOption={selectedOption}
          onSelect={(id) => {
            onSelectPressed();
            void promise.then(() => {
              setSelectedOption(id);
              onOptionUpdated();
            });
          }}
        />
      );
    }

    const { getByRole } = renderComponent(<Wrapper />);

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    expect(onSelectPressed).toHaveBeenCalled();
    expect(onOptionUpdated).not.toHaveBeenCalled();
    // After clicking, plannedSelection="mic2" but selectedOption is still "mic1",
    // so mic2 should be in an activating state
    screen.getByRole("menuitemradio", {
      name: "Microphone 2 Activating…",
      checked: false,
    });

    // The currently-selected mic1 item should not be activating
    screen.getByRole("menuitemradio", {
      name: "Microphone 1",
      checked: true,
    });
    await act(async () => {
      // resolve the promise that acutally updates the select option.
      resolve();
      await promise;
    });

    expect(onOptionUpdated).toHaveBeenCalled();
    // Spinner should now be gone since the selection has caught up
    const mic2ItemAfter = screen.getByRole("menuitemradio", {
      name: "Microphone 2",
    });
    expect(mic2ItemAfter.querySelector(".rotate")).toBeNull();
  });

  test("renders menu with toggle control and calls toggle callback", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onVideoBlurToggle = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="video"
        enabled={true}
        videoBlurToggleClick={onVideoBlurToggle}
        onSelect={onSelect}
      />,
    );

    await user.click(getByRole("button", { name: "Camera" }));

    const toggle = screen.getByRole("menuitemcheckbox", {
      name: "Blur background",
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(onVideoBlurToggle).toHaveBeenCalled();
  });

  test("renders check icon to mark the selected menu item", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic2"
      />,
    );

    // open menu
    await user.click(getByRole("button", { name: "Microphone" }));

    // The selected item (mic2) renders both an IconOptions SVG and a CheckIcon SVG
    const mic1Item = screen.getByRole("menuitemradio", {
      name: "Microphone 2",
    });
    expect(mic1Item.querySelectorAll("svg").length).toBe(2);

    // The unselected item (mic1) only renders its IconOptions SVG
    const mic2Item = screen.getByRole("menuitemradio", {
      name: "Microphone 1",
    });
    expect(mic2Item.querySelectorAll("svg").length).toBe(1);
  });
});
