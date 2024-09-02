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
