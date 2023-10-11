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

import { AttributeValue, Attributes } from "@opentelemetry/api";
import { hrTimeToMicroseconds } from "@opentelemetry/core";
import {
  SpanProcessor,
  ReadableSpan,
  Span,
} from "@opentelemetry/sdk-trace-base";

const dumpAttributes = (
  attr: Attributes
): {
  key: string;
  type:
    | "string"
    | "number"
    | "bigint"
    | "boolean"
    | "symbol"
    | "undefined"
    | "object"
    | "function";
  value: AttributeValue | undefined;
}[] =>
  Object.entries(attr).map(([key, value]) => ({
    key,
    type: typeof value,
    value,
  }));

/**
 * Exports spans on demand to the Jaeger JSON format, which can be attached to
 * rageshakes and loaded into analysis tools like Jaeger and Stalk.
 */
export class RageshakeSpanProcessor implements SpanProcessor {
  private readonly spans: ReadableSpan[] = [];

  public async forceFlush(): Promise<void> {}

  public onStart(span: Span): void {
    this.spans.push(span);
  }

  public onEnd(): void {}

  /**
   * Dumps the spans collected so far as Jaeger-compatible JSON.
   */
  public dump(): string {
    const now = Date.now() * 1000; // Jaeger works in microseconds
    const traces = new Map<string, ReadableSpan[]>();

    // Organize spans by their trace IDs
    for (const span of this.spans) {
      const traceId = span.spanContext().traceId;
      let trace = traces.get(traceId);

      if (trace === undefined) {
        trace = [];
        traces.set(traceId, trace);
      }

      trace.push(span);
    }

    const processId = "p1";
    const processes = {
      [processId]: {
        serviceName: "element-call",
        tags: [],
      },
      warnings: null,
    };

    return JSON.stringify({
      // Honestly not sure what some of these fields mean, I just know that
      // they're present in Jaeger JSON exports
      total: 0,
      limit: 0,
      offset: 0,
      errors: null,
      data: [...traces.entries()].map(([traceId, spans]) => ({
        traceID: traceId,
        warnings: null,
        processes,
        spans: spans.map((span) => {
          const ctx = span.spanContext();
          const startTime = hrTimeToMicroseconds(span.startTime);
          // If the span has not yet ended, pretend that it ends now
          const duration =
            span.duration[0] === -1
              ? now - startTime
              : hrTimeToMicroseconds(span.duration);

          return {
            traceID: traceId,
            spanID: ctx.spanId,
            operationName: span.name,
            processID: processId,
            warnings: null,
            startTime,
            duration,
            references:
              span.parentSpanId === undefined
                ? []
                : [
                    {
                      refType: "CHILD_OF",
                      traceID: traceId,
                      spanID: span.parentSpanId,
                    },
                  ],
            tags: dumpAttributes(span.attributes),
            logs: span.events.map((event) => ({
              timestamp: hrTimeToMicroseconds(event.time),
              // The name of the event is in the "event" field, aparently.
              fields: [
                ...dumpAttributes(event.attributes ?? {}),
                { key: "event", type: "string", value: event.name },
              ],
            })),
          };
        }),
      })),
    });
  }

  public async shutdown(): Promise<void> {}
}
