/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BackgroundProcessorWrapper } from "@livekit/track-processors";

type InitOptions = Parameters<BackgroundProcessorWrapper["init"]>[0];
type DestroyOptions = Parameters<BackgroundProcessorWrapper["destroy"]>[0];

/**
 * A background pipeline that is built, rebuilt and destroyed one step at a
 * time. The camera tracks sharing it attach and stop it independently, and
 * the SDK's wrapper holds a single track's streams: two builds at once
 * overwrite each other's, and a destroy during a build does nothing.
 */
export class OneStepPipeline extends BackgroundProcessorWrapper {
  private steps: Promise<void> = Promise.resolve();

  public override async init(opts: InitOptions): Promise<void> {
    return this.inTurn(async () => super.init(opts));
  }

  // The SDK's restart calls init and destroy, which would wait on itself.
  public override async restart(opts: InitOptions): Promise<void> {
    return this.inTurn(async () => {
      await super.destroy({ willProcessorRestart: true });
      await super.init(opts);
    });
  }

  public override async destroy(options?: DestroyOptions): Promise<void> {
    return this.inTurn(async () => super.destroy(options));
  }

  private async inTurn(step: () => Promise<void>): Promise<void> {
    const turn = this.steps.then(step);
    this.steps = turn.catch(() => {});
    return turn;
  }
}
