/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../state/Behavior";

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
}

/** The backgrounds this device keeps, which never leave it. */
export class AddedBackgrounds {
  private readonly subject$ = new BehaviorSubject<
    AddedBackground[] | undefined
  >(undefined);
  /** Undefined until what the device keeps has been read. */
  public readonly added$: Behavior<AddedBackground[] | undefined> =
    this.subject$;

  public constructor(private readonly storage: BackgroundImageStorage | null) {
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

  /** Keeps a file as a background, and answers with its id. */
  public async add(file: Blob): Promise<string> {
    if (this.storage === null)
      throw new Error("This browser keeps no backgrounds");
    const kept: KeptImage = {
      id: crypto.randomUUID(),
      image: file,
      addedAt: Date.now(),
    };
    await this.storage.put(kept);
    this.subject$.next([
      ...(this.subject$.value ?? []),
      { id: kept.id, url: URL.createObjectURL(file) },
    ]);
    return kept.id;
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
