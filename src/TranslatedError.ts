/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { DefaultNamespace, ParseKeys, TFunction, TOptions } from "i18next";

/**
 * An error with messages in both English and the user's preferred language.
 * Use this for errors that need to be displayed inline within another
 * component. For errors that could be given their own screen, prefer
 * {@link RichError}.
 */
// Abstract to force consumers to use the function below rather than calling the
// constructor directly
export abstract class TranslatedError extends Error {
  /**
   * The error message in the user's preferred language.
   */
  public readonly translatedMessage: string;

  public constructor(
    messageKey: ParseKeys<DefaultNamespace, TOptions>,
    translationFn: TFunction<DefaultNamespace>,
  ) {
    super(translationFn(messageKey, { lng: "en" } as TOptions));
    this.translatedMessage = translationFn(messageKey);
  }
}

class TranslatedErrorImpl extends TranslatedError {}

// i18next-parser can't detect calls to a constructor, so we expose a bare
// function instead
export const translatedError = (
  messageKey: ParseKeys<DefaultNamespace, TOptions>,
  t: TFunction<"app", undefined>,
): TranslatedError => new TranslatedErrorImpl(messageKey, t);
