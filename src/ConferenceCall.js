import EventEmitter from "events";

const CONF_ROOM = "me.robertlong.conf";
const CONF_PARTICIPANT = "me.robertlong.conf.participant";
const PARTICIPANT_TIMEOUT = 1000 * 5;

export class ConferenceCall extends EventEmitter {
  constructor(client, roomId) {
    super();
    this.client = client;
    this.roomId = roomId;
    this.joined = false;
    this.room = client.getRoom(roomId);
    this.localParticipant = {
      local: true,
      userId: client.getUserId(),
      feed: null,
      call: null,
      muted: true,
      calls: [],
    };
    this.participants = [this.localParticipant];

    this.client.on("RoomState.members", this._onMemberChanged);
    this.client.on("Call.incoming", this._onIncomingCall);
  }

  join() {
    console.debug(
      "join",
      `Local user ${this.client.getUserId()} joining room ${this.roomId}`
    );

    this.joined = true;

    const activeConf = this.room.currentState
      .getStateEvents(CONF_ROOM, "")
      ?.getContent()?.active;

    if (!activeConf) {
      this.client.sendStateEvent(this.roomId, CONF_ROOM, { active: true }, "");
    }

    this.room
      .getMembers()
      .forEach((member) => this._processMember(member.userId));

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
    const localUserId = this.client.getUserId();

    if (userId === localUserId) {
      return;
    }

    // Don't process members until we've joined
    if (!this.joined) {
      console.debug(
        "_processMember",
        `Ignored ${userId}. Local user has not joined conference yet.`
      );
      return;
    }

    // Only initiate a call with a user who has a userId that is lexicographically
    // less than your own. Otherwise, that user will call you.
    if (userId < localUserId) {
      console.debug(
        "_processMember",
        `Ignored ${userId}. Local user will answer call instead.`
      );
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
      typeof participantTimeout === "number" &&
      new Date().getTime() - participantTimeout > PARTICIPANT_TIMEOUT
    ) {
      // Member is inactive so don't call them.
      console.debug(
        "_processMember",
        `Ignored ${userId}. User is not active in conference.`
      );
      return;
    }

    const call = this.client.createCall(this.roomId, userId);
    this._addCall(call, userId);
    console.debug(
      "_processMember",
      `Placing video call ${call.callId} to ${userId}.`
    );
    call.placeVideoCall();
  }

  _onIncomingCall = (call) => {
    if (!this.joined) {
      console.debug(
        "_onIncomingCall",
        "Local user hasn't joined yet. Not answering."
      );
      return;
    }

    if (call.opponentMember) {
      const userId = call.opponentMember.userId;
      this._addCall(call, userId);
      console.debug(
        "_onIncomingCall",
        `Answering incoming call ${call.callId} from ${userId}`
      );
      call.answer();
      return;
    }
  };

  _addCall(call, userId) {
    const existingCall = this.participants.find(
      (p) => p.call && p.call.callId === call.callId
    );

    if (existingCall) {
      console.debug(
        "_addCall",
        `Found existing call ${call.callId}. Ignoring.`
      );
      return;
    }

    this.participants.push({
      userId,
      feed: null,
      call,
      calls: [call],
    });

    console.debug("_addCall", `Added new participant ${userId}`);

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
    console.debug("_onCallHangup", `Hangup reason ${call.hangupReason}`);

    if (call.hangupReason === "replaced") {
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
    console.debug(
      "_onCallReplaced",
      `Call ${call.callId} replaced with ${newCall.callId}`
    );

    const remoteParticipant = this.participants.find((p) => p.call === call);

    remoteParticipant.call = newCall;
    remoteParticipant.calls.push(newCall);

    newCall.on("feeds_changed", () => this._onCallFeedsChanged(newCall));
    newCall.on("hangup", () => this._onCallHangup(newCall));
    newCall.on("replaced", (nextCall) =>
      this._onCallReplaced(newCall, nextCall)
    );
    this._onCallFeedsChanged(newCall);

    this.emit("participants_changed");
  };
}
