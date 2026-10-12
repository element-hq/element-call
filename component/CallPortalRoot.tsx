/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode } from "react";
import { PortalRoot } from "@vector-im/compound-web";

interface Props {
  root: HTMLElement | null | undefined;
  children: ReactNode;
}

/**
 * Where Compound floats the call's menus and tooltips. With no `root` the call
 * is not wrapped at all and they go into the host document's body; `null` is
 * Compound's "not available yet", and the floating parts wait for it.
 */
export const CallPortalRoot: FC<Props> = ({ root, children }): ReactNode =>
  root === undefined ? (
    children
  ) : (
    <PortalRoot root={root}>{children}</PortalRoot>
  );
