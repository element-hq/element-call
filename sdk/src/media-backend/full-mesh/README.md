# Full mesh media backend

The MatrixRTC full mesh transport, as specified in
[MSC4575: Full mesh transport for MatrixRTC](https://github.com/matrix-org/matrix-spec-proposals/pull/4575).

Every subscriber opens a WebRTC connection to every publisher it receives from. To-device messages set
the connection up; after that, the connection's control channel carries all signalling.

The MSC is not merged, so all identifiers use its unstable prefix `org.matrix.msc4575`.

Not yet as the MSC has it: the membership's `transports.can_subscribe` is built by the js-sdk
(`MembershipManager.makeMyMembership`), which lists the LiveKit types only, so full mesh isn't
advertised there although every participation receives it.

| File                      | What it implements                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `FullMeshBackend.ts`      | The `MediaBackend`: subscribing to members, accepting subscribers                       |
| `signalling.ts`           | The to-device messages and their ordering by `seq`                                      |
| `ControlChannel.ts`       | The control channel and its messages                                                    |
| `PeerConnection.ts`       | What both sides of a connection share, including the channel switch                     |
| `PublisherConnection.ts`  | Sending our tracks and the data channel to one subscriber                               |
| `SubscriberConnection.ts` | Receiving one publisher's tracks, with retries                                          |
| `metadata.ts`             | Track and consumption metadata, and their validation                                    |
| `LocalMedia.ts`           | The local tracks every publisher connection sends: captured, or taken over from a lobby |
| `MediaTrack.ts`           | A WebRTC track as the SDK's `MediaTrack`                                                |
