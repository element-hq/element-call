/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test, vi } from "vitest";
import { axe } from "vitest-axe";
import {
  act,
  render,
  screen,
  within,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, type JSX, useState, type ReactNode } from "react";
import { TooltipProvider } from "@vector-im/compound-web";

import {
  MediaMuteAndSwitchButton,
  type MenuOptions,
} from "./MediaMuteAndSwitchButton";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";
import { restoreAudioCapture, stubAudioCapture } from "../utils/test";

interface RenderOptions {
  requestDeviceNames: () => void;
}

function withProviders(
  component: ReactNode,
  { requestDeviceNames = (): void => {} }: Partial<RenderOptions> = {},
): JSX.Element {
  return (
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames } as unknown as MediaDevices}
      >
        {component}
      </MediaDevicesContext>
    </TooltipProvider>
  );
}

function renderComponent(
  component: ReactNode,
  options: Partial<RenderOptions> = {},
): RenderResult {
  return render(withProviders(component, options));
}

describe("MediaMuteAndSwitchButton", () => {
  // Only one test stubs the capture; don't let it leak into the rest.
  afterEach(restoreAudioCapture);

  test("renders", () => {
    const { container } = renderComponent(
      <TooltipProvider>
        <MediaMuteAndSwitchButton iconsAndLabels={"audio"} />
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
        <MediaMuteAndSwitchButton iconsAndLabels={type} enabled={enabled} />,
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
      <MediaMuteAndSwitchButton iconsAndLabels="audio" enabled />,
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
          iconsAndLabels="audio"
          enabled
          options={[
            { label: { type: "number", number: 1 }, id: "mic1" },
            { label: { type: "number", number: 2 }, id: "mic2" },
          ]}
          selectedOption="mic1"
        />
        <MediaMuteAndSwitchButton
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

  test("marks the selected menu item as checked", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic2"
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    screen.getByRole("menuitemradio", { name: "Microphone 2", checked: true });
    screen.getByRole("menuitemradio", { name: "Microphone 1", checked: false });
  });

  test("disables every device while a selection is settling", async () => {
    const user = userEvent.setup();
    const { promise, resolve } = Promise.withResolvers<void>();
    function Wrapper(): JSX.Element {
      const [selectedOption, setSelectedOption] = useState("mic1");
      return (
        <MediaMuteAndSwitchButton
          iconsAndLabels="audio"
          enabled={true}
          options={[
            { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
            { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
          ]}
          selectedOption={selectedOption}
          onSelect={(id) => {
            void promise.then(() => setSelectedOption(id));
          }}
          outputOptions={[
            { label: { type: "name", name: "Speakers" }, id: "spk1" },
            { label: { type: "name", name: "Headset" }, id: "spk2" },
          ]}
          selectedOutputOption="spk1"
          onSelectOutput={vi.fn()}
        />
      );
    }

    const { getByRole } = renderComponent(<Wrapper />);
    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    // In flight: nothing else can be picked, in either section.
    for (const name of ["Microphone 1", "Speakers", "Headset"]) {
      expect(screen.getByRole("menuitemradio", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }

    await act(async () => {
      resolve();
      await promise;
    });

    // Settled: selectable again.
    expect(
      screen.getByRole("menuitemradio", { name: "Microphone 1" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  test("lets go of a device switch that never arrives", async () => {
    const user = userEvent.setup();
    // onSelect never reports back, as when a device is removed mid-switch.
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={[
          { label: { type: "name", name: "Speakers" }, id: "spk1" },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );
    await user.keyboard("{Escape}");
    await user.click(getByRole("button", { name: "Microphone" }));

    for (const name of ["Microphone 1", "Speakers", "Headset"]) {
      expect(screen.getByRole("menuitemradio", { name })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  test("lets go of a device switch whose device is unplugged", async () => {
    const user = userEvent.setup();
    const mics: MenuOptions[] = [
      { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
      { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
    ];
    const menu = (options: MenuOptions[]): JSX.Element => (
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={options}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={[
          { label: { type: "name", name: "Speakers" }, id: "spk1" },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />
    );

    const { getByRole, rerender } = renderComponent(menu(mics));
    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    // The second microphone is unplugged before the switch lands.
    rerender(withProviders(menu(mics.slice(0, 1))));

    // Selectable again without closing the menu.
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  test("moves the level without re-rendering anything", async () => {
    // The level is drawn into the DOM, so a moving level commits nothing.
    const capture = stubAudioCapture();
    const user = userEvent.setup();
    let commits = 0;

    const { getByRole } = renderComponent(
      <Profiler
        id="menu"
        onRender={(): void => {
          commits++;
        }}
      >
        <MediaMuteAndSwitchButton
          iconsAndLabels="audio"
          enabled={true}
          options={[
            { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
            { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
          ]}
          selectedOption="mic1"
          onSelect={vi.fn()}
          outputOptions={[
            { label: { type: "name", name: "Speakers" }, id: "spk1" },
            { label: { type: "name", name: "Headset" }, id: "spk2" },
          ]}
          selectedOutputOption="spk1"
          onSelectOutput={vi.fn()}
        />
      </Profiler>,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    capture.grant();
    await vi.waitFor(() => expect(capture.contexts).toHaveLength(1));
    const meter = await screen.findByRole("meter");
    // The capture's arrival is one render: the idle level swapped for its own.
    await act(async () => {});
    const settled = commits;

    // The meter smooths by elapsed time, so hand-driven frames need a clock.
    let elapsed = performance.now();
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(() => (elapsed += 16));

    // One frame per task, as a browser delivers them: one act() would batch them.
    for (let step = 1; step <= 8; step++) {
      capture.speak(step / 8);
      await act(async () => {
        capture.drawFrames(1);
        await Promise.resolve();
      });
    }
    clock.mockRestore();

    expect(meter.getAttribute("aria-valuenow")).not.toBe("0");
    expect(commits - settled).toBe(0);
  });

  test("camera menu uses the same selection pattern and keeps the blur toggle", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="video"
        enabled={true}
        options={[
          { label: { type: "name", name: "Camera 1" }, id: "cam1" },
          { label: { type: "name", name: "Camera 2" }, id: "cam2" },
        ]}
        selectedOption="cam1"
        onSelect={vi.fn()}
        videoBlurToggleClick={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Camera" }));

    screen.getByRole("menuitemradio", { name: "Camera 1", checked: true });
    screen.getByRole("menuitemradio", { name: "Camera 2", checked: false });
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Blur background" }),
    ).toBeInTheDocument();
  });

  test("marks focus as keyboard-driven only when the keyboard moved it", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    const list = screen
      .getByRole("menuitemradio", { name: "Microphone 1" })
      .closest("[data-focus-source]");

    // The menu focuses whatever the pointer is over, so focus alone says nothing.
    expect(list).toHaveAttribute("data-focus-source", "pointer");

    await user.keyboard("{ArrowDown}");
    expect(list).toHaveAttribute("data-focus-source", "keyboard");

    await user.pointer({
      target: screen.getByRole("menuitemradio", { name: "Microphone 2" }),
      coords: { clientX: 10, clientY: 10 },
    });
    expect(list).toHaveAttribute("data-focus-source", "pointer");
  });

  test("marks the selected device with the accent fill", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic2"
        onSelect={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    const selected = screen
      .getByRole("menuitemradio", { name: "Microphone 2" })
      .querySelector("input[type=radio]");
    expect(selected).toBeChecked();
    // readOnly would paint the selected radio muted.
    expect(selected).not.toHaveAttribute("readonly");
  });

  test("the open menu has no accessibility violations", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={[
          { label: { type: "name", name: "Speakers" }, id: "spk1" },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    const menu = document.querySelector('[role="menu"]');
    expect(await axe(menu as HTMLElement)).toHaveNoViolations();
  });

  test("puts the speaker section above the microphone section", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={[
          { label: { type: "name", name: "Speakers" }, id: "spk1" },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    const speakers = screen.getByRole("menuitemradio", { name: "Speakers" });
    const microphone = screen.getByRole("menuitemradio", {
      name: "Microphone 1",
    });
    expect(
      speakers.compareDocumentPosition(microphone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("lists speaker and microphone sections", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={[
          {
            label: { type: "default", name: "Built-in Output" },
            id: "default",
          },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="default"
        onSelectOutput={vi.fn()}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    screen.getByRole("menuitemradio", {
      name: "Default (Built-in Output)",
      checked: true,
    });
    screen.getByRole("menuitemradio", { name: "Headset", checked: false });
    screen.getByRole("menuitemradio", { name: "Microphone 1", checked: true });
    screen.getByRole("menuitemradio", { name: "Microphone 2", checked: false });
  });

  test("calls the output select callback on speaker click", async () => {
    const user = userEvent.setup();
    const onSelectOutput = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        outputOptions={[
          { label: { type: "name", name: "Speakers" }, id: "spk1" },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="spk1"
        onSelectOutput={onSelectOutput}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Headset" }));

    expect(onSelectOutput).toHaveBeenCalledWith("spk2");
  });

  test("shows a single device entry disabled", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
        ]}
        selectedOption="mic1"
        onSelect={onSelect}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    // Shown, but not selectable.
    const only = screen.getByRole("menuitemradio", { name: "Microphone 1" });
    expect(only).toHaveAttribute("aria-disabled", "true");
  });

  test("shows a default speaker where the platform lists none", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
        // As Safari: no outputs listed.
        outputOptions={[]}
        selectedOutputOption={undefined}
        onSelectOutput={undefined}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    const speakers = screen
      .getAllByRole("group")
      .find((group) => group.getAttribute("aria-label") === "Speaker")!;
    const entries = within(speakers).getAllByRole("menuitemradio");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveAccessibleName("Default");
    expect(entries[0]).toHaveAttribute("aria-disabled", "true");
    expect(entries[0]).toHaveAttribute("aria-checked", "true");
    expect(
      within(entries[0]).getByRole("radio", { hidden: true }),
    ).toBeChecked();
  });

  test("shows the speaker section disabled when output selection is unsupported", async () => {
    const user = userEvent.setup();
    const { getByRole } = renderComponent(
      <MediaMuteAndSwitchButton
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
          { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={[
          { label: { type: "name", name: "Speakers" }, id: "spk1" },
          { label: { type: "name", name: "Headset" }, id: "spk2" },
        ]}
        selectedOutputOption="spk1"
        onSelectOutput={undefined}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    expect(
      screen.getByRole("menuitemradio", { name: "Speakers" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});
