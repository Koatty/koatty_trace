/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2021-11-26 16:31:03
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as Koa from 'koa';
import { Koatty, KoattyContext } from "koatty_core";
import { asyncLocalStorage, createAsyncResource, wrapEmitter } from './wrap';
import { httpHandler } from './http';
import { grpcHandler } from './grpc';
import { wsHandler } from './ws';

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
    IdFactory: (key = "") => {
        return Symbol(key).toString();
    },
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
    const protocol = app.config("protocol") || 'http';
    const timeout = (app.config('http_timeout') || 10) * 1000;
    const encoding = app.config('encoding') || 'utf-8';
    const openTrace = app.config("open_trace") || false;
    return async (ctx: KoattyContext, next: Koa.Next) => {
        // 
        const respWapper = (currTraceId: string) => {
            // metadata
            ctx.setMetaData(options.HeaderName, currTraceId);
            if (protocol === "grpc") {
                ctx.call.metadata.set(options.HeaderName, currTraceId);
                return grpcHandler(ctx, next, { timeout, currTraceId, encoding, protocol });
            } else if (protocol === "ws" || protocol === "wss") {
                // response header
                ctx.set(options.HeaderName, currTraceId);
                return wsHandler(ctx, next, { timeout, currTraceId, encoding, protocol });
            } else {
                // response header
                ctx.set(options.HeaderName, currTraceId);
                return httpHandler(ctx, next, { timeout, currTraceId });
            }
        }

        let currTraceId = '';
        if (openTrace) {
            if (protocol === "grpc") {
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

