/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import { MediaViewModel, UserMediaViewModel } from "./MediaViewModel";
import { GridTileViewModel, SpotlightTileViewModel } from "./TileViewModel";
import { fillGaps } from "../utils/iter";

class SpotlightTileData {
  private readonly media_: BehaviorSubject<MediaViewModel[]>;
  public get media(): MediaViewModel[] {
    return this.media_.value;
  }
  public set media(value: MediaViewModel[]) {
    this.media_.next(value);
  }

  private readonly maximised_: BehaviorSubject<boolean>;
  public get maximised(): boolean {
    return this.maximised_.value;
  }
  public set maximised(value: boolean) {
    this.maximised_.next(value);
  }

  public readonly vm: SpotlightTileViewModel;

  public constructor(media: MediaViewModel[], maximised: boolean) {
    this.media_ = new BehaviorSubject(media);
    this.maximised_ = new BehaviorSubject(maximised);
    this.vm = new SpotlightTileViewModel(this.media_, this.maximised_);
  }

  public destroy(): void {
    this.vm.destroy();
  }
}

class GridTileData {
  private readonly media_: BehaviorSubject<UserMediaViewModel>;
  public get media(): UserMediaViewModel {
    return this.media_.value;
  }
  public set media(value: UserMediaViewModel) {
    this.media_.next(value);
  }

  public readonly vm: GridTileViewModel;

  public constructor(media: UserMediaViewModel) {
    this.media_ = new BehaviorSubject(media);
    this.vm = new GridTileViewModel(this.media_);
  }

  public destroy(): void {
    this.vm.destroy();
  }
}

/**
 * A collection of tiles to be mapped to a layout.
 */
export class TileStore {
  private constructor(
    private readonly spotlight: SpotlightTileData | null,
    private readonly grid: GridTileData[],
  ) {}

  public readonly spotlightTile = this.spotlight?.vm;
  public readonly gridTiles = this.grid.map(({ vm }) => vm);
  public readonly gridTilesByMedia = new Map(
    this.grid.map(({ vm, media }) => [media, vm]),
  );

  /**
   * Creates an an empty collection of tiles.
   */
  public static empty(): TileStore {
    return new TileStore(null, []);
  }

  /**
   * Creates a builder which can be used to update the collection, passing
   * ownership of the tiles to the updated collection.
   */
  public from(visibleTiles: Set<GridTileViewModel>): TileStoreBuilder {
    return new TileStoreBuilder(
      this.spotlight,
      this.grid,
      (spotlight, grid) => new TileStore(spotlight, grid),
      visibleTiles,
    );
  }
}

/**
 * A builder for a new collection of tiles. Will reuse tiles and destroy unused
 * tiles from a previous collection where appropriate.
 */
export class TileStoreBuilder {
  private spotlight: SpotlightTileData | null = null;
  private readonly prevSpotlightSpeaker =
    this.prevSpotlight?.media.length === 1 &&
    "speaking" in this.prevSpotlight.media[0] &&
    this.prevSpotlight.media[0];

  private readonly prevGridByMedia = new Map(
    this.prevGrid.map((entry, i) => [entry.media, [entry, i]] as const),
  );

  // The total number of grid entries that we have so far
  private numGridEntries = 0;
  // A sparse array of grid entries which should be kept in the same spots as
  // which they appeared in the previous grid
  private readonly stationaryGridEntries: GridTileData[] = new Array(
    this.prevGrid.length,
  );
  // Grid entries which should now enter the visible section of the grid
  private readonly visibleGridEntries: GridTileData[] = [];
  // Grid entries which should now enter the invisible section of the grid
  private readonly invisibleGridEntries: GridTileData[] = [];

  public constructor(
    private readonly prevSpotlight: SpotlightTileData | null,
    private readonly prevGrid: GridTileData[],
    private readonly construct: (
      spotlight: SpotlightTileData | null,
      grid: GridTileData[],
    ) => TileStore,
    private readonly visibleTiles: Set<GridTileViewModel>,
  ) {}

  /**
   * Sets the contents of the spotlight tile. If this is never called, there
   * will be no spotlight tile.
   */
  public registerSpotlight(media: MediaViewModel[], maximised: boolean): void {
    if (this.spotlight !== null) throw new Error("Spotlight already set");
    if (this.numGridEntries > 0)
      throw new Error("Spotlight must be registered before grid tiles");

    // Reuse the previous spotlight tile if it exists
    if (this.prevSpotlight === null) {
      this.spotlight = new SpotlightTileData(media, maximised);
    } else {
      this.spotlight = this.prevSpotlight;
      this.spotlight.media = media;
      this.spotlight.maximised = maximised;
    }
  }

  /**
   * Sets up a grid tile for the given media. If this is never called for some
   * media, then that media will have no grid tile.
   */
  public registerGridTile(media: UserMediaViewModel): void {
    if (this.spotlight !== null) {
      // We actually *don't* want spotlight speakers to appear in both the
      // spotlight and the grid, so they're filtered out here
      if (!media.local && this.spotlight.media.includes(media)) return;
      // When the spotlight speaker changes, we would see one grid tile appear
      // and another grid tile disappear. This would be an undesirable layout
      // shift, so instead what we do is take the speaker's grid tile and swap
      // the media out, so it can remain where it is in the layout.
      if (
        media === this.prevSpotlightSpeaker &&
        this.spotlight.media.length === 1 &&
        "speaking" in this.spotlight.media[0] &&
        this.prevSpotlightSpeaker !== this.spotlight.media[0]
      ) {
        const prev = this.prevGridByMedia.get(this.spotlight.media[0]);
        if (prev !== undefined) {
          const [entry] = prev;
          // Do the media swap
          entry.media = media;
          this.prevGridByMedia.delete(this.spotlight.media[0]);
          this.prevGridByMedia.set(media, prev);
        }
      }
    }

    // Was there previously a tile with this same media?
    const prev = this.prevGridByMedia.get(media);
    if (prev === undefined) {
      // Create a new tile
      (this.visibleTiles.has(this.prevGrid[this.numGridEntries]?.vm)
        ? this.visibleGridEntries
        : this.invisibleGridEntries
      ).push(new GridTileData(media));
    } else {
      // Reuse the existing tile
      const [entry, prevIndex] = prev;
      const previouslyVisible = this.visibleTiles.has(entry.vm);
      const nowVisible = this.visibleTiles.has(
        this.prevGrid[this.numGridEntries]?.vm,
      );
      // If it doesn't need to move between the visible/invisible sections of
      // the grid, then we can keep it exactly where it was previously
      if (previouslyVisible === nowVisible)
        this.stationaryGridEntries[prevIndex] = entry;
      // Otherwise, queue this tile to be moved
      else
        (nowVisible ? this.visibleGridEntries : this.invisibleGridEntries).push(
          entry,
        );
    }

    this.numGridEntries++;
  }

  /**
   * Constructs a new collection of all registered tiles, transferring ownership
   * of the tiles to the new collection. Any tiles present in the previous
   * collection but not the new collection will be destroyed.
   */
  public build(): TileStore {
    // Piece together the grid
    const grid = [
      ...fillGaps(this.stationaryGridEntries, [
        ...this.visibleGridEntries,
        ...this.invisibleGridEntries,
      ]),
    ];

    // Destroy unused tiles
    if (this.spotlight === null && this.prevSpotlight !== null)
      this.prevSpotlight.destroy();
    const gridEntries = new Set(grid);
    for (const entry of this.prevGrid)
      if (!gridEntries.has(entry)) entry.destroy();

    return this.construct(this.spotlight, grid);
  }
}
