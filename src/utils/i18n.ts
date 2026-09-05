/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import i18next, { type i18n as I18nInstance } from "i18next";

// Custom marker function to allow i18next extraction
export const i18nKey = (key: string): string => key;

/**
 * Element Call's own i18next instance.
 *
 * We deliberately do not use the global i18next singleton: when Element Call is
 * embedded in a host application (rather than running as its own page), that
 * singleton belongs to the host, and configuring it would clobber the host's
 * translations.
 *
 * It is configured by `Initializer.initBeforeReact` and made available to
 * components via `<I18nextProvider>`; tests and stories configure it directly.
 *
 * Non-React code should call `i18n.t(...)` on this instance. Components should
 * use `useTranslation()` instead, so that they re-render on a language change.
 * Note that `t` must be reached through the instance at call time — i18next
 * only assigns it during `init()`, so destructuring it at module scope would
 * capture an uninitialised function.
 */
export const i18n: I18nInstance = i18next.createInstance();
