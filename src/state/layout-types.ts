/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BehaviorSubject } from "rxjs";

import { type LocalUserMediaViewModel } from "./media/LocalUserMediaViewModel.ts";
import { type MediaViewModel } from "./media/MediaViewModel.ts";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel.ts";
import { type UserMediaViewModel } from "./media/UserMediaViewModel.ts";
import {
  type GridTileViewModel,
  type SpotlightTileViewModel,
} from "./TileViewModel.ts";
import { type Behavior } from "./Behavior.ts";

export interface GridLayoutMedia {
  type: "grid";
  edgeToEdge: false;
  spotlight?: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightLandscapeLayoutMedia {
  type: "spotlight-landscape";
  edgeToEdge: boolean;
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightPortraitLayoutMedia {
  type: "spotlight-portrait";
  edgeToEdge: false;
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightExpandedLayoutMedia {
  type: "spotlight-expanded";
  edgeToEdge: boolean;
  spotlight: MediaViewModel[];
  pip?: UserMediaViewModel;
}

export interface OneOnOneLandscapeLayoutMedia {
  type: "one-on-one-landscape";
  edgeToEdge: false;
  spotlight: UserMediaViewModel;
  pip: LocalUserMediaViewModel | RingingMediaViewModel;
}

export interface OneOnOnePortraitLayoutMedia {
  type: "one-on-one-portrait";
  edgeToEdge: true;
  spotlight: UserMediaViewModel | RingingMediaViewModel;
  pip?: LocalUserMediaViewModel;
}

export interface PipLayoutMedia {
  type: "pip";
  edgeToEdge: boolean;
  spotlight: MediaViewModel[];
}

export type LayoutMedia =
  | GridLayoutMedia
  | SpotlightLandscapeLayoutMedia
  | SpotlightPortraitLayoutMedia
  | SpotlightExpandedLayoutMedia
  | OneOnOneLandscapeLayoutMedia
  | OneOnOnePortraitLayoutMedia
  | PipLayoutMedia;

export interface Alignment {
  inline: "start" | "end";
  block: "start" | "end";
}

export interface GridLayout {
  type: "grid";
  spotlight?: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  spotlightAlignment$: BehaviorSubject<Alignment>;
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightLandscapeLayout {
  type: "spotlight-landscape";
  spotlight: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightPortraitLayout {
  type: "spotlight-portrait";
  spotlight: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightExpandedLayout {
  type: "spotlight-expanded";
  spotlight: SpotlightTileViewModel;
  pip?: GridTileViewModel;
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface OneOnOneLandscapeLayout {
  type: "one-on-one-landscape";
  spotlight: GridTileViewModel;
  pip: GridTileViewModel;
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface OneOnOnePortraitLayout {
  type: "one-on-one-portrait";
  spotlight: SpotlightTileViewModel;
  pip?: GridTileViewModel;
  pipSize$: Behavior<"sm" | "lg">;
  pipAlignment$: BehaviorSubject<Alignment>;
}

export interface PipLayout {
  type: "pip";
  spotlight: SpotlightTileViewModel;
}

/**
 * A layout defining the media tiles present on screen and their visual
 * arrangement.
 */
export type Layout =
  | GridLayout
  | SpotlightLandscapeLayout
  | SpotlightPortraitLayout
  | SpotlightExpandedLayout
  | OneOnOneLandscapeLayout
  | OneOnOnePortraitLayout
  | PipLayout;
