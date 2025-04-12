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
import { SpanManager } from '../opentelemetry/spanManager';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DefaultLogger as logger } from "koatty_logger";
import { HandlerFactory } from '../handler/factory';
import { ProtocolType } from '../handler/base';
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { extensionOptions, TraceOptions } from "./itrace";
import { initSDK, startTracer } from "../opentelemetry/sdk";
import { TopologyAnalyzer } from "../opentelemetry/topology";

/** 
 * defaultOptions
 */
const defaultOptions = {
  timeout: 10000, // response timeout in milliseconds
  requestIdHeaderName: 'X-Request-Id',
  requestIdName: "requestId",
  idFactory: randomUUID,
  encoding: 'utf-8',
  enableTrace: false,
  enableTopology: false,
  asyncHooks: false,
  otlpEndpoint: "http://localhost:4318/v1/traces",
  otlpHeaders: {},
  otlpTimeout: 10000,
  spanTimeout: 30000,
  samplingRate: 1.0,
  batchMaxQueueSize: 2048,
  batchMaxExportSize: 512,
  batchDelayMillis: 5000,
  batchExportTimeout: 30000
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
  if (options.enableTrace) {
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
    if (options.enableTrace && tracer) {
      const serviceName = app.name || "unknownKoattyProject";
      span = spanManager.createSpan(tracer, ctx, serviceName);
      if (ctx.setMetaData) ctx.setMetaData("tracer_span", span);
    }

    // Record topology if enabled
    if (options.enableTopology) {
      const topology = TopologyAnalyzer.getInstance();
      const serviceName = Array.isArray(ctx.headers['service'])
        ? ctx.headers['service'][0]
        : ctx.headers['service'] || 'unknown';
      topology.recordServiceDependency(app.name, serviceName);
    }

    const ext = {
      debug: app.appDebug,
      timeout: options.timeout,
      encoding: options.encoding,
      requestId,
      terminated: false,
      span,
      spanManager,
      globalErrorHandler: geh,
    };

    // Handle async hooks if enabled
    if (options.asyncHooks && (ctx.req || ctx.res)) {
      const asyncResource = createAsyncResource();
      return asyncLocalStorage.run(requestId, () => {
        if (ctx.req) wrapEmitter(ctx.req, asyncResource);
        if (ctx.res) wrapEmitter(ctx.res, asyncResource);
        return handleRequest(ctx, next, options, ext);
      });
    }

    return handleRequest(ctx, next, options, ext);
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
      requestId = ctx?.getMetaData(<string>options.requestIdName) ||
        request[<string>options.requestIdName] || '';
      break;
    default:
      if (options.requestIdHeaderName) {
        const headerValue = ctx.headers?.[options.requestIdHeaderName.toLowerCase()] ||
          ctx.query?.[options.requestIdName] || '';
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
  ext: extensionOptions
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
      ext.spanManager.endSpan(ext.span);
    }
  }
}

/**
 * Generate a trace ID using the provided factory function or UUID.
 * 
 * @param {TraceOptions} [options] - Optional configuration options
 * @param {Function} [options.idFactory] - Custom function to generate trace ID
 * @returns {string} The generated trace ID
 */
function getTraceId(options?: TraceOptions) {
  return Helper.isFunction(options?.idFactory) ? options.idFactory() : randomUUID();
}

async function respWarper(
  ctx: KoattyContext,
  next: KoattyNext,
  options: TraceOptions,
  ext: extensionOptions
) {
  if (options.requestIdName && ctx.setMetaData) {
    ctx.setMetaData(options.requestIdName, ctx.requestId);
  }

  const protocol = (ctx?.protocol || "http").toLowerCase();
  if (protocol === "grpc" || protocol === "ws" || protocol === "wss") {
    ctx.respond = false;
  }

  if (options.requestIdHeaderName) {
    ctx.set(options.requestIdHeaderName, ctx.requestId);
  }

  if (ctx.rpc?.call?.metadata && options.requestIdName) {
    ctx.rpc.call.metadata.set(options.requestIdName, ctx.requestId);
  }

  const handler = HandlerFactory.getHandler(protocol as ProtocolType);
  return handler.handle(ctx, next, ext);
}
