/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { Ref, useCallback, useRef } from "react";
import { BehaviorSubject, Observable } from "rxjs";

import { useInitial } from "../useInitial";

/**
 * React hook that creates an Observable from a changing value. The Observable
 * replays its current value upon subscription and emits whenever the value
 * changes.
 */
export function useObservable<T>(value: T): Observable<T> {
  const subject = useRef<BehaviorSubject<T>>();
  subject.current ??= new BehaviorSubject(value);
  if (value !== subject.current.value) subject.current.next(value);
  return subject.current;
}

/**
 * React hook that creates a ref and an Observable that emits any values
 * stored in the ref. The Observable replays the value currently stored in the
 * ref upon subscription.
 */
export function useObservableRef<T>(initialValue: T): [Observable<T>, Ref<T>] {
  const subject = useInitial(() => new BehaviorSubject(initialValue));
  const ref = useCallback((value: T) => subject.next(value), [subject]);
  return [subject, ref];
}
