/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFile } from "node:fs/promises";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

// As a component, Element Call's stylesheets share a document with the host's.
// CSS modules keep to themselves through their class names, but the base styles
// speak of bare elements and custom properties, and nothing rewrites them at
// build time: each rule has to name the root itself.
const ROOT = "[data-element-call-root]";

/** Whether a rule is relative to something other than the document. */
function isRelative(rule: Rule): boolean {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === "rule") return true;
    if (parent.type === "atrule") {
      const { name } = parent as AtRule;
      if (name.endsWith("keyframes") || name === "page") return true;
    }
  }
  return false;
}

describe.each(["src/base.css", "src/normalize.css"])("%s", (file) => {
  it("confines every rule to Element Call's root", async () => {
    const root = postcss.parse(await readFile(file, "utf8"), { from: file });
    const unscoped: string[] = [];
    root.walkRules((rule) => {
      if (isRelative(rule)) return;
      for (const selector of rule.selectors)
        if (!selector.includes(ROOT))
          unscoped.push(`${rule.source?.start?.line}: ${selector}`);
    });
    expect(unscoped).toEqual([]);
  });
});
