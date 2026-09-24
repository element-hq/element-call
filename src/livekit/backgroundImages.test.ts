/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  AddedBackgrounds,
  type BackgroundImageStorage,
  IndexedDBImageStorage,
  type KeptImage,
} from "./backgroundImages";
import { flushPromises } from "../utils/test";

describe("AddedBackgrounds", () => {
  beforeEach(() => {
    let n = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++n}`);
  });

  it("offers what the device keeps, oldest first", async () => {
    const image = new Blob(["x"], { type: "image/png" });
    const store = new AddedBackgrounds(
      memoryStorage([
        { id: "later", image, addedAt: 2 },
        { id: "earlier", image, addedAt: 1 },
      ]),
    );
    expect(store.added$.value).toBeUndefined();
    await flushPromises();
    expect(store.added$.value?.map(({ id }) => id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("keeps an added image and offers it after the others", async () => {
    const storage = memoryStorage();
    const store = new AddedBackgrounds(storage);
    await flushPromises();
    const id = await store.add(new Blob(["x"], { type: "image/png" }));
    expect(store.added$.value?.map((a) => a.id)).toEqual([id]);
    expect((await storage.list()).map((k) => k.id)).toEqual([id]);
  });

  it("offers nothing where the browser keeps nothing", async () => {
    const store = new AddedBackgrounds(null);
    await flushPromises();
    expect(store.added$.value).toEqual([]);
    await expect(store.add(new Blob(["x"]))).rejects.toThrow();
  });

  it("offers none, rather than waiting, where the device can't be read", async () => {
    const unreadable: BackgroundImageStorage = {
      ...memoryStorage(),
      list: async () => Promise.reject(new Error("storage cleared")),
    };
    const store = new AddedBackgrounds(unreadable);
    await flushPromises();
    expect(store.added$.value).toEqual([]);
  });
});

describe("IndexedDBImageStorage", () => {
  it("keeps images across sessions", async () => {
    const indexedDB = new IDBFactory();
    const image = new Blob(["x"], { type: "image/webp" });
    const first = new IndexedDBImageStorage(indexedDB);
    await first.put({ id: "a", image, addedAt: 1 });
    await first.put({ id: "b", image, addedAt: 2 });

    // A session of its own, as after a reload.
    const second = new IndexedDBImageStorage(indexedDB);
    expect(
      (await second.list()).map(({ id, addedAt }) => [id, addedAt]),
    ).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

function memoryStorage(kept: KeptImage[] = []): BackgroundImageStorage {
  return {
    list: async (): Promise<KeptImage[]> => Promise.resolve([...kept]),
    put: async (image): Promise<void> => {
      kept.push(image);
      return Promise.resolve();
    },
  };
}
