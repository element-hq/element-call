# MID Based Signalling

We intend to migrate away from refering to tracks by WebRTC track ID since this has known
problems with ID consistency on either side of the WebRTC connection (we currently parse the
SDP to work around this).

We also propose switch the structure of MSC3401 call events to be compatible with extensible
events. Legacy calls would have to remain the same for backwards compatibility. It is probably
impractical to have any call events support both formats because this would mean the SDP, which
can be quite large,would have to be duplicated in the JSON. Therefore, there's a significant
advantage to taking to opportunity to migrate to an extensible event format now.

We use the same event types for call invites and answers, so it is important that these events
are only sent via to-device messages directly to clients known to support them. They must not be
sent in rooms not supporting extensible events.

This outlines how a switch to mid + media UUID based signalling would work in more detail.

**Note: I've made this mixin about describing the tracks that are being sent on the transceivers
and the keys are the mids rather than the media UUIDs. Hoping that sketching this out will give
us an idea of whether it could work or not.**

m.call.invite:
```
{
    "m.call.negotiate": {
        "version": 1,
        "call_id": "35657a5b793ce",
        "conf_id": "bbe53499f82e3",
        "invitee": "@bob:example.org",
        "lifetime": 60000,
        "party_id": "123456",
        "description": {
            "type": "offer",
            "sdp": "[...]",
        }
    },
    "m.call.capabilities": {
        "m.call.transferee": false,
        "m.call.dtmf": false,
    },
    "m.call.describe_media": {
        "1": { // transceiver mid 1
            "media_uuid": "aaaa-aaaa-aaaaaa-aaaa-aaaa",
            "media_group_uuid": "1234-1234-123456-1234-1234", // rather than 'track group ID' to match media UUID?
            "purpose": "m.usermedia",
            "kind": "video"
        },
        "2": {
            "media_uuid": "bbbb-bbbb-bbbbbb-bbbb-bbbb",
            "media_group_uuid": "1234-1234-123456-1234-1234",
            "purpose": "m.usermedia",
            "kind": "audio",
        },
    },
}
```

Note that the SDP content is now in a section called `m.negotiate`. This is a mixin block common to all negotiation events
(invite, answer, negotiate).

The `m.call.describe_media` block is a 'mixin' block in extensible events terms and describes the media being sent on each
transceiver by the sending user. It *always* refers only to the media being sent by the device that sends the event.

The same is sent either to a focus or a peer client.

A focus will gather the various streams that it's receiving by the `conf_id` from the `m.negotiate` section. In future
when stream are advertised via the room state, this could be unnecessary and foci need not have any knowledge of what
group calls are happening (assuming we don't need them to enforce viewship based on this).

The peer or focus then answers, again over to-device message. A peer will start sending media tracks automatically and
therefore describe them in the answer:

m.call.answer (full mesh)
```
{
    "m.negotiate": {
        "version": 1,
        "call_id": "35657a5b793ce",
        "conf_id": "bbe53499f82e3",
        "party_id": "678910",
        "description": {
            "type": "answer",
            "sdp": "[...]",
        }
    },
    "m.call.capabilities": {
        "m.call.transferee": false,
        "m.call.dtmf": false,
    },
    "m.call.describe_media": {
        "1": { // transceiver mid 1
            "media_uuid": "cccc-cccc-cccccc-cccc-cccc",
            "media_group_uuid": "2345-2345-234567-2345-2345",
            "purpose": "m.usermedia",
            "kind": "video"
        },
        "2": {
            "media_uuid": "bbbb-bbbb-bbbbbb-bbbb-bbbb",
            "media_group_uuid": "1234-1234-123456-1234-1234",
            "purpose": "m.usermedia",
            "kind": "audio",
        },
    },
}
```

A focus, however, will not send any tracks by default and therefore does not include an
`m.call.describe_media` block. Instead, it includes an `m.track.advertise` block advertising
what tracks are available for that `conf_id`.

m.call.answer (focus)
```
{
    "m.negotiate": {
        "version": 1,
        "call_id": "35657a5b793ce",
        "conf_id": "bbe53499f82e3",
        "party_id": "678910",
        "description": {
            "type": "answer",
            "sdp": "[...]",
        }
    },
    "m.call.capabilities": {
        "m.call.transferee": false,
        "m.call.dtmf": false,
    },
    "m.call.advertise_media": {
        "2345-2345-234567-2345-2345": { // media group uuid
            "user_id": "alice:example.org",
            "device_id": "88888888",
            media: [{
                "media_uuid": "aaaa-aaaa-aaaaaa-aaaa-aaaa":
                "purpose": "m.usermedia",
                "kind": "video",
            }, {
                "media_uuid": "bbbb-bbbb-bbbbbb-bbbb-bbbb":
                "purpose": "m.usermedia",
                "kind": "audio",
            }],
        }
    },
}
```

XXX: How flat vs deep do we want the structure to be here? I've done it quite deep here,
organised by user ID / device ID / media group UUID, but they could also just be a flat
list of tracks. It would be more duplication but maybe less effort to read.

The expected behaviour here would be for foci to essentially maintain a structure with all
tracks being pushed to it. This structure would probably have call IDs as a top level index,
then look very similar to the structure of the `m.call.advertise_media` event. It could keep
a reference to the transceiver it was receiving media on in the structure itself alongside
the media UUID, or maintain a separate map of media UUID to transceiver / peer connection such
that the first structure could be marshalled to JSON and sent to clients as-is. These are just
potential implementations though, all that is important is that the focus maintains sufficient
information about each track being sent to each client.

On the client side, the client will essentially take the `m.call.advertise_media` data and save it
almost as-is. It would probably cross-reference it against the call member state events to
ensure that it wasn't showing feeds for any users that did not have state events indicating
that they were in the call, although if we trust the focus and assume that conf IDs are unique
enough to be unguessable, this may be unnecessary.

In the simplest case, the client will simply iterate through this structure and add every
media UUID it finds to an `m.call.subscribe_media` message.

The most complex part is that when the `m.call.describe_media` message arrives back from the focus,
it will have to search through the data from the `m.call.advertise_media` message to map the tracks
it is now receving to the right user IDs (XXX: it could build them into a map to make this lookup
efficient, although if we make the advertise message indexed by media UUID then it already has
a map indexed by the correct thing...)

The `select_answer` is also tweaked to be more extensible-event like although is essentially
the same:

m.select\_answer
```
"m.select_answer": {
    "version": "1",
    "conf_id": "1674732106391mz4ygIc84Q2Z6mJ5",
    "call_id": "35657a5b793ce",
    "party_id": "123456",
    "selected_party_id": "678910",
}
```

Once the client receives this, it decides what tracks it wants to receive and then sends
a subscribe message over the data channel:

m.call.subscribe\_media
```
"m.call.subscribe_media": {
    "seq": 1,
    "media_uuids": {
        "aaaa-aaaa-aaaaaa-aaaa-aaaa": {
            "width": 1024,
            "height": 576,
        },
        "bbbb-bbbb-bbbbbb-bbbb-bbbb": {},
    },
},
```

This has also been rearranged a little to make the media UUIDs the keys and remove the
unsubscribe section which is unnecessary if we always send the complete set of tracks we
want to receive (we unsubscribe by just removing the media UUID from the dict).

This also now contains a sequence number. This is a monotonically increasing integer, starting
at 0 and scoped to the lifetime of the peer connection. The focus will send a reply containing
this sequence number to acknowledge that it has processed the message. This can be a positive ack:

m.call.ack
```
"m.call.ack": {
    "seq": 1,
    "result": "success",
}
```

...or an error:

m.call.ack
```
"m.call.ack": {
    "seq": 1,
    "result": "error",
    "errcode": "M_UNKNOWN",
    "error": "Internal server error",
}
```

This may give some indication as to why some tracks were not available (should it have errors per
media UUID, perhaps?)

If the focus needs to renegotiate to send the tracks, it does so, describing the media UUIDs it intends to send on the
transceivers once the negotiation is complete:

m.call.negotiate
```
{
    "m.negotiate": {
        "version": 1,
        "call_id": "35657a5b793ce",
        "conf_id": "bbe53499f82e3",
        "lifetime": 60000,
        "party_id": "123456",
        "description": {
            "type": "offer",
            "sdp": "[...]",
        }
    },
    "m.call.describe_media": {
        "1": { // transceiver mid 1
            "media_uuid": "aaaa-aaaa-aaaaaa-aaaa-aaaa",
            "media_group_uuid": "1234-1234-123456-1234-1234", // rather than 'track group ID' to match media UUID?
            "purpose": "m.usermedia",
            "kind": "video"
        },
        "2": {
            "media_uuid": "bbbb-bbbb-bbbbbb-bbbb-bbbb",
            "media_group_uuid": "1234-1234-123456-1234-1234",
            "purpose": "m.usermedia",
            "kind": "audio",
        },
    },
}
```

Note that the content of this event is practically *identical* to the invite sent in a full mesh call. The purpose
is the same: to describe what tracks are being sent on each transceiver. In this case, the `purpose` and `kind` fields
are redundant since the client already knows them: they're included for symmetry. User IDs and device IDs are omitted,
howerver, as the client equally already knows what user IDs the media UUIDs correspond to, and this keeps it the same as
a full mesh track description.

Or it may already have enough spare transceivers and not need to negotiate, in which case it simply sends the same
track description block without a negotiation (and with event type `m.call.describe_media`.
