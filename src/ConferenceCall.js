import EventEmitter from "events";

const CONF_ROOM = "me.robertlong.conf";
const CONF_PARTICIPANT = "me.robertlong.conf.participant";
const PARTICIPANT_TIMEOUT = 1000 * 30;

export class ConferenceCall extends EventEmitter {
  constructor(client, roomId) {
    super();
    this.client = client;
    this.roomId = roomId;
    this.confId = null;
    this.room = client.getRoom(roomId);
    this.localParticipant = {
      userId: client.getUserId(),
      feed: null,
      call: null,
      muted: true,
    };
    this.participants = [this.localParticipant];

    client.on("Room.timeline", function (event, room, toStartOfTimeline) {
      console.debug(event.event);
    });
  }

  join() {
    this.client.on("RoomState.members", this._onMemberChanged);
    this.client.on("Call.incoming", this._onIncomingCall);

    this.emit("joined");

    const activeConf = this.room.currentState
      .getStateEvents(CONF_ROOM, "")
      ?.getContent()?.active;

    if (!activeConf) {
      this.client.sendStateEvent(this.roomId, CONF_ROOM, { active: true }, "");
    } else {
      this.room
        .getMembers()
        .forEach((member) => this._processMember(member.userId));
    }

    this._updateParticipantState();
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
    this._processMember(member.userId);
  };

  _processMember(userId) {
    if (userId === this.client.getUserId()) {
      return;
    }

    const participant = this.participants.find((p) => p.userId === userId);

    const memberStateEvent = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );
    const participantTimeout = memberStateEvent.getContent()[CONF_PARTICIPANT];

    if (
      typeof participantTimeout === "number" &&
      new Date().getTime() - participantTimeout > PARTICIPANT_TIMEOUT * 1.5
    ) {
      if (participant && participant.call) {
        participant.call.hangup("user_hangup");
      }

      return;
    }

    if (!participant) {
      this._callUser(userId);
    }
  }

  _onIncomingCall = (call) => {
    console.debug("_onIncomingCall", call);
    this._addCall(call);
    call.answer();
  };

  _callUser = (userId) => {
    const call = this.client.createCall(this.roomId, userId);
    console.debug("_callUser", call, userId);
    // TODO: Handle errors
    this._addCall(call, userId);
    call.placeVideoCall();
  };

  _addCall(call, userId) {
    const existingCall = this.participants.find(
      (p) => p.call && p.call.callId === call.callId
    );

    if (existingCall) {
      console.debug("found existing call");
      return;
    }

    this.participants.push({
      userId,
      feed: null,
      call,
    });

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
    console.debug("_onCallFeedsChanged", call);
    const localFeeds = call.getLocalFeeds();

    let participantsChanged = false;

    if (!this.localParticipant.feed && localFeeds.length > 0) {
      this.localParticipant.feed = localFeeds[0];
      participantsChanged = true;
    }

    const remoteFeeds = call.getRemoteFeeds();
    const remoteParticipant = this.participants.find((p) => p.call === call);

    if (remoteFeeds.length > 0 && remoteParticipant.feed !== remoteFeeds[0]) {
      remoteParticipant.feed = remoteFeeds[0];
      participantsChanged = true;
    }

    if (participantsChanged) {
      this.emit("participants_changed");
    }
  };

  _onCallHangup = (call) => {
    console.debug("_onCallHangup", call);

    if (call.hangupReason === "replaced") {
      console.debug("replaced");
      return;
    }

    const participantIndex = this.participants.findIndex(
      (p) => p.call === call
    );

    if (participantIndex === -1) {
      return;
    }

    this.participants.splice(participantIndex, 1);

    this.emit("participants_changed");
  };

  _onCallReplaced = (call, newCall) => {
    console.debug("_onCallReplaced", call, newCall);

    const remoteParticipant = this.participants.find((p) => p.call === call);

    remoteParticipant.call = newCall;

    newCall.on("feeds_changed", () => this._onCallFeedsChanged(newCall));
    newCall.on("hangup", () => this._onCallHangup(newCall));
    newCall.on("replaced", (nextCall) =>
      this._onCallReplaced(newCall, nextCall)
    );
    this._onCallFeedsChanged(newCall);

    this.emit("participants_changed");
  };
}
