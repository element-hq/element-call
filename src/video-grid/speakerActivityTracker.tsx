// import { logger } from "matrix-js-sdk/src/logger";
// import { useState } from "react";
// interface SpeakerActivityState {
//   speakerActivity: Map<string, SpeakerActivity>;
//   currentlySpeakingUserIds: string[];
//   shortPeriodMostActiveSpeaker: string[];
//   longPeriodMostActiveSpeaker: string[];
// }
// class SpeakerActivity {
//   speakArray: TimeInterval[];
//   isSpeaking() {
//     return this.speakArray[-1]?.endTime == undefined;
//   }
//   startSpeaking() {
//     if (!this.isSpeaking) {
//       this.speakArray.push(new TimeInterval(Date.now(), undefined));
//     } else {
//       logger.warn(
//         "Trying to call startSpeaking but the speaker tracker is already started (Called startSpeaking twice)"
//       );
//     }
//   }
//   endSpeaking() {
//     if (this.isSpeaking) {
//       this.speakArray[-1].endTime = Date.now();
//     } else {
//       logger.warn(
//         "Trying to call startSpeaking but the speaker tracker is already started (Called startSpeaking twice)"
//       );
//     }
//   }
//   getActiveTimeDuringLast(seconds: number) {
//     const lowerBound = Date.now() - seconds * 1000;
//     const upperBound = Date.now();
//     return this.speakArray
//       .filter(
//         (interval) =>
//           interval.endTime > lowerBound || interval.endTime === undefined
//       )
//       .map((interval) => {
//         if (interval.endTime === undefined) {
//           return new TimeInterval(interval.startTime, upperBound);
//         }
//         if (interval.startTime < lowerBound) {
//           return new TimeInterval(lowerBound, interval.endTime);
//         }
//         return interval;
//       })
//       .reduce(
//         (totalDuration, interval) => totalDuration + interval.getDuration(),
//         0
//       );
//   }
// }
// class TimeInterval {
//   startTime: number;
//   endTime?: number;
//   constructor(startTime: number, endTime?: number) {
//     this.startTime = startTime;
//     this.endTime = endTime;
//   }
//   getDuration() {
//     return this.endTime - this.startTime;
//   }
// }
// export function useSpeakerActivityTracker(): {
//   state: SpeakerActivityState;
//   startSpeaking: (speaking: string) => void;
//   endSpeaking: (speaker: string) => void;
// } {
//   const [state, setState] = useState<SpeakerActivityState>();
//   const startSpeaking = (speaking: string) => {
//     setState((oldState) => {
//       oldState.speakerActivity.get(speaking)?.startSpeaking();
//       return;
//     });
//   };
//   const endSpeaking = (speaking: string) => {
//     state.speakerActivity.get(speaking)?.endSpeaking();
//   };
//   return { state, startSpeaking, endSpeaking };
// }
