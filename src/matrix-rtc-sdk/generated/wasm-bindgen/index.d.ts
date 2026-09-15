/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Hand-written declaration for the wasm-bindgen glue next to it, which ubrn
// emits as plain JavaScript. Only the loading entry points are declared; the
// exported `ubrn_*` FFI functions are reached through matrix_rtc.ts alone.
// Kept out of the sync script's way: it is not generated.

/** What wasm-bindgen's loader accepts as the module to instantiate. */
export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export default function initAsync(
  moduleOrPath?:
    | { module_or_path?: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<unknown>;

export function initSync(
  module: { module: BufferSource | WebAssembly.Module } | BufferSource | WebAssembly.Module,
): unknown;
