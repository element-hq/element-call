# Element Call

Showcase for full mesh video chat powered by Matrix, implementing [MSC3401](https://github.com/matrix-org/matrix-spec-proposals/blob/matthew/group-voip/proposals/3401-group-voip.md).

Discussion in [#webrtc:matrix.org: ![#webrtc:matrix.org](https://img.shields.io/matrix/webrtc:matrix.org)](https://matrix.to/#/#webrtc:matrix.org)

## Getting Started

`element-call` is built against the `robertlong/group-call` branch of [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk/pull/1902). Because of how this package is configured and Vite's requirements, you will need to clone it locally and use `yarn link` to stich things together.

First clone, install, and link `matrix-js-sdk`

```
git clone https://github.com/matrix-org/matrix-js-sdk.git
cd matrix-js-sdk
git checkout robertlong/group-call
yarn
yarn link
```

Next you'll also need [Synapse](https://matrix-org.github.io/synapse/latest/setup/installation.html) installed locally and running on port 8008.

Finally we can set up this project.

```
git clone https://github.com/vector-im/element-call.git
cd element-call
yarn
yarn link matrix-js-sdk
cp .env.example .env
yarn dev
```

## Config

Configuration options are documented in the `.env` file.

## License

All files in this project are:

Copyright 2021-2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
