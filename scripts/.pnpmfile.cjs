/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
// DONT RUN THIS FILE MANUALLY
// This file is intended to be used with `pnpm links:on` and `pnpm links:off` which will copy this file to the project root.
// See docs/linking.md for details.
//
//
// Created based on https://github.com/element-hq/element-call/blob/60fae70a60e3697eb41210ccf1e400cab37df7c8/.yarn/plugins/linker.cjs
// and the following prompt history:
// - Can you convert this yarn plugin into a pnpm plugin.
// - The goal is to not have modifications to the package.json and lock files so that we do not track links on gh.
// This seems to modify the package.json file.
// What can we do with pnpm to have the link inforamtion in a seperate file
// - why do you cache the loaded links. When does this file get executed?
// Do we need this optimization.
// How do we guarantee, that we aleays use the most recent content from the links file?
//
// Manual transition to cjs. Claude proposed manual yaml parsing.

const fs = require("fs");
const path = require("path");

function loadLinks() {
  try {
    return require(path.join(__dirname, ".links.cjs"));
  } catch (e) {
    return null;
  }
}

function readPackage(pkg, context) {
  const links = loadLinks();
  if (!links) return pkg;

  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
  );
  if (pkg.name !== manifest.name) return pkg;

  for (const [name, linkPath] of Object.entries(links)) {
    const resolved = `link:${path.resolve(__dirname, linkPath)}`;
    if (pkg.dependencies && pkg.dependencies[name]) {
      context.log(`Linking ${name} -> ${resolved}`);
      pkg.dependencies[name] = resolved;
    } else if (pkg.devDependencies && pkg.devDependencies[name]) {
      context.log(`Linking ${name} -> ${resolved}`);
      pkg.devDependencies[name] = resolved;
    }
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
