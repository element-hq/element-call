/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Checks that the component build leaves the packages a host must supply to
 * the host.
 *
 * A host application already has React, the Matrix SDK and LiveKit, and a
 * second copy of any of them is worse than dead weight: React would hold two
 * sets of hooks, and the Matrix client would run two sync loops. So the
 * component build lists them as external — but that list has to name every
 * subpath, since the bundler silently ignores the pattern and callback forms
 * of the option, and an import it does not cover is bundled with no warning at
 * all. That is the failure this guards against.
 *
 * It reads the list from the build config itself, so there is one copy of it,
 * and compares it against every import of those packages in the source.
 *
 * The comparison is deliberately over-approximate: it looks at all of `src`
 * rather than only the modules the component actually pulls in, so it will
 * sometimes ask for a subpath that only the standalone app imports. Listing
 * one the component never imports costs nothing — the bundler ignores it —
 * whereas missing one costs a duplicate package.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfigFromFile } from "vite";

const CONFIG = "vite-component.config.ts";
const SOURCES = ["src", "component"];

/** The packages whose duplication would break a host, rather than merely enlarge it. */
const MUST_BE_EXTERNAL = [
  "react",
  "react-dom",
  "matrix-js-sdk",
  "livekit-client",
];

const isTestFile = (name) =>
  name.includes(".test.") || name.includes(".stories.");

/** Every source file under the given directories, recursively. */
async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(entry.name) && !isTestFile(entry.name))
      yield path;
  }
}

/**
 * The module specifiers a source file imports. Covers `from "…"` (which is
 * both static imports and re-exports), bare `import "…"` for side effects, and
 * dynamic `import("…")`.
 */
function imports(source) {
  const specifiers = [];
  for (const pattern of [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm,
  ])
    for (const [, specifier] of source.matchAll(pattern))
      specifiers.push(specifier);
  return specifiers;
}

/**
 * Whether a specifier is an import of one of the packages we care about.
 *
 * Imports carrying a resource query — `?worker`, `?inline` and friends — are
 * not, whatever package they name. Those ask the bundler for a script to run
 * in a context of its own, which has to be self-contained and shares no state
 * with the host's copy of anything. Worker sub-builds do not inherit this
 * option anyway.
 */
const mustBeExternal = (specifier) =>
  !specifier.includes("?") &&
  MUST_BE_EXTERNAL.some(
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  );

const loaded = await loadConfigFromFile(
  { command: "build", mode: "production" },
  CONFIG,
);
if (loaded === null) {
  console.error(`Could not load ${CONFIG}`);
  process.exit(1);
}
const declared = new Set(loaded.config.build?.rollupOptions?.external ?? []);
if (declared.size === 0) {
  console.error(
    `${CONFIG} declares nothing external. Either the option moved, or the ` +
      `list is empty; either way this check is not looking at what it thinks.`,
  );
  process.exit(1);
}

// Where each missing specifier is imported, so the message can point at it
const missing = new Map();
const seen = new Set();
for (const dir of SOURCES)
  for await (const file of sourceFiles(dir)) {
    const source = await readFile(file, "utf8");
    for (const specifier of imports(source)) {
      if (!mustBeExternal(specifier)) continue;
      seen.add(specifier);
      if (declared.has(specifier)) continue;
      const files = missing.get(specifier) ?? [];
      files.push(file);
      missing.set(specifier, files);
    }
  }

if (missing.size > 0) {
  console.error(
    `${CONFIG} does not declare these imports external, so the component ` +
      `build would bundle its own copy of them:\n`,
  );
  for (const [specifier, files] of [...missing].sort())
    console.error(`  ${specifier}\n    imported by ${files.join(", ")}`);
  console.error(`\nAdd each one to the \`external\` list in ${CONFIG}.`);
  process.exit(1);
}

// Deliberately no complaint about declarations nothing imports. Some of them
// cannot be seen from the source at all — `react/jsx-runtime` is injected by
// the JSX transform — and an extra declaration is inert, so there is nothing
// to warn about.
console.log(
  `${declared.size} external declarations cover all ${seen.size} imports of ${MUST_BE_EXTERNAL.join(", ")}.`,
);
