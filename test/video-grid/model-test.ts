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

import {
  addItems,
  column,
  cycleTileSize,
  fillGaps,
  forEachCellInArea,
  Grid,
  resize,
  row,
  tryMoveTile,
} from "../../src/video-grid/model";
import { TileDescriptor } from "../../src/video-grid/TileDescriptor";

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
        item: { id: area } as unknown as TileDescriptor,
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
  g.cells.forEach((c, i) => {
    if (i > 0 && i % g.columns == 0) result += "\n";
    result += c?.item.id ?? " ";
  });
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
`
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
ef`
);

testFillGaps(
  "fills a gap",
  `
a b
cde
f`,
  `
cab
fde`
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
monjk`
);

testFillGaps(
  "fills a big gap",
  `
abcd
e  f
g  h
ijkl`,
  `
abcd
elhf
gkji`
);

testFillGaps(
  "only moves 1×1 tiles",
  `
  
aa
bc`,
  `
bc
aa`
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
kghi`
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
iegh`
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
iief`
);

testFillGaps(
  "pushes a chain of large tiles upwards",
  `
abcd
e fg
hh  
hh  
 ii 
 ii`,
  `
hhcd
hhfg
aiib
eii`
);

testFillGaps(
  "gives up on pushing large tiles upwards when not possible",
  `
aabb
aabb
cc  
cc`,
  `
aabb
aabb
cc  
cc`
);

function testCycleTileSize(
  title: string,
  tileId: string,
  input: string,
  output: string
): void {
  test(`cycleTileSize ${title}`, () => {
    expect(showGrid(cycleTileSize(tileId, mkGrid(input)))).toBe(output);
  });
}

testCycleTileSize(
  "does nothing if the tile is not present",
  "z",
  `
abcd
efgh`,
  `
abcd
efgh`
);

testCycleTileSize(
  "expands a tile to 2×2 in a 3 column layout",
  "c",
  `
abc
def
ghi`,
  `
acc
bcc
def
ghi`
);

testCycleTileSize(
  "expands a tile to 3×3 in a 4 column layout",
  "g",
  `
abcd
efgh`,
  `
abcd
eggg
fggg
h`
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
akbc
djhe
fig`
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
cci
cch
klm`
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
ddf`
);

function testAddItems(
  title: string,
  items: TileDescriptor[],
  input: string,
  output: string
): void {
  test(`addItems ${title}`, () => {
    expect(showGrid(addItems(items, mkGrid(input)))).toBe(output);
  });
}

testAddItems(
  "appends 1×1 tiles",
  ["e", "f"].map((i) => ({ id: i } as unknown as TileDescriptor)),
  `
aab
aac
d`,
  `
aab
aac
def`
);

testAddItems(
  "places one tile near another on request",
  [{ id: "g", placeNear: "b" } as unknown as TileDescriptor],
  `
abc
def`,
  `
abc
gfe
d`
);

testAddItems(
  "places items with a large base size",
  [{ id: "g", largeBaseSize: true } as unknown as TileDescriptor],
  `
abc
def`,
  `
abc
ggf
gge
d`
);

function testTryMoveTile(
  title: string,
  from: number,
  to: number,
  input: string,
  output: string
): void {
  test(`tryMoveTile ${title}`, () => {
    expect(showGrid(tryMoveTile(mkGrid(input), from, to))).toBe(output);
  });
}

testTryMoveTile(
  "refuses to move a tile too far to the left",
  1,
  -1,
  `
abc`,
  `
abc`
);

testTryMoveTile(
  "refuses to move a tile too far to the right",
  1,
  3,
  `
abc`,
  `
abc`
);

testTryMoveTile(
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
d e`
);

testTryMoveTile(
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
cce`
);

function testResize(
  title: string,
  columns: number,
  input: string,
  output: string
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
ch
dd
dd
eg`
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
bbbc
bbbf
addd
hddd
ge`
);
