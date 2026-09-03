/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";

import {
  ElementWidgetActions,
  type ScreenShareAudioSessionRequest,
  type ScreenShareAudioSessionResponse,
  type WidgetHelpers,
} from "../../../widget.ts";

export interface AcquiredScreenShareAudioSession {
  sessionId: string;
}

export class ScreenShareAudioSessionCoordinator {
  private currentSessionId: string | null = null;

  public constructor(
    private readonly widget: WidgetHelpers | null,
    private readonly enabled: boolean,
    private readonly logger: Logger,
  ) {}

  public get current(): string | null {
    return this.currentSessionId;
  }

  public async acquire(): Promise<AcquiredScreenShareAudioSession | null> {
    await this.release();
    if (!this.enabled || !this.widget) return null;

    const sessionId = crypto.randomUUID();
    try {
      const response = await this.widget.api.transport.send<
        ScreenShareAudioSessionRequest,
        ScreenShareAudioSessionResponse
      >(ElementWidgetActions.ScreenShareAudioSession, {
        version: 1,
        state: "acquire",
        session_id: sessionId,
      });
      if (response.accepted !== true) return null;
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
      await this.widget?.api.transport.send<
        ScreenShareAudioSessionRequest,
        ScreenShareAudioSessionResponse
      >(ElementWidgetActions.ScreenShareAudioSession, {
        version: 1,
        state: "release",
        session_id: sessionId,
      });
    } catch {
      this.logger.info(
        "Isolated screen-share audio session release was not acknowledged",
      );
    }
  }
}
