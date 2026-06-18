/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ESLintUtils } from "@typescript-eslint/utils";

// These ObservableScope methods will not generally cause resource leaks even if
// called from a callback
const safeScopeMethods = ["bind", "end"];

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
          // Is this a reference to a variable defined in an outer ("through") scope?
          scope.through.some(
            ({ identifier }) => identifier.name === node.name,
          ) &&
          // Exclude calls to "safe" ObservableScope methods
          node.parent?.type === "MemberExpression" &&
          node.parent.object === node &&
          node.parent.property.type === "Identifier" &&
          !safeScopeMethods.includes(node.parent.property.name) &&
          node.name.endsWith("cope")
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
