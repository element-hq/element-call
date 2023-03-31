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

import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";

import { PosthogAnalytics } from "./PosthogAnalytics";

/**
 * This is implementation of {@link SpanExporter} that sends spans
 * to Posthog
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
    for (const span of spans) {
      const sendInstantly = [
        "otel_callEnded",
        "otel_otherSentInstantlyEventName",
      ].includes(span.name);

      for (const spanEvent of span.events) {
        await PosthogAnalytics.instance.trackFromSpan(
          {
            eventName: spanEvent.name,
            ...spanEvent.attributes,
          },
          {
            send_instantly: sendInstantly,
          }
        );
      }

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
}
