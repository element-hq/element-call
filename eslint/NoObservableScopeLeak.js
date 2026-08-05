/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ESLintUtils } from "@typescript-eslint/utils";

// These ObservableScope methods will not generally cause resource leaks even if
// called from a callback
const safeScopeMethods = new Set(["bind", "end"]);

/**
 * Determines whether the variable with the given name is local to
 * the enclosing function or class scope.
 */
function isLocal(name, scope) {
  // If it is nowhere to be found in the "through" scope, it is local.
  if (!scope.through.some(({ identifier }) => identifier.name === name))
    return true;
  if (scope.type === "function" || scope.type === "class") return false;
  // If this is something other than a function or class scope, check its outer
  // scope.
  return !scope.upper || isLocal(name, scope.upper);
}

const rule = ESLintUtils.RuleCreator(
  () => "https://github.com/element-hq/element-call",
)({
  name: "no-observablescope-leak",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require referenced ObservableScopes to be defined in the very same scope to avoid resource leaks.",
    },
    messages: {
      scopeLeak:
        "Do not reference ObservableScopes defined in an outer scope; this may create resource leaks.",
    },
    schema: [],
  },
  create(context) {
    return {
      Identifier(node) {
        const scope = context.sourceCode.getScope(node);
        if (
          // Is this a reference to a variable defined in an outer scope?
          !isLocal(node.name, scope) &&
          // Exclude calls to "safe" ObservableScope methods
          node.parent?.type === "MemberExpression" &&
          node.parent.object === node &&
          node.parent.property.type === "Identifier" &&
          !safeScopeMethods.has(node.parent.property.name) &&
          /(^s|S)cope$/.test(node.name)
        ) {
          // TODO: Once oxlint supports lint rules that rely on TypeScript type-awareness,
          // Verify that the variable is actually of type ObservableScope rather than just
          // checking its name. This is expensive so we should do this last.
          //
          // const services = ESLintUtils.getParserServices(context);
          // const type = services.getTypeAtLocation(node);
          // if (type.symbol?.name === "ObservableScope") { ... }

          // This ObservableScope method call may be causing resource leaks.
          context.report({
            messageId: "scopeLeak",
            loc: node.loc,
            node,
          });
        }
      },
    };
  },
});

export default rule;
