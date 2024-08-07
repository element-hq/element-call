# Element Call

[![Chat](https://img.shields.io/matrix/webrtc:matrix.org)](https://matrix.to/#/#webrtc:matrix.org)
[![Localazy](https://img.shields.io/endpoint?url=https%3A%2F%2Fconnect.localazy.com%2Fstatus%2Felement-call%2Fdata%3Fcontent%3Dall%26title%3Dlocalazy%26logo%3Dtrue)](https://localazy.com/p/element-call)

Group calls with WebRTC that leverage [Matrix](https://matrix.org) and an open-source WebRTC toolkit from [LiveKit](https://livekit.io/).

For prior version of the Element Call that relied solely on full-mesh logic, check [`full-mesh`](https://github.com/element-hq/element-call/tree/full-mesh) branch.

![A demo of Element Call with six people](demo.jpg)

To try it out, visit our hosted version at [call.element.io](https://call.element.io). You can also find the latest development version continuously deployed to [call.element.dev](https://call.element.dev/).

## Host it yourself

Until prebuilt tarballs are available, you'll need to build Element Call from source. First, clone and install the package:

```
git clone https://github.com/element-hq/element-call.git
cd element-call
yarn
yarn build
```

If all went well, you can now find the build output under `dist` as a series of static files. These can be hosted using any web server of your choice.

You may also wish to add a configuration file (Element Call uses the domain it's hosted on as a Homeserver URL by default,
but you can change this in the config file). This goes in `public/config.json` - you can use the sample as a starting point:

```
cp config/config.sample.json public/config.json
# edit public/config.json
```

Because Element Call uses client-side routing, your server must be able to route any requests to non-existing paths back to `/index.html`. For example, in Nginx you can achieve this with the `try_files` directive:

```
server {
    ...
    location / {
        ...
        try_files $uri /$uri /index.html;
    }
}
```

By default, the app expects you to have a Matrix homeserver (such as [Synapse](https://matrix-org.github.io/synapse/latest/setup/installation.html)) installed locally and running on port 8008. If you wish to use a homeserver on a different URL or one that is hosted on a different server, you can add a config file as above, and include the homeserver URL that you'd like to use.

Element Call requires a homeserver with registration enabled without any 3pid or token requirements, if you want it to be used by unregistered users. Furthermore, it is not recommended to use it with an existing homeserver where user accounts have joined normal rooms, as it may not be able to handle those yet and it may behave unreliably.

Therefore, to use a self-hosted homeserver, this is recommended to be a new server where any user account created has not joined any normal rooms anywhere in the Matrix federated network. The homeserver used can be setup to disable federation, so as to prevent spam registrations (if you keep registrations open) and to ensure Element Call continues to work in case any user decides to log in to their Element Call account using the standard Element app and joins normal rooms that Element Call cannot handle.

## Configuration

There are currently two different config files. `.env` holds variables that are used at build time, while `public/config.json` holds variables that are used at runtime. Documentation and default values for `public/config.json` can be found in [ConfigOptions.ts](src/config/ConfigOptions.ts).

If you're using [Synapse](https://github.com/element-hq/synapse/), you'll need to additionally add the following to `homeserver.yaml` or Element Call won't work:

```
experimental_features:
    msc3266_enabled: true
```

MSC3266 allows to request a room summary of rooms you are not joined.
The summary contains the room join rules. We need that to decide if the user gets prompted with the option to knock ("ask to join"), a cannot join error or the join view.

Element Call requires a Livekit SFU behind a Livekit jwt service to work. The url to the Livekit jwt service can either be configured in the config of Element Call (fallback/legacy configuration) or be configured by your homeserver via the `.well-known`.
This is the recommended method.

The configuration is a list of Foci configs:

```json
"org.matrix.msc4143.rtc_foci": [
    {
        "type": "livekit",
        "livekit_service_url": "https://someurl.com"
    },
     {
        "type": "livekit",
        "livekit_service_url": "https://livekit2.com"
    },
    {
        "type": "another_foci",
        "props_for_another_foci": "val"
    },
]
```

## Translation

If you'd like to help translate Element Call, head over to [Localazy](https://localazy.com/p/element-call). You're also encouraged to join the [Element Translators](https://matrix.to/#/#translators:element.io) space to discuss and coordinate translation efforts.

## Development

### Frontend

Element Call is built against [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk/pull/2553). To get started, clone, install, and link the package:

```
git clone https://github.com/matrix-org/matrix-js-sdk.git
cd matrix-js-sdk
yarn
yarn link
```

Next, we can set up this project:

```
git clone https://github.com/element-hq/element-call.git
cd element-call
yarn
yarn link matrix-js-sdk
```

You're now ready to launch the development server:

```
yarn dev
```

### Backend

A docker compose file is provided to start a LiveKit server and auth
service for development. These use a test 'secret' published in this
repository, so this must be used only for local development and
**_never be exposed to the public Internet._**

To use it, add a SFU parameter in your local config `./public/config.json`:
(Be aware, that this is only the fallback Livekit SFU. If the homeserver
advertises one in the client well-known, this will not be used.)

```json
"livekit": {
  "livekit_service_url": "http://localhost:7881"
},
```

Run backend components:

```
yarn backend
```

### Add a new translation key

To add a new translation key you can do these steps:

1. Add the new key entry to the code where the new key is used: `t("some_new_key")`
1. Run `yarn i18n` to extract the new key and update the translation files. This will add a skeleton entry to the `public/locales/en-GB/app.json` file:
   ```jsonc
   {
       ...
       "some_new_key": "",
       ...
   }
   ```
1. Update the skeleton entry in the `public/locales/en-GB/app.json` file with the English translation:
   ```jsonc
   {
       ...
       "some_new_key": "Some new key",
       ...
   }
   ```

## Documentation

Usage and other technical details about the project can be found here:

[**Docs**](./docs/README.md)
