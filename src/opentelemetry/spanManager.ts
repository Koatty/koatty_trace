import { Span, context, trace } from '@opentelemetry/api';
import { defaultTextMapSetter } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as logger } from "koatty_logger";
import { TraceOptions } from "../itrace";

/**
 * Manages span lifecycle and operations
 */
export class SpanManager {
  private activeSpans = new Map<string, { span: Span, timer: NodeJS.Timeout }>();

  constructor(private options: TraceOptions) {}

  createSpan(tracer: any, ctx: KoattyContext, serviceName: string): Span | undefined {
    const shouldSample = Math.random() < (this.options.SamplingRate ?? 1.0);
    if (!shouldSample) return undefined;

    const propagator = new W3CTraceContextPropagator();
    const span = tracer.startSpan(serviceName);
    this.setupSpanTimeout(span);
    this.injectContext(span, ctx);
    this.setBasicAttributes(span, ctx);

    return span;
  }

  private setupSpanTimeout(span: Span) {
    if (!this.options.SpanTimeout) return;

    const traceId = span.spanContext().traceId;
    const timer = setTimeout(() => {
      const entry = this.activeSpans.get(traceId);
      if (entry) {
        logger.warn(`Span timeout after ${this.options.SpanTimeout}ms`, {
          traceId
        });
        entry.span.end();
        this.activeSpans.delete(traceId);
      }
    }, this.options.SpanTimeout);

    this.activeSpans.set(traceId, { span, timer });
  }

  private injectContext(span: Span, ctx: KoattyContext) {
    const propagator = new W3CTraceContextPropagator();
    const carrier: { [key: string]: string } = {};

    context.with(trace.setSpan(context.active(), span), () => {
      propagator.inject(context.active(), carrier, defaultTextMapSetter);
      Object.entries(carrier).forEach(([key, value]) => {
        ctx.set(key, value);
      });
    });
  }

  private setBasicAttributes(span: Span, ctx: KoattyContext) {
    span.setAttribute("http.request_id", ctx.requestId);
    span.setAttribute("http.method", ctx.method);
    span.setAttribute("http.route", ctx.path);

    if (this.options.spanAttributes) {
      const customAttrs = this.options.spanAttributes(ctx);
      Object.entries(customAttrs).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }
  }

  endSpan(span: Span) {
    const traceId = span.spanContext().traceId;
    const entry = this.activeSpans.get(traceId);
    if (entry) {
      clearTimeout(entry.timer);
      this.activeSpans.delete(traceId);
    }
    span.end();
  }
}
