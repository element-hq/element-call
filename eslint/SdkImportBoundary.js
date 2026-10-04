/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { dirname, resolve, sep } from "node:path";
import { ESLintUtils } from "@typescript-eslint/utils";

/**
 * Packages a host supplies and the SDK must not know about: UI, i18n and
 * Element Call's design system.
 */
const BANNED_PACKAGES = [
  "react",
  "react-dom",
  "react-i18next",
  "i18next",
  "@vector-im/",
];

/**
 * Packages only a media backend may import. The session speaks MatrixRTC and
 * sees media through `sdk/src/backend/api.ts`; a backend under
 * `sdk/src/backend/<name>/` is the one place its protocol's library appears.
 */
const BACKEND_PACKAGES = ["livekit-client", "@livekit/"];

/**
 * Keeps the SDK free of Element Call: nothing under `sdk/` may import a file
 * outside `sdk/` by relative path (that is `src/`, `component/`,
 * `playwright/`) or one of the packages above. The development harness under
 * `sdk/dev/` is a host, not part of the library, and is exempt. Keeps the
 * session free of any one media backend, too: outside `sdk/src/backend/`,
 * a backend's packages may only be imported for their types, and only in
 * the public API, the errors and the test helpers that have to name them.
 */
const rule = ESLintUtils.RuleCreator(
  () => "https://github.com/element-hq/element-call",
)({
  name: "sdk-import-boundary",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow the SDK importing Element Call (anything outside sdk/) or host-supplied packages.",
    },
    messages: {
      outsideSdk:
        "The SDK must not import '{{specifier}}': it resolves outside sdk/. Copy or move what it needs into sdk/src.",
      bannedPackage:
        "The SDK must not import '{{specifier}}': a host supplies that, the SDK has no UI.",
      backendPackage:
        "Only a media backend under sdk/src/backend/ may import '{{specifier}}'; the session sees media through backend/api.ts.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename;
    const sdkRoot = resolve(context.cwd, "sdk") + sep;
    if (!filename.startsWith(sdkRoot)) return {};
    if (filename.startsWith(resolve(sdkRoot, "dev") + sep)) return {};
    const inBackend = filename.startsWith(
      resolve(sdkRoot, "src", "backend") + sep,
    );

    const matchesPackage = (specifier, pkg) =>
      specifier === pkg ||
      specifier.startsWith(pkg.endsWith("/") ? pkg : `${pkg}/`);

    const check = (node, specifier, typeOnly = false) => {
      if (typeof specifier !== "string") return;
      if (
        !inBackend &&
        !typeOnly &&
        BACKEND_PACKAGES.some((pkg) => matchesPackage(specifier, pkg))
      ) {
        context.report({
          node,
          messageId: "backendPackage",
          data: { specifier },
        });
        return;
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(filename), specifier);
        if (!target.startsWith(sdkRoot))
          context.report({
            node,
            messageId: "outsideSdk",
            data: { specifier },
          });
      } else if (
        BANNED_PACKAGES.some((pkg) => matchesPackage(specifier, pkg))
      ) {
        context.report({
          node,
          messageId: "bannedPackage",
          data: { specifier },
        });
      }
    };

    return {
      ImportDeclaration(node) {
        check(
          node,
          node.source.value,
          node.importKind === "type" ||
            node.specifiers.every((s) => s.importKind === "type"),
        );
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node, node.source.value);
      },
    };
  },
});

export default rule;
