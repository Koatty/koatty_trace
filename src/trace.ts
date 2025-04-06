/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-04 19:11:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { IOCContainer } from "koatty_container";
import { AppEvent, Koatty, KoattyContext, KoattyNext } from "koatty_core";
import { Helper } from "koatty_lib";
import { context, Span, trace } from '@opentelemetry/api';
import { defaultTextMapGetter, defaultTextMapSetter } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DefaultLogger as logger } from "koatty_logger";
import { extensionOptions } from "./catcher";
import { HandlerFactory } from './handler/factory';
import { ProtocolType } from './handler/base';
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { TraceOptions } from "./itrace";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { initSDK, startTracer } from "./opentelemetry/sdk";

/** 
 * defaultOptions
 */
const defaultOptions = {
  RequestIdHeaderName: 'X-Request-Id',
  RequestIdName: "requestId",
  IdFactory: randomUUID,
  Timeout: 10000,
  Encoding: 'utf-8',
  EnableTrace: false,
  AsyncHooks: false,
  OtlpEndpoint: "http://localhost:4318/v1/traces",
  OtlpHeaders: {},
  OtlpTimeout: 10000,
  SpanTimeout: 30000,
  SamplingRate: 1.0, // 默认采样率100%
  BatchMaxQueueSize: 2048,
  BatchMaxExportSize: 512,
  BatchDelayMillis: 5000,
  BatchExportTimeout: 30000
};

/**
 * Middleware function for request tracing and monitoring in Koatty framework.
 * Provides request ID generation, OpenTelemetry tracing, async hooks support,
 * and response handling.
 * 
 * @param options - Configuration options for tracing middleware
 * @param app - Koatty application instance
 * @returns Middleware function that handles request context and tracing
 * 
 * Features:
 * - Request ID generation and propagation
 * - OpenTelemetry integration for distributed tracing
 * - W3C Trace Context support
 * - Async hooks for request context tracking
 * - Server shutdown handling
 * - Response wrapping and error handling
 * 
 * @example
 * app.use(Trace({
 *   EnableTrace: true,
 *   RequestIdName: 'requestId'
 * }, app));
 */
export function Trace(options: TraceOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };

  // Span超时跟踪 (使用Map替代WeakMap以提高性能)
  const activeSpans = new Map<string, {span: Span, timer: NodeJS.Timeout}>();
  
  let tracer: any;
  if (options.EnableTrace) {
    tracer = app.getMetaData("tracer")[0];
    if (!tracer) {
      tracer = initSDK(app, options)
      app.once(AppEvent.appStart, async () => {
        await startTracer(tracer, app, options);
      });
    }
  }
  const geh: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");

  return async (ctx: KoattyContext, next: KoattyNext) => {
    Helper.define(ctx, 'startTime', Date.now());

    let terminated = false;
    if (app?.server?.status === 503) {
      ctx.status = 503;
      ctx.set('Connection', 'close');
      ctx.body = 'Server is in the process of shutting down';
      terminated = true;
    }
    
    let requestId = '', headerRequestIdValue;
    switch (ctx.protocol) {
      case "grpc":
        Helper.define(ctx, 'originalPath', ctx.getMetaData("originalPath")[0]);
        Helper.define(ctx, 'version', "2.0");
        const request: any = ctx?.getMetaData("_body")[0] || {};
        headerRequestIdValue = ctx?.getMetaData(<string>options.RequestIdName) ||
          request[<string>options.RequestIdName] || '';
        break;
      default:
        Helper.define(ctx, 'originalPath', ctx.path);
        Helper.define(ctx, 'version', ctx.req.httpVersion);
        if (options.RequestIdHeaderName) {
          const requestIdHeaderName = options.RequestIdHeaderName.toLowerCase();
          headerRequestIdValue = ctx.headers ? ctx.headers[requestIdHeaderName] :
            ctx.query?.[options.RequestIdName] || '';
          break;
        }
    }
    if (!headerRequestIdValue) {
      headerRequestIdValue = '';
    }
    if (Helper.isArray(headerRequestIdValue)) {
      requestId = headerRequestIdValue?.join(".");
    } else {
      requestId = headerRequestIdValue;
    }

    requestId = requestId || getTraceId(options);
    Helper.define(ctx, 'requestId', requestId);
    let span: Span;

    if (options.EnableTrace) {
      // 采样率检查
      const shouldSample = Math.random() < (options.SamplingRate ?? 1.0);
      const serviceName = app.name || "unknownKoattyProject";
      const propagator = new W3CTraceContextPropagator();
      const carrier: { [key: string]: string } = {};
      let incomingContext;

      if (shouldSample) {
        incomingContext = propagator.extract(
          context.active(),
          ctx.headers,
          defaultTextMapGetter
        );
        span = tracer.startSpan(serviceName, {}, incomingContext);
      } else {
        span = undefined;
      }
      
      // 设置Span超时定时器
      if (options.SpanTimeout && span) {
        const traceId = span.spanContext().traceId;
        const timer = setTimeout(() => {
          const entry = activeSpans.get(traceId);
          if (entry) {
            logger.warn(`Span timeout after ${options.SpanTimeout}ms`, {
              requestId,
              traceId
            });
            entry.span.end();
            activeSpans.delete(traceId);
          }
        }, options.SpanTimeout);
        activeSpans.set(traceId, {span, timer});
      }

      context.with(trace.setSpan(incomingContext, span), () => {
        propagator.inject(
          context.active(),
          carrier,
          defaultTextMapSetter
        );
        Object.entries(carrier).forEach(([key, value]) => {
          ctx.set(key, value);
        });
      });

      span.setAttribute("http.request_id", requestId);
      span.setAttribute("http.method", ctx.method);
      span.setAttribute("http.route", ctx.path);
      if (ctx.setMetaData) ctx?.setMetaData("tracer_span", span);
    }

    const ext = {
      debug: app.appDebug,
      timeout: options.Timeout,
      encoding: options.Encoding,
      requestId,
      terminated: terminated,
      span,
      globalErrorHandler: geh,
    }

    if (options.AsyncHooks && (ctx.req || ctx.res)) {
      const asyncResource = createAsyncResource();
      return asyncLocalStorage.run(requestId, () => {
        if (ctx.req) wrapEmitter(ctx.req, asyncResource);
        if (ctx.res) wrapEmitter(ctx.res, asyncResource);
        return respWarper(ctx, next, options, ext);
      });
    }
    try {
      return await respWarper(ctx, next, options, ext);
    } finally {
      if (span) {
        const traceId = span.spanContext().traceId;
        const entry = activeSpans.get(traceId);
        if (entry) {
          clearTimeout(entry.timer);
          activeSpans.delete(traceId);
        }
        span.end();
      }
    }
  }
}

function getTraceId(options?: TraceOptions) {
  let rid;
  if (Helper.isFunction(options?.IdFactory)) {
    rid = options?.IdFactory();
  }
  return rid || randomUUID();
}
/**
 * Wrapper function for handling different protocol responses with trace functionality.
 * Supports multiple protocols (gRPC/WS/WSS/HTTP/HTTPS/GraphQL) and sets request ID in metadata.
 * 
 * @param ctx - Koatty context object
 * @param next - Koatty next middleware function
 * @param options - Trace configuration options
 * @param ext - Extension options for trace handling
 * @returns Promise that resolves to the handler result based on protocol
 */
async function respWarper(ctx: KoattyContext, next: KoattyNext,
  options: TraceOptions, ext: extensionOptions) {
  if (options.RequestIdName && ctx.setMetaData) ctx?.setMetaData(options.RequestIdName, ctx.requestId);
  // protocol handler （grpc/ws/wss/http/https/graphql）
  // allow bypassing koa
  const protocol = (ctx?.protocol || "http").toLowerCase();
  if (protocol === "grpc" || protocol === "ws" || protocol === "wss") {
    ctx.respond = false;
  }

  if (options.RequestIdHeaderName) {
    ctx.set(options.RequestIdHeaderName, ctx.requestId);
  }
  if (ctx.rpc?.call?.metadata && options.RequestIdName) {
    ctx.rpc.call.metadata.set(options.RequestIdName, ctx.requestId);
  }

  const protocolType = protocol as ProtocolType;
  const handler = HandlerFactory.getHandler(protocolType);
  return handler.handle(ctx, next, ext);
}
