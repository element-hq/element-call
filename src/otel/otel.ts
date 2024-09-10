/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import opentelemetry, { Tracer } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { logger } from "matrix-js-sdk/src/logger";

import { PosthogSpanProcessor } from "../analytics/PosthogSpanProcessor";
import { Config } from "../config/Config";
import { RageshakeSpanProcessor } from "../analytics/RageshakeSpanProcessor";

const SERVICE_NAME = "element-call";

let sharedInstance: ElementCallOpenTelemetry;

export class ElementCallOpenTelemetry {
  private _provider: WebTracerProvider;
  private _tracer: Tracer;
  private otlpExporter?: OTLPTraceExporter;
  public readonly rageshakeProcessor?: RageshakeSpanProcessor;

  public static globalInit(): void {
    const config = Config.get();
    // we always enable opentelemetry in general. We only enable the OTLP
    // collector if a URL is defined (and in future if another setting is defined)
    // Posthog reporting is enabled or disabled
    // within the posthog code.
    const shouldEnableOtlp = Boolean(config.opentelemetry?.collector_url);

    if (!sharedInstance || sharedInstance.isOtlpEnabled !== shouldEnableOtlp) {
      logger.info("(Re)starting OpenTelemetry debug reporting");
      sharedInstance?.dispose();

      sharedInstance = new ElementCallOpenTelemetry(
        config.opentelemetry?.collector_url,
        config.rageshake?.submit_url,
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
    // This is how we can make Jaeger show a reasonable service in the dropdown on the left.
    const providerConfig = {
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
      }),
    };
    this._provider = new WebTracerProvider(providerConfig);

    if (collectorUrl) {
      logger.info("Enabling OTLP collector with URL " + collectorUrl);
      this.otlpExporter = new OTLPTraceExporter({
        url: collectorUrl,
      });
      this._provider.addSpanProcessor(
        new SimpleSpanProcessor(this.otlpExporter),
      );
    } else {
      logger.info("OTLP collector disabled");
    }

    if (rageshakeUrl) {
      this.rageshakeProcessor = new RageshakeSpanProcessor();
      this._provider.addSpanProcessor(this.rageshakeProcessor);
    }

    this._provider.addSpanProcessor(new PosthogSpanProcessor());
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
