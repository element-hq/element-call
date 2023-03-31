import { ObjectFlattener } from "../../src/otel/ObjectFlattener";

/*
Copyright 2023 New Vector Ltd

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
describe("ObjectFlattener", () => {
  const statsReport = {
    report: {
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
          rtt: null,
        },
      ],
    },
  };
  describe("on flattenObjectRecursive", () => {
    it("should flatter an Map object", () => {
      const flatObject = {};
      ObjectFlattener.flattenObjectRecursive(
        statsReport.report.resolution,
        flatObject,
        "matrix.stats.conn.resolution.",
        0
      );
      expect(flatObject).toEqual({
        "matrix.stats.conn.resolution.local.LOCAL_AUDIO_TRACK_ID.height": -1,
        "matrix.stats.conn.resolution.local.LOCAL_AUDIO_TRACK_ID.width": -1,

        "matrix.stats.conn.resolution.local.LOCAL_VIDEO_TRACK_ID.height": 460,
        "matrix.stats.conn.resolution.local.LOCAL_VIDEO_TRACK_ID.width": 780,

        "matrix.stats.conn.resolution.remote.REMOTE_AUDIO_TRACK_ID.height": -1,
        "matrix.stats.conn.resolution.remote.REMOTE_AUDIO_TRACK_ID.width": -1,

        "matrix.stats.conn.resolution.remote.REMOTE_VIDEO_TRACK_ID.height": 960,
        "matrix.stats.conn.resolution.remote.REMOTE_VIDEO_TRACK_ID.width": 1080,
      });
    });
    it("should flatter an Array object", () => {
      const flatObject = {};
      ObjectFlattener.flattenObjectRecursive(
        statsReport.report.transport,
        flatObject,
        "matrix.stats.conn.transport.",
        0
      );
      expect(flatObject).toEqual({
        "matrix.stats.conn.transport.0.ip": "ff11::5fa:abcd:999c:c5c5:50000",
        "matrix.stats.conn.transport.0.type": "udp",
        "matrix.stats.conn.transport.0.localIp":
          "2aaa:9999:2aaa:999:8888:2aaa:2aaa:7777:50000",
        "matrix.stats.conn.transport.0.isFocus": true,
        "matrix.stats.conn.transport.0.localCandidateType": "host",
        "matrix.stats.conn.transport.0.remoteCandidateType": "host",
        "matrix.stats.conn.transport.0.networkType": "ethernet",
        "matrix.stats.conn.transport.0.rtt": "NaN",
        "matrix.stats.conn.transport.1.ip": "10.10.10.2:22222",
        "matrix.stats.conn.transport.1.type": "tcp",
        "matrix.stats.conn.transport.1.localIp": "10.10.10.100:33333",
        "matrix.stats.conn.transport.1.isFocus": true,
        "matrix.stats.conn.transport.1.localCandidateType": "srfx",
        "matrix.stats.conn.transport.1.remoteCandidateType": "srfx",
        "matrix.stats.conn.transport.1.networkType": "ethernet",
        "matrix.stats.conn.transport.1.rtt": "null",
      });
    });
  });

  describe("on flattenConnectionStatsReportObject", () => {
    it("should flatten a Report to otel Attributes Object", () => {
      expect(
        ObjectFlattener.flattenConnectionStatsReportObject(statsReport)
      ).toEqual({
        "matrix.stats.conn.bandwidth.download": 0,
        "matrix.stats.conn.bandwidth.upload": 426,
        "matrix.stats.conn.bitrate.audio.download": 0,
        "matrix.stats.conn.bitrate.audio.upload": 124,
        "matrix.stats.conn.bitrate.download": 0,
        "matrix.stats.conn.bitrate.upload": 426,
        "matrix.stats.conn.bitrate.video.download": 0,
        "matrix.stats.conn.bitrate.video.upload": 302,
        "matrix.stats.conn.codec.local.LOCAL_AUDIO_TRACK_ID": "opus",
        "matrix.stats.conn.codec.local.LOCAL_VIDEO_TRACK_ID": "v8",
        "matrix.stats.conn.codec.remote.REMOTE_AUDIO_TRACK_ID": "opus",
        "matrix.stats.conn.codec.remote.REMOTE_VIDEO_TRACK_ID": "v9",
        "matrix.stats.conn.framerate.local.LOCAL_AUDIO_TRACK_ID": 0,
        "matrix.stats.conn.framerate.local.LOCAL_VIDEO_TRACK_ID": 30,
        "matrix.stats.conn.framerate.remote.REMOTE_AUDIO_TRACK_ID": 0,
        "matrix.stats.conn.framerate.remote.REMOTE_VIDEO_TRACK_ID": 60,
        "matrix.stats.conn.packetLoss.download": 0,
        "matrix.stats.conn.packetLoss.total": 0,
        "matrix.stats.conn.packetLoss.upload": 0,
        "matrix.stats.conn.resolution.local.LOCAL_AUDIO_TRACK_ID.height": -1,
        "matrix.stats.conn.resolution.local.LOCAL_AUDIO_TRACK_ID.width": -1,
        "matrix.stats.conn.resolution.local.LOCAL_VIDEO_TRACK_ID.height": 460,
        "matrix.stats.conn.resolution.local.LOCAL_VIDEO_TRACK_ID.width": 780,
        "matrix.stats.conn.resolution.remote.REMOTE_AUDIO_TRACK_ID.height": -1,
        "matrix.stats.conn.resolution.remote.REMOTE_AUDIO_TRACK_ID.width": -1,
        "matrix.stats.conn.resolution.remote.REMOTE_VIDEO_TRACK_ID.height": 960,
        "matrix.stats.conn.resolution.remote.REMOTE_VIDEO_TRACK_ID.width": 1080,
        "matrix.stats.conn.transport.0.ip": "ff11::5fa:abcd:999c:c5c5:50000",
        "matrix.stats.conn.transport.0.type": "udp",
        "matrix.stats.conn.transport.0.localIp":
          "2aaa:9999:2aaa:999:8888:2aaa:2aaa:7777:50000",
        "matrix.stats.conn.transport.0.isFocus": true,
        "matrix.stats.conn.transport.0.localCandidateType": "host",
        "matrix.stats.conn.transport.0.remoteCandidateType": "host",
        "matrix.stats.conn.transport.0.networkType": "ethernet",
        "matrix.stats.conn.transport.0.rtt": "NaN",
        "matrix.stats.conn.transport.1.ip": "10.10.10.2:22222",
        "matrix.stats.conn.transport.1.type": "tcp",
        "matrix.stats.conn.transport.1.localIp": "10.10.10.100:33333",
        "matrix.stats.conn.transport.1.isFocus": true,
        "matrix.stats.conn.transport.1.localCandidateType": "srfx",
        "matrix.stats.conn.transport.1.remoteCandidateType": "srfx",
        "matrix.stats.conn.transport.1.networkType": "ethernet",
        "matrix.stats.conn.transport.1.rtt": "null",
      });
    });
  });

  describe("on flattenByteSendStatsReportObject", () => {
    const byteSent = {
      report: new Map([
        ["4aa92608-04c6-428e-8312-93e17602a959", 132093],
        ["a08e4237-ee30-4015-a932-b676aec894b1", 913448],
      ]),
    };
    it("should flatten a Report to otel Attributes Object", () => {
      expect(
        ObjectFlattener.flattenByteSentStatsReportObject(byteSent)
      ).toEqual({
        "matrix.stats.bytesSent.4aa92608-04c6-428e-8312-93e17602a959": 132093,
        "matrix.stats.bytesSent.a08e4237-ee30-4015-a932-b676aec894b1": 913448,
      });
    });
  });
});
