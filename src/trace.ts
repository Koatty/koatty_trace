/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2023-07-31 21:14:46
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as Koa from 'koa';
import { FORMAT_HTTP_HEADERS, Span, Tags, Tracer } from "opentracing";
import { v4 as uuidv4 } from "uuid";
import { Koatty, KoattyContext } from "koatty_core";
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { httpHandler } from './handler/http';
import { gRPCHandler } from './handler/grpc';
import { wsHandler } from './handler/ws';
import { respond } from './respond';

/**
 * GetTraceId
 *
 * @export
 * @returns {*}  
 */
export function GetTraceId(options?: TraceOptions) {
  const rid = options?.IdFactory()
  return rid || uuidv4();
}

/**
 * TraceOptions
 *
 * @export
 * @interface TraceOptions
 */
export interface TraceOptions {
  HeaderName: string;
  IdFactory: any;
}

/** 
 * defaultOptions
 */
const defaultOptions = {
  HeaderName: 'X-Request-Id',
  IdFactory: uuidv4,
};

/**
 * Trace middleware
 *
 * @param {TraceOptions} options
 * @param {Koatty} app
 * @returns {*}  {Koa.Middleware}
 */
export function Trace(options: TraceOptions, app: Koatty): Koa.Middleware {
  options = { ...defaultOptions, ...options };
  const requestIdName = options.HeaderName.toLowerCase();
  const timeout = (app.config('http_timeout') || 10) * 1000;
  const encoding = app.config('encoding') || 'utf-8';
  const openTrace = app.config("open_trace") || false;
  const serviceName = app.name || "unknownKoattyProject";

  // 
  let tracer: Tracer;
  if (openTrace) {
    tracer = app.getMetaData("tracer")[0];
    if (!tracer) {
      tracer = new Tracer();
    }
  }

  return async (ctx: KoattyContext, next: Koa.Next) => {
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
      ctx.setMetaData(options.HeaderName, requestId);

      if (ctx.protocol === "grpc") {
        // allow bypassing koa
        ctx.respond = false;
        ctx.rpc.call.metadata.set(options.HeaderName, requestId);
        await gRPCHandler(ctx, next, { timeout, requestId, encoding, terminated, span });
      } else if (ctx.protocol === "ws" || ctx.protocol === "wss") {
        // allow bypassing koa
        ctx.respond = false;
        ctx.set(options.HeaderName, requestId);
        await wsHandler(ctx, next, { timeout, requestId, encoding, terminated, span });
      } else {
        // response header
        ctx.set(options.HeaderName, requestId);
        await httpHandler(ctx, next, { timeout, requestId, encoding, terminated, span });
      }
      return respond(ctx);
    }

    let requestId = '';

    if (ctx.protocol === "grpc") {
      const request: any = ctx.getMetaData("_body")[0] || {};
      requestId = `${ctx.getMetaData(requestIdName)[0]}` || <string>request[requestIdName];
    } else {
      requestId = <string>ctx.headers[requestIdName] || <string>ctx.query[requestIdName];
    }
    requestId = requestId || GetTraceId(options);
    if (openTrace) {
      let span: Span;
      if (tracer) {
        const wireCtx = tracer.extract(FORMAT_HTTP_HEADERS, ctx.req.headers);
        if (wireCtx != null) {
          span = tracer.startSpan(serviceName, { childOf: wireCtx });
        } else {
          span = tracer.startSpan(serviceName);
        }
        span?.addTags({ requestId });
      }

      ctx.setMetaData("tracer_span", span);

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

