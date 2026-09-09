/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import postcss from "postcss";

import { ROOT_SELECTOR, scopeStylesToRoot } from "./scopeStylesToRoot";

const inRoot = `:where(${ROOT_SELECTOR}, ${ROOT_SELECTOR} *)`;
const isRoot = `:where(${ROOT_SELECTOR})`;

async function scope(css: string, file = "base.css"): Promise<string> {
  const result = await postcss([scopeStylesToRoot()]).process(css, {
    from: file,
  });
  return result.css;
}

describe("scopeStylesToRoot", () => {
  it("makes the root stand in for the document", async () => {
    expect(await scope("html { line-height: 1.15 }")).toBe(
      `${isRoot} { line-height: 1.15 }`,
    );
    expect(await scope("body { margin: 0 }")).toBe(`${isRoot} { margin: 0 }`);
    expect(await scope(":root { --a: 1 }")).toBe(`${isRoot} { --a: 1 }`);
    expect(await scope("body.no-scroll-body { position: fixed }")).toBe(
      `${isRoot}.no-scroll-body { position: fixed }`,
    );
    expect(await scope("body .x { color: red }")).toBe(
      `${isRoot} .x { color: red }`,
    );
  });

  it("collapses selectors that all became the root", async () => {
    expect(await scope("html, body, input { font: inherit }")).toBe(
      `${isRoot},input${inRoot} { font: inherit }`,
    );
  });

  it("confines everything else to the root and what is inside it", async () => {
    expect(await scope("h1 { margin: 0 }")).toBe(`h1${inRoot} { margin: 0 }`);
    expect(await scope(".cpd-theme-dark { --a: 1 }")).toBe(
      `.cpd-theme-dark${inRoot} { --a: 1 }`,
    );
    expect(await scope("* { box-sizing: border-box }")).toBe(
      `*${inRoot} { box-sizing: border-box }`,
    );
    expect(await scope(".a > .b + .c { color: red }")).toBe(
      `.a>.b+.c${inRoot} { color: red }`,
    );
  });

  it("keeps pseudo-elements last", async () => {
    expect(await scope("button::-moz-focus-inner { border: 0 }")).toBe(
      `button${inRoot}::-moz-focus-inner { border: 0 }`,
    );
    expect(await scope(".a .b:hover::after { content: '' }")).toBe(
      `.a .b:hover${inRoot}::after { content: '' }`,
    );
    expect(await scope("p:first-letter { color: red }")).toBe(
      `p${inRoot}:first-letter { color: red }`,
    );
  });

  it("leaves alone what already names the root", async () => {
    const css = `${ROOT_SELECTOR}[data-platform="ios"] { --a: 1 }`;
    expect(await scope(css)).toBe(css);
  });

  it("reaches into layers and media queries", async () => {
    expect(
      await scope(
        "@layer normalize { h1 { margin: 0 } } @media (min-width: 1px) { p { margin: 0 } }",
      ),
    ).toBe(
      `@layer normalize { h1${inRoot} { margin: 0 } } @media (min-width: 1px) { p${inRoot} { margin: 0 } }`,
    );
  });

  it("does not touch keyframes or nested rules", async () => {
    expect(
      await scope("@keyframes spin { from { opacity: 0 } to { opacity: 1 } }"),
    ).toBe("@keyframes spin { from { opacity: 0 } to { opacity: 1 } }");
    expect(
      await scope(
        ".a { color: red; &:hover { color: blue } .b { color: green } }",
      ),
    ).toBe(
      `.a${inRoot} { color: red; &:hover { color: blue } .b { color: green } }`,
    );
  });

  it("only touches the bare selectors of a CSS module", async () => {
    const file = "Settings.module.css";
    expect(await scope("pre { font-size: 1px }", file)).toBe(
      `pre${inRoot} { font-size: 1px }`,
    );
    expect(await scope(".modal pre { font-size: 1px }", file)).toBe(
      `.modal pre${inRoot} { font-size: 1px }`,
    );
    expect(await scope(".box_abc12 { border: 0 }", file)).toBe(
      ".box_abc12 { border: 0 }",
    );
    expect(await scope(".a .b_abc12:hover { border: 0 }", file)).toBe(
      ".a .b_abc12:hover { border: 0 }",
    );
  });
});
