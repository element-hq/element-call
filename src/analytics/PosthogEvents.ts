/*
Copyright 2022 The New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { DisconnectReason } from "livekit-client";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc";

import {
  IPosthogEvent,
  PosthogAnalytics,
  RegistrationType,
} from "./PosthogAnalytics";
import { E2eeType } from "../e2ee/e2eeType";

type EncryptionScheme = "none" | "shared" | "per_sender";

function mapE2eeType(type: E2eeType): EncryptionScheme {
  switch (type) {
    case E2eeType.NONE:
      return "none";
    case E2eeType.SHARED_KEY:
      return "shared";
    case E2eeType.PER_PARTICIPANT:
      return "per_sender";
  }
}
interface CallEnded extends IPosthogEvent {
  eventName: "CallEnded";
  callId: string;
  callParticipantsOnLeave: number;
  callParticipantsMax: number;
  callDuration: number;
  encryption: EncryptionScheme;
  toDeviceEncryptionKeysSent: number;
  toDeviceEncryptionKeysReceived: number;
  toDeviceEncryptionKeysReceivedAverageAge: number;
  roomEventEncryptionKeysSent: number;
  roomEventEncryptionKeysReceived: number;
  roomEventEncryptionKeysReceivedAverageAge: number;
}

export class CallEndedTracker {
  private cache: { startTime: Date; maxParticipantsCount: number } = {
    startTime: new Date(0),
    maxParticipantsCount: 0,
  };

  public cacheStartCall(time: Date): void {
    this.cache.startTime = time;
  }

  public cacheParticipantCountChanged(count: number): void {
    this.cache.maxParticipantsCount = Math.max(
      count,
      this.cache.maxParticipantsCount,
    );
  }

  public track(
    callId: string,
    callParticipantsNow: number,
    e2eeType: E2eeType,
    rtcSession: MatrixRTCSession,
    sendInstantly: boolean,
  ): void {
    PosthogAnalytics.instance.trackEvent<CallEnded>(
      {
        eventName: "CallEnded",
        callId: callId,
        callParticipantsMax: this.cache.maxParticipantsCount,
        callParticipantsOnLeave: callParticipantsNow,
        callDuration: (Date.now() - this.cache.startTime.getTime()) / 1000,
        encryption: mapE2eeType(e2eeType),
        toDeviceEncryptionKeysSent:
          rtcSession.statistics.counters.toDeviceEncryptionKeysSent,
        toDeviceEncryptionKeysReceived:
          rtcSession.statistics.counters.toDeviceEncryptionKeysReceived,
        toDeviceEncryptionKeysReceivedAverageAge:
          rtcSession.statistics.counters.toDeviceEncryptionKeysReceived > 0
            ? rtcSession.statistics.totals
                .toDeviceEncryptionKeysReceivedTotalAge /
              rtcSession.statistics.counters.toDeviceEncryptionKeysReceived
            : 0,
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
      },
      { send_instantly: sendInstantly },
    );
  }
}

interface CallStarted extends IPosthogEvent {
  eventName: "CallStarted";
  callId: string;
  encryption: EncryptionScheme;
}

export class CallStartedTracker {
  public track(callId: string, e2eeType: E2eeType): void {
    PosthogAnalytics.instance.trackEvent<CallStarted>({
      eventName: "CallStarted",
      callId: callId,
      encryption: mapE2eeType(e2eeType),
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
