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

import {
  IPosthogEvent,
  PosthogAnalytics,
  RegistrationType,
} from "./PosthogAnalytics";

interface CallEnded extends IPosthogEvent {
  eventName: "CallEnded";
  callId: string;
  callParticipantsOnLeave: number;
  callParticipantsMax: number;
  callDuration: number;
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
    sendInstantly: boolean,
  ): void {
    PosthogAnalytics.instance.trackEvent<CallEnded>(
      {
        eventName: "CallEnded",
        callId: callId,
        callParticipantsMax: this.cache.maxParticipantsCount,
        callParticipantsOnLeave: callParticipantsNow,
        callDuration: (Date.now() - this.cache.startTime.getTime()) / 1000,
      },
      { send_instantly: sendInstantly },
    );
  }
}

interface CallStarted extends IPosthogEvent {
  eventName: "CallStarted";
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
  websockedDuration: number;
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
    const websockedDuration = this.websocketConnected - this.connectStart;
    const peerConnectionDuration = now - this.websocketConnected;
    PosthogAnalytics.instance.trackEvent<CallConnectDuration>({
      eventName: "CallConnectDuration",
      totalDuration,
      websockedDuration: this.websocketConnected - this.connectStart,
      peerConnectionDuration: Date.now() - this.websocketConnected,
    });
    if (options.log)
      logger.log(
        `Time to connect:\ntotal: ${totalDuration}ms\npeerConnection: ${websockedDuration}ms\nwebsocket: ${peerConnectionDuration}ms`,
      );
  }
}
