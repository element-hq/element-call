import { SpanExporter } from "@opentelemetry/sdk-trace-base";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";

import { PosthogAnalytics } from "./PosthogAnalytics";
/**
 * This is implementation of {@link SpanExporter} that prints spans to the
 * console. This class can be used for diagnostic purposes.
 */
export class PosthogSpanExporter implements SpanExporter {
  /**
   * Export spans.
   * @param spans
   * @param resultCallback
   */
  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): Promise<void> {
    console.log("POSTHOGEXPORTER", spans);
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const sendInstantly =
        span.name == "otel_callEnded" ||
        span.name == "otel_otherSentInstantlyEventName";

      await PosthogAnalytics.instance.trackFromSpan(
        { eventName: span.name, ...span.attributes },
        {
          send_instantly: sendInstantly,
        }
      );
      resultCallback({ code: ExportResultCode.SUCCESS });
    }
  }
  /**
   * Shutdown the exporter.
   */
  shutdown(): Promise<void> {
    console.log("POSTHOGEXPORTER shutdown of otelPosthogExporter");
    return new Promise<void>((resolve, _reject) => {
      resolve();
    });
  }
  /**
   * converts span info into more readable format
   * @param span
   */
  // private _exportInfo;
  /**
   * Showing spans in console
   * @param spans
   * @param done
   */
  // private _sendSpans;
}
//# sourceMappingURL=ConsoleSpanExporter.d.ts.map
