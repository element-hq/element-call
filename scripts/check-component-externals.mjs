/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Checks that the library builds leave the packages a host must supply to the
 * host.
 *
 * A host application already has React, the Matrix SDK and Compound,
 * and a second copy of any of them is worse than dead weight: React would hold
 * two sets of hooks, the Matrix client would run two sync loops, and a second
 * Compound would style the tooltips it floats into the host's body with class
 * names the host's stylesheet does not know. So each library build lists them
 * as external — but that list has to name every subpath, since the bundler
 * silently ignores the pattern and callback forms of the option, and an import
 * it does not cover is bundled with no warning at all. That is the failure
 * this guards against.
 *
 * It reads each list from the build config itself, so there is one copy of it
 * per build, and compares it against every import of those packages in the
 * source.
 *
 * The comparison is deliberately over-approximate: it looks at all of `src`
 * rather than only the modules a build actually pulls in, so it will sometimes
 * ask for a subpath that only the standalone app imports. Listing one a build
 * never imports costs nothing — the bundler ignores it — whereas missing one
 * costs a duplicate package.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfigFromFile } from "vite";

/**
 * The library builds, each with the directories it is built from and the
 * packages whose duplication would break a host rather than merely enlarge it.
 * A development harness is a host, not part of the library: it is the one that
 * imports what a host supplies (Compound's stylesheets, say).
 */
const TARGETS = [
  {
    config: "vite-component.config.ts",
    what: "the component build",
    sources: ["src", "component"],
    excluded: ["component/dev"],
    mustBeExternal: [
      "react",
      "react-dom",
      "matrix-js-sdk",
      "@vector-im/compound-web",
      "@vector-im/compound-design-tokens",
    ],
  },
  {
    config: "vite-sdk.config.ts",
    what: "the SDK build",
    sources: ["src", "sdk"],
    excluded: ["sdk/dev"],
    mustBeExternal: ["matrix-js-sdk", "livekit-client", "rxjs"],
  },
];

const isTestFile = (name) =>
  name.includes(".test.") || name.includes(".stories.");

/** Every source file under the given directories, recursively. */
async function* sourceFiles(dir, excluded) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (excluded.includes(path)) continue;
    if (entry.isDirectory()) yield* sourceFiles(path, excluded);
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
const mustBeExternal = (specifier, packages) =>
  !specifier.includes("?") &&
  packages.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));

/** @returns Whether the target's externals list covers its imports. */
async function check({
  config,
  what,
  sources,
  excluded,
  mustBeExternal: packages,
}) {
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    config,
  );
  if (loaded === null) {
    console.error(`Could not load ${config}`);
    return false;
  }
  const declared = new Set(loaded.config.build?.rollupOptions?.external ?? []);
  if (declared.size === 0) {
    console.error(
      `${config} declares nothing external. Either the option moved, or the ` +
        `list is empty; either way this check is not looking at what it thinks.`,
    );
    return false;
  }

  // Where each missing specifier is imported, so the message can point at it
  const missing = new Map();
  for (const dir of sources)
    for await (const file of sourceFiles(dir, excluded)) {
      const source = await readFile(file, "utf8");
      for (const specifier of imports(source)) {
        if (!mustBeExternal(specifier, packages)) continue;
        if (declared.has(specifier)) continue;
        const files = missing.get(specifier) ?? [];
        files.push(file);
        missing.set(specifier, files);
      }
    }

  if (missing.size === 0) return true;
  console.error(
    `${config} does not declare these imports external, so ${what} ` +
      `would bundle its own copy of them:\n`,
  );
  for (const [specifier, files] of [...missing].sort())
    console.error(`  ${specifier}\n    imported by ${files.join(", ")}`);
  console.error(`\nAdd each one to the \`external\` list in ${config}.\n`);
  return false;
}

let ok = true;
for (const target of TARGETS) ok = (await check(target)) && ok;
if (!ok) process.exit(1);
