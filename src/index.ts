/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2022-02-14 10:39:35
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as Koa from 'koa';
import { v4 as uuidv4 } from "uuid";
import { Helper } from "koatty_lib";
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
        const respWapper = (currTraceId: string) => {
            // metadata
            ctx.setMetaData(options.HeaderName, currTraceId);
            if (ctx.protocol === "grpc") {
                ctx.rpc.call.metadata.set(options.HeaderName, currTraceId);
                return grpcHandler(ctx, next, { timeout, currTraceId, encoding });
            } else if (ctx.protocol === "ws" || ctx.protocol === "wss") {
                // response header
                ctx.set(options.HeaderName, currTraceId);
                return wsHandler(ctx, next, { timeout, currTraceId, encoding });
            } else {
                // response header
                ctx.set(options.HeaderName, currTraceId);
                return httpHandler(ctx, next, { timeout, currTraceId, encoding });
            }
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

