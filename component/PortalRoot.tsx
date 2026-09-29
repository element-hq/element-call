/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { FloatingPortal } from "@floating-ui/react";
import { type FC, type ReactNode } from "react";

import styles from "./ElementCall.module.css";

/**
 * Keeps what Compound floats over Element Call, its tooltips, inside Element
 * Call's root.
 *
 * Compound's `Tooltip` renders its bubble through floating-ui's
 * `FloatingPortal`, which appends to `document.body` unless it sits inside
 * another `FloatingPortal`, whose node it then shares. Compound offers no way
 * to name a container, so this is that enclosing portal: it puts its node
 * inside `root` and renders the children into it, and every tooltip they open
 * lands in the same node, inside the element the component's stylesheet is
 * confined to. Outside it, a tooltip matches none of the component's rules and
 * shows as bare text, permanently, since the rule that hides a label tooltip
 * until it is hovered is one of them.
 *
 * The children go in a wrapper of their own, which stands in for the `#root`
 * of the standalone page: it fills the node and is a stacking context, so
 * that the call's own layers (its header and footer, its overlays) stay below
 * the modals and toasts portalled into the root, and below the tooltips beside
 * it. `ElementCall.module.css` lays both out.
 *
 * Nothing renders until `root` exists, just as nothing renders before Element
 * Call's container does. The portal's tab order guards are for a focus
 * manager, which nothing in Element Call puts here, so they are off.
 */
export const PortalRoot: FC<{
  root: HTMLElement | null;
  children: ReactNode;
}> = ({ root, children }) => (
  <FloatingPortal root={root} preserveTabOrder={false}>
    <div className={styles.content}>{children}</div>
  </FloatingPortal>
);
