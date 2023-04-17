import { Attributes } from "@opentelemetry/api";
import { hrTimeToMilliseconds } from "@opentelemetry/core";
import {
  SpanProcessor,
  ReadableSpan,
  Span,
} from "@opentelemetry/sdk-trace-base";

const dumpAttributes = (attr: Attributes) =>
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

  async forceFlush(): Promise<void> {}

  onStart(span: Span): void {
    this.spans.push(span);
  }

  onEnd(): void {}

  /**
   * Dumps the spans collected so far as Jaeger-compatible JSON.
   */
  public dump(): string {
    const now = Date.now();
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
          const startTime = hrTimeToMilliseconds(span.startTime);
          // If the span has not yet ended, pretend that it ends now
          const duration =
            span.duration[0] === -1
              ? now - startTime
              : hrTimeToMilliseconds(span.duration);

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
              timestamp: hrTimeToMilliseconds(event.time),
              fields: dumpAttributes(event.attributes ?? {}),
            })),
          };
        }),
      })),
    });
  }

  async shutdown(): Promise<void> {}
}
