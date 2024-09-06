/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  ComponentPropsWithoutRef,
  forwardRef,
  MouseEvent,
  useCallback,
  useMemo,
} from "react";
import { Link as CpdLink } from "@vector-im/compound-web";
import { useHistory } from "react-router-dom";
import { createPath, LocationDescriptor, Path } from "history";

export function useLink(
  to: LocationDescriptor,
): [Path, (e: MouseEvent) => void] {
  const history = useHistory();
  const path = useMemo(
    () => (typeof to === "string" ? to : createPath(to)),
    [to],
  );
  const onClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      history.push(to);
    },
    [history, to],
  );

  return [path, onClick];
}

type Props = Omit<
  ComponentPropsWithoutRef<typeof CpdLink>,
  "href" | "onClick"
> & { to: LocationDescriptor };

/**
 * A version of Compound's link component that integrates with our router setup.
 */
export const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { to, ...props },
  ref,
) {
  const [path, onClick] = useLink(to);
  return <CpdLink ref={ref} {...props} href={path} onClick={onClick} />;
});
