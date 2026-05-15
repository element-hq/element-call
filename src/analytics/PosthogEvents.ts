/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type DisconnectReason } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import {
  type IPosthogEvent,
  PosthogAnalytics,
  RegistrationType,
} from "./PosthogAnalytics";

interface CallEnded extends IPosthogEvent {
  eventName: "CallEnded";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
  callParticipantsOnLeave: number;
  callParticipantsMax: number;
  callDuration: number;
  roomEventEncryptionKeysSent: number;
  roomEventEncryptionKeysReceived: number;
  roomEventEncryptionKeysReceivedAverageAge: number;
  callReconnectingCount: number;
  callReconnectingCountSync: number;
  callReconnectingCountMembership: number;
  callReconnectingCountProbablyLeft: number;
  callReconnectingCountLivekit: number;
}

export class CallEndedTracker {
  private cache: {
    startTime?: Date;
    maxParticipantsCount: number;
    reconnectingCount: number;
    reconnectingCountByReason: Record<CallReconnectingReason, number>;
  } = {
    startTime: undefined,
    maxParticipantsCount: 0,
    reconnectingCount: 0,
    reconnectingCountByReason: {
      sync: 0,
      membership: 0,
      probablyLeft: 0,
      livekit: 0,
    },
  };

  public cacheStartCall(time: Date): void {
    this.cache = {
      startTime: time,
      maxParticipantsCount: 0,
      reconnectingCount: 0,
      reconnectingCountByReason: {
        sync: 0,
        membership: 0,
        probablyLeft: 0,
        livekit: 0,
      },
    };
  }

  public cacheParticipantCountChanged(count: number): void {
    this.cache.maxParticipantsCount = Math.max(
      count,
      this.cache.maxParticipantsCount,
    );
  }

  public cacheReconnecting(reason: CallReconnectingReason): void {
    this.cache.reconnectingCount++;
    this.cache.reconnectingCountByReason[reason]++;
  }

  public track(
    callId: string,
    callParticipantsNow: number,
    sendInstantly: boolean,
    rtcSession: MatrixRTCSession,
  ): void {
    if (this.cache.startTime) {
      PosthogAnalytics.instance.trackEvent<CallEnded>(
        {
          eventName: "CallEnded",
          callId: callId,
          callParticipantsMax: this.cache.maxParticipantsCount,
          callParticipantsOnLeave: callParticipantsNow,
          callDuration: (Date.now() - this.cache.startTime.getTime()) / 1000,
          roomEventEncryptionKeysSent:
            rtcSession.statistics.counters.roomEventEncryptionKeysSent,
          roomEventEncryptionKeysReceived:
            rtcSession.statistics.counters.roomEventEncryptionKeysReceived,
          roomEventEncryptionKeysReceivedAverageAge:
            rtcSession.statistics.counters.roomEventEncryptionKeysReceived > 0
              ? rtcSession.statistics.totals
                  .roomEventEncryptionKeysReceivedTotalAge /
                rtcSession.statistics.counters.roomEventEncryptionKeysReceived
              : 0,
          callReconnectingCount: this.cache.reconnectingCount,
          callReconnectingCountSync: this.cache.reconnectingCountByReason.sync,
          callReconnectingCountMembership:
            this.cache.reconnectingCountByReason.membership,
          callReconnectingCountProbablyLeft:
            this.cache.reconnectingCountByReason.probablyLeft,
          callReconnectingCountLivekit:
            this.cache.reconnectingCountByReason.livekit,
        },
        { send_instantly: sendInstantly },
      );
    } else {
      logger.warn(
        "[PosthogEvents] Failed to send posthog callEnded event due to missing startTime",
      );
    }
  }
}

interface CallStarted extends IPosthogEvent {
  eventName: "CallStarted";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
}

export class CallStartedTracker {
  public track(callId: string): void {
    PosthogAnalytics.instance.trackEvent<CallStarted>({
      eventName: "CallStarted",
      callId: callId,
    });
  }
}

interface Signup extends IPosthogEvent {
  eventName: "Signup";
  signupDuration: number;
}

export class SignupTracker {
  private cache: { signupStart: Date; signupEnd: Date } = {
    signupStart: new Date(0),
    signupEnd: new Date(0),
  };

  public cacheSignupStart(time: Date): void {
    this.cache.signupStart = time;
  }

  public getSignupEndTime(): Date {
    return this.cache.signupEnd;
  }

  public cacheSignupEnd(time: Date): void {
    this.cache.signupEnd = time;
  }

  public track(): void {
    PosthogAnalytics.instance.trackEvent<Signup>({
      eventName: "Signup",
      signupDuration: Date.now() - this.cache.signupStart.getTime(),
    });
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Registered);
  }
}

interface Login extends IPosthogEvent {
  eventName: "Login";
}

export class LoginTracker {
  public track(): void {
    PosthogAnalytics.instance.trackEvent<Login>({
      eventName: "Login",
    });
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Registered);
  }
}

interface MuteMicrophone {
  eventName: "MuteMicrophone";
  targetMuteState: "mute" | "unmute";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
}

export class MuteMicrophoneTracker {
  public track(targetIsMute: boolean, callId: string): void {
    PosthogAnalytics.instance.trackEvent<MuteMicrophone>({
      eventName: "MuteMicrophone",
      targetMuteState: targetIsMute ? "mute" : "unmute",
      callId,
    });
  }
}

interface MuteCamera {
  eventName: "MuteCamera";
  targetMuteState: "mute" | "unmute";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
}

export class MuteCameraTracker {
  public track(targetIsMute: boolean, callId: string): void {
    PosthogAnalytics.instance.trackEvent<MuteCamera>({
      eventName: "MuteCamera",
      targetMuteState: targetIsMute ? "mute" : "unmute",
      callId,
    });
  }
}

interface UndecryptableToDeviceEvent {
  eventName: "UndecryptableToDeviceEvent";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
}

export class UndecryptableToDeviceEventTracker {
  public track(callId: string): void {
    PosthogAnalytics.instance.trackEvent<UndecryptableToDeviceEvent>({
      eventName: "UndecryptableToDeviceEvent",
      callId,
    });
  }
}

interface QualitySurveyEvent {
  eventName: "QualitySurvey";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
  feedbackText: string;
  stars: number;
}

export class QualitySurveyEventTracker {
  public track(callId: string, feedbackText: string, stars: number): void {
    PosthogAnalytics.instance.trackEvent<QualitySurveyEvent>({
      eventName: "QualitySurvey",
      callId,
      feedbackText,
      stars,
    });
  }
}

interface CallDisconnectedEvent {
  eventName: "CallDisconnected";
  reason?: DisconnectReason;
}

export class CallDisconnectedEventTracker {
  public track(reason?: DisconnectReason): void {
    PosthogAnalytics.instance.trackEvent<CallDisconnectedEvent>({
      eventName: "CallDisconnected",
      reason,
    });
  }
}

interface CallConnectDuration extends IPosthogEvent {
  eventName: "CallConnectDuration";
  totalDuration: number;
  websocketDuration: number;
  peerConnectionDuration: number;
}

export class CallConnectDurationTracker {
  private connectStart = 0;
  private websocketConnected = 0;
  public cacheConnectStart(): void {
    this.connectStart = Date.now();
  }
  public cacheWsConnect(): void {
    this.websocketConnected = Date.now();
  }

  public track(options = { log: false }): void {
    const now = Date.now();
    const totalDuration = now - this.connectStart;
    const websocketDuration = this.websocketConnected - this.connectStart;
    const peerConnectionDuration = now - this.websocketConnected;
    PosthogAnalytics.instance.trackEvent<CallConnectDuration>({
      eventName: "CallConnectDuration",
      totalDuration,
      websocketDuration,
      peerConnectionDuration,
    });
    if (options.log)
      logger.log(
        `Time to connect:\ntotal: ${totalDuration}ms\npeerConnection: ${websocketDuration}ms\nwebsocket: ${peerConnectionDuration}ms`,
      );
  }
}

export type CallReconnectingReason =
  | "sync"
  | "membership"
  | "probablyLeft"
  | "livekit";

interface CallReconnecting extends IPosthogEvent {
  eventName: "CallReconnecting";
  // the callId posthog key is essentially a Matrix roomId
  callId: string;
  reason: CallReconnectingReason;
  reconnectDuration: number;
}

export class CallReconnectingTracker {
  public track(
    callId: string,
    reason: CallReconnectingReason,
    reconnectDuration: number,
  ): void {
    PosthogAnalytics.instance.trackEvent<CallReconnecting>({
      eventName: "CallReconnecting",
      callId,
      reason,
      reconnectDuration,
    });
  }
}
