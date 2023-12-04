/*
Copyright 2023 New Vector Ltd

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
import {
  addItems,
  column,
  cycleTileSize,
  fillGaps,
  forEachCellInArea,
  Grid,
  SparseGrid,
  resize,
  row,
  moveTile,
} from "../../src/video-grid/BigGrid";

/**
 * Builds a grid from a string specifying the contents of each cell as a letter.
 */
function mkGrid(spec: string): Grid {
  const secondNewline = spec.indexOf("\n", 1);
  const columns = secondNewline === -1 ? spec.length : secondNewline - 1;
  const cells = spec.match(/[a-z ]/g) ?? ([] as string[]);
  const areas = new Set(cells);
  areas.delete(" "); // Space represents an empty cell, not an area
  const grid: Grid = { columns, cells: new Array(cells.length) };

  for (const area of areas) {
    const start = cells.indexOf(area);
    const end = cells.lastIndexOf(area);
    const rows = row(end, grid) - row(start, grid) + 1;
    const columns = column(end, grid) - column(start, grid) + 1;

    forEachCellInArea(start, end, grid, (_c, i) => {
      grid.cells[i] = {
        item: { id: area } as unknown as TileDescriptor<unknown>,
        origin: i === start,
        rows,
        columns,
      };
    });
  }

  return grid;
}

/**
 * Turns a grid into a string showing the contents of each cell as a letter.
 */
function showGrid(g: Grid): string {
  let result = "\n";
  for (let i = 0; i < g.cells.length; i++) {
    if (i > 0 && i % g.columns == 0) result += "\n";
    result += g.cells[i]?.item.id ?? " ";
  }
  return result;
}

function testFillGaps(title: string, input: string, output: string): void {
  test(`fillGaps ${title}`, () => {
    expect(showGrid(fillGaps(mkGrid(input)))).toBe(output);
  });
}

testFillGaps(
  "does nothing on an empty grid",
  `
`,
  `
`,
);

testFillGaps(
  "does nothing if there are no gaps",
  `
ab
cd
ef`,
  `
ab
cd
ef`,
);

testFillGaps(
  "fills a gap",
  `
a b
cde
f`,
  `
cab
fde`,
);

testFillGaps(
  "fills multiple gaps",
  `
a bc 
defgh
 ijkl
mno`,
  `
aebch
difgl
mjnok`,
);

testFillGaps(
  "fills a big gap with 1×1 tiles",
  `
abcd
e  f
g  h
ijkl`,
  `
abcd
ehkf
glji`,
);

testFillGaps(
  "fills a big gap with a large tile",
  `
  
aa
bc`,
  `
aa
cb`,
);

testFillGaps(
  "prefers moving around large tiles",
  `
a bc
ddde
dddf
ghij
k`,
  `
abce
dddf
dddj
kghi`,
);

testFillGaps(
  "moves through large tiles if necessary",
  `
a bc
dddd
efgh
i`,
  `
afbc
dddd
iegh`,
);

testFillGaps(
  "keeps a large tile from hanging off the bottom",
  `
abcd
efgh
    
ii  
ii`,
  `
abcd
iigh
iief`,
);

testFillGaps(
  "collapses large tiles trapped at the bottom",
  `
abcd
e fg
hh  
hh  
 ii 
 ii`,
  `
abcd
hhfg
hhie`,
);

testFillGaps(
  "gives up on pushing large tiles upwards when not possible",
  `
aa  
aa  
bccd
eccf
ghij`,
  `
aadf
aaji
bcch
eccg`,
);

function testCycleTileSize(
  title: string,
  tileId: string,
  input: string,
  output: string,
): void {
  test(`cycleTileSize ${title}`, () => {
    const grid = mkGrid(input);
    const tile = grid.cells.find((c) => c?.item.id === tileId)!.item;
    expect(showGrid(cycleTileSize(grid, tile))).toBe(output);
  });
}

testCycleTileSize(
  "expands a tile to 2×2 in a 3 column layout",
  "c",
  `
abc
def
ghi`,
  `
acc
dcc
gbe
ifh`,
);

testCycleTileSize(
  "expands a tile to 3×3 in a 4 column layout",
  "g",
  `
abcd
efgh`,
  `
acdh
bggg
fggg
e`,
);

testCycleTileSize(
  "restores a tile to 1×1",
  "b",
  `
abbc
dbbe
fghi
jk`,
  `
abhc
djge
fik`,
);

testCycleTileSize(
  "expands a tile even in a crowded grid",
  "c",
  `
abb
cbb
dde
ddf
ghi
klm`,
  `
abb
gbb
dde
ddf
ccm
cch
lik`,
);

testCycleTileSize(
  "does nothing if the tile has no room to expand",
  "c",
  `
abb
cbb
dde
ddf`,
  `
abb
cbb
dde
ddf`,
);

test("cycleTileSize is its own inverse", () => {
  const input = `
abc
def
ghi
jk`;

  const grid = mkGrid(input);
  let gridAfter = grid;

  const toggle = (tileId: string): void => {
    const tile = grid.cells.find((c) => c?.item.id === tileId)!.item;
    gridAfter = cycleTileSize(gridAfter, tile);
  };

  // Toggle a series of tiles
  toggle("j");
  toggle("h");
  toggle("a");
  // Now do the same thing in reverse
  toggle("a");
  toggle("h");
  toggle("j");

  // The grid should be back to its original state
  expect(showGrid(gridAfter)).toBe(input);
});

function testAddItems(
  title: string,
  items: TileDescriptor<unknown>[],
  input: string,
  output: string,
): void {
  test(`addItems ${title}`, () => {
    expect(showGrid(addItems(items, mkGrid(input) as SparseGrid) as Grid)).toBe(
      output,
    );
  });
}

testAddItems(
  "appends 1×1 tiles",
  ["e", "f"].map((i) => ({ id: i }) as unknown as TileDescriptor<unknown>),
  `
aab
aac
d`,
  `
aab
aac
def`,
);

testAddItems(
  "places one tile near another on request",
  [{ id: "g", placeNear: "b" } as unknown as TileDescriptor<unknown>],
  `
abc
def`,
  `
abc
 g 
def`,
);

testAddItems(
  "places items with a large base size",
  [{ id: "g", largeBaseSize: true } as unknown as TileDescriptor<unknown>],
  `
abc
def`,
  `
abc
ggf
gge
d`,
);

function testMoveTile(
  title: string,
  from: number,
  to: number,
  input: string,
  output: string,
): void {
  test(`moveTile ${title}`, () => {
    expect(showGrid(moveTile(mkGrid(input), from, to))).toBe(output);
  });
}

testMoveTile(
  "refuses to move a tile too far to the left",
  1,
  -1,
  `
abc`,
  `
abc`,
);

testMoveTile(
  "refuses to move a tile too far to the right",
  1,
  3,
  `
abc`,
  `
abc`,
);

testMoveTile(
  "moves a large tile to an unoccupied space",
  3,
  1,
  `
a b
ccd
cce`,
  `
acc
bcc
d e`,
);

testMoveTile(
  "refuses to move a large tile to an occupied space",
  3,
  1,
  `
abb
ccd
cce`,
  `
abb
ccd
cce`,
);

function testResize(
  title: string,
  columns: number,
  input: string,
  output: string,
): void {
  test(`resize ${title}`, () => {
    expect(showGrid(resize(mkGrid(input), columns))).toBe(output);
  });
}

testResize(
  "contracts the grid",
  2,
  `
abbb
cbbb
ddde
dddf
gh`,
  `
af
bb
bb
dd
dd
ch
eg`,
);

testResize(
  "expands the grid",
  4,
  `
af
bb
bb
ch
dd
dd
eg`,
  `
afcd
bbbg
bbbe
h`,
);
