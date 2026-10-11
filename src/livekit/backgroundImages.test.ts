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
  maxAddedBackgrounds,
  prepareImage,
  UnusableImage,
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
      asGiven,
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
    const store = new AddedBackgrounds(storage, asGiven);
    await flushPromises();
    const id = await store.add(new Blob(["x"], { type: "image/png" }));
    expect(store.added$.value?.map((a) => a.id)).toEqual([id]);
    expect((await storage.list()).map((k) => k.id)).toEqual([id]);
  });

  it("keeps the prepared image, not the file", async () => {
    const storage = memoryStorage();
    const prepared = new Blob(["y"], { type: "image/webp" });
    const store = new AddedBackgrounds(storage, async () =>
      Promise.resolve(prepared),
    );
    await store.add(new Blob(["x"], { type: "image/png" }));
    expect((await storage.list())[0].image).toBe(prepared);
  });

  it("keeps nothing of a file it refuses", async () => {
    const storage = memoryStorage();
    const store = new AddedBackgrounds(storage, async () =>
      Promise.reject(new UnusableImage("animated")),
    );
    await flushPromises();
    await expect(store.add(new Blob(["x"]))).rejects.toThrow(UnusableImage);
    expect(await storage.list()).toEqual([]);
    expect(store.added$.value).toEqual([]);
  });

  it("keeps no more than the grid holds", async () => {
    const storage = memoryStorage();
    const store = new AddedBackgrounds(storage, asGiven);
    for (let i = 0; i < maxAddedBackgrounds; i++)
      await store.add(new Blob([`${i}`]));
    await expect(store.add(new Blob(["more"]))).rejects.toThrow(RangeError);
    expect(await storage.list()).toHaveLength(maxAddedBackgrounds);
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

describe("prepareImage", () => {
  // Refused before anything is decoded, which only a real browser could do.
  it("refuses a file that isn't an image", async () => {
    await expect(
      prepareImage(new Blob(["x"], { type: "text/plain" })),
    ).rejects.toEqual(new UnusableImage("not-an-image"));
  });

  it("refuses an animated type where the browser can't count frames", async () => {
    expect(globalThis.ImageDecoder).toBeUndefined();
    await expect(
      prepareImage(new Blob(["GIF89a"], { type: "image/gif" })),
    ).rejects.toEqual(new UnusableImage("animated"));
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

// Decoding needs a real browser; the end-to-end checks cover it.
const asGiven = async (file: Blob): Promise<Blob> => Promise.resolve(file);

function memoryStorage(kept: KeptImage[] = []): BackgroundImageStorage {
  return {
    list: async (): Promise<KeptImage[]> => Promise.resolve([...kept]),
    put: async (image): Promise<void> => {
      kept.push(image);
      return Promise.resolve();
    },
  };
}
