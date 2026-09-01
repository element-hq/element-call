/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, use } from "react";

/**
 * The element that Element Call treats as the root of its own interface.
 *
 * Element Call decorates this element with the theme, layout and background
 * attributes its stylesheets key off, and portals its modals into it. When
 * Element Call owns the page this is simply the document body; when it is
 * embedded in a host application it is the container the host mounted it into,
 * so that Element Call does not reach outside its own subtree.
 */
const RootElementContext = createContext<HTMLElement | null>(null);

export const RootElementProvider = RootElementContext.Provider;

/**
 * The element Element Call should decorate and portal into.
 *
 * Defaults to the document body, so that the standalone and widget builds work
 * without a provider.
 */
export const useRootElement = (): HTMLElement =>
  use(RootElementContext) ?? document.body;
