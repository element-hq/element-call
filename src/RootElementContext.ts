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
 * The stylesheets find this element by its `data-element-call-root` attribute,
 * which {@link useTheme} sets along with the platform and theme, so they no
 * longer depend on it being the body.
 *
 * What remains body-specific is the standalone page's own furniture: the
 * `body` rule in `index.css` still sets the page background and margin, and
 * `index.html` starts the body hidden with `no-theme` until the theme lands.
 * Neither applies when a host mounts Element Call into a container of its own.
 */
// No provider is exported yet: nothing supplies a root element, so every
// consumer falls back to the document body. One arrives with the entry point
// that mounts Element Call into a container.
const RootElementContext = createContext<HTMLElement | null>(null);

/**
 * The element Element Call should decorate and portal into.
 *
 * Defaults to the document body, so that the standalone and widget builds work
 * without a provider.
 */
export const useRootElement = (): HTMLElement =>
  use(RootElementContext) ?? document.body;
