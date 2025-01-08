/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { Button } from "@vector-im/compound-web";

import type { LinkProps } from "react-router-dom";
import { useLink } from "./Link";

type Props = Omit<
  ComponentPropsWithoutRef<typeof Button<"a">>,
  "as" | "href"
> & { to: LinkProps["to"]; state?: unknown };

/**
 * A version of Compound's button component that acts as a link and integrates
 * with our router setup.
 */
export const LinkButton = forwardRef<HTMLAnchorElement, Props>(
  function LinkButton({ to, state, ...props }, ref) {
    const [path, onClick] = useLink(to, state);
    return <Button as="a" ref={ref} {...props} href={path} onClick={onClick} />;
  },
);
