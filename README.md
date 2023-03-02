# Element Call

[![Chat](https://img.shields.io/matrix/webrtc:matrix.org)](https://matrix.to/#/#webrtc:matrix.org)
[![Translate](https://translate.element.io/widgets/element-call/-/element-call/svg-badge.svg)](https://translate.element.io/engage/element-call/)

Full mesh group calls powered by [Matrix](https://matrix.org), implementing [MatrixRTC](https://github.com/matrix-org/matrix-spec-proposals/blob/matthew/group-voip/proposals/3401-group-voip.md).

![A demo of Element Call with six people](demo.jpg)

To try it out, visit our hosted version at [call.element.io](https://call.element.io). You can also find the latest development version continuously deployed to [element-call.netlify.app](https://element-call.netlify.app).

## Host it yourself

Until prebuilt tarballs are available, you'll need to build Element Call from source. First, clone and install the package:

```
git clone https://github.com/vector-im/element-call.git
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

### Features

#### Allow to join group calls without camera and audio device

You can allow to join a group call without video and audio by setup this feature in your `config.json`:

```json
{
  ...

  "features": {
    "feature_group_calls_without_video_and_audio": true
  }
}
```

## Development

Element Call is built against [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk/pull/2553). To get started, clone, install, and link the package:

```
git clone https://github.com/matrix-org/matrix-js-sdk.git
cd matrix-js-sdk
yarn
yarn link
```

Next, we can set up this project:

```
git clone https://github.com/vector-im/element-call.git
cd element-call
yarn
yarn link matrix-js-sdk
```

You're now ready to launch the development server:

```
yarn dev
```

## Configuration

There are currently two different config files. `.env` holds variables that are used at build time, while `public/config.json` holds variables that are used at runtime. Documentation and default values for `public/config.json` can be found in [ConfigOptions.ts](src/config/ConfigOptions.ts).

## Translation

If you'd like to help translate Element Call, head over to [translate.element.io](https://translate.element.io/engage/element-call/). You're also encouraged to join the [Element Translators](https://matrix.to/#/#translators:element.io) space to discuss and coordinate translation efforts.
