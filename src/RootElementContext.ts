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
 * Element Call owns the page this is simply the document body; the intent is
 * that when embedded in a host application it becomes the container the host
 * mounted it into, so that Element Call does not reach outside its own subtree.
 *
 * That intent is not yet achievable: several selectors still name `body`
 * directly — `body[data-background="gradient"]` and `body[data-platform=…]` in
 * `index.css`, and `body[data-platform="ios"]` in `AppBar.module.css` and
 * `Modal.module.css` — and `Initializer.initBeforeReact` writes
 * `data-platform` straight onto the body. So anything other than the body will
 * be decorated correctly and styled incorrectly, silently. Until those are
 * scoped, treat this as preparation rather than a working seam.
 */
// No provider is exported yet: nothing supplies a root element, so every
// consumer falls back to the document body. M1 adds one along with the
// component that mounts Element Call into a container.
const RootElementContext = createContext<HTMLElement | null>(null);

/**
 * The element Element Call should decorate and portal into.
 *
 * Defaults to the document body, so that the standalone and widget builds work
 * without a provider.
 */
export const useRootElement = (): HTMLElement =>
  use(RootElementContext) ?? document.body;
