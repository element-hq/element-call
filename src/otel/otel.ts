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
import opentelemetry from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import { PosthogSpanExporter } from "../analytics/OtelPosthogExporter";

const SERVICE_NAME = "element-call";

const otlpExporter = new OTLPTraceExporter();
const consoleExporter = new ConsoleSpanExporter();
const posthogExporter = new PosthogSpanExporter();

// This is how we can make Jaeger show a reaonsable service in the dropdown on the left.
const providerConfig = {
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  }),
};
export const provider = new WebTracerProvider(providerConfig);

provider.addSpanProcessor(new SimpleSpanProcessor(otlpExporter));
provider.addSpanProcessor(new SimpleSpanProcessor(posthogExporter));
provider.addSpanProcessor(new SimpleSpanProcessor(consoleExporter));
opentelemetry.trace.setGlobalTracerProvider(provider);

// This is not the serviceName shown in jaeger
export const tracer = opentelemetry.trace.getTracer(
  "my-element-call-otl-tracer"
);
