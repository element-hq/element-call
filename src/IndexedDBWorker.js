import { IndexedDBStoreWorker } from "matrix-js-sdk/src/indexeddb-worker";

const remoteWorker = new IndexedDBStoreWorker(self.postMessage);

self.onmessage = remoteWorker.onMessage;
