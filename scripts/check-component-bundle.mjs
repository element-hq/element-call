/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Checks the component build's output for what a host must not be handed.
 *
 * A library build inlines every asset it meets as a data URL unless the import
 * says otherwise, and does so silently: one import without `no-inline` and the
 * module grows by the asset, encoded a third larger, that every host then
 * downloads and parses before the first call. MediaPipe's runtime alone is
 * 11 MB. A reference to a file by an absolute path is just as silent and
 * breaks at runtime instead, since a host serves the module from wherever it
 * likes. And the standalone app's client store worker, which carries a copy of
 * the Matrix SDK and its crypto, has no business in a package whose host
 * supplies the client: the bundler emits it on loading its import, used or
 * not (see src/utils/initClient.ts). This fails the build on each of those.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const dist = "component/dist";

/** The longest data URL a chunk may carry: enough for an icon, not a sound. */
const inlineLimit = 16 * 1024;

/**
 * The module itself, in bytes. Well above where it sits with its assets as
 * files, so that only an asset finding its way back in trips it.
 */
const moduleBudget = 4 * 1024 * 1024;

/**
 * The modules a host bundles: the entry points and their chunks, at the top of
 * the package. What sits under `assets/` is fetched as it is, by URL.
 */
async function modules() {
  const names = await readdir(dist);
  return names.filter((name) => name.endsWith(".js")).map((n) => join(dist, n));
}

const problems = [];

for (const name of await readdir(join(dist, "assets")))
  if (name.includes("IndexedDBWorker"))
    problems.push(
      `${dist}/assets/${name}: the standalone app's client store worker is ` +
        `in the package. Something the component reaches imports the worker; ` +
        `keep it on the standalone app's side (see src/utils/initClient.ts ` +
        `and the \`loadClient\` prop of ClientProvider).`,
    );

for (const file of await modules()) {
  const code = await readFile(file, "utf8");

  for (const [, type, payload] of code.matchAll(
    /data:([a-z0-9/.+-]*);base64,([A-Za-z0-9+/=]*)/g,
  ))
    if (payload.length > inlineLimit)
      problems.push(
        `${file}: a ${type} asset of ${Math.round(payload.length / 1024)} kB ` +
          `is inlined as a data URL. Import it with \`?url&no-inline\` so ` +
          `that it is emitted as a file.`,
      );

  for (const [reference] of code.matchAll(/["'`]\/assets\/[^"'`]+["'`]/g))
    problems.push(
      `${file}: ${reference} is an absolute path, which only resolves ` +
        `against an origin that serves the package at its root. The build ` +
        `is meant to render relative references; check \`base\` in ` +
        `vite-component.config.ts.`,
    );
}

const moduleSize = (await stat(join(dist, "element-call.js"))).size;
if (moduleSize > moduleBudget)
  problems.push(
    `${dist}/element-call.js is ${Math.round(moduleSize / 1024 / 1024)} MB, ` +
      `over its ${moduleBudget / 1024 / 1024} MB budget. Something large ` +
      `has been bundled into the module that a host would rather fetch when ` +
      `it is needed.`,
  );

if (problems.length > 0) {
  console.error(`The component build is not fit to publish:\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}
