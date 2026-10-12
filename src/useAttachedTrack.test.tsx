/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type LocalVideoTrack } from "livekit-client";

import { useAttachedTrack } from "./useAttachedTrack";

vi.mock("livekit-client", () => ({
  facingModeFromLocalTrack: (track: { facing: string }): object => ({
    facingMode: track.facing,
  }),
}));

function cameraTrack(facing: string): LocalVideoTrack {
  return {
    facing,
    attach: vi.fn(),
    detach: vi.fn(),
  } as unknown as LocalVideoTrack;
}

const Video: FC<{ track: LocalVideoTrack | null }> = ({ track }) => {
  const { videoRef, mirrored } = useAttachedTrack(track);
  return <video ref={videoRef} data-mirrored={mirrored} />;
};

describe("useAttachedTrack", () => {
  it("detaches only its own element from a track shown twice", () => {
    const track = cameraTrack("user");
    const first = render(<Video track={track} />);
    const second = render(<Video track={track} />);
    const [a, b] = [first, second].map((r) =>
      r.container.querySelector("video"),
    );
    expect(track.attach).toHaveBeenCalledWith(a);
    expect(track.attach).toHaveBeenCalledWith(b);

    first.unmount();
    expect(track.detach).toHaveBeenCalledExactlyOnceWith(a);
  });

  it("mirrors a camera facing the user, and only that", () => {
    const { container, rerender } = render(
      <Video track={cameraTrack("user")} />,
    );
    expect(container.querySelector("video")?.dataset.mirrored).toBe("true");
    rerender(<Video track={cameraTrack("environment")} />);
    expect(container.querySelector("video")?.dataset.mirrored).toBe("false");
    rerender(<Video track={null} />);
    expect(container.querySelector("video")?.dataset.mirrored).toBe("false");
  });
});
