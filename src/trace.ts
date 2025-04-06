/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-06 12:59:31
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { IOCContainer } from "koatty_container";
import { AppEvent, Koatty, KoattyContext, KoattyNext } from "koatty_core";
import { Helper } from "koatty_lib";
import { Span } from '@opentelemetry/api';
import { SpanManager } from './spanManager';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DefaultLogger as logger } from "koatty_logger";
import { extensionOptions } from "./catcher";
import { HandlerFactory } from './handler/factory';
import { ProtocolType } from './handler/base';
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { TraceOptions } from "./itrace";
import { initSDK, startTracer } from "./opentelemetry/sdk";
import { TopologyAnalyzer } from "./opentelemetry/topology";

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
  EnableTopology: false,
  AsyncHooks: false,
  OtlpEndpoint: "http://localhost:4318/v1/traces",
  OtlpHeaders: {},
  OtlpTimeout: 10000,
  SpanTimeout: 30000,
  SamplingRate: 1.0,
  BatchMaxQueueSize: 2048,
  BatchMaxExportSize: 512,
  BatchDelayMillis: 5000,
  BatchExportTimeout: 30000
};

/**
 * Trace middleware for Koatty framework that provides request tracing, topology analysis,
 * and request lifecycle management capabilities.
 * 
 * @param {TraceOptions} options - Configuration options for the trace middleware
 * @param {Koatty} app - Koatty application instance
 * @returns {Function} Middleware function that handles request tracing and lifecycle
 * 
 * Features:
 * - Request tracing with OpenTelemetry
 * - Request ID generation and propagation
 * - Service topology analysis
 * - Request lifecycle management
 * - Server shutdown handling
 * - Async hooks support for request context
 * 
 * @export
 */
export function Trace(options: TraceOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };
  const spanManager = new SpanManager(options);
  const geh: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");

  let tracer: any;
  if (options.EnableTrace) {
    tracer = app.getMetaData("tracer")[0] || initSDK(app, options);
    app.once(AppEvent.appStart, async () => {
      await startTracer(tracer, app, options);
    });
  }

  return async (ctx: KoattyContext, next: KoattyNext) => {
    Helper.define(ctx, 'startTime', Date.now());

    // Handle server shutdown case
    if (app?.server?.status === 503) {
      ctx.status = 503;
      ctx.set('Connection', 'close');
      ctx.body = 'Server is in the process of shutting down';
      return;
    }

    // Generate or get request ID
    const requestId = getRequestId(ctx, options);
    Helper.define(ctx, 'requestId', requestId);

    // Create span if tracing is enabled
    let span: Span | undefined;
    if (options.EnableTrace && tracer) {
      const serviceName = app.name || "unknownKoattyProject";
      span = spanManager.createSpan(tracer, ctx, serviceName);
      if (ctx.setMetaData) ctx.setMetaData("tracer_span", span);
    }

    // Record topology if enabled
    if (options.EnableTopology) {
      const topology = TopologyAnalyzer.getInstance();
      const serviceName = Array.isArray(ctx.headers['service'])
        ? ctx.headers['service'][0]
        : ctx.headers['service'] || 'unknown';
      topology.recordServiceDependency(app.name, serviceName);
    }

    const ext = {
      debug: app.appDebug,
      timeout: options.Timeout,
      encoding: options.Encoding,
      requestId,
      terminated: false,
      span,
      globalErrorHandler: geh,
    };

    // Handle async hooks if enabled
    if (options.AsyncHooks && (ctx.req || ctx.res)) {
      const asyncResource = createAsyncResource();
      return asyncLocalStorage.run(requestId, () => {
        if (ctx.req) wrapEmitter(ctx.req, asyncResource);
        if (ctx.res) wrapEmitter(ctx.res, asyncResource);
        return handleRequest(ctx, next, options, ext, spanManager);
      });
    }

    return handleRequest(ctx, next, options, ext, spanManager);
  };
}

/**
 * Get request id from context based on protocol and options.
 * For grpc protocol, get from metadata or request body.
 * For other protocols, get from headers or query parameters.
 * If no request id found, generate a new trace id.
 * 
 * @param {KoattyContext} ctx - Koatty context object
 * @param {TraceOptions} options - Trace configuration options
 * @returns {string} Request ID or generated trace ID
 */
function getRequestId(ctx: KoattyContext, options: TraceOptions): string {
  let requestId = '';
  switch (ctx.protocol) {
    case "grpc":
      const request: any = ctx?.getMetaData("_body")[0] || {};
      requestId = ctx?.getMetaData(<string>options.RequestIdName) ||
        request[<string>options.RequestIdName] || '';
      break;
    default:
      if (options.RequestIdHeaderName) {
        const headerValue = ctx.headers?.[options.RequestIdHeaderName.toLowerCase()] ||
          ctx.query?.[options.RequestIdName] || '';
        requestId = Helper.isArray(headerValue) ? headerValue.join(".") : headerValue;
      }
  }
  return requestId || getTraceId(options);
}

/**
 * Handle HTTP request with tracing and metrics reporting
 * 
 * @param ctx - Koatty context object
 * @param next - Next middleware function
 * @param options - Trace configuration options
 * @param ext - Extension options containing span information
 * @param spanManager - Manager for handling trace spans
 * @returns Promise with the request handling result
 * 
 * @description
 * Wraps request handling with tracing functionality:
 * - Measures request duration
 * - Reports metrics if configured
 * - Manages span lifecycle
 * - Handles request response
 */
async function handleRequest(
  ctx: KoattyContext,
  next: KoattyNext,
  options: TraceOptions,
  ext: extensionOptions,
  spanManager: SpanManager
) {
  const startTime = performance.now();
  try {
    const result = await respWarper(ctx, next, options, ext);
    
    if (options.metricsReporter && ext.span) {
      options.metricsReporter({
        duration: performance.now() - startTime,
        status: ctx.status || 200,
        path: ctx.path,
        attributes: {}
      });
    }
    
    return result;
  } finally {
    if (ext.span) {
      spanManager.endSpan(ext.span);
    }
  }
}

/**
 * Generate a trace ID using the provided factory function or UUID.
 * 
 * @param {TraceOptions} [options] - Optional configuration options
 * @param {Function} [options.IdFactory] - Custom function to generate trace ID
 * @returns {string} The generated trace ID
 */
function getTraceId(options?: TraceOptions) {
  return Helper.isFunction(options?.IdFactory) ? options.IdFactory() : randomUUID();
}

async function respWarper(
  ctx: KoattyContext,
  next: KoattyNext,
  options: TraceOptions,
  ext: extensionOptions
) {
  if (options.RequestIdName && ctx.setMetaData) {
    ctx.setMetaData(options.RequestIdName, ctx.requestId);
  }

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

  const handler = HandlerFactory.getHandler(protocol as ProtocolType);
  return handler.handle(ctx, next, ext);
}
