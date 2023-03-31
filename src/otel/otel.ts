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
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import opentelemetry, { Tracer } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { logger } from "@sentry/utils";

import { PosthogSpanExporter } from "../analytics/OtelPosthogExporter";
import { Anonymity } from "../analytics/PosthogAnalytics";
import { Config } from "../config/Config";
import { getSetting, settingsBus } from "../settings/useSetting";

const SERVICE_NAME = "element-call";

let sharedInstance: ElementCallOpenTelemetry;

export class ElementCallOpenTelemetry {
  private _provider: WebTracerProvider;
  private _tracer: Tracer;
  private _anonymity: Anonymity;

  static globalInit(): void {
    settingsBus.on("opt-in-analytics", recheckOTelEnabledStatus);
    recheckOTelEnabledStatus(getSetting("opt-in-analytics", false));
  }

  static get instance(): ElementCallOpenTelemetry {
    return sharedInstance;
  }

  constructor(collectorUrl: string) {
    const otlpExporter = new OTLPTraceExporter({
      url: collectorUrl,
    });
    const consoleExporter = new ConsoleSpanExporter();
    const posthogExporter = new PosthogSpanExporter();

    // This is how we can make Jaeger show a reaonsable service in the dropdown on the left.
    const providerConfig = {
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
      }),
    };
    this._provider = new WebTracerProvider(providerConfig);

    this._provider.addSpanProcessor(new SimpleSpanProcessor(otlpExporter));
    this._provider.addSpanProcessor(new SimpleSpanProcessor(posthogExporter));
    this._provider.addSpanProcessor(new SimpleSpanProcessor(consoleExporter));
    opentelemetry.trace.setGlobalTracerProvider(this._provider);

    this._tracer = opentelemetry.trace.getTracer(
      // This is not the serviceName shown in jaeger
      "my-element-call-otl-tracer"
    );
  }

  public get tracer(): Tracer {
    return this._tracer;
  }

  public get provider(): WebTracerProvider {
    return this._provider;
  }

  public get anonymity(): Anonymity {
    return this._anonymity;
  }
}

function recheckOTelEnabledStatus(optInAnalayticsEnabled: boolean): void {
  const shouldEnable =
    optInAnalayticsEnabled &&
    Boolean(Config.get().opentelemetry?.collector_url);

  if (shouldEnable && !sharedInstance) {
    logger.info("Starting OpenTelemetry debug reporting");
    sharedInstance = new ElementCallOpenTelemetry(
      Config.get().opentelemetry?.collector_url
    );
  } else if (!shouldEnable && sharedInstance) {
    logger.info("Stopping OpenTelemetry debug reporting");
    sharedInstance = undefined;
  }
}
