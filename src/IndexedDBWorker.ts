/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { IndexedDBStoreWorker } from "matrix-js-sdk/lib/indexeddb-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const remoteWorker = new IndexedDBStoreWorker((self as any).postMessage);

self.onmessage = remoteWorker.onMessage;
