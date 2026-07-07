/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ESLintUtils } from "@typescript-eslint/utils";

/**
 * Node types that introduce a new non-module scope. A getChild() call nested
 * inside any of these is considered "not at the top level".
 */
const FUNCTION_OR_CLASS_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassBody",
]);

const rule = ESLintUtils.RuleCreator(
  () => "https://github.com/element-hq/element-call",
)({
  name: "no-top-level-logger-get-child",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow calling logger.getChild() at the top level of a module." +
        "`getChild` has to be called after the rageshake logger `init()`." +
        "If it is called at the top level the child logger will never be setup for rageshakes.",
    },
    messages: {
      noTopLevelGetChild:
        "Do not call logger.getChild() at the top level of a module; move it inside a function or class instead that gets called after rageshake logger `init()` is called.",
    },
    schema: [],
  },
  create(context) {
    // Tracks the local binding names that refer to the logger imported from
    // 'matrix-js-sdk/lib/logger', e.g. both `logger` and `rootLogger` in:
    //   import { logger } from "matrix-js-sdk/lib/logger";
    //   import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
    const loggerNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "matrix-js-sdk/lib/logger") return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.name === "logger"
          ) {
            loggerNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        // Must be a non-computed member expression call: something.getChild(...)
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.computed ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "getChild"
        )
          return;

        // The receiver must be one of the tracked logger names.
        const object = node.callee.object;
        if (object.type !== "Identifier" || !loggerNames.has(object.name))
          return;

        // Flag the call only when it is at module top level — i.e. there is no
        // enclosing function or class body anywhere in the ancestor chain.
        const ancestors = context.sourceCode.getAncestors(node);
        const isTopLevel = !ancestors.some((a) =>
          FUNCTION_OR_CLASS_TYPES.has(a.type),
        );

        if (isTopLevel) {
          context.report({
            messageId: "noTopLevelGetChild",
            node,
          });
        }
      },
    };
  },
});

export default rule;
