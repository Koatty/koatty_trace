/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2024-11-11 11:36:33
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { IOCContainer } from "koatty_container";
import { Koatty, KoattyContext, KoattyNext } from "koatty_core";
import { Helper } from "koatty_lib";
import { context, trace } from '@opentelemetry/api';
import { defaultTextMapGetter, defaultTextMapSetter } from '@opentelemetry/api';
import { v4 as uuidv4 } from "uuid";
import { extensionOptions } from "./catcher";
import { gRPCHandler } from './handler/grpc';
import { httpHandler } from './handler/http';
import { wsHandler } from './handler/ws';
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { initOpenTelemetry, startTracer } from "./opentelemetry";
import { TraceOptions } from "./itrace";
import { W3CTraceContextPropagator } from "@opentelemetry/core";


/** 
 * defaultOptions
 */
const defaultOptions = {
  RequestIdHeaderName: 'X-Request-Id',
  RequestIdName: "requestId",
  IdFactory: uuidv4,
  Timeout: 10000,
  Encoding: 'utf-8',
  EnableTrace: false,
  AsyncHooks: false,
  OtlpEndpoint: "http://localhost:4318/v1/traces",
};


/**
 * Trace middleware
 *
 * @param {TraceOptions} options
 * @param {Koatty} app
 * @returns {*}  {Koa.Middleware}
 */
export  async function Trace(options: TraceOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };

  // 
  let tracer: any;
  if (options.EnableTrace) {
    tracer = app.getMetaData("tracer")[0];
    if (!tracer) {
      tracer = initOpenTelemetry(app, options)
      await startTracer(tracer, app, options);
    }
  }
  // global error handler class
  const geh: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");

  return async (ctx: KoattyContext, next: KoattyNext) => {
    // set ctx start time
    Helper.define(ctx, 'startTime', Date.now());

    // server terminated
    let terminated = false;
    if (app?.server?.status === 503) {
      ctx.status = 503;
      ctx.set('Connection', 'close');
      ctx.body = 'Server is in the process of shutting down';
      terminated = true;
    }
    // 
    let requestId = '';
    switch (ctx.protocol) {
      case "grpc":
        // originalPath
        Helper.define(ctx, 'originalPath', ctx.getMetaData("originalPath")[0]);
        // http version
        Helper.define(ctx, 'version', "2.0");
        const request: any = ctx.getMetaData("_body")[0] || {};
        requestId = `${ctx.getMetaData(<string>options.RequestIdName)[0]}` ||
          `${request[<string>options.RequestIdName] || ''}`;
        break;
      default:
        // originalPath
        Helper.define(ctx, 'originalPath', ctx.path);
        // http version
        Helper.define(ctx, 'version', ctx.req.httpVersion);
        if (options.RequestIdHeaderName) {
          const requestIdHeaderName = options.RequestIdHeaderName.toLowerCase();
          const headerRequestIdValue = ctx.headers[requestIdHeaderName];
          if (Helper.isArray(headerRequestIdValue)) {
            requestId = headerRequestIdValue.join(".");
          } else {
            requestId = headerRequestIdValue;
          }
          requestId = requestId ||
            `${ctx.query[<string>options.RequestIdName] || ''}`;
        }
        break;
    }

    requestId = requestId || getTraceId(options);
    Helper.define(ctx, 'requestId', requestId);
    let span;
    // opten trace
    if (options.EnableTrace) {
      const serviceName = app.name || "unknownKoattyProject";
      // 使用标准W3C Trace Context传播
      const propagator = new W3CTraceContextPropagator();
      const carrier: { [key: string]: string } = {};

      // 从请求头中提取上下文
      const incomingContext = propagator.extract(
        context.active(),
        ctx.headers,
        defaultTextMapGetter
      );

      // 创建新Span并关联到上下文
      span = tracer.startSpan(serviceName, {}, incomingContext);

      // 注入响应头
      context.with(trace.setSpan(incomingContext, span), () => {
        propagator.inject(
          context.active(),
          carrier,
          defaultTextMapSetter
        );

        // 设置标准headers到响应
        Object.entries(carrier).forEach(([key, value]) => {
          ctx.set(key, value);
        });
      });

      // 添加标准属性
      span.setAttribute("http.request_id", requestId);
      span.setAttribute("http.method", ctx.method);
      span.setAttribute("http.route", ctx.path);
      ctx.setMetaData("tracer_span", span);
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
    // open async hooks
    if (options.AsyncHooks) {
      return asyncLocalStorage.run(requestId, () => {
        const asyncResource = createAsyncResource();
        wrapEmitter(ctx.req, asyncResource);
        wrapEmitter(ctx.res, asyncResource);
        return respWapper(ctx, next, options, ext);
      });
    }
    try {
      return await respWapper(ctx, next, options, ext);
    } finally {
      if (span) {
        span.end(); // 确保Span正确结束
      }
    }
  }
}


/**
 * getTraceId
 *
 * @export
 * @returns {*}  
 */
function getTraceId(options?: TraceOptions) {
  let rid;
  if (Helper.isFunction(options?.IdFactory)) {
    rid = options?.IdFactory();
  }
  return rid || uuidv4();
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
async function respWapper(ctx: KoattyContext, next: KoattyNext,
  options: TraceOptions, ext: extensionOptions) {
  // metadata
  if (options.RequestIdName) ctx.setMetaData(options.RequestIdName, ctx.requestId);
  // protocol handler
  // 支持多协议处理（grpc/ws/wss/http/https/graphql）
  switch (ctx.protocol.toLowerCase()) {
    case "grpc":
      // allow bypassing koa
      ctx.respond = false;
      if (ctx.rpc && options.RequestIdName)
        ctx.rpc.call.metadata.set(options.RequestIdName, ctx.requestId);
      return gRPCHandler(ctx, next, ext);
    case "ws":
    case "wss":
      // allow bypassing koa
      ctx.respond = false;
      if (options.RequestIdHeaderName)
        ctx.set(options.RequestIdHeaderName, ctx.requestId);
      return wsHandler(ctx, next, ext);
    default:
      // response header
      if (options.RequestIdHeaderName)
        ctx.set(options.RequestIdHeaderName, ctx.requestId);
      return httpHandler(ctx, next, ext);
  }
}
