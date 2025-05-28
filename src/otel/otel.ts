/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import opentelemetry, { type Tracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { logger } from "matrix-js-sdk/lib/logger";

import { PosthogSpanProcessor } from "../analytics/PosthogSpanProcessor";
import { Config } from "../config/Config";
import { RageshakeSpanProcessor } from "../analytics/RageshakeSpanProcessor";
import { getRageshakeSubmitUrl } from "../settings/submit-rageshake";

const SERVICE_NAME = "element-call";

let sharedInstance: ElementCallOpenTelemetry;

export class ElementCallOpenTelemetry {
  private _provider: WebTracerProvider;
  private _tracer: Tracer;
  private otlpExporter?: OTLPTraceExporter;
  public readonly rageshakeProcessor?: RageshakeSpanProcessor;

  public static globalInit(): void {
    // this is only supported in the full package as the is currently no support for passing in the collector URL from the widget host
    const collectorUrl =
      import.meta.env.VITE_PACKAGE === "full"
        ? Config.get().opentelemetry?.collector_url
        : undefined;
    // we always enable opentelemetry in general. We only enable the OTLP
    // collector if a URL is defined (and in future if another setting is defined)
    // Posthog reporting is enabled or disabled
    // within the posthog code.
    const shouldEnableOtlp = Boolean(collectorUrl);

    if (!sharedInstance || sharedInstance.isOtlpEnabled !== shouldEnableOtlp) {
      logger.info("(Re)starting OpenTelemetry debug reporting");
      sharedInstance?.dispose();

      sharedInstance = new ElementCallOpenTelemetry(
        collectorUrl,
        getRageshakeSubmitUrl(),
      );
    }
  }

  public static get instance(): ElementCallOpenTelemetry {
    return sharedInstance;
  }

  private constructor(
    collectorUrl: string | undefined,
    rageshakeUrl: string | undefined,
  ) {
    const spanProcessors: SpanProcessor[] = [];

    if (collectorUrl) {
      logger.info("Enabling OTLP collector with URL " + collectorUrl);
      this.otlpExporter = new OTLPTraceExporter({
        url: collectorUrl,
      });
      spanProcessors.push(new SimpleSpanProcessor(this.otlpExporter));
    } else {
      logger.info("OTLP collector disabled");
    }

    if (rageshakeUrl) {
      this.rageshakeProcessor = new RageshakeSpanProcessor();
      spanProcessors.push(this.rageshakeProcessor);
    }

    spanProcessors.push(new PosthogSpanProcessor());

    this._provider = new WebTracerProvider({
      resource: resourceFromAttributes({
        // This is how we can make Jaeger show a reasonable service in the dropdown on the left.
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
      }),
      spanProcessors,
    });

    opentelemetry.trace.setGlobalTracerProvider(this._provider);
    this._tracer = opentelemetry.trace.getTracer(
      // This is not the serviceName shown in jaeger
      "my-element-call-otl-tracer",
    );
  }

  public dispose(): void {
    opentelemetry.trace.disable();
    this._provider?.shutdown().catch((e) => {
      logger.error("Failed to shutdown OpenTelemetry", e);
    });
  }

  public get isOtlpEnabled(): boolean {
    return Boolean(this.otlpExporter);
  }

  public get tracer(): Tracer {
    return this._tracer;
  }

  public get provider(): WebTracerProvider {
    return this._provider;
  }
}
