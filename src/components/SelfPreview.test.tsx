/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";

import { SelfPreview } from "./SelfPreview";
import styles from "./SelfPreview.module.css";
import { mockVideoTrack } from "../utils/test";

describe("SelfPreview", () => {
  it("detaches only its own element from a camera shown twice", () => {
    const track = mockVideoTrack({});
    const first = render(<SelfPreview track={track} />);
    const second = render(<SelfPreview track={track} />);
    const [a, b] = [first, second].map((r) =>
      r.container.querySelector("video"),
    );
    expect(track.attach).toHaveBeenCalledWith(a);
    expect(track.attach).toHaveBeenCalledWith(b);

    first.unmount();
    expect(track.detach).toHaveBeenCalledExactlyOnceWith(a);
  });

  it("mirrors the camera while it faces the user, and only then", () => {
    const facingMode$ = new BehaviorSubject<"user" | "environment">("user");
    const { container } = render(
      <SelfPreview track={mockVideoTrack({ facingMode$ })} />,
    );
    const video = (): HTMLVideoElement => container.querySelector("video")!;
    expect(video().classList.contains(styles.mirrored)).toBe(true);
    act(() => facingMode$.next("environment"));
    expect(video().classList.contains(styles.mirrored)).toBe(false);
  });

  it("says the camera is off while there is none", () => {
    const { container } = render(<SelfPreview track={null} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
