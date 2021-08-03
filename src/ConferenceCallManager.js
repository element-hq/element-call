/*
Copyright 2021 New Vector Ltd

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

import EventEmitter from "events";

const CONF_ROOM = "me.robertlong.conf";
const CONF_PARTICIPANT = "me.robertlong.conf.participant";
const PARTICIPANT_TIMEOUT = 1000 * 5;

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    const onSync = (state) => {
      if (state === "PREPARED") {
        resolve();
        client.removeListener("sync", onSync);
      }
    };
    client.on("sync", onSync);
  });
}

export class ConferenceCallManager extends EventEmitter {
  static async restore(homeserverUrl) {
    try {
      const authStore = localStorage.getItem("matrix-auth-store");

      if (authStore) {
        const { user_id, device_id, access_token } = JSON.parse(authStore);

        const client = matrixcs.createClient({
          baseUrl: homeserverUrl,
          accessToken: access_token,
          userId: user_id,
          deviceId: device_id,
        });

        const manager = new ConferenceCallManager(client);

        await client.startClient();

        await waitForSync(client);

        return manager;
      }
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      throw err;
    }
  }

  static async login(homeserverUrl, username, password) {
    try {
      const registrationClient = matrixcs.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.loginWithPassword(username, password);

      const client = matrixcs.createClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );

      const manager = new ConferenceCallManager(client);

      await client.startClient();

      await waitForSync(client);

      return manager;
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");

      throw err;
    }
  }

  static async register(homeserverUrl, username, password) {
    try {
      const registrationClient = matrixcs.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.register(username, password, null, {
          type: "m.login.dummy",
        });

      const client = matrixcs.createClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );

      const manager = new ConferenceCallManager(client);

      await client.startClient();

      await waitForSync(client);

      return manager;
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");

      throw err;
    }
  }

  constructor(client) {
    super();
    this.client = client;
    this.joined = false;
    this.room = null;
    const localUserId = client.getUserId();
    this.localParticipant = {
      local: true,
      userId: localUserId,
      feed: null,
      call: null,
      muted: true,
    };
    this.participants = [this.localParticipant];
    this.pendingCalls = [];
    this.callUserMap = new Map();
    this.debugState = {
      users: new Map(),
      calls: new Map(),
    };
    this.client.on("event", this._onEvent);
    this.client.on("RoomState.members", this._onMemberChanged);
    this.client.on("Call.incoming", this._onIncomingCall);
  }

  setRoom(roomId) {
    this.roomId = roomId;
    this.room = this.client.getRoom(this.roomId);
  }

  join() {
    this.joined = true;

    this._setDebugState(this.client.getUserId(), null, "you");

    const activeConf = this.room.currentState
      .getStateEvents(CONF_ROOM, "")
      ?.getContent()?.active;

    if (!activeConf) {
      this.client.sendStateEvent(this.roomId, CONF_ROOM, { active: true }, "");
    }

    const roomMemberIds = this.room.getMembers().map(({ userId }) => userId);

    roomMemberIds.forEach((userId) => {
      this._processMember(userId);
    });

    for (const { call, onHangup, onReplaced } of this.pendingCalls) {
      if (call.roomId !== this.roomId) {
        continue;
      }

      call.removeListener("hangup", onHangup);
      call.removeListener("replaced", onReplaced);
      const userId = call.opponentMember.userId;
      this._addCall(call, userId);
      call.answer();
      this._observePeerConnection(call);
    }

    this.pendingCalls = [];

    this._updateParticipantState();
  }

  _onEvent = (event) => {
    const roomId = event.getRoomId();
    const type = event.getType();

    if (
      roomId === this.roomId &&
      (type.startsWith("m.call.") || type === "me.robertlong.call.info")
    ) {
      const sender = event.getSender();
      const { call_id } = event.getContent();

      if (call_id) {
        if (this.debugState.calls.has(call_id)) {
          const callState = this.debugState.calls.get(call_id);
          callState.events.push(event);
        } else {
          this.debugState.calls.set(call_id, {
            state: "unknown",
            events: [event],
          });
        }
      }

      if (this.debugState.users.has(sender)) {
        const userState = this.debugState.users.get(sender);
        userState.events.push(event);
      } else {
        this.debugState.users.set(sender, {
          state: "unknown",
          events: [event],
        });
      }

      this.emit("debug");
    }
  };

  _setDebugState(userId, callId, state) {
    if (userId) {
      const userState = this.debugState.users.get(userId);

      if (userState) {
        userState.state = state;
      } else {
        this.debugState.users.set(userId, {
          state,
          events: [],
        });
      }
    }

    if (callId) {
      const callState = this.debugState.calls.get(callId);

      if (callState) {
        callState.state = state;
      } else {
        this.debugState.calls.set(callId, {
          state,
          events: [],
        });
      }
    }

    this.emit("debug");
  }

  _updateParticipantState = () => {
    const userId = this.client.getUserId();
    const currentMemberState = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );

    this.client.sendStateEvent(
      this.roomId,
      "m.room.member",
      {
        ...currentMemberState.getContent(),
        [CONF_PARTICIPANT]: new Date().getTime(),
      },
      userId
    );

    this._participantStateTimeout = setTimeout(
      this._updateParticipantState,
      PARTICIPANT_TIMEOUT
    );
  };

  _onMemberChanged = (_event, _state, member) => {
    if (member.roomId !== this.roomId) {
      return;
    }

    this._processMember(member.userId);
  };

  _processMember(userId) {
    const localUserId = this.client.getUserId();

    if (userId === localUserId) {
      return;
    }

    // Don't process members until we've joined
    if (!this.joined) {
      return;
    }

    const participant = this.participants.find((p) => p.userId === userId);

    if (participant) {
      // Member has already been processed
      return;
    }

    const memberStateEvent = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );
    const participantTimeout = memberStateEvent.getContent()[CONF_PARTICIPANT];

    if (
      typeof participantTimeout !== "number" ||
      new Date().getTime() - participantTimeout > PARTICIPANT_TIMEOUT
    ) {
      // Member is inactive so don't call them.
      this._setDebugState(userId, null, "inactive");
      return;
    }

    // Only initiate a call with a user who has a userId that is lexicographically
    // less than your own. Otherwise, that user will call you.
    if (userId < localUserId) {
      this._setDebugState(userId, null, "waiting for invite");
      return;
    }

    const call = this.client.createCall(this.roomId, userId);
    this._addCall(call, userId);
    call.placeVideoCall().then(() => {
      this._observePeerConnection(call);
    });
  }

  _observePeerConnection(call) {
    const peerConnection = call.peerConn;

    if (!peerConnection) {
      return;
    }

    const sendWebRTCInfoEvent = async (eventType) => {
      const event = {
        call_id: call.callId,
        eventType,
        iceConnectionState: peerConnection.iceConnectionState,
        iceGatheringState: peerConnection.iceGatheringState,
        signalingState: peerConnection.signalingState,
        selectedCandidatePair: null,
        localCandidate: null,
        remoteCandidate: null,
      };

      // getStats doesn't support selectors in Firefox so get all stats by passing null.
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats#browser_compatibility
      const stats = await peerConnection.getStats(null);

      const statsArr = Array.from(stats.values());

      // Matrix doesn't support floats so we convert time in seconds to ms
      function secToMs(time) {
        if (time === undefined) {
          return undefined;
        }

        return Math.round(time * 1000);
      }

      function processTransportStats(transportStats) {
        if (!transportStats) {
          return undefined;
        }

        return {
          packetsSent: transportStats.packetsSent,
          packetsReceived: transportStats.packetsReceived,
          bytesSent: transportStats.bytesSent,
          bytesReceived: transportStats.bytesReceived,
          iceRole: transportStats.iceRole,
          iceState: transportStats.iceState,
          dtlsState: transportStats.dtlsState,
          dtlsCipher: transportStats.dtlsCipher,
          tlsVersion: transportStats.tlsVersion,
        };
      }

      function processCandidateStats(candidateStats) {
        if (!candidateStats) {
          return undefined;
        }

        // TODO: Figure out how to normalize ip and address across browsers
        // networkType property excluded for privacy reasons:
        // https://www.w3.org/TR/webrtc-stats/#sotd
        return {
          protocol: candidateStats.protocol,
          address: !!candidateStats.address
            ? candidateStats.address
            : candidateStats.ip,
          port: candidateStats.port,
          url: candidateStats.url,
          relayProtocol: candidateStats.relayProtocol,
        };
      }

      function processCandidatePair(candidatePairStats) {
        if (!candidatePairStats) {
          return undefined;
        }

        const localCandidateStats = statsArr.find(
          (stat) => stat.id === candidatePairStats.localCandidateId
        );
        event.localCandidate = processCandidateStats(localCandidateStats);

        const remoteCandidateStats = statsArr.find(
          (stat) => stat.id === candidatePairStats.remoteCandidateId
        );
        event.remoteCandidate = processCandidateStats(remoteCandidateStats);

        const transportStats = statsArr.find(
          (stat) => stat.id === candidatePairStats.transportId
        );
        event.transport = processTransportStats(transportStats);

        return {
          state: candidatePairStats.state,
          bytesSent: candidatePairStats.bytesSent,
          bytesReceived: candidatePairStats.bytesReceived,
          requestsSent: candidatePairStats.requestsSent,
          requestsReceived: candidatePairStats.requestsReceived,
          responsesSent: candidatePairStats.responsesSent,
          responsesReceived: candidatePairStats.responsesReceived,
          currentRoundTripTime: secToMs(
            candidatePairStats.currentRoundTripTime
          ),
          totalRoundTripTime: secToMs(candidatePairStats.totalRoundTripTime),
        };
      }

      // Firefox uses the deprecated "selected" property for the nominated ice candidate.
      const selectedCandidatePair = statsArr.find(
        (stat) =>
          stat.type === "candidate-pair" && (stat.selected || stat.nominated)
      );

      event.selectedCandidatePair = processCandidatePair(selectedCandidatePair);

      function processCodecStats(codecStats) {
        if (!codecStats) {
          return undefined;
        }

        // Payload type enums and MIME types listed here:
        // https://www.iana.org/assignments/rtp-parameters/rtp-parameters.xhtml
        return {
          mimeType: codecStats.mimeType,
          clockRate: codecStats.clockRate,
          payloadType: codecStats.payloadType,
          channels: codecStats.channels,
          sdpFmtpLine: codecStats.sdpFmtpLine,
        };
      }

      function processRTPStreamStats(rtpStreamStats) {
        const codecStats = statsArr.find(
          (stat) => stat.id === rtpStreamStats.codecId
        );
        const codec = processCodecStats(codecStats);

        return {
          kind: rtpStreamStats.kind,
          codec,
        };
      }

      function processInboundRTPStats(inboundRTPStats) {
        const rtpStreamStats = processRTPStreamStats(inboundRTPStats);

        return {
          ...rtpStreamStats,
          decoderImplementation: inboundRTPStats.decoderImplementation,
          bytesReceived: inboundRTPStats.bytesReceived,
          packetsReceived: inboundRTPStats.packetsReceived,
          packetsLost: inboundRTPStats.packetsLost,
          jitter: secToMs(inboundRTPStats.jitter),
          frameWidth: inboundRTPStats.frameWidth,
          frameHeight: inboundRTPStats.frameHeight,
          frameBitDepth: inboundRTPStats.frameBitDepth,
          framesPerSecond:
            inboundRTPStats.framesPerSecond &&
            inboundRTPStats.framesPerSecond.toString(),
          framesReceived: inboundRTPStats.framesReceived,
          framesDecoded: inboundRTPStats.framesDecoded,
          framesDropped: inboundRTPStats.framesDropped,
          totalSamplesDecoded: inboundRTPStats.totalSamplesDecoded,
          totalDecodeTime: secToMs(inboundRTPStats.totalDecodeTime),
          totalProcessingDelay: secToMs(inboundRTPStats.totalProcessingDelay),
        };
      }

      function processOutboundRTPStats(outboundRTPStats) {
        const rtpStreamStats = processRTPStreamStats(outboundRTPStats);

        return {
          ...rtpStreamStats,
          encoderImplementation: outboundRTPStats.encoderImplementation,
          bytesSent: outboundRTPStats.bytesSent,
          packetsSent: outboundRTPStats.packetsSent,
          frameWidth: outboundRTPStats.frameWidth,
          frameHeight: outboundRTPStats.frameHeight,
          frameBitDepth: outboundRTPStats.frameBitDepth,
          framesPerSecond:
            outboundRTPStats.framesPerSecond &&
            outboundRTPStats.framesPerSecond.toString(),
          framesSent: outboundRTPStats.framesSent,
          framesEncoded: outboundRTPStats.framesEncoded,
          qualityLimitationReason: outboundRTPStats.qualityLimitationReason,
          qualityLimitationResolutionChanges:
            outboundRTPStats.qualityLimitationResolutionChanges,
          totalEncodeTime: secToMs(outboundRTPStats.totalEncodeTime),
          totalPacketSendDelay: secToMs(outboundRTPStats.totalPacketSendDelay),
        };
      }

      function processRemoteInboundRTPStats(remoteInboundRTPStats) {
        const rtpStreamStats = processRTPStreamStats(remoteInboundRTPStats);

        return {
          ...rtpStreamStats,
          packetsReceived: remoteInboundRTPStats.packetsReceived,
          packetsLost: remoteInboundRTPStats.packetsLost,
          jitter: secToMs(remoteInboundRTPStats.jitter),
          framesDropped: remoteInboundRTPStats.framesDropped,
          roundTripTime: secToMs(remoteInboundRTPStats.roundTripTime),
          totalRoundTripTime: secToMs(remoteInboundRTPStats.totalRoundTripTime),
          fractionLost:
            remoteInboundRTPStats.fractionLost !== undefined &&
            remoteInboundRTPStats.fractionLost.toString(),
          reportsReceived: remoteInboundRTPStats.reportsReceived,
          roundTripTimeMeasurements:
            remoteInboundRTPStats.roundTripTimeMeasurements,
        };
      }

      function processRemoteOutboundRTPStats(remoteOutboundRTPStats) {
        const rtpStreamStats = processRTPStreamStats(remoteOutboundRTPStats);

        return {
          ...rtpStreamStats,
          encoderImplementation: remoteOutboundRTPStats.encoderImplementation,
          bytesSent: remoteOutboundRTPStats.bytesSent,
          packetsSent: remoteOutboundRTPStats.packetsSent,
          roundTripTime: secToMs(remoteOutboundRTPStats.roundTripTime),
          totalRoundTripTime: secToMs(
            remoteOutboundRTPStats.totalRoundTripTime
          ),
          reportsSent: remoteOutboundRTPStats.reportsSent,
          roundTripTimeMeasurements:
            remoteOutboundRTPStats.roundTripTimeMeasurements,
        };
      }

      event.inboundRTP = statsArr
        .filter((stat) => stat.type === "inbound-rtp")
        .map(processInboundRTPStats);

      event.outboundRTP = statsArr
        .filter((stat) => stat.type === "outbound-rtp")
        .map(processOutboundRTPStats);

      event.remoteInboundRTP = statsArr
        .filter((stat) => stat.type === "remote-inbound-rtp")
        .map(processRemoteInboundRTPStats);

      event.remoteOutboundRTP = statsArr
        .filter((stat) => stat.type === "remote-outbound-rtp")
        .map(processRemoteOutboundRTPStats);

      this.client.sendEvent(this.roomId, "me.robertlong.call.info", event);
    };

    let statsTimeout;

    const sendStats = () => {
      if (
        call.state === "ended" ||
        peerConnection.connectionState === "closed"
      ) {
        clearTimeout(statsTimeout);
        return;
      }

      sendWebRTCInfoEvent("stats");
      statsTimeout = setTimeout(sendStats, 30 * 1000);
    };

    setTimeout(sendStats, 30 * 1000);

    peerConnection.addEventListener("iceconnectionstatechange", () => {
      sendWebRTCInfoEvent("iceconnectionstatechange");
    });
    peerConnection.addEventListener("icegatheringstatechange", () => {
      sendWebRTCInfoEvent("icegatheringstatechange");
    });
    peerConnection.addEventListener("negotiationneeded", () => {
      sendWebRTCInfoEvent("negotiationneeded");
    });
    peerConnection.addEventListener("track", () => {
      sendWebRTCInfoEvent("track");
    });
    // NOTE: Not available on Firefox
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1561441
    peerConnection.addEventListener(
      "icecandidateerror",
      ({ errorCode, url, errorText }) => {
        this.client.sendEvent(this.roomId, "me.robertlong.call.ice_error", {
          call_id: call.callId,
          errorCode,
          url,
          errorText,
        });
      }
    );
    peerConnection.addEventListener("signalingstatechange", () => {
      sendWebRTCInfoEvent("signalingstatechange");
    });
  }

  _onIncomingCall = (call) => {
    if (!this.joined) {
      const onHangup = (call) => {
        const index = this.pendingCalls.findIndex((p) => p.call === call);

        if (index !== -1) {
          this.pendingCalls.splice(index, 1);
        }
      };

      const onReplaced = (call, newCall) => {
        const index = this.pendingCalls.findIndex((p) => p.call === call);

        if (index !== -1) {
          this.pendingCalls.splice(index, 1, {
            call: newCall,
            onHangup: () => onHangup(newCall),
            onReplaced: (nextCall) => onReplaced(newCall, nextCall),
          });
        }
      };

      this.pendingCalls.push({
        call,
        onHangup: () => onHangup(call),
        onReplaced: (newCall) => onReplaced(call, newCall),
      });
      call.on("hangup", onHangup);
      call.on("replaced", onReplaced);

      return;
    }

    if (call.roomId !== this.roomId) {
      return;
    }

    const userId = call.opponentMember.userId;
    this._addCall(call, userId);
    call.answer();
    this._observePeerConnection(call);
  };

  _addCall(call, userId) {
    if (call.state === "ended") {
      return;
    }

    const existingCall = this.participants.find(
      (p) => !p.local && p.call && p.call.callId === call.callId
    );

    if (existingCall) {
      return;
    }

    this.participants.push({
      userId,
      feed: null,
      call,
    });

    call.on("state", (state) =>
      this._setDebugState(userId, call.callId, state)
    );
    call.on("feeds_changed", () => this._onCallFeedsChanged(call));
    call.on("hangup", () => this._onCallHangup(call));

    const onReplaced = (newCall) => {
      this._onCallReplaced(call, newCall);
      call.removeListener("replaced", onReplaced);
    };

    call.on("replaced", onReplaced);
    this._onCallFeedsChanged(call);

    this.emit("participants_changed");
  }

  _onCallFeedsChanged = (call) => {
    const localFeeds = call.getLocalFeeds();

    let participantsChanged = false;

    if (!this.localParticipant.feed && localFeeds.length > 0) {
      this.localParticipant.call = call;
      this.localParticipant.feed = localFeeds[0];
      participantsChanged = true;
    }

    const remoteFeeds = call.getRemoteFeeds();
    const remoteParticipant = this.participants.find(
      (p) => !p.local && p.call === call
    );

    if (remoteFeeds.length > 0 && remoteParticipant.feed !== remoteFeeds[0]) {
      remoteParticipant.feed = remoteFeeds[0];
      participantsChanged = true;
    }

    if (participantsChanged) {
      this.emit("participants_changed");
    }
  };

  _onCallHangup = (call) => {
    const participantIndex = this.participants.findIndex(
      (p) => !p.local && p.call === call
    );

    if (call.hangupReason === "replaced") {
      return;
    }

    if (participantIndex === -1) {
      return;
    }

    this.participants.splice(participantIndex, 1);

    if (this.localParticipant.call === call) {
      const newLocalCallParticipant = this.participants.find(
        (p) => !p.local && p.call
      );

      if (newLocalCallParticipant) {
        const localFeeds = call.getLocalFeeds();

        if (localFeeds.length > 0) {
          this.localParticipant.call = call;
          this.localParticipant.feed = localFeeds[0];
        } else {
          this.localParticipant.call = null;
          this.localParticipant.feed = null;
        }
      } else {
        this.localParticipant.call = null;
        this.localParticipant.feed = null;
      }
    }

    this.emit("participants_changed");
  };

  _onCallReplaced = (call, newCall) => {
    const remoteParticipant = this.participants.find(
      (p) => !p.local && p.call === call
    );

    remoteParticipant.call = newCall;
    this._observePeerConnection(newCall);

    newCall.on("feeds_changed", () => this._onCallFeedsChanged(newCall));
    newCall.on("hangup", () => this._onCallHangup(newCall));
    newCall.on("replaced", (nextCall) =>
      this._onCallReplaced(newCall, nextCall)
    );
    this._onCallFeedsChanged(newCall);

    this.emit("participants_changed");
  };

  leaveCall() {
    if (!this.joined) {
      return;
    }

    const userId = this.client.getUserId();
    const currentMemberState = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );

    this.client.sendStateEvent(
      this.roomId,
      "m.room.member",
      {
        ...currentMemberState.getContent(),
        [CONF_PARTICIPANT]: null,
      },
      userId
    );

    for (const participant of this.participants) {
      if (!participant.local && participant.call) {
        participant.call.hangup("user_hangup", false);
      }
    }

    this.joined = false;
    this.participants = [this.localParticipant];
    this.localParticipant.feed = null;
    this.localParticipant.call = null;

    this.emit("participants_changed");
  }

  logout() {
    localStorage.removeItem("matrix-auth-store");
  }
}
