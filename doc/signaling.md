# Signaling

> A documentation of [MSC3898](https://github.com/matrix-org/matrix-spec-proposals/blob/1896fc7cdab7cbf5e653f84b650772e894e26485/proposals/3898-sfu.md) and  [MSC3401](https://github.com/matrix-org/matrix-spec-proposals/blob/6b98d667cf634f78c6604151276d5ef25d305aac/proposals/3401-group-voip.md)

With Signaling we mean the whole process of message exchange for the purpose of video audio media synchronization and connection.
WebRTC Signaling is a part of it. 

## Message Exchange
To set up and operate a video conference, data have to be exchanged between the participants.
Matrix itself provides three different message protocols for data synchronization and data persistence.

1. [State Events](https://spec.matrix.org/latest/#events)

   State Events exchanged in the context of a room are stored in a directed acyclic graph (DAG) called an “event graph”.
2. TO-Device Messages

3. DCs (DataChannel Messages)

## Element Call Components

![Element Call Components With Protocols](./assets/element-call-protocols.component.svg)

## Start a Group Call

![Start Group Call Sequence](./assets/group-call-start.sequence.svg)

## Join a Group Call

In case of joining a Group Call we get another situation.
Members which already joined the conference can use `DC Messages` (WebRTC datachannel messages).
The component diagram for user there already in a call looks more like this.

![Element Call Components With Protocols in Group Call](./assets/element-call-group-call.component.svg)

In Element Call the WebRTC media renegotiation is done via `DC Messages`. 
In this case the sequence diagram for Users there joining a Group Call is more advanced.

![Join Group Call Sequence](./assets/group-call-join.sequence.svg)


## Mute, Unmute and ScreenShare

.. not yet finish


## Distributed Data States 

Because [Matrix is a distributed system](https://hacks.mozilla.org/2018/10/dweb-decentralised-real-time-interoperable-communication-with-matrix/), this leads us to distributed data states.

.. not yet finish


## Links

- [MSC3898](https://github.com/matrix-org/matrix-spec-proposals/blob/1896fc7cdab7cbf5e653f84b650772e894e26485/proposals/3898-sfu.md)
- [MSC3401](https://github.com/matrix-org/matrix-spec-proposals/blob/6b98d667cf634f78c6604151276d5ef25d305aac/proposals/3401-group-voip.md)
- [Decentralised real time interoperable communication with matrix](https://hacks.mozilla.org/2018/10/dweb-decentralised-real-time-interoperable-communication-with-matrix/)
- [MSC3401, Native Group VoIP and Metaverse on Matrix by Robert Long, https://archive.fosdem.org](https://archive.fosdem.org/2022/schedule/event/matrix_metaverse/)
- [Events, https://spec.matrix.org/](https://spec.matrix.org/latest/#events)
- [Events, https://matrix.org/docs/spec](https://matrix.org/docs/spec/client_server/r0.4.0.html#events)
- [To Device Messages, https://spec.matrix.org](https://spec.matrix.org/latest/#devices)
- [To Device Messages, https://matrix.org/docs/spec](https://matrix.org/docs/spec/client_server/r0.4.0.html#send-to-device-messaging)
- [Federation API, https://spec.matrix.org](https://spec.matrix.org/v1.6/server-server-api/)
