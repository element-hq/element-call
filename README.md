# Matrix Video Chat

Testbed for full mesh video chat.

## Getting Started

You must first run a local Synapse server on port 8008

Then install the dependencies:

```
cd matrix-video-chat
npm install
```

Locally checkout the [robertlong/full-mesh-voip](https://github.com/matrix-org/matrix-js-sdk/tree/robertlong/full-mesh-voip) branch of the matrix-js-sdk.

```
cd matrix-js-sdk
git checkout robertlong/full-mesh-voip
yarn
yarn build
npm link
```

Link the matrix-js-sdk into the matrix-video-chat project:

```
cd matrix-video-chat
npm link matrix-js-sdk
```

Finally run the development server

```
npm run dev
```