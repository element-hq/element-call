/*
Copyright 2023 New Vector Ltd

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
  ForwardRefExoticComponent,
  ForwardRefRenderFunction,
  PropsWithoutRef,
  RefAttributes,
  forwardRef,
} from "react";
// eslint-disable-next-line no-restricted-imports
import { Subscribe, RemoveSubscribe } from "@react-rxjs/core";

/**
 * Wraps a React component that consumes Observables, resulting in a component
 * that safely subscribes to its Observables before rendering. The component
 * will return null until the subscriptions are created.
 */
export function subscribe<P, R>(
  render: ForwardRefRenderFunction<R, P>,
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<R>> {
  const InnerComponent = forwardRef<R, { p: P }>(({ p }, ref) => (
    <RemoveSubscribe>{render(p, ref)}</RemoveSubscribe>
  ));
  const OuterComponent = forwardRef<R, P>((p, ref) => (
    <Subscribe>
      <InnerComponent ref={ref} p={p} />
    </Subscribe>
  ));
  // Copy over the component's display name, default props, etc.
  Object.assign(OuterComponent, render);
  return OuterComponent;
}
