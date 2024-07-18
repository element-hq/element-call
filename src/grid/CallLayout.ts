/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { BehaviorSubject, Observable } from "rxjs";
import { ComponentType } from "react";

import { MediaViewModel } from "../state/MediaViewModel";
import { LayoutProps } from "./Grid";
import { Alignment } from "../room/InCallView";

export interface Bounds {
  width: number;
  height: number;
}

export interface CallLayoutInputs {
  /**
   * The minimum bounds of the layout area.
   */
  minBounds: Observable<Bounds>;
  /**
   * The alignment of the floating tile, if any.
   */
  floatingAlignment: BehaviorSubject<Alignment>;
}

export interface GridTileModel {
  type: "grid";
  vm: MediaViewModel;
}

export interface SpotlightTileModel {
  type: "spotlight";
  vms: MediaViewModel[];
  maximised: boolean;
}

export type TileModel = GridTileModel | SpotlightTileModel;

export interface CallLayoutOutputs<Model> {
  /**
   * The visually fixed (non-scrolling) layer of the layout.
   */
  fixed: ComponentType<LayoutProps<Model, TileModel, HTMLDivElement>>;
  /**
   * The layer of the layout that can overflow and be scrolled.
   */
  scrolling: ComponentType<LayoutProps<Model, TileModel, HTMLDivElement>>;
}

/**
 * A layout system for media tiles.
 */
export type CallLayout<Model> = (
  inputs: CallLayoutInputs,
) => CallLayoutOutputs<Model>;
