# Element Call

Showcase for full mesh video chat powered by Matrix, implementing [MSC3401](https://github.com/matrix-org/matrix-spec-proposals/blob/matthew/group-voip/proposals/3401-group-voip.md).

## Getting Started

`element-call` is built against the `robertlong/group-call` branch of both [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk/pull/1902) and [matrix-react-sdk](https://github.com/matrix-org/matrix-react-sdk/pull/6848). Because of how these packages are configured and Vite's requirements, you will need to clone them locally and use `yarn link` to stich things together.

First clone, install, and link `matrix-js-sdk`

```
git clone https://github.com/matrix-org/matrix-js-sdk.git
cd matrix-js-sdk
git checkout robertlong/group-call
yarn
yarn link
```

Then clone, install, link `matrix-js-sdk` into `matrix-react-sdk`, and link `matrix-react-sdk`

```
git clone https://github.com/matrix-org/matrix-react-sdk.git
cd matrix-react-sdk
git checkout robertlong/group-call
yarn
yarn link matrix-js-sdk
yarn link
```

Next you'll also need [Synapse](https://matrix-org.github.io/synapse/latest/setup/installation.html) installed locally and running on port 8008.

Finally we can set up this project.

```
git clone https://github.com/vector-im/element-call.git
cd element-call
yarn
yarn link matrix-js-sdk
yarn link matrix-react-sdk
yarn dev
```

## Config

Configuration options are documented in the `.env` file.
