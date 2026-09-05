/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AtRule,
  type Container,
  type Document,
  type Plugin,
  type Rule,
} from "postcss";
import selectorParser, {
  type Node,
  type Pseudo,
  type Selector,
} from "postcss-selector-parser";

/**
 * How the stylesheets find Element Call's root element. The attribute is put
 * there by `useTheme`, on the container the host gives the component.
 */
export const ROOT_SELECTOR = "[data-element-call-root]";

// Both are `:where()`, which has no specificity of its own, so the rules keep
// exactly the weight they had before being scoped and nothing in Element Call's
// cascade changes — only where it applies.
//
// The root, or anything inside it. Appended to the element a rule is about,
// rather than prepended to the whole selector, so that a rule about the root
// itself (its theme class, say) still matches.
const IN_ROOT = `:where(${ROOT_SELECTOR}, ${ROOT_SELECTOR} *)`;
// The root itself, standing in for the document.
const IS_ROOT = `:where(${ROOT_SELECTOR})`;

/**
 * Confines a stylesheet to Element Call's root element, for the build of
 * Element Call as a component.
 *
 * As a page of its own, Element Call can style the document: normalize.css and
 * Compound speak of `html`, `body` and bare elements, and the design tokens are
 * declared on `:root`. Embedded in a host, all of that would land on the host's
 * document too. This rewrites every selector so that it matches only the root
 * or its descendants:
 *
 * - `html`, `body` and `:root` become the root element, which is what stands in
 *   for the document inside a host.
 * - Everything else keeps its selector and gains `:where([data-element-call-root],
 *   [data-element-call-root] *)` on the element it styles.
 * - Selectors that already name the root are left alone, as are keyframe
 *   selectors and rules nested inside another rule, which are relative to it.
 *
 * CSS modules are scoped by their class names already, so only their selectors
 * that would match by element alone — `pre` rather than `.pre` — are touched.
 *
 * The root's fonts and design tokens are still inherited by everything inside
 * it, the way they were from `body` and `:root`, and `@font-face` declarations
 * stay global, which they are by nature.
 */
export function scopeStylesToRoot(): Plugin {
  return {
    postcssPlugin: "element-call-scope-styles-to-root",
    Once(root) {
      const isModule =
        root.source?.input.file?.endsWith(".module.css") ?? false;
      root.walkRules((rule) => {
        if (isRelative(rule)) return;
        rule.selector = (isModule ? scopeBare : scopeAll).processSync(
          rule.selector,
          { lossless: false },
        );
      });
    },
  };
}

/** Whether a rule's selectors are relative to something other than the document. */
function isRelative(rule: Rule): boolean {
  let parent: Container | Document | undefined = rule.parent;
  while (parent !== undefined) {
    if (parent.type === "rule") return true;
    if (parent.type === "atrule") {
      const { name } = parent as AtRule;
      if (name.endsWith("keyframes") || name === "page") return true;
    }
    parent = parent.parent;
  }
  return false;
}

const processor = (isModule: boolean): ReturnType<typeof selectorParser> =>
  selectorParser((selectors) => {
    selectors.each((selector) => {
      scopeSelector(selector, isModule);
    });
    // Mapping `html, body` onto the root leaves the same selector twice
    const seen = new Set<string>();
    selectors.each((selector) => {
      const text = String(selector).trim();
      if (seen.has(text)) selector.remove();
      else seen.add(text);
    });
  });

// Everything, for stylesheets that speak of the document; only what a class
// does not already confine, for CSS modules
const scopeAll = processor(false);
const scopeBare = processor(true);

function scopeSelector(selector: Selector, isModule: boolean): void {
  if (String(selector).includes(ROOT_SELECTOR)) return;

  const compounds = splitCompounds(selector);
  if (compounds.length === 0) return;

  // Something said of the document is said of the root instead
  const document = compounds[0].find(isDocumentSelector);
  if (document !== undefined) {
    document.replaceWith(pseudo(IS_ROOT));
    return;
  }

  const subject = compounds.at(-1)!;
  if (isModule && subject.some((node) => node.type === "class")) return;

  // Pseudo-elements have to come last in a compound selector
  const pseudoElement = subject.find(isPseudoElement);
  if (pseudoElement === undefined) selector.append(pseudo(IN_ROOT));
  else selector.insertBefore(pseudoElement, pseudo(IN_ROOT));
}

/** The compound selectors making up a complex selector, in order. */
function splitCompounds(selector: Selector): Node[][] {
  const compounds: Node[][] = [[]];
  for (const node of selector.nodes) {
    if (node.type === "combinator") compounds.push([]);
    else if (node.type !== "comment") compounds.at(-1)!.push(node);
  }
  return compounds.filter((compound) => compound.length > 0);
}

function isDocumentSelector(node: Node): boolean {
  return (
    (node.type === "tag" && (node.value === "html" || node.value === "body")) ||
    (node.type === "pseudo" && node.value === ":root")
  );
}

function isPseudoElement(node: Node): node is Pseudo {
  if (node.type !== "pseudo") return false;
  return (
    node.value.startsWith("::") ||
    [":before", ":after", ":first-line", ":first-letter"].includes(node.value)
  );
}

function pseudo(text: string): Pseudo {
  return selectorParser().astSync(text).nodes[0].nodes[0].clone() as Pseudo;
}
