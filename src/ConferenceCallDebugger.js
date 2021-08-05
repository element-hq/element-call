import EventEmitter from "events";

export class ConferenceCallDebugger extends EventEmitter {
  constructor(manager) {
    super();

    this.manager = manager;

    this.debugState = {
      users: new Map(),
      calls: new Map(),
    };

    this.manager.on("call", this._onCall);
    this.manager.on("debugstate", this._onDebugStateChanged);
    this.manager.client.on("event", this._onEvent);
  }

  _onEvent = (event) => {
    const roomId = event.getRoomId();
    const type = event.getType();

    if (
      roomId === this.manager.roomId &&
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

  _onDebugStateChanged = (userId, callId, state) => {
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
  };

  _onCall = (call) => {
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
          priority:
            candidateStats.priority && candidateStats.priority.toString(),
          candidateType: candidateStats.candidateType,
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

      this.manager.client.sendEvent(
        this.manager.roomId,
        "me.robertlong.call.info",
        event
      );
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
        this.manager.client.sendEvent(
          this.manager.roomId,
          "me.robertlong.call.ice_error",
          {
            call_id: call.callId,
            errorCode,
            url,
            errorText,
          }
        );
      }
    );
    peerConnection.addEventListener("signalingstatechange", () => {
      sendWebRTCInfoEvent("signalingstatechange");
    });
  };
}
