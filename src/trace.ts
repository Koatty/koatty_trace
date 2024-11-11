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
import { FORMAT_HTTP_HEADERS, Tracer } from "opentracing";
import { v4 as uuidv4 } from "uuid";
import { extensionOptions } from "./catcher";
import { gRPCHandler } from './handler/grpc';
import { httpHandler } from './handler/http';
import { wsHandler } from './handler/ws';
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';

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
const respWapper = async (ctx: KoattyContext, next: KoattyNext,
  options: TraceOptions, ext: extensionOptions) => {
  // metadata
  if (options.RequestIdName) ctx.setMetaData(options.RequestIdName, ctx.requestId);
  // protocol handler
  switch (ctx.protocol) {
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
  if (Helper.isFunction(options?.IdFactory)) {
    rid = options?.IdFactory();
  }
  return rid || uuidv4();
}