# Self-Hosting Element Call

> [!NOTE]  
> For In-App calling (Element X, Element Web, Element Desktop) use-case only
> section [Prerequisites](#Prerequisites) is required.

## Prerequisites

> [!IMPORTANT]  
> This section covers the requirements for deploying a **Matrix site**
> compatible with MatrixRTC, the foundation of Element Call. These requirements
> apply to both Standalone as well as Widget mode operation of Element Call.

### A Matrix Homeserver

The following [MSCs](https://github.com/matrix-org/matrix-spec-proposals) are
required for Element Call to work properly:

- **[MSC3266](https://github.com/deepbluev7/matrix-doc/blob/room-summaries/proposals/3266-room-summary.md):
  Room Summary API**: In Standalone mode Element Call is able to join rooms
  over federation using knocking. In this context MSC3266 is required as it
  allows to request a room summary of rooms you are not joined. The summary
  contains the room join rules. We need that information to decide if the user
  gets prompted with the option to knock ("Request to join call"), a "cannot
  join error" or "the join view".

- **[MSC4140](https://github.com/matrix-org/matrix-spec-proposals/blob/toger5/expiring-events-keep-alive/proposals/4140-delayed-events-futures.md)
  Delayed Events**: Delayed events are required for proper call participation
  signalling. If disabled it is very likely that you end up with stuck calls in
  Matrix rooms.

- **[MSC4222](https://github.com/matrix-org/matrix-spec-proposals/blob/erikj/sync_v2_state_after/proposals/4222-sync-v2-state-after.md)
  Adding `state_after` to sync v2**: Allow clients to opt-in to a change of the
  sync v2 API that allows them to correctly track the state of the room. This is
  required by Element Call to track room state reliably.

If you're using [Synapse](https://github.com/element-hq/synapse/) as your
homeserver, you'll need to additionally add the following config items to
`homeserver.yaml` to comply with Element Call:

```yaml
experimental_features:
  # MSC3266: Room summary API. Used for knocking over federation
  msc3266_enabled: true
  # MSC4222 needed for syncv2 state_after. This allow clients to
  # correctly track the state of the room.
  msc4222_enabled: true

# The maximum allowed duration by which sent events can be delayed, as
# per MSC4140.
max_event_delay_duration: 24h

rc_message:
  # This needs to match at least e2ee key sharing frequency plus a bit of headroom
  # Note key sharing events are bursty
  per_second: 0.5
  burst_count: 30

rc_delayed_event_mgmt:
  # This needs to match at least the heart-beat frequency plus a bit of headroom
  # Currently the heart-beat is every 5 seconds which translates into a rate of 0.2s
  per_second: 1
  burst_count: 20
```

As a prerequisite for the
[MatrixRTC Authorization Service](https://github.com/element-hq/lk-jwt-service)
make sure that your Synapse server has either a `federation` or `openid`
[listener configured](https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html#listeners).

### MatrixRTC Backend

In order to **guarantee smooth operation** of Element Call MatrixRTC backend is
required for each site deployment.

![MSC4195 compatible setup](MSC4195_setup.drawio.png)

As depicted above in the `example.com` site deployment, Element Call requires a
[Livekit SFU](https://github.com/livekit/livekit) alongside a
[MatrixRTC Authorization Service](https://github.com/element-hq/lk-jwt-service)
to implement
[MSC4195: MatrixRTC using LiveKit backend](https://github.com/hughns/matrix-spec-proposals/blob/hughns/matrixrtc-livekit/proposals/4195-matrixrtc-livekit.md).

#### Matrix site endpoint routing

In the context of MatrixRTC, we suggest using a single hostname for backend
communication by implementing endpoint routing within a reverse proxy setup. For
the example above, this results in:
| Service | Endpoint | Example |
| -------- | ------- | ------- |
| [Livekit SFU](https://github.com/livekit/livekit) WebSocket signalling connection | `/livekit/sfu` | `matrix-rtc.example.com/livekit/sfu` |
| [MatrixRTC Authorization Service](https://github.com/element-hq/lk-jwt-service) | `/livekit/jwt` | `matrix-rtc.example.com/livekit/jwt` |

Using Nginx, you can achieve this by:

```nginx configuration file
server {
    ...
    location ^~ /livekit/jwt/ {
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # MatrixRTC Authorization Service running at port 8080
      proxy_pass http://localhost:8080/;
    }

    location ^~ /livekit/sfu/ {
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      proxy_send_timeout 120;
      proxy_read_timeout 120;
      proxy_buffering off;

      proxy_set_header Accept-Encoding gzip;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";

      # LiveKit SFU websocket connection running at port 7880
      proxy_pass http://localhost:7880/;
    }
}
```

Or Using Caddy, you can achieve this by:

```caddy configuration file
# Route for lk-jwt-service with livekit/jwt prefix
@jwt_service path /livekit/jwt/sfu/get /livekit/jwt/healthz
handle @jwt_service {
  uri strip_prefix /livekit/jwt
  reverse_proxy http://[::1]:8080 {
    header_up Host {host}
    header_up X-Forwarded-Server {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
  }
}

# Default route for livekit
handle {
  reverse_proxy http://localhost:7880 {
    header_up Host {host}
    header_up X-Forwarded-Server {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
  }
}
```

#### MatrixRTC backend announcement

> [!IMPORTANT]
> As defined in
> [MSC4143](https://github.com/matrix-org/matrix-spec-proposals/pull/4143)
> MatrixRTC backend must be announced to the client via your **Matrix site's
> `.well-known/matrix/client`** file (e.g.
> `example.com/.well-known/matrix/client` matching the site deployment example
> from above). The configuration is a list of Foci configs:

```json
"org.matrix.msc4143.rtc_foci": [
    {
        "type": "livekit",
        "livekit_service_url": "https://matrix-rtc.example.com/livekit/jwt"
    },
    {
        "type": "livekit",
        "livekit_service_url": "https://matrix-rtc-2.example.com/livekit/jwt"
    }
]
```

Make sure this file is served with the correct MIME type (`application/json`).
Additionally, ensure the appropriate CORS headers are set to allow web clients
to access it across origins. For more details, refer to the
[Matrix Client-Server API: 2. Web Browser Clients](https://spec.matrix.org/latest/client-server-api/#web-browser-clients).

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization
```

> [!NOTE]  
> Most `org.matrix.msc4143.rtc_foci` configurations will only have one entry in
> the array

## Building Element Call

> [!NOTE]  
> This step is only required if you want to deploy Element Call in Standalone
> mode.

Until prebuilt tarballs are available, you'll need to build Element Call from
source. First, clone and install the package:

```sh
git clone https://github.com/element-hq/element-call.git
cd element-call
corepack enable
yarn
yarn build
```

If all went well, you can now find the build output under `dist` as a series of
static files. These can be hosted using any web server that can be configured
with custom routes (see below).

You also need to add a configuration file which goes in `public/config.json` -
you can use the sample as a starting point:

```sh
cp config/config.sample.json public/config.json
# edit public/config.json
```

The sample needs editing to contain the homeserver that you are using.

Because Element Call uses client-side routing, your server must be able to route
any requests to non-existing paths back to `/index.html`. For example, in Nginx
you can achieve this with the `try_files` directive:

```nginx configuration file
server {
    ...
    location / {
        ...
        try_files $uri /$uri /index.html;
    }
}
```

## Configuration

There are currently two different config files. `.env` holds variables that are
used at build time, while `public/config.json` holds variables that are used at
runtime. Documentation and default values for `public/config.json` can be found
in [ConfigOptions.ts](../src/config/ConfigOptions.ts).

> [!CAUTION]
> Please note configuring MatrixRTC backend via `config.json` of
> Element Call is only available for developing and debug purposes. Relying on
> it might break Element Call going forward!

## A Note on Standalone Mode of Element Call

Element Call in Standalone mode requires a homeserver with registration enabled
without any 3pid or token requirements, if you want it to be used by
unregistered users. Furthermore, it is not recommended to use it with an
existing homeserver where user accounts have joined normal rooms, as it may not
be able to handle those yet and it may behave unreliably.

Therefore, to use a self-hosted homeserver, this is recommended to be a new
server where any user account created has not joined any normal rooms anywhere
in the Matrix federated network. The homeserver used can be setup to disable
federation, so as to prevent spam registrations (if you keep registrations open)
and to ensure Element Call continues to work in case any user decides to log in
to their Element Call account using the standard Element app and joins normal
rooms that Element Call cannot handle.

# 📚 Community Guides & How-Tos

Looking for real-world tips, tutorials, and experiences from the community?
Below is a collection of blog posts, walkthroughs, and how-tos created by other
self-hosters and developers working with Element Call.

> [!NOTE]  
> These resources are community-created and may reflect different setups or
> versions. Use them alongside the official documentation for best results.

## 🌐 Blog Posts & Articles

- [How to resolve stuck MatrixRTC calls](https://sspaeth.de/2025/02/how-to-resolve-stuck-matrixrtc-calls/)

## 📝 How-Tos & Tutorials

- [MatrixRTC aka Element-call setup (Geek warning)](https://sspaeth.de/2024/11/sfu/)
- [MatrixRTC with Synology Container Manager (Docker)](https://ztfr.de/matrixrtc-with-synology-container-manager-docker/)
- [Encrypted & Scalable Video Calls: How to deploy an Element Call backend with Synapse Using Docker-Compose](https://willlewis.co.uk/blog/posts/deploy-element-call-backend-with-synapse-and-docker-compose/)
- [Element Call einrichten: Verschlüsselte Videoanrufe mit Element X und Matrix Synapse](https://www.cleveradmin.de/blog/2025/04/matrixrtc-element-call-backend-einrichten/)
- [MatrixRTC Back-End for Synapse with Docker Compose and Traefik](https://forge.avontech.net/kstro1/matrixrtc-docker-traefik/)

## 🛠️ Tools

- [A Matrix server sanity tester including tests for proper MatrixRTC setup](https://codeberg.org/spaetz/testmatrix)

## 🤝 Want to Contribute?

Have a guide or blog post you'd like to share? Open a
[PR](https://github.com/element-hq/element-call/pulls) to add it here, or drop a
link in the [#webrtc:matrix.org](https://matrix.to/#/#webrtc:matrix.org) room.
