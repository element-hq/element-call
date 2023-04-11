import { Attributes } from "@opentelemetry/api";
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMilliseconds,
} from "@opentelemetry/core";
import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";

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
export class RageshakeSpanExporter implements SpanExporter {
  private readonly spans: ReadableSpan[] = [];

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.spans.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  /**
   * Dumps the spans collected so far as Jaeger-compatible JSON.
   */
  public dump(): string {
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

          return {
            traceID: traceId,
            spanID: ctx.spanId,
            operationName: span.name,
            processID: processId,
            warnings: null,
            startTime: hrTimeToMilliseconds(span.startTime),
            duration: hrTimeToMilliseconds(span.duration),
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
