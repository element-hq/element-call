/* document-load.ts|js file - the code is the same for both the languages */
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { ZipkinExporter } from "@opentelemetry/exporter-zipkin";
// import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import opentelemetry from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import { PosthogSpanExporter } from "../analytics/OtelPosthogExporter";

const SERVICE_NAME = "element-call";
// It is really important to set the correct content type here. Otherwise the Jaeger will crash and not accept the zipkin event
// Additionally jaeger needs to be started with zipkin on port 9411
const optionsZipkin = {
  // url: `http://localhost:9411/api/v2/spans`,
  // serviceName: SERVICE_NAME,
  headers: {
    "Content-Type": "application/json",
  },
};
// We DO NOT use the OTLPTraceExporter. This somehow does not hit the right endpoint and also causes issues with CORS
const collectorOptions = {
  // url: `http://localhost:14268/api/v2/spans`, // url is optional and can be omitted - default is http://localhost:4318/v1/traces
  headers: { "Access-Control-Allow-Origin": "*" }, // an optional object containing custom headers to be sent with each request
  concurrencyLimit: 10, // an optional limit on pending requests
};
const otlpExporter = new OTLPTraceExporter(collectorOptions);
const consoleExporter = new ConsoleSpanExporter();
// The zipkin exporter is the actual exporter we need for web based otel applications
const zipkin = new ZipkinExporter(optionsZipkin);
const posthogExporter = new PosthogSpanExporter();

// This is how we can make Jaeger show a reaonsable service in the dropdown on the left.
const providerConfig = {
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  }),
};
const provider = new WebTracerProvider(providerConfig);

provider.addSpanProcessor(new SimpleSpanProcessor(otlpExporter));
// We can add as many processors and exporters as we want to. The zipkin one is the important one for Jaeger
provider.addSpanProcessor(new SimpleSpanProcessor(posthogExporter));
provider.addSpanProcessor(new SimpleSpanProcessor(consoleExporter));
provider.addSpanProcessor(new SimpleSpanProcessor(zipkin));

// This is unecassary i think...
provider.register({
  // Changing default contextManager to use ZoneContextManager - supports asynchronous operations - optional
  contextManager: new ZoneContextManager(),
});

// Registering instrumentations (These are automated span collectors for the Http request during page loading, switching)
registerInstrumentations({
  instrumentations: [
    // new DocumentLoadInstrumentation(),
    // new UserInteractionInstrumentation(),
  ],
});

// This is not the serviceName shown in jaeger
export const tracer = opentelemetry.trace.getTracer(
  "my-element-call-otl-tracer"
);

class CallTracer {
  // We create one tracer class for each main context.
  // Even if differnt tracer classes overlap in time space, we might want to visulaize them seperately.
  // The Call Tracer should only contain spans/events that are relevant to understand the procedure of the individual candidates.
  // Another Tracer Class (for example a ConnectionTracer) can contain a very granular list of all steps to connect to a call.

  private callSpan;
  private callContext;
  private muteSpan?;
  public startCall(callId: string) {
    // The main context will be set when initiating the main/parent span.

    // Create an initial context with the callId param
    const callIdContext = opentelemetry.context
      .active()
      .setValue(Symbol("callId"), callId);

    // Create the main span that tracks the whole call
    this.callSpan = tracer.startSpan("otel_callSpan", undefined, callIdContext);

    // Create a new call based on the callIdContext. This context also has a span assigned to it.
    // Other spans can use this context to extract the parent span.
    // (When passing this context to startSpan the started span will use the span set in the context (in this case the callSpan) as the parent)
    this.callContext = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      this.callSpan
    );

    // Here we start a very short span. This is a hack to trigger the posthog exporter.
    // Only ended spans are processed by the exporter.
    // We want the exporter to know that a call has started
    const startCallSpan = tracer.startSpan(
      "otel_startCallSpan",
      undefined,
      this.callContext
    );
    startCallSpan.end();
  }
  public muteMic(muteState: boolean) {
    if (muteState) {
      this.muteSpan = tracer.startSpan(
        "otel_muteSpan",
        undefined,
        this.callContext
      );
    } else if (this.muteSpan) {
      this.muteSpan.end();
      this.muteSpan = null;
    }
  }
  public endCall() {
    this.callSpan?.end();
  }
}

export const callTracer = new CallTracer();
