/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { act, render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";

import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";

describe("MediaMuteAndSwitchButton", () => {
  test("renders", () => {
    const { container } = render(
      <MediaMuteAndSwitchButton title={"Switcher"} />,
    );
    expect(container).toMatchSnapshot();
  });

  test("renders correct audio and video labels", () => {
    const renderLabels = (
      type: "video" | "audio",
      enabled: boolean,
    ): RenderResult => {
      return render(
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
      renderAudioEndabled.getByRole("button", { name: "Mute microphone" }),
    ).toBeInTheDocument();
    expect(
      renderAudioDisabled.getByRole("button", { name: "Unmute microphone" }),
    ).toBeInTheDocument();
    expect(
      renderVideoEnabled.getByRole("button", { name: "Start video" }),
    ).toBeInTheDocument();
    expect(
      renderVideoDisabled.getByRole("button", { name: "Stop video" }),
    ).toBeInTheDocument();
  });

  test("calls mute on mute press", async () => {
    const user = userEvent.setup();
    const onMute = vi.fn();
    const { getByRole } = render(
      <MediaMuteAndSwitchButton
        title={"Switcher"}
        onMuteClick={onMute}
        iconsAndLabels="audio"
        enabled={true}
      />,
    );

    await user.click(getByRole("button", { name: "Mute microphone" }));

    expect(onMute).toHaveBeenCalled();
  });

  test("calls select callback on menu click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { getByRole } = render(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: "Microphone 1", id: "mic1" },
          { label: "Microphone 2", id: "mic2" },
        ]}
        selectedOption="mic1"
        onSelect={onSelect}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(screen.getByRole("menuitem", { name: "Microphone 2" }));

    expect(onSelect).toHaveBeenCalledWith("mic2");
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
            { label: "Microphone 1", id: "mic1" },
            { label: "Microphone 2", id: "mic2" },
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

    const { getByRole } = render(<Wrapper />);

    await user.click(getByRole("button", { name: "Microphone" }));
    await user.click(screen.getByRole("menuitem", { name: "Microphone 2" }));

    expect(onSelectPressed).toHaveBeenCalled();
    expect(onOptionUpdated).not.toHaveBeenCalled();
    // After clicking, plannedSelection="mic2" but selectedOption is still "mic1",
    // so a spinner should appear on the mic2 item
    const mic2Item = screen.getByRole("menuitem", { name: "Microphone 2" });
    expect(mic2Item.querySelector(".rotate")).toBeTruthy();

    // The currently-selected mic1 item should not have a spinner
    const mic1Item = screen.getByRole("menuitem", { name: "Microphone 1" });
    expect(mic1Item.querySelector(".rotate")).toBeNull();
    await act(async () => {
      // resolve the promise that acutally updates the select option.
      resolve();
      await promise;
    });

    expect(onOptionUpdated).toHaveBeenCalled();
    // Spinner should now be gone since the selection has caught up
    const mic2ItemAfter = screen.getByRole("menuitem", {
      name: "Microphone 2",
    });
    expect(mic2ItemAfter.querySelector(".rotate")).toBeNull();
  });

  test("renders menu with toggle control and calls toggle callback", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { getByRole } = render(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled={true}
        toggles={[{ label: "Background blur", id: "bg_blur", enabled: false }]}
        onSelect={onSelect}
      />,
    );

    await user.click(getByRole("button", { name: "Microphone" }));

    const toggle = screen.getByRole("menuitemcheckbox", {
      name: "Background blur",
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(onSelect).toHaveBeenCalledWith("bg_blur");
  });

  test("renders check icon to mark the selected menu item", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(
      <MediaMuteAndSwitchButton
        title="Switcher"
        iconsAndLabels="audio"
        enabled={true}
        options={[
          { label: "Microphone 1", id: "mic1" },
          { label: "Microphone 2", id: "mic2" },
        ]}
        selectedOption="mic2"
      />,
    );

    // open menu
    await user.click(getByRole("button", { name: "Microphone" }));

    // The selected item (mic2) renders both an IconOptions SVG and a CheckIcon SVG
    const mic1Item = screen.getByRole("menuitem", { name: "Microphone 2" });
    expect(mic1Item.querySelectorAll("svg").length).toBe(2);

    // The unselected item (mic1) only renders its IconOptions SVG
    const mic2Item = screen.getByRole("menuitem", { name: "Microphone 1" });
    expect(mic2Item.querySelectorAll("svg").length).toBe(1);
  });
});
