/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

module.exports = {
  name: "linker",
  factory: (require) => ({
    hooks: {
      // Yarn's plugin system is very light on documentation. The best we have
      // for this hook is simply the type definition in
      // https://github.com/yarnpkg/berry/blob/master/packages/yarnpkg-core/sources/Plugin.ts
      registerPackageExtensions: async (config, registerPackageExtension) => {
        const { structUtils } = require("@yarnpkg/core");
        const { parseSyml } = require("@yarnpkg/parsers");
        const path = require("path");
        const fs = require("fs");
        const process = require("process");

        // Create a descriptor that we can use to target our direct dependencies
        const projectPath = config.projectCwd
          .replace(/\\/g, "/")
          .replace("/C:/", "C:/");
        const manifestPath = path.join(projectPath, "package.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const selfDescriptor = structUtils.parseDescriptor(
          `${manifest.name}@*`,
          true,
        );

        // Load the list of linked packages
        const linksPath = path.join(projectPath, ".links.yaml");
        let linksFile;
        try {
          linksFile = fs.readFileSync(linksPath, "utf8");
        } catch (e) {
          return; // File doesn't exist, there's nothing to link
        }
        let links;
        try {
          links = parseSyml(linksFile);
        } catch (e) {
          console.error(".links.yaml has invalid syntax", e);
          process.exit(1);
        }

        // Resolve paths and turn them into a Yarn package extension
        const overrides = Object.fromEntries(
          Object.entries(links).map(([name, link]) => [
            name,
            `portal:${path.resolve(config.projectCwd, link)}`,
          ]),
        );
        const overrideIdentHashes = new Set();
        for (const name of Object.keys(overrides))
          overrideIdentHashes.add(
            structUtils.parseDescriptor(`${name}@*`, true).identHash,
          );

        // Extend our own package's dependencies with these local overrides
        registerPackageExtension(selfDescriptor, { dependencies: overrides });

        // Filter out the original dependencies from the package spec so Yarn
        // actually respects the overrides
        const filterDependencies = (original) => {
          const pkg = structUtils.copyPackage(original);
          pkg.dependencies = new Map(
            Array.from(pkg.dependencies.entries()).filter(
              ([, value]) => !overrideIdentHashes.has(value.identHash),
            ),
          );
          return pkg;
        };

        // Patch Yarn's own normalizePackage method to use the above filter
        const originalNormalizePackage = config.normalizePackage;
        config.normalizePackage = function (pkg, extensions) {
          return originalNormalizePackage.call(
            this,
            pkg.identHash === selfDescriptor.identHash
              ? filterDependencies(pkg)
              : pkg,
            extensions,
          );
        };
      },
    },
  }),
};
