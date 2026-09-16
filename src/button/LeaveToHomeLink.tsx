/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type MouseEvent, type ReactNode, useCallback } from "react";
import { Link } from "@vector-im/compound-web";

import { useLeaveToHome } from "../LeaveToHomeContext";

interface Props {
  className?: string;
  children: ReactNode;
}

/**
 * A link out of the call, to wherever the user came from. Renders nothing when
 * there is nowhere to go (see {@link useLeaveToHome}).
 */
export const LeaveToHomeLink: FC<Props> = ({ className, children }) => {
  const leaveToHome = useLeaveToHome();
  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      leaveToHome?.();
    },
    [leaveToHome],
  );

  if (leaveToHome === null) return null;
  // Where this leads is the shell's business, so the link has no address of
  // its own to offer
  return (
    <Link className={className} href="#" onClick={onClick}>
      {children}
    </Link>
  );
};
