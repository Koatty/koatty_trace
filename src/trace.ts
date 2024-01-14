/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2024-01-14 11:59:33
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { v4 as uuidv4 } from "uuid";
import { Helper } from "koatty_lib";
import { IOCContainer } from "koatty_container";
import { Koatty, KoattyContext, KoattyNext } from "koatty_core";
import { FORMAT_HTTP_HEADERS, Span, Tags, Tracer } from "opentracing";
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { httpHandler } from './handler/http';
import { gRPCHandler } from './handler/grpc';
import { wsHandler } from './handler/ws';
import { respond } from './respond';
import { Exception } from "koatty_exception";

/**
 * GetTraceId
 *
 * @export
 * @returns {*}  
 */
export function GetTraceId(options?: TraceOptions) {
  let rid;
  if (Helper.isFunction(options.IdFactory)) {
    rid = options?.IdFactory();
  }
  return rid || uuidv4();
}

/**
 * TraceOptions
 *
 * @export
 * @interface TraceOptions
 */
export interface TraceOptions {
  RequestIdHeaderName?: string;
  RequestIdName?: string;
  IdFactory?: Function;
  Timeout?: number;
  Encoding?: string;
  OpenTrace?: boolean;
  AsyncHooks?: boolean;
}

/** 
 * defaultOptions
 */
const defaultOptions = {
  RequestIdHeaderName: 'X-Request-Id',
  RequestIdName: "requestId",
  IdFactory: uuidv4,
  Timeout: 10000,
  Encoding: 'utf-8',
  OpenTrace: false,
  AsyncHooks: false,
};

/**
 * @description: 
 * @return {*}
 */
const respWapper = async <T extends Exception>(ctx: KoattyContext, next: KoattyNext, options: TraceOptions,
  terminated: boolean, requestId: string, globalErrorHandler: T, span?: Span) => {
  // metadata
  ctx.setMetaData(options.RequestIdName, requestId);
  const timeout = options.Timeout;
  const encoding = options.Encoding;
  const ext = {
    timeout,
    requestId,
    encoding,
    terminated,
    span,
    globalErrorHandler,
  }

  switch (ctx.protocol) {
    case "grpc":
      // allow bypassing koa
      ctx.respond = false;
      ctx.rpc.call.metadata.set(options.RequestIdName, requestId);
      await gRPCHandler(ctx, next, ext);
      break;
    case "ws":
    case "wss":
      // allow bypassing koa
      ctx.respond = false;
      ctx.set(options.RequestIdHeaderName, requestId);
      await wsHandler(ctx, next, ext);
      break
    default:
      // response header
      ctx.set(options.RequestIdHeaderName, requestId);
      await httpHandler(ctx, next, ext);
      break;
  }

  return respond(ctx);
}

/**
 * Trace middleware
 *
 * @param {TraceOptions} options
 * @param {Koatty} app
 * @returns {*}  {Koa.Middleware}
 */
export function Trace(options: TraceOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };

  // 
  let tracer: Tracer;
  if (options.OpenTrace) {
    tracer = app.getMetaData("tracer")[0];
    if (!tracer) {
      tracer = new Tracer();
    }
  }
  // global error handler class
  const globalErrorHandler: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");

  return async (ctx: KoattyContext, next: KoattyNext) => {
    // server terminated
    let terminated = false;
    if (app.server.status === 503) {
      ctx.status = 503;
      ctx.set('Connection', 'close');
      ctx.body = 'Server is in the process of shutting down';
      terminated = true;
    }
    // 
    let requestId = '';
    if (ctx.protocol === "grpc") {
      const request: any = ctx.getMetaData("_body")[0] || {};
      requestId = `${ctx.getMetaData(options.RequestIdName)[0]}` || <string>request[options.RequestIdName];
    } else {
      const requestIdHeaderName = options.RequestIdHeaderName.toLowerCase();
      requestId = <string>ctx.headers[requestIdHeaderName] || <string>ctx.query[options.RequestIdName];
    }
    requestId = requestId || GetTraceId(options);
    let span: Span;
    // opten trace
    if (options.OpenTrace) {
      const serviceName = app.name || "unknownKoattyProject";
      const wireCtx = tracer.extract(FORMAT_HTTP_HEADERS, ctx.req.headers);
      if (wireCtx != null) {
        span = tracer.startSpan(serviceName, { childOf: wireCtx });
      } else {
        span = tracer.startSpan(serviceName);
      }
      span.addTags({ requestId });
      ctx.setMetaData("tracer_span", span);
    }
    // open async hooks
    if (options.AsyncHooks) {
      return asyncLocalStorage.run(requestId, () => {
        const asyncResource = createAsyncResource();
        wrapEmitter(ctx.req, asyncResource);
        wrapEmitter(ctx.res, asyncResource);
        return respWapper(ctx, next, options, terminated, requestId, globalErrorHandler, span);
      });
    }
    return respWapper(ctx, next, options, terminated, requestId, globalErrorHandler, span);
  }
}