/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../state/Behavior";

export const maxAddedBackgrounds = 5;

/** The longest edge kept; the pipeline scales every image to the camera. */
export const maxStoredEdge = 1920;

/** Why a file can't be used as a background. */
export type UnusableReason = "not-an-image" | "animated" | "undecodable";

export class UnusableImage extends Error {
  public constructor(public readonly reason: UnusableReason) {
    super(reason);
    this.name = "UnusableImage";
  }
}

/** A background the user added, as the menu and the pipeline use it. */
export interface AddedBackground {
  id: string;
  url: string;
}

/** A background the user added, as it is kept on the device. */
export interface KeptImage {
  id: string;
  image: Blob;
  addedAt: number;
}

/** Where added backgrounds are kept. */
export interface BackgroundImageStorage {
  list(): Promise<KeptImage[]>;
  put(image: KeptImage): Promise<void>;
  delete(id: string): Promise<void>;
}

/** The backgrounds this device keeps, which never leave it. */
export class AddedBackgrounds {
  private readonly subject$ = new BehaviorSubject<
    AddedBackground[] | undefined
  >(undefined);
  /** Undefined until what the device keeps has been read. */
  public readonly added$: Behavior<AddedBackground[] | undefined> =
    this.subject$;

  public constructor(
    private readonly storage: BackgroundImageStorage | null,
    private readonly prepare: (file: Blob) => Promise<Blob> = prepareImage,
  ) {
    this.read().catch((e) => {
      logger.warn("Could not read added backgrounds", e);
      this.subject$.next([]);
    });
  }

  private async read(): Promise<void> {
    const kept = (await this.storage?.list()) ?? [];
    kept.sort((a, b) => a.addedAt - b.addedAt);
    this.subject$.next(
      kept.map(({ id, image }) => ({ id, url: URL.createObjectURL(image) })),
    );
  }

  /**
   * Keeps a file as a background, and answers with its id. Throws
   * {@link UnusableImage} for a file that can't be used, and a RangeError
   * once maxAddedBackgrounds are kept.
   */
  public async add(file: Blob): Promise<string> {
    if (this.storage === null)
      throw new Error("This browser keeps no backgrounds");
    const image = await this.prepare(file);
    if ((await this.storage.list()).length >= maxAddedBackgrounds)
      throw new RangeError(
        `${maxAddedBackgrounds} backgrounds are kept already`,
      );
    const kept: KeptImage = {
      id: crypto.randomUUID(),
      image,
      addedAt: Date.now(),
    };
    await this.storage.put(kept);
    this.subject$.next([
      ...(this.subject$.value ?? []),
      { id: kept.id, url: URL.createObjectURL(image) },
    ]);
    return kept.id;
  }

  public async remove(id: string): Promise<void> {
    await this.storage?.delete(id);
    const current = this.subject$.value ?? [];
    const gone = current.find((a) => a.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    this.subject$.next(current.filter((a) => a.id !== id));
  }
}

/**
 * Refuses what can't be used, reduces what is larger than is kept, and lays
 * every image on an opaque ground: a background has to cover what is behind
 * it, so a transparent pixel would be a hole in it.
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
    const scale = Math.min(
      1,
      maxStoredEdge / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
    const context = canvas.getContext("2d");
    if (!context) throw new UnusableImage("undecodable");
    context.fillStyle = "black";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
  } finally {
    bitmap.close();
  }
}

// Read from the file, not its type: a still and an animated WebP share one.
async function isAnimated(file: Blob): Promise<boolean> {
  if (typeof ImageDecoder === "undefined") return /gif|apng/.test(file.type);
  try {
    const decoder = new ImageDecoder({
      data: await file.arrayBuffer(),
      type: file.type,
    });
    // Some browsers have no selected track until the tracks are ready.
    await decoder.tracks.ready;
    await decoder.completed;
    return (decoder.tracks.selectedTrack?.frameCount ?? 1) > 1;
  } catch (e) {
    logger.debug("Could not read the frame count, judging by type", e);
    return /gif|apng/.test(file.type);
  }
}

const DB_NAME = "element-call-background-images";
const STORE = "backgrounds";

export class IndexedDBImageStorage implements BackgroundImageStorage {
  private db?: Promise<IDBDatabase>;

  public constructor(private readonly indexedDB: IDBFactory) {}

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

  public async list(): Promise<KeptImage[]> {
    return this.run<KeptImage[]>("readonly", (s) => s.getAll());
  }

  public async put(image: KeptImage): Promise<void> {
    await this.run("readwrite", (s) => s.put(image));
  }

  public async delete(id: string): Promise<void> {
    await this.run("readwrite", (s) => s.delete(id));
  }
}

function openStorage(): BackgroundImageStorage | null {
  // Merely reading indexedDB throws where it is disabled.
  try {
    return globalThis.indexedDB
      ? new IndexedDBImageStorage(globalThis.indexedDB)
      : null;
  } catch (e) {
    logger.warn("Could not reach IndexedDB", e);
    return null;
  }
}

export const addedBackgrounds = new AddedBackgrounds(openStorage());
