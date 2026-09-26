/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessorWrapper } from "@livekit/track-processors";

import { OneStepPipeline } from "./OneStepPipeline";
import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";
import { flushPromises } from "../utils/test";

const opts = {} as Parameters<OneStepPipeline["init"]>[0];

describe("OneStepPipeline", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stops and builds again only once a build has finished", async () => {
    let finishBuild!: () => void;
    const init = vi
      .spyOn(ProcessorWrapper.prototype, "init")
      .mockImplementationOnce(
        async () => new Promise((resolve) => (finishBuild = resolve)),
      )
      .mockResolvedValue();
    const destroy = vi
      .spyOn(ProcessorWrapper.prototype, "destroy")
      .mockResolvedValue();
    const pipeline = new OneStepPipeline(
      new BackgroundEffectTransformer({}),
      "test",
    );

    const first = pipeline.init(opts);
    const stopped = pipeline.destroy();
    const second = pipeline.init(opts);
    await flushPromises();
    expect(init).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();

    finishBuild();
    await Promise.all([first, stopped, second]);
    expect(init).toHaveBeenCalledTimes(2);
    expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(
      init.mock.invocationCallOrder[1],
    );
  });

  it("restarts in one step, without waiting on itself", async () => {
    const init = vi
      .spyOn(ProcessorWrapper.prototype, "init")
      .mockResolvedValue();
    const destroy = vi
      .spyOn(ProcessorWrapper.prototype, "destroy")
      .mockResolvedValue();
    const pipeline = new OneStepPipeline(
      new BackgroundEffectTransformer({}),
      "test",
    );

    await pipeline.restart(opts);
    expect(destroy).toHaveBeenCalledWith({ willProcessorRestart: true });
    expect(init).toHaveBeenCalledOnce();
  });

  it("carries on after a step that failed", async () => {
    vi.spyOn(ProcessorWrapper.prototype, "init")
      .mockRejectedValueOnce(new Error("no GPU"))
      .mockResolvedValue();
    const pipeline = new OneStepPipeline(
      new BackgroundEffectTransformer({}),
      "test",
    );

    await expect(pipeline.init(opts)).rejects.toThrow("no GPU");
    await expect(pipeline.init(opts)).resolves.toBeUndefined();
  });
});
