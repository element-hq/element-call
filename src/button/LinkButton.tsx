/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { ComponentPropsWithoutRef, forwardRef } from "react";
import { Button } from "@vector-im/compound-web";
import { LocationDescriptor } from "history";

import { useLink } from "./Link";

type Props = Omit<
  ComponentPropsWithoutRef<typeof Button<"a">>,
  "as" | "href"
> & { to: LocationDescriptor };

/**
 * A version of Compound's button component that acts as a link and integrates
 * with our router setup.
 */
export const LinkButton = forwardRef<HTMLAnchorElement, Props>(
  function LinkButton({ to, ...props }, ref) {
    const [path, onClick] = useLink(to);
    return <Button as="a" ref={ref} {...props} href={path} onClick={onClick} />;
  },
);
