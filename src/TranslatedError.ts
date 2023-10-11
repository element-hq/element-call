/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import i18n from "i18next";

/**
 * An error with messages in both English and the user's preferred language.
 */
// Abstract to force consumers to use the function below rather than calling the
// constructor directly
export abstract class TranslatedError extends Error {
  /**
   * The error message in the user's preferred language.
   */
  public readonly translatedMessage: string;

  public constructor(messageKey: string, translationFn: typeof i18n.t) {
    super(translationFn(messageKey, { lng: "en-GB" }));
    this.translatedMessage = translationFn(messageKey);
  }
}

class TranslatedErrorImpl extends TranslatedError {}

// i18next-parser can't detect calls to a constructor, so we expose a bare
// function instead
export const translatedError = (
  messageKey: string,
  t: typeof i18n.t
): TranslatedError => new TranslatedErrorImpl(messageKey, t);
