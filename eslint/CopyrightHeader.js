/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ESLintUtils } from "@typescript-eslint/utils";

const rule = ESLintUtils.RuleCreator(
  () => "https://github.com/element-hq/element-call",
)({
  name: "copyright-header",
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description: "Require a copyright header in files.",
    },
    messages: {
      noHeader: "Copyright header is required.",
    },
    schema: [{ type: "string" }],
  },
  create(context) {
    const code = context.getSourceCode();

    return {
      Program(node) {
        const firstToken = code.getFirstToken(node, { includeComments: false });

        if (!firstToken) {
          return;
        }

        const headComments = code.getCommentsBefore(firstToken);
        const hasSomeCopyrightHeader = headComments?.some((comment) =>
          comment?.value?.includes("Copyright"),
        );
        if (hasSomeCopyrightHeader) {
          return;
        }
        const headerTemplate = context.options[0];
        const fix = headerTemplate
          ? function (fixer) {
              return fixer.insertTextBefore(
                firstToken,
                headerTemplate.replace(
                  /%%CURRENT_YEAR%%/g,
                  new Date().getFullYear(),
                ),
              );
            }
          : undefined;

        context.report({
          messageId: "noHeader",
          node,
          fix,
        });
      },
    };
  },
});

export default rule;
