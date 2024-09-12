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
import classNames from "classnames";

import { useLatest } from "../useLatest";
import styles from "./Link.module.css";

export function useLink(
  to: LocationDescriptor,
  state?: unknown,
): [Path, (e: MouseEvent) => void] {
  const latestState = useLatest(state);
  const history = useHistory();
  const path = useMemo(
    () => (typeof to === "string" ? to : createPath(to)),
    [to],
  );
  const onClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      history.push(to, latestState.current);
    },
    [history, to, latestState],
  );

  return [path, onClick];
}

type Props = Omit<
  ComponentPropsWithoutRef<typeof CpdLink>,
  "href" | "onClick"
> & { to: LocationDescriptor; state?: unknown };

/**
 * A version of Compound's link component that integrates with our router setup.
 * This is only for app-internal links.
 */
export const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { to, state, ...props },
  ref,
) {
  const [path, onClick] = useLink(to, state);
  return <CpdLink ref={ref} {...props} href={path} onClick={onClick} />;
});

/**
 * A link to an external web page, made to fit into blocks of text more subtly
 * than the normal Compound link component.
 */
export const ExternalLink = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<"a">
>(function ExternalLink({ className, children, ...props }, ref) {
  return (
    <a
      ref={ref}
      className={classNames(className, styles.external)}
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    >
      {children}
    </a>
  );
});
