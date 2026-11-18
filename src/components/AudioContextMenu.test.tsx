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
  AudioContextMenu,
  type AudioContextMenuProps,
} from "./AudioContextMenu";
import { MediaButtonWithContextMenu } from "./MediaButtonWithContextMenu";
import { type MenuOptions } from "./DeviceMenu";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";
import { restoreAudioCapture, stubAudioCapture } from "../utils/test";

function withProviders(component: ReactNode): JSX.Element {
  return (
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames: () => {} } as unknown as MediaDevices}
      >
        {component}
      </MediaDevicesContext>
    </TooltipProvider>
  );
}

/** The menu as the microphone's button opens it. */
function AudioMenu(props: AudioContextMenuProps): JSX.Element {
  return (
    <MediaButtonWithContextMenu
      muteButton={null}
      label="Microphone"
      title="Microphone source"
    >
      <AudioContextMenu {...props} />
    </MediaButtonWithContextMenu>
  );
}

function renderMenu(component: ReactNode): RenderResult {
  return render(withProviders(component));
}

async function open(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Microphone" }));
}

const mics: MenuOptions[] = [
  { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
  { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
];

const speakers: MenuOptions[] = [
  { label: { type: "name", name: "Speakers" }, id: "spk1" },
  { label: { type: "name", name: "Headset" }, id: "spk2" },
];

describe("AudioContextMenu", () => {
  // Only one test stubs the capture; don't let it leak into the rest.
  afterEach(restoreAudioCapture);

  test("shows numbered devices correctly", async () => {
    renderMenu(
      <AudioMenu
        options={[
          { label: { type: "number", number: 1 }, id: "mic1" },
          { label: { type: "number", number: 2 }, id: "mic2" },
        ]}
        selectedOption="mic1"
      />,
    );

    await open();
    screen.getByRole("menuitemradio", { name: "Microphone 1" });
    screen.getByRole("menuitemradio", { name: "Microphone 2" });
  });

  test("calls select callback on menu click", async () => {
    const onSelect = vi.fn();
    renderMenu(
      <AudioMenu options={mics} selectedOption="mic1" onSelect={onSelect} />,
    );

    await open();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    expect(onSelect).toHaveBeenCalledWith("mic2");
  });

  test("does not call select callback on already selected menu click", async () => {
    const onSelect = vi.fn();
    renderMenu(
      <AudioMenu options={mics} selectedOption="mic1" onSelect={onSelect} />,
    );

    await open();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Microphone 1" }),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  test("renders menu spinner until selection updates for the component", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const onSelectPressed = vi.fn();
    const onOptionUpdated = vi.fn();
    function Wrapper(): JSX.Element {
      const [selectedOption, setSelectedOption] = useState("mic1");
      return (
        <AudioMenu
          options={mics}
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

    renderMenu(<Wrapper />);

    await open();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    expect(onSelectPressed).toHaveBeenCalled();
    expect(onOptionUpdated).not.toHaveBeenCalled();
    // Requested but not yet selected, so mic2 is activating
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

  test("marks the selected menu item as checked", async () => {
    renderMenu(<AudioMenu options={mics} selectedOption="mic2" />);

    await open();

    screen.getByRole("menuitemradio", { name: "Microphone 2", checked: true });
    screen.getByRole("menuitemradio", { name: "Microphone 1", checked: false });
  });

  test("disables every device while a selection is settling", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    function Wrapper(): JSX.Element {
      const [selectedOption, setSelectedOption] = useState("mic1");
      return (
        <AudioMenu
          options={mics}
          selectedOption={selectedOption}
          onSelect={(id) => {
            void promise.then(() => setSelectedOption(id));
          }}
          outputOptions={speakers}
          selectedOutputOption="spk1"
          onSelectOutput={vi.fn()}
        />
      );
    }

    renderMenu(<Wrapper />);
    await open();
    await userEvent.click(
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
    // onSelect never reports back, as when a device is removed mid-switch.
    renderMenu(
      <AudioMenu
        options={mics}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={speakers}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />,
    );

    await open();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );
    await userEvent.keyboard("{Escape}");
    await open();

    for (const name of ["Microphone 1", "Speakers", "Headset"]) {
      expect(screen.getByRole("menuitemradio", { name })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  test("lets go of a device switch whose device is unplugged", async () => {
    const menu = (options: MenuOptions[]): JSX.Element =>
      withProviders(
        <AudioMenu
          options={options}
          selectedOption="mic1"
          onSelect={vi.fn()}
          outputOptions={speakers}
          selectedOutputOption="spk1"
          onSelectOutput={vi.fn()}
        />,
      );

    const { rerender } = render(menu(mics));
    await open();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Microphone 2" }),
    );

    // The second microphone is unplugged before the switch lands.
    rerender(menu(mics.slice(0, 1)));

    // Selectable again without closing the menu.
    expect(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  test("moves the level without re-rendering anything", async () => {
    // The level is drawn into the DOM, so a moving level commits nothing.
    const capture = stubAudioCapture();
    let commits = 0;

    renderMenu(
      <Profiler
        id="menu"
        onRender={(): void => {
          commits++;
        }}
      >
        <AudioMenu
          options={mics}
          selectedOption="mic1"
          onSelect={vi.fn()}
          outputOptions={speakers}
          selectedOutputOption="spk1"
          onSelectOutput={vi.fn()}
        />
      </Profiler>,
    );

    await open();
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

  test("marks focus as keyboard-driven only when the keyboard moved it", async () => {
    const user = userEvent.setup();
    renderMenu(
      <AudioMenu options={mics} selectedOption="mic1" onSelect={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Microphone" }));
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
    renderMenu(
      <AudioMenu options={mics} selectedOption="mic2" onSelect={vi.fn()} />,
    );

    await open();

    const selected = screen
      .getByRole("menuitemradio", { name: "Microphone 2" })
      .querySelector("input[type=radio]");
    expect(selected).toBeChecked();
    // readOnly would paint the selected radio muted.
    expect(selected).not.toHaveAttribute("readonly");
  });

  test("the open menu has no accessibility violations", async () => {
    renderMenu(
      <AudioMenu
        options={mics}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={speakers}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />,
    );

    await open();

    const menu = document.querySelector('[role="menu"]');
    expect(await axe(menu as HTMLElement)).toHaveNoViolations();
  });

  test("puts the speaker section above the microphone section", async () => {
    renderMenu(
      <AudioMenu
        options={mics}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={speakers}
        selectedOutputOption="spk1"
        onSelectOutput={vi.fn()}
      />,
    );

    await open();

    const speaker = screen.getByRole("menuitemradio", { name: "Speakers" });
    const microphone = screen.getByRole("menuitemradio", {
      name: "Microphone 1",
    });
    expect(
      speaker.compareDocumentPosition(microphone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("lists speaker and microphone sections", async () => {
    renderMenu(
      <AudioMenu
        options={mics}
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

    await open();

    screen.getByRole("menuitemradio", {
      name: "Default (Built-in Output)",
      checked: true,
    });
    screen.getByRole("menuitemradio", { name: "Headset", checked: false });
    screen.getByRole("menuitemradio", { name: "Microphone 1", checked: true });
    screen.getByRole("menuitemradio", { name: "Microphone 2", checked: false });
  });

  test("calls the output select callback on speaker click", async () => {
    const onSelectOutput = vi.fn();
    renderMenu(
      <AudioMenu
        options={mics}
        selectedOption="mic1"
        outputOptions={speakers}
        selectedOutputOption="spk1"
        onSelectOutput={onSelectOutput}
      />,
    );

    await open();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Headset" }),
    );

    expect(onSelectOutput).toHaveBeenCalledWith("spk2");
  });

  test("shows a single device entry disabled", async () => {
    renderMenu(
      <AudioMenu
        options={mics.slice(0, 1)}
        selectedOption="mic1"
        onSelect={vi.fn()}
      />,
    );

    await open();

    // Shown, but not selectable.
    const only = screen.getByRole("menuitemradio", { name: "Microphone 1" });
    expect(only).toHaveAttribute("aria-disabled", "true");
  });

  test("shows a default speaker where the platform lists none", async () => {
    renderMenu(
      <AudioMenu
        options={mics}
        selectedOption="mic1"
        onSelect={vi.fn()}
        // As Safari: no outputs listed.
        outputOptions={[]}
        selectedOutputOption={undefined}
        onSelectOutput={undefined}
      />,
    );

    await open();

    const speakerGroup = screen
      .getAllByRole("group")
      .find((group) => group.getAttribute("aria-label") === "Speaker")!;
    const entries = within(speakerGroup).getAllByRole("menuitemradio");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveAccessibleName("Default");
    expect(entries[0]).toHaveAttribute("aria-disabled", "true");
    expect(entries[0]).toHaveAttribute("aria-checked", "true");
    expect(
      within(entries[0]).getByRole("radio", { hidden: true }),
    ).toBeChecked();
  });

  test("shows the speaker section disabled when output selection is unsupported", async () => {
    renderMenu(
      <AudioMenu
        options={mics}
        selectedOption="mic1"
        onSelect={vi.fn()}
        outputOptions={speakers}
        selectedOutputOption="spk1"
        onSelectOutput={undefined}
      />,
    );

    await open();

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
