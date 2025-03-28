/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type GroupCallStatsReport } from "matrix-js-sdk/lib/webrtc/groupCall";
import {
  type AudioConcealment,
  type ByteSentStatsReport,
  type ConnectionStatsReport,
} from "matrix-js-sdk/lib/webrtc/stats/statsReport";
import { describe, expect, it } from "vitest";

import { ObjectFlattener } from "../../src/otel/ObjectFlattener";

describe("ObjectFlattener", () => {
  const noConcealment: AudioConcealment = {
    concealedAudio: 0,
    totalAudioDuration: 0,
  };

  const statsReport: GroupCallStatsReport<ConnectionStatsReport> = {
    report: {
      callId: "callId",
      opponentMemberId: "opponentMemberId",
      bandwidth: { upload: 426, download: 0 },
      bitrate: {
        upload: 426,
        download: 0,
        audio: {
          upload: 124,
          download: 0,
        },
        video: {
          upload: 302,
          download: 0,
        },
      },
      packetLoss: {
        total: 0,
        download: 0,
        upload: 0,
      },
      framerate: {
        local: new Map([
          ["LOCAL_AUDIO_TRACK_ID", 0],
          ["LOCAL_VIDEO_TRACK_ID", 30],
        ]),
        remote: new Map([
          ["REMOTE_AUDIO_TRACK_ID", 0],
          ["REMOTE_VIDEO_TRACK_ID", 60],
        ]),
      },
      resolution: {
        local: new Map([
          ["LOCAL_AUDIO_TRACK_ID", { height: -1, width: -1 }],
          ["LOCAL_VIDEO_TRACK_ID", { height: 460, width: 780 }],
        ]),
        remote: new Map([
          ["REMOTE_AUDIO_TRACK_ID", { height: -1, width: -1 }],
          ["REMOTE_VIDEO_TRACK_ID", { height: 960, width: 1080 }],
        ]),
      },
      jitter: new Map([
        ["REMOTE_AUDIO_TRACK_ID", 2],
        ["REMOTE_VIDEO_TRACK_ID", 50],
      ]),
      codec: {
        local: new Map([
          ["LOCAL_AUDIO_TRACK_ID", "opus"],
          ["LOCAL_VIDEO_TRACK_ID", "v8"],
        ]),
        remote: new Map([
          ["REMOTE_AUDIO_TRACK_ID", "opus"],
          ["REMOTE_VIDEO_TRACK_ID", "v9"],
        ]),
      },
      transport: [
        {
          ip: "ff11::5fa:abcd:999c:c5c5:50000",
          type: "udp",
          localIp: "2aaa:9999:2aaa:999:8888:2aaa:2aaa:7777:50000",
          isFocus: true,
          localCandidateType: "host",
          remoteCandidateType: "host",
          networkType: "ethernet",
          rtt: NaN,
        },
        {
          ip: "10.10.10.2:22222",
          type: "tcp",
          localIp: "10.10.10.100:33333",
          isFocus: true,
          localCandidateType: "srfx",
          remoteCandidateType: "srfx",
          networkType: "ethernet",
          rtt: 0,
        },
      ],
      audioConcealment: new Map([
        ["REMOTE_AUDIO_TRACK_ID", noConcealment],
        ["REMOTE_VIDEO_TRACK_ID", noConcealment],
      ]),
      totalAudioConcealment: noConcealment,
    },
  };

  describe("on flattenObjectRecursive", () => {
    it("should flatter an Map object", () => {
      const flatObject = {};
      ObjectFlattener.flattenObjectRecursive(
        statsReport.report.resolution,
        flatObject,
        "matrix.call.stats.connection.resolution.",
        0,
      );
      expect(flatObject).toEqual({
        "matrix.call.stats.connection.resolution.local.LOCAL_AUDIO_TRACK_ID.height":
          -1,
        "matrix.call.stats.connection.resolution.local.LOCAL_AUDIO_TRACK_ID.width":
          -1,

        "matrix.call.stats.connection.resolution.local.LOCAL_VIDEO_TRACK_ID.height": 460,
        "matrix.call.stats.connection.resolution.local.LOCAL_VIDEO_TRACK_ID.width": 780,

        "matrix.call.stats.connection.resolution.remote.REMOTE_AUDIO_TRACK_ID.height":
          -1,
        "matrix.call.stats.connection.resolution.remote.REMOTE_AUDIO_TRACK_ID.width":
          -1,

        "matrix.call.stats.connection.resolution.remote.REMOTE_VIDEO_TRACK_ID.height": 960,
        "matrix.call.stats.connection.resolution.remote.REMOTE_VIDEO_TRACK_ID.width": 1080,
      });
    });
    it("should flatter an Array object", () => {
      const flatObject = {};
      ObjectFlattener.flattenObjectRecursive(
        statsReport.report.transport,
        flatObject,
        "matrix.call.stats.connection.transport.",
        0,
      );
      expect(flatObject).toEqual({
        "matrix.call.stats.connection.transport.0.ip":
          "ff11::5fa:abcd:999c:c5c5:50000",
        "matrix.call.stats.connection.transport.0.type": "udp",
        "matrix.call.stats.connection.transport.0.localIp":
          "2aaa:9999:2aaa:999:8888:2aaa:2aaa:7777:50000",
        "matrix.call.stats.connection.transport.0.isFocus": true,
        "matrix.call.stats.connection.transport.0.localCandidateType": "host",
        "matrix.call.stats.connection.transport.0.remoteCandidateType": "host",
        "matrix.call.stats.connection.transport.0.networkType": "ethernet",
        "matrix.call.stats.connection.transport.0.rtt": "NaN",
        "matrix.call.stats.connection.transport.1.ip": "10.10.10.2:22222",
        "matrix.call.stats.connection.transport.1.type": "tcp",
        "matrix.call.stats.connection.transport.1.localIp":
          "10.10.10.100:33333",
        "matrix.call.stats.connection.transport.1.isFocus": true,
        "matrix.call.stats.connection.transport.1.localCandidateType": "srfx",
        "matrix.call.stats.connection.transport.1.remoteCandidateType": "srfx",
        "matrix.call.stats.connection.transport.1.networkType": "ethernet",
        "matrix.call.stats.connection.transport.1.rtt": 0,
      });
    });
  });

  describe("on flattenReportObject Connection Stats", () => {
    it("should flatten a Report to otel Attributes Object", () => {
      expect(
        ObjectFlattener.flattenReportObject(
          "matrix.call.stats.connection",
          statsReport.report,
        ),
      ).toEqual({
        "matrix.call.stats.connection.callId": "callId",
        "matrix.call.stats.connection.opponentMemberId": "opponentMemberId",
        "matrix.call.stats.connection.bandwidth.download": 0,
        "matrix.call.stats.connection.bandwidth.upload": 426,
        "matrix.call.stats.connection.bitrate.audio.download": 0,
        "matrix.call.stats.connection.bitrate.audio.upload": 124,
        "matrix.call.stats.connection.bitrate.download": 0,
        "matrix.call.stats.connection.bitrate.upload": 426,
        "matrix.call.stats.connection.bitrate.video.download": 0,
        "matrix.call.stats.connection.bitrate.video.upload": 302,
        "matrix.call.stats.connection.codec.local.LOCAL_AUDIO_TRACK_ID": "opus",
        "matrix.call.stats.connection.codec.local.LOCAL_VIDEO_TRACK_ID": "v8",
        "matrix.call.stats.connection.codec.remote.REMOTE_AUDIO_TRACK_ID":
          "opus",
        "matrix.call.stats.connection.codec.remote.REMOTE_VIDEO_TRACK_ID": "v9",
        "matrix.call.stats.connection.framerate.local.LOCAL_AUDIO_TRACK_ID": 0,
        "matrix.call.stats.connection.framerate.local.LOCAL_VIDEO_TRACK_ID": 30,
        "matrix.call.stats.connection.framerate.remote.REMOTE_AUDIO_TRACK_ID": 0,
        "matrix.call.stats.connection.framerate.remote.REMOTE_VIDEO_TRACK_ID": 60,
        "matrix.call.stats.connection.jitter.REMOTE_AUDIO_TRACK_ID": 2,
        "matrix.call.stats.connection.jitter.REMOTE_VIDEO_TRACK_ID": 50,
        "matrix.call.stats.connection.packetLoss.download": 0,
        "matrix.call.stats.connection.packetLoss.total": 0,
        "matrix.call.stats.connection.packetLoss.upload": 0,
        "matrix.call.stats.connection.resolution.local.LOCAL_AUDIO_TRACK_ID.height":
          -1,
        "matrix.call.stats.connection.resolution.local.LOCAL_AUDIO_TRACK_ID.width":
          -1,
        "matrix.call.stats.connection.resolution.local.LOCAL_VIDEO_TRACK_ID.height": 460,
        "matrix.call.stats.connection.resolution.local.LOCAL_VIDEO_TRACK_ID.width": 780,
        "matrix.call.stats.connection.resolution.remote.REMOTE_AUDIO_TRACK_ID.height":
          -1,
        "matrix.call.stats.connection.resolution.remote.REMOTE_AUDIO_TRACK_ID.width":
          -1,
        "matrix.call.stats.connection.resolution.remote.REMOTE_VIDEO_TRACK_ID.height": 960,
        "matrix.call.stats.connection.resolution.remote.REMOTE_VIDEO_TRACK_ID.width": 1080,
        "matrix.call.stats.connection.transport.0.ip":
          "ff11::5fa:abcd:999c:c5c5:50000",
        "matrix.call.stats.connection.transport.0.type": "udp",
        "matrix.call.stats.connection.transport.0.localIp":
          "2aaa:9999:2aaa:999:8888:2aaa:2aaa:7777:50000",
        "matrix.call.stats.connection.transport.0.isFocus": true,
        "matrix.call.stats.connection.transport.0.localCandidateType": "host",
        "matrix.call.stats.connection.transport.0.remoteCandidateType": "host",
        "matrix.call.stats.connection.transport.0.networkType": "ethernet",
        "matrix.call.stats.connection.transport.0.rtt": "NaN",
        "matrix.call.stats.connection.transport.1.ip": "10.10.10.2:22222",
        "matrix.call.stats.connection.transport.1.type": "tcp",
        "matrix.call.stats.connection.transport.1.localIp":
          "10.10.10.100:33333",
        "matrix.call.stats.connection.transport.1.isFocus": true,
        "matrix.call.stats.connection.transport.1.localCandidateType": "srfx",
        "matrix.call.stats.connection.transport.1.remoteCandidateType": "srfx",
        "matrix.call.stats.connection.transport.1.networkType": "ethernet",
        "matrix.call.stats.connection.transport.1.rtt": 0,
        "matrix.call.stats.connection.audioConcealment.REMOTE_AUDIO_TRACK_ID.concealedAudio": 0,
        "matrix.call.stats.connection.audioConcealment.REMOTE_AUDIO_TRACK_ID.totalAudioDuration": 0,
        "matrix.call.stats.connection.audioConcealment.REMOTE_VIDEO_TRACK_ID.concealedAudio": 0,
        "matrix.call.stats.connection.audioConcealment.REMOTE_VIDEO_TRACK_ID.totalAudioDuration": 0,
        "matrix.call.stats.connection.totalAudioConcealment.concealedAudio": 0,
        "matrix.call.stats.connection.totalAudioConcealment.totalAudioDuration": 0,
      });
    });
  });

  describe("on flattenByteSendStatsReportObject", () => {
    const byteSentStatsReport = new Map<
      string,
      number
    >() as ByteSentStatsReport;
    byteSentStatsReport.callId = "callId";
    byteSentStatsReport.opponentMemberId = "opponentMemberId";
    byteSentStatsReport.set("4aa92608-04c6-428e-8312-93e17602a959", 132093);
    byteSentStatsReport.set("a08e4237-ee30-4015-a932-b676aec894b1", 913448);

    it("should flatten a Report to otel Attributes Object", () => {
      expect(
        ObjectFlattener.flattenReportObject(
          "matrix.call.stats.bytesSend",
          byteSentStatsReport,
        ),
      ).toEqual({
        "matrix.call.stats.bytesSend.4aa92608-04c6-428e-8312-93e17602a959": 132093,
        "matrix.call.stats.bytesSend.a08e4237-ee30-4015-a932-b676aec894b1": 913448,
      });
      expect(byteSentStatsReport.callId).toEqual("callId");
      expect(byteSentStatsReport.opponentMemberId).toEqual("opponentMemberId");
    });
  });
});
