/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2024-01-16 08:03:53
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
 * @description: extensionOptions
 * @return {*}
 */
interface extensionOptions<T extends Exception> {
  timeout?: number,
  requestId?: string,
  encoding?: string,
  terminated?: boolean,
  span?: Span,
  globalErrorHandler?: T,
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
const respWapper = async <T extends Exception>(ctx: KoattyContext, next: KoattyNext,
  options: TraceOptions, ext: extensionOptions<T>) => {
  // metadata
  ctx.setMetaData(options.RequestIdName, ext.requestId);
  // protocol handler
  switch (ctx.protocol) {
    case "grpc":
      // allow bypassing koa
      ctx.respond = false;
      ctx.rpc.call.metadata.set(options.RequestIdName, ext.requestId);
      await gRPCHandler(ctx, next, ext);
      break;
    case "ws":
    case "wss":
      // allow bypassing koa
      ctx.respond = false;
      ctx.set(options.RequestIdHeaderName, ext.requestId);
      await wsHandler(ctx, next, ext);
      break
    default:
      // response header
      ctx.set(options.RequestIdHeaderName, ext.requestId);
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
  const geh: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");

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
    switch (ctx.protocol) {
      case "grpc":
        const request: any = ctx.getMetaData("_body")[0] || {};
        requestId = `${ctx.getMetaData(options.RequestIdName)[0]}` ||
          `${request[options.RequestIdName] || ''}`;
        break;
      default:
        const requestIdHeaderName = options.RequestIdHeaderName.toLowerCase();
        requestId = <string>ctx.headers[requestIdHeaderName] ||
          `${ctx.query[options.RequestIdName] || ''}`;
        break;
    }

    requestId = requestId || getTraceId(options);
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

    const ext = {
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
    return respWapper(ctx, next, options, ext);
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
  if (Helper.isFunction(options.IdFactory)) {
    rid = options?.IdFactory();
  }
  return rid || uuidv4();
}