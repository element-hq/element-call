# MatrixRTC modes

Element Call is in the middle of a transition of how a call session is
represented: from room _state_ events (`org.matrix.msc3401.call.member`) to
_sticky_ events
([MSC4354](https://github.com/matrix-org/matrix-spec-proposals/pull/4354)),
which are a much better fit for the short lived, per-device nature of call
memberships.

Not every homeserver supports sticky events yet. The two MatrixRTC modes
controls whether Element Call uses them.

## The modes

| Mode            | Membership events | SFU selection | JWT endpoint                 |
| --------------- | ----------------- | ------------- | ---------------------------- |
| `compatibility` | state events      | multi SFU     | legacy                       |
| `matrix_2_0`    | sticky events     | multi SFU     | Matrix 2.0 (hashed identity) |

**`compatibility`** — multi SFU, but still state events. Use it when the
homeserver does not support sticky events. This is the default.

**`matrix_2_0`** — the target state. Requires a homeserver that advertises
MSC4354 and all clients on v0.17.0 or later. The local membership requests its
token from the Matrix 2.0 JWT endpoint of the
[MatrixRTC Authorization Service](https://github.com/element-hq/lk-jwt-service)
and identifies the room by a hashed identity instead of a `livekit_alias`.
(Remote memberships always try the new endpoint first and fall back to the
legacy one, so remote participants can be on either.)

## Selecting a mode

Users can choose a mode under **Settings → Developer → MatrixRTC mode**. The
Matrix 2.0 option is disabled if the homeserver does not support sticky events.

A deployment can pin the mode for all its clients in `config.json`, which
disables the Developer Settings choice:

```json
{
  "matrix_rtc_mode": "compatibility"
}
```

Valid values are `compatibility` and `matrix_2_0`; an invalid value is
ignored (with a warning) and the user's choice applies. Pinning `matrix_2_0` on a
homeserver without sticky event support makes joining fail with a "sticky events
required" error.
