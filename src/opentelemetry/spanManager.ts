import { Span, context, trace, Tracer, SpanAttributes } from '@opentelemetry/api';
import { defaultTextMapSetter } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as logger } from "koatty_logger";
import { TraceOptions } from "../trace/itrace";

/**
 * Manages span lifecycle and operations
 */
export class SpanManager {
  private activeSpans = new Map<string, { span: Span, timer: NodeJS.Timeout }>();
  private span: Span | undefined;
  private readonly propagator: W3CTraceContextPropagator;
  private readonly options: NonNullable<TraceOptions['opentelemetryConf']>;

  constructor(options: TraceOptions) {
    this.propagator = new W3CTraceContextPropagator();
    this.options = {
      spanTimeout: 30000,
      samplingRate: 1.0,
      spanAttributes: undefined,
      ...options.opentelemetryConf
    };
  }

  createSpan(tracer: Tracer, ctx: KoattyContext, serviceName: string): Span | undefined {
    const shouldSample = Math.random() < this.options.samplingRate;
    if (!shouldSample) return undefined;

    if (!tracer.startSpan) {
      logger.error('Tracer does not have startSpan method');
      return undefined;
    }
    this.span = tracer.startSpan(serviceName);
    this.setupSpanTimeout();
    this.injectContext(ctx);
    this.setBasicAttributes(ctx);

    return this.span;
  }

  getSpan(): Span | undefined {
    return this.span;
  }

  setupSpanTimeout() {
    if (!this.options.spanTimeout || !this.span) return;

    const traceId = this.span.spanContext().traceId;
    const timer = setTimeout(() => {
      const entry = this.activeSpans.get(traceId);
      if (entry) {
        logger.warn(`Span timeout after ${this.options.spanTimeout}ms`, {
          traceId
        });
        entry.span.end();
        this.activeSpans.delete(traceId);
      }
    }, this.options.spanTimeout);

    this.activeSpans.set(traceId, { span: this.span, timer });
  }

  injectContext(ctx: KoattyContext) {
    if (!this.span) return;
    
    const carrier: { [key: string]: string } = {};
    context.with(trace.setSpan(context.active(), this.span), () => {
      this.propagator.inject(context.active(), carrier, defaultTextMapSetter);
      Object.entries(carrier).forEach(([key, value]) => {
        ctx.set(key, value);
      });
    });
  }

  setBasicAttributes(ctx: KoattyContext) {
    if (!this.span) return;
    
    this.span.setAttribute("http.request_id", ctx.requestId);
    this.span.setAttribute("http.method", ctx.method);
    this.span.setAttribute("http.route", ctx.path);

    if (this.options.spanAttributes) {
      const customAttrs = this.options.spanAttributes(ctx);
      Object.entries(customAttrs).forEach(([key, value]) => {
        this.span?.setAttribute(key, value);
      });
    }
  }

  setSpanAttributes(attributes: SpanAttributes) {
    if (!this.span) return;
    this.span.setAttributes(attributes);
    return this;
  }

  addSpanEvent(name: string, attributes?: SpanAttributes) {
    if (!this.span) return;
    this.span.addEvent(name, attributes);
  }

  endSpan() {
    try {
      if (!this.span) return;
      const traceId = this.span.spanContext().traceId;
      const entry = this.activeSpans.get(traceId);
      if (entry) {
        clearTimeout(entry.timer);
        this.activeSpans.delete(traceId);
      }
      this.span.end();
    } catch (error) {
      logger.error("SpanManager.endSpan error:", error);
    }
  }
}
