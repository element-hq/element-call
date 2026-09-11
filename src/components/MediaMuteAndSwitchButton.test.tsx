/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState, type ReactNode } from "react";
import { TooltipProvider } from "@vector-im/compound-web";

import {
  MediaMuteAndSwitchButton,
  type AudioControls,
} from "./MediaMuteAndSwitchButton";
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

describe("audio menu", () => {
  test("level indicator is on screen as soon as the menu opens", async () => {
    // A microphone takes a moment to open. The meter waits at rest rather
    // than appearing late and pushing the rest of the menu down.
    getUserMedia.mockReturnValue(new Promise<MediaStream>(() => {}));
    await openAudioMenu();

    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(screen.queryByTestId("mic_absent")).toBe(null);
  });

  test("level indicator responds while muted", async () => {
    await openAudioMenu({ enabled: false });

    // Muting must not stop the meter: checking the microphone before unmuting
    // is the whole point of it.
    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: { deviceId: { exact: "mic-1" } },
      }),
    );
    expect(screen.getByRole("meter")).toBeInTheDocument();
  });

  test("audio menu starts capture on open and stops on close", async () => {
    const user = userEvent.setup();
    renderAudioMenu();
    expect(getUserMedia).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Microphone" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    await user.keyboard("[Escape]");
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  test("level indicator follows a microphone change", async () => {
    const user = userEvent.setup();
    function Wrapper(): JSX.Element {
      const [mic, setMic] = useState("mic-1");
      return (
        <MediaMuteAndSwitchButton
          title="Audio controls"
          iconsAndLabels="audio"
          enabled
          onMuteClick={vi.fn()}
          options={micOptions}
          selectedOption={mic}
          onSelect={setMic}
          audioControls={audioControls({ micDeviceId: mic })}
        />
      );
    }
    renderComponent(<Wrapper />);
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({
        audio: { deviceId: { exact: "mic-1" } },
      }),
    );

    await user.click(
      screen.getByRole("menuitemradio", { name: "Headset Microphone" }),
    );

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({
        audio: { deviceId: { exact: "mic-2" } },
      }),
    );
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toBeInTheDocument();
  });

  test("audio menu hints when microphone permission is denied", async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error("no"), { name: "NotAllowedError" }),
    );
    await openAudioMenu();

    expect(await screen.findByTestId("mic_level_denied")).toHaveTextContent(
      /microphone access is blocked/i,
    );
    expect(screen.queryByRole("meter")).toBe(null);
  });

  test("level indicator stays with the microphone list rather than the speakers", async () => {
    await openAudioMenu();

    // The meter reads the microphone, so it belongs to that group and never
    // sits among the output controls.
    const micSection = screen.getByTestId("audio_menu_mic_section");
    expect(micSection).toContainElement(
      screen.getByRole("menuitemradio", { name: "Headset Microphone" }),
    );
    expect(micSection).toContainElement(screen.getByTestId("mic_level_meter"));
    expect(micSection).not.toContainElement(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    );
  });

  test("audio menu switches microphone and stays open", async () => {
    const onSelect = vi.fn();
    const user = await openAudioMenu({ onSelect });

    await user.click(
      screen.getByRole("menuitemradio", { name: "Headset Microphone" }),
    );

    expect(onSelect).toHaveBeenCalledWith("mic-2");
    // Selecting a device must not dismiss the menu: the user needs to see the
    // choice take effect and may want to change it again.
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  test("audio menu switches audio output and stays open", async () => {
    const controls = audioControls();
    const user = await openAudioMenu({ audioControls: controls });

    await user.click(screen.getByRole("menuitemradio", { name: "Headset" }));

    expect(controls.onSelectOutput).toHaveBeenCalledWith("out-2");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  test("audio menu says when there is no microphone", async () => {
    await openAudioMenu({
      micOptions: [],
      audioControls: audioControls({ micDeviceId: undefined }),
    });

    // A meter resting at zero would read as a microphone that hears nothing,
    // so the group names the absence instead.
    expect(screen.getByTestId("mic_absent")).toHaveTextContent(
      /no microphone found/i,
    );
    expect(screen.queryByRole("meter")).toBe(null);
    // The rest of the menu is unaffected.
    expect(
      screen.getByRole("menuitemradio", { name: "Built-in Speakers" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sound_effect_volume")).toBeInTheDocument();
  });

  test("audio menu marks the active output", async () => {
    await openAudioMenu();

    expect(
      screen.getByRole("menuitemradio", { name: "Built-in Speakers" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  test("audio menu separates microphone speaker and sound effects groups", async () => {
    await openAudioMenu();

    // One rule after the microphone group, one after the speaker group.
    expect(screen.getByRole("menu").querySelectorAll("hr")).toHaveLength(2);
    expect(screen.getByTestId("mic_level_meter")).toBeInTheDocument();
    expect(screen.getByTestId("sound_effect_volume")).toBeInTheDocument();
  });

  test("audio menu keeps its title and volume slider out of the scrolling area", async () => {
    await openAudioMenu();

    // Machines with many inputs and outputs produce a device list taller than
    // the menu can be. Only that list scrolls; the heading above it and the
    // sound-effect slider below it stay put.
    const scroll = screen.getByTestId("audio_menu_scroll");
    expect(scroll).toContainElement(
      screen.getByRole("menuitemradio", { name: "Headset Microphone" }),
    );
    expect(scroll).toContainElement(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    );
    expect(scroll).not.toContainElement(
      screen.getByTestId("sound_effect_volume"),
    );
    expect(scroll).not.toContainElement(
      screen.getByRole("heading", { name: "Audio controls" }),
    );
  });

  test("audio menu is fully operable from the keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const controls = audioControls();
    renderAudioMenu({ onSelect, audioControls: controls });

    // Open from the chevron; the first device row takes focus.
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Microphone" })).toHaveFocus();
    await user.keyboard("[Enter]");
    await screen.findByRole("menu");
    expect(
      screen.getByRole("menuitemradio", { name: "Built-in Microphone" }),
    ).toHaveFocus();

    // Arrow keys walk the microphone rows; Enter selects and keeps the menu.
    await user.keyboard("[ArrowDown]");
    const headsetMic = screen.getByRole("menuitemradio", {
      name: /Headset Microphone/,
    });
    expect(headsetMic).toHaveFocus();
    await user.keyboard("[Enter]");
    expect(onSelect).toHaveBeenCalledWith("mic-2");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Tab reaches the meter below the microphones, then the slider; arrow
    // keys adjust the slider without moving the menu's focus.
    await user.tab();
    expect(screen.getByRole("meter")).toHaveFocus();
    await user.tab();
    const slider = screen.getByRole("slider", { name: /Sound effect volume/ });
    expect(slider).toHaveFocus();
    await user.keyboard("[ArrowRight]");
    expect(controls.onSoundEffectVolumeCommit).toHaveBeenCalledWith(0.51);
    expect(slider).toHaveFocus();

    // Shift+Tab walks back to the meter and the current row; from there the
    // arrow keys carry on into the speaker rows.
    await user.tab({ shift: true });
    expect(screen.getByRole("meter")).toHaveFocus();
    await user.tab({ shift: true });
    expect(headsetMic).toHaveFocus();
    await user.keyboard("[ArrowDown][ArrowDown]");
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).toHaveFocus();
    await user.keyboard("[Enter]");
    expect(controls.onSelectOutput).toHaveBeenCalledWith("out-2");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  test("audio menu does not reselect the active output", async () => {
    const controls = audioControls();
    const user = await openAudioMenu({ audioControls: controls });

    await user.click(
      screen.getByRole("menuitemradio", { name: "Built-in Speakers" }),
    );

    expect(controls.onSelectOutput).not.toHaveBeenCalled();
  });

  test("audio menu shows single audio output as non-selectable", async () => {
    await openAudioMenu({
      audioControls: audioControls({
        outputOptions: [
          { label: { type: "name", name: "Built-in Speakers" }, id: "out-1" },
        ],
      }),
    });

    expect(screen.getByTestId("speaker_readonly")).toHaveTextContent(
      "Built-in Speakers",
    );
    // The one output must not present itself as a choice.
    expect(
      screen.queryByRole("menuitemradio", { name: "Built-in Speakers" }),
    ).toBe(null);
  });

  test("audio menu names the default output where none can be chosen", async () => {
    await openAudioMenu({
      audioControls: audioControls({ outputOptions: [] }),
    });
    expect(screen.getByTestId("speaker_readonly")).toHaveTextContent("Default");
  });

  test("audio menu labels every kind of output", async () => {
    await openAudioMenu({
      audioControls: audioControls({
        outputOptions: [
          { label: { type: "default", name: "Built-in Speakers" }, id: "" },
          { label: { type: "default", name: null }, id: "default" },
          { label: { type: "number", number: 2 }, id: "out-2" },
          { label: { type: "speaker" }, id: "speaker" },
          { label: { type: "earpiece" }, id: "earpiece" },
        ],
        selectedOutput: "",
      }),
    });

    for (const name of [
      "Default (Built-in Speakers)",
      "Default",
      "Speaker 2",
      "Loudspeaker",
      "Handset",
    ])
      expect(screen.getByRole("menuitemradio", { name })).toBeInTheDocument();
  });

  const stop = vi.fn();
  const getUserMedia = vi.fn();

  beforeEach(() => {
    stop.mockClear();
    getUserMedia.mockReset().mockResolvedValue({
      getTracks: () => [{ stop }],
    } as unknown as MediaStream);
    // Define only mediaDevices: replacing the whole navigator drops the
    // prototype getters that user-event relies on.
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    // jsdom has no AudioContext; the meter only needs a silent analyser.
    vi.stubGlobal(
      "AudioContext",
      class {
        public createAnalyser(): unknown {
          return {
            fftSize: 1024,
            getFloatTimeDomainData: (out: Float32Array): void => {
              out.fill(0);
            },
          };
        }
        public createMediaStreamSource(): { connect: () => void } {
          return { connect: (): void => {} };
        }
        public async resume(): Promise<void> {}
        public async close(): Promise<void> {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  const micOptions = [
    {
      label: { type: "name" as const, name: "Built-in Microphone" },
      id: "mic-1",
    },
    {
      label: { type: "name" as const, name: "Headset Microphone" },
      id: "mic-2",
    },
  ];

  function audioControls(over: Partial<AudioControls> = {}): AudioControls {
    return {
      outputOptions: [
        {
          label: { type: "name" as const, name: "Built-in Speakers" },
          id: "out-1",
        },
        { label: { type: "name" as const, name: "Headset" }, id: "out-2" },
      ],
      selectedOutput: "out-1",
      onSelectOutput: vi.fn(),
      micDeviceId: "mic-1",
      soundEffectVolume: 0.5,
      onSoundEffectVolumeCommit: vi.fn(),
      ...over,
    };
  }

  interface AudioMenuProps {
    enabled?: boolean;
    audioControls?: AudioControls;
    onSelect?: (id: string) => void;
    micOptions?: typeof micOptions;
  }

  /** Renders the microphone button with the audio menu, closed. */
  function renderAudioMenu(props: AudioMenuProps = {}): void {
    renderComponent(
      <MediaMuteAndSwitchButton
        title="Audio controls"
        iconsAndLabels="audio"
        enabled={props.enabled ?? true}
        onMuteClick={vi.fn()}
        options={props.micOptions ?? micOptions}
        selectedOption="mic-1"
        onSelect={props.onSelect ?? vi.fn()}
        audioControls={props.audioControls ?? audioControls()}
      />,
    );
  }

  /** Renders the microphone button with the audio menu and opens the menu. */
  async function openAudioMenu(
    props: AudioMenuProps = {},
  ): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    renderAudioMenu(props);
    await user.click(screen.getByRole("button", { name: "Microphone" }));
    await screen.findByRole("menu");
    return user;
  }
});
