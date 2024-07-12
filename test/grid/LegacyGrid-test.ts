/*
Copyright 2023-2024 New Vector Ltd

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

import { TileDescriptor } from "../../src/state/CallViewModel";
import { Tile, reorderTiles } from "../../src/grid/LegacyGrid";

const alice: Tile<unknown> = {
  key: "alice",
  order: 0,
  item: { local: false } as unknown as TileDescriptor<unknown>,
  remove: false,
  focused: false,
  isPresenter: false,
  isSpeaker: false,
  hasVideo: true,
};
const bob: Tile<unknown> = {
  key: "bob",
  order: 1,
  item: { local: false } as unknown as TileDescriptor<unknown>,
  remove: false,
  focused: false,
  isPresenter: false,
  isSpeaker: false,
  hasVideo: false,
};

test("reorderTiles does not promote a non-speaker", () => {
  const tiles = [{ ...alice }, { ...bob }];
  reorderTiles(tiles, "spotlight", 1);
  expect(tiles).toEqual([
    expect.objectContaining({ key: "alice", order: 0 }),
    expect.objectContaining({ key: "bob", order: 1 }),
  ]);
});

test("reorderTiles promotes a speaker into the visible area", () => {
  const tiles = [{ ...alice }, { ...bob, isSpeaker: true }];
  reorderTiles(tiles, "spotlight", 1);
  expect(tiles).toEqual([
    expect.objectContaining({ key: "alice", order: 1 }),
    expect.objectContaining({ key: "bob", order: 0 }),
  ]);
});

test("reorderTiles keeps a promoted speaker in the visible area", () => {
  const tiles = [
    { ...alice, order: 1 },
    { ...bob, isSpeaker: true, order: 0 },
  ];
  reorderTiles(tiles, "spotlight", 1);
  expect(tiles).toEqual([
    expect.objectContaining({ key: "alice", order: 1 }),
    expect.objectContaining({ key: "bob", order: 0 }),
  ]);
});
