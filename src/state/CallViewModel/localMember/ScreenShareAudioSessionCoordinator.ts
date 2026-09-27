/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";

import { type HostBridge } from "../../../HostBridge.ts";

export interface AcquiredScreenShareAudioSession {
  sessionId: string;
}

export class ScreenShareAudioSessionCoordinator {
  private currentSessionId: string | null = null;

  public constructor(
    private readonly hostBridge: HostBridge,
    private readonly logger: Logger,
  ) {}

  public get current(): string | null {
    return this.currentSessionId;
  }

  public async acquire(): Promise<AcquiredScreenShareAudioSession | null> {
    await this.release();
    if (!this.hostBridge.supportsIsolatedScreenShareAudio) return null;

    const sessionId = crypto.randomUUID();
    try {
      const accepted =
        await this.hostBridge.acquireIsolatedScreenShareAudio(sessionId);
      if (!accepted) return null;
      this.currentSessionId = sessionId;
      return { sessionId };
    } catch {
      this.logger.info(
        "Isolated screen-share audio session was not accepted; using ordinary capture",
      );
      return null;
    }
  }

  public async release(sessionId = this.currentSessionId): Promise<void> {
    if (!sessionId || this.currentSessionId !== sessionId) return;
    this.currentSessionId = null;
    try {
      await this.hostBridge.releaseIsolatedScreenShareAudio(sessionId);
    } catch {
      this.logger.info(
        "Isolated screen-share audio session release was not acknowledged",
      );
    }
  }
}
