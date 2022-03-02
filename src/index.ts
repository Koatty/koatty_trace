/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2022-03-01 15:56:09
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as Koa from 'koa';
import { v4 as uuidv4 } from "uuid";
import { Koatty, KoattyContext } from "koatty_core";
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { httpHandler } from './handler/http';
import { grpcHandler } from './handler/grpc';
import { wsHandler } from './handler/ws';
import { respond } from './respond';

/**
 * GetTraceId
 *
 * @export
 * @returns {*}  
 */
export function GetTraceId() {
    return asyncLocalStorage.getStore();
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
    const headerName = options.HeaderName.toLowerCase();
    const timeout = (app.config('http_timeout') || 10) * 1000;
    const encoding = app.config('encoding') || 'utf-8';
    const openTrace = app.config("open_trace") || false;
    return async (ctx: KoattyContext, next: Koa.Next) => {
        // 
        const respWapper = async (currTraceId: string) => {
            // metadata
            ctx.setMetaData(options.HeaderName, currTraceId);
            if (ctx.protocol === "grpc") {
                // allow bypassing koa
                ctx.respond = false;
                ctx.rpc.call.metadata.set(options.HeaderName, currTraceId);
                await grpcHandler(ctx, next, { timeout, currTraceId, encoding });
            } else if (ctx.protocol === "ws" || ctx.protocol === "wss") {
                // allow bypassing koa
                ctx.respond = false;
                ctx.set(options.HeaderName, currTraceId);
                await wsHandler(ctx, next, { timeout, currTraceId, encoding });
            } else {
                // response header
                ctx.set(options.HeaderName, currTraceId);
                await httpHandler(ctx, next, { timeout, currTraceId, encoding });
            }
            return respond(ctx);
        }

        let currTraceId = '';
        if (openTrace) {
            if (ctx.protocol === "grpc") {
                const request: any = ctx.getMetaData("_body") || {};
                currTraceId = `${ctx.getMetaData(headerName)}` || <string>request[headerName];
            } else {
                currTraceId = <string>ctx.headers[headerName] || <string>ctx.query[headerName];
            }
            currTraceId = currTraceId || `koatty-${options.IdFactory()}`;

            return asyncLocalStorage.run(currTraceId, () => {
                const asyncResource = createAsyncResource();
                wrapEmitter(ctx.req, asyncResource);
                wrapEmitter(ctx.res, asyncResource);
                return respWapper(currTraceId);
            });
        }

        return respWapper(currTraceId);
    }
}

