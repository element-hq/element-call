/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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

import { IPosthogEvent, PosthogAnalytics } from './PosthogAnalytics';


interface CallEnded extends IPosthogEvent {
  eventName: "callEnded",
  callName: string,
  callParticipantsOnLeave: number,
  callParticipantsMax: number,
  callDuration: number,
}

export class CallEndedTracker {

  private cache: { startTime: Date, maxParticipantsCount: number, } = {
    startTime: new Date(0),
    maxParticipantsCount: 0,
  }

  cacheStartCall(time: Date) {
    this.cache.startTime = time
  }

  cachePartCountChanged(count: number) {
    this.cache.maxParticipantsCount = Math.max(count, this.cache.maxParticipantsCount)
  }

  track(callName: string, callParticipantsNow: number) {
    PosthogAnalytics.instance.trackEvent<CallEnded>({
      eventName: "callEnded",
      callName,
      callParticipantsMax: this.cache.maxParticipantsCount,
      callParticipantsOnLeave: callParticipantsNow,
      callDuration: (new Date()).getSeconds() - this.cache.startTime.getSeconds()
    })
  }
}


interface Signup extends IPosthogEvent {
  eventName: "signup"
  signupDuration: number,
}

export class SignupCache {

  private cache: { signupStart: Date, signupEnd: Date } = {
    signupStart: new Date(0),
    signupEnd: new Date(0),
  }
  cacheSignupStart(time: Date) {
    this.cache.signupStart = time
  }

  cacheSignupEnd(time: Date) {
    this.cache.signupEnd = time
  }

  track() {
    PosthogAnalytics.instance.trackEvent<Signup>({
      eventName: "signup",
      signupDuration: (new Date()).getSeconds() - this.cache.signupStart.getSeconds()
    })
  }
}