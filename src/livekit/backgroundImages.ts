/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

/**
 * The most backgrounds of their own a device keeps.
 *
 * Five, because it fills the grid. With no effect, blur and the two shipped
 * images that makes nine tiles at the limit, where the add tile goes; and one
 * short of it, four and the add tile make nine too. At four the grid stopped
 * at eight and left its last corner empty.
 */
export const maxAddedBackgrounds = 5;

/**
 * The longest edge an added background is kept at.
 *
 * Not a display constraint: the pipeline crops and scales the image to the
 * camera on every use, so a larger one buys nothing. It is what stops a
 * forty-megapixel photograph sitting in storage and being decoded on every
 * call.
 */
export const maxStoredEdge = 1920;

/** A background the user added, as it is kept on the device. */
export interface AddedBackground {
  id: string;
  image: Blob;
  addedAt: number;
}

/** Why a file cannot be used as a background. */
export type UnusableReason = "not-an-image" | "animated" | "undecodable";

export class UnusableImage extends Error {
  public constructor(public readonly reason: UnusableReason) {
    super(reason);
    this.name = "UnusableImage";
  }
}

/**
 * Whether the file holds more than one frame.
 *
 * Read from the file rather than guessed from its type: an animated WebP and a
 * still one are both `image/webp`, and a `.png` may be an APNG. Where the
 * browser cannot tell us, the types that are usually animated are refused
 * rather than accepted and left to move behind someone's head.
 */
async function isAnimated(file: Blob): Promise<boolean> {
  const decoder = (
    globalThis as { ImageDecoder?: new (init: unknown) => unknown }
  ).ImageDecoder;
  if (!decoder) return /gif|apng/.test(file.type);
  try {
    const d = new decoder({ data: await file.arrayBuffer(), type: file.type });
    await (d as { completed: Promise<void> }).completed;
    const track = (d as { tracks: { selectedTrack?: { frameCount: number } } })
      .tracks.selectedTrack;
    return (track?.frameCount ?? 1) > 1;
  } catch (e) {
    logger.debug("Could not read frame count, judging by type", e);
    return /gif|apng/.test(file.type);
  }
}

/**
 * Prepares a file to be kept as a background: refuses what cannot be used, and
 * reduces what is larger than we keep.
 *
 * Does not crop. The pipeline covers the camera's frame with whatever it is
 * given, recomputed as the frame changes, so cropping here would bake in one
 * shape and lose the rest of the picture for good.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new UnusableImage("not-an-image");
  if (await isAnimated(file)) throw new UnusableImage("animated");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    logger.debug("Could not decode the chosen file", e);
    throw new UnusableImage("undecodable");
  }

  try {
    // Every picture goes through the canvas, not only the oversized ones: a
    // background covers what is behind it, so it has to be opaque, and a
    // picture with transparency in it — a logo, a screenshot with rounded
    // corners — would otherwise be stored with its holes and drawn with them.
    // Passing small files straight through is what kept them.
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxStoredEdge / longest);
    const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
    const context = canvas.getContext("2d");
    if (!context) throw new UnusableImage("undecodable");
    // The ground the picture is laid on, so nothing it does not cover is a
    // hole. Black rather than white: an unfilled corner reads as the frame's
    // own edge rather than as a lamp.
    context.fillStyle = "black";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
  } finally {
    bitmap.close();
  }
}

const DB_NAME = "element-call-background-images";
const STORE = "backgrounds";

/**
 * The backgrounds a user added, kept on this device.
 *
 * They never leave it: there is no upload here and no identifier that would
 * let anything fetch one.
 */
export class BackgroundImageStore {
  private db?: Promise<IDBDatabase>;

  /** The factory is injected so a test can hand over its own. */
  public constructor(
    private readonly indexedDB: IDBFactory = globalThis.indexedDB,
  ) {}

  private async open(): Promise<IDBDatabase> {
    return (this.db ??= new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (): void => {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    }));
  }

  private async run<T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = body(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
  }

  public async list(): Promise<AddedBackground[]> {
    const all = await this.run<AddedBackground[]>("readonly", (s) =>
      s.getAll(),
    );
    return all.sort((a, b) => a.addedAt - b.addedAt);
  }

  /**
   * Keeps a file as a background, and answers with it.
   *
   * Throws {@link UnusableImage} for a file that cannot be used, and
   * {@link RangeError} once the device is already keeping as many as it will.
   */
  public async add(file: Blob): Promise<AddedBackground> {
    const image = await prepareImage(file);
    if ((await this.list()).length >= maxAddedBackgrounds)
      throw new RangeError("Already keeping the most backgrounds we keep");
    const background: AddedBackground = {
      id: crypto.randomUUID(),
      image,
      addedAt: Date.now(),
    };
    await this.run("readwrite", (s) => s.add(background));
    return background;
  }

  public async remove(id: string): Promise<void> {
    await this.run("readwrite", (s) => s.delete(id));
  }
}
