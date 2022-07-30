import { IndexedDBStoreWorker } from "matrix-js-sdk/src/indexeddb-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const remoteWorker = new IndexedDBStoreWorker((self as any).postMessage);

self.onmessage = remoteWorker.onMessage;
