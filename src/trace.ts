/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2023-12-14 22:49:54
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { FORMAT_HTTP_HEADERS, Span, Tags, Tracer } from "opentracing";
import { v4 as uuidv4 } from "uuid";
import { Koatty, KoattyContext, KoattyNext } from "koatty_core";
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { httpHandler } from './handler/http';
import { gRPCHandler } from './handler/grpc';
import { wsHandler } from './handler/ws';
import { respond } from './respond';
import { Helper } from "koatty_lib";

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
  IdFactory?: any;
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
    const respWapper = async (requestId: string, span?: Span) => {
      // metadata
      ctx.setMetaData(options.RequestIdName, requestId);
      const timeout = options.Timeout;
      const encoding = options.Encoding;
      // 
      if (ctx.protocol === "grpc") {
        // allow bypassing koa
        ctx.respond = false;
        ctx.rpc.call.metadata.set(options.RequestIdName, requestId);
        await gRPCHandler(ctx, next, { timeout, requestId, encoding, terminated, span });
      } else if (ctx.protocol === "ws" || ctx.protocol === "wss") {
        // allow bypassing koa
        ctx.respond = false;
        ctx.set(options.RequestIdHeaderName, requestId);
        await wsHandler(ctx, next, { timeout, requestId, encoding, terminated, span });
      } else {
        // response header
        ctx.set(options.RequestIdHeaderName, requestId);
        await httpHandler(ctx, next, { timeout, requestId, encoding, terminated, span });
      }
      return respond(ctx);
    }

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
    if (options.AsyncHooks) {
      return asyncLocalStorage.run(requestId, () => {
        const asyncResource = createAsyncResource();
        wrapEmitter(ctx.req, asyncResource);
        wrapEmitter(ctx.res, asyncResource);
        return respWapper(requestId, span);
      });
    }
    return respWapper(requestId);
  }
}