/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2021-06-29 16:41:16
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { IncomingMessage, ServerResponse } from 'http';
import { Http2ServerRequest, Http2ServerResponse } from 'http2';
import { Namespace, createNamespace } from "cls-hooked";
import * as Helper from "koatty_lib";
import { Application, Context } from "koatty_container";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isException, isPrevent } from './Exception';
import { v4 as uuid } from "uuid";
// export
export * from "./Exception";

/**
 * Create Namespace
 *
 * @export
 * @returns {*}  
 */
export function TraceServerSetup(app: Application): Namespace {
    const traceCls = createNamespace('koatty-debug-trace');
    // app.trace = traceCls;
    Helper.define(app, 'trace', traceCls);
    return traceCls;
}

/**
 * debug/trace server handle binding
 *
 * @param {Koatty} app  app instance
 * @param {IncomingMessage | Http2ServerRequest} req  request
 * @param {ServerResponse | Http2ServerResponse} res  response
 * @param {boolean} openTrace enable full stack debug & trace
 */
export function TraceBinding(
    app: Application,
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse,
    openTrace: boolean,
) {
    // if enable full stack debug & trace
    if (openTrace) {
        app.trace.run(() => {
            // event binding
            app.trace.bindEmitter(req);
            app.trace.bindEmitter(res);
            // execute app.callback
            app.callback()(req, res);
        });
    } else {
        app.callback()(req, res);
    }
}

/**
 * Trace middleware handler
 *
 * @export
 * @param {Koatty} app
 * @returns {*}  
 */
export function TraceHandler(app: Application) {
    const timeout = (app.config('http_timeout') ?? 10) * 1000;
    const encoding = app.config('encoding') ?? 'utf-8';

    return async function (ctx: Context, next: Function): Promise<any> {
        // set ctx start time
        Helper.define(ctx, 'startTime', Date.now());
        // http version
        Helper.define(ctx, 'version', ctx.req.httpVersion);
        // originalPath
        Helper.define(ctx, 'originalPath', ctx.path);
        // Encoding
        ctx.encoding = encoding;
        // auto send security header
        ctx.set('X-Powered-By', 'Koatty');
        ctx.set('X-Content-Type-Options', 'nosniff');
        ctx.set('X-XSS-Protection', '1;mode=block');

        // if enable full stack debug & trace，created traceId
        let currTraceId = '';
        if (app.trace) {
            // some key
            const traceId = <string>ctx.headers.traceId ?? <string>ctx.query.traceId;
            const requestId = <string>ctx.headers.requestId ?? <string>ctx.query.requestId;

            // traceId
            const parentId = traceId ?? requestId;
            // current traceId
            currTraceId = parentId ?? `koatty-${uuid()}`;
            app.trace.set('parentId', parentId ?? '');
            app.trace.set('traceId', currTraceId);
            app.trace.set('ctx', ctx);
            ctx.set('X-Trace-Id', currTraceId);
        }
        // response finish
        ctx.res.once('finish', () => {
            const { method, startTime, status, originalPath } = ctx;
            const now = Date.now();
            const cmd = originalPath ?? '/';
            const msg = `{"action":"${method}","code":"${status}","startTime":"${startTime}","duration":"${(now - startTime) ?? 0}","traceId":"${currTraceId}","endTime":"${now}","path":"${cmd}"}`;
            Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
            ctx = null;
        });

        // try /catch
        const response: any = ctx.res;
        try {
            response.timeout = null;
            // promise.race
            const res = await Promise.race([new Promise((resolve, reject) => {
                response.timeout = setTimeout(reject, timeout, new Exception('Request Timeout', 1, 408));
                return;
            }), next()]);

            if (res && ctx.status !== 304) {
                ctx.body = res ?? "";
            }

            return null;
        } catch (err: any) {
            // skip prevent errors
            if (isPrevent(err)) {
                return null;
            }
            return catcher(app, ctx, err);
        } finally {
            clearTimeout(response.timeout);
        }
    };
}

/**
 * error catcher
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @param {Error} err
 * @returns {*}  
 */
function catcher(app: Application, ctx: Context, err: Exception) {
    try {
        let body: any = ctx.body;
        if (!body) {
            body = err.message ?? ctx.message ?? "";
        }
        ctx.status = ctx.status ?? 500;
        if (isException(err)) {
            err.message = body;
            ctx.status = err.status;
            return responseBody(app, ctx, err);
        }
        Logger.Error(err);
        return ctx.res.end(body);
    } catch (error) {
        Logger.Error(error);
        return null;
    }
}

/**
 *
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @returns {*}  
 */
function responseBody(app: Application, ctx: Context, err: Exception) {
    const contentType = parseResContentType(ctx);
    // accepted types
    switch (contentType) {
        case 'json':
            return jsonRend(ctx, err);
            break;
        case 'html':
            return htmlRend(ctx, err);
            break;
        case 'text':
        default:
            return textRend(ctx, err);
            break;
    }
}

/**
 * Parse response type
 *
 * @param {KoattyContext} ctx
 * @returns {*}  
 */
function parseResContentType(ctx: Context) {
    let type = '';
    if (ctx.request.type === "") {
        type = <string>ctx.accepts('json', 'html', 'text');
    } else {
        type = <string>ctx.request.is('json', 'html', 'text');
    }
    if (type) {
        return type;
    }
    return '';
}

/**
 *
 *
 * @param {KoattyContext} ctx
 * @param {Exception} err
 * @returns {*}  
 */
function htmlRend(ctx: Context, err: Exception) {
    let contentType = 'text/html';
    if (ctx.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;

    const { code, message } = err;
    const body = `<!DOCTYPE html><html><head><title>Error - ${code ?? 1}</title><meta name="viewport" content="user-scalable=no, width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <style>body {padding: 50px 80px;font: 14px 'Microsoft YaHei','微软雅黑',Helvetica,Sans-serif;}h1, h2 {margin: 0;padding: 10px 0;}h1 {font-size: 2em;}h2 {font-size: 1.2em;font-weight: 200;color: #aaa;}pre {font-size: .8em;}</style>
    </head><body><div id="error"><h1>Error</h1><p>Oops! Your visit is rejected!</p><h2>Message:</h2><pre><code>${Helper.escapeHtml(message) ?? ""}</code></pre></div></body></html>`;
    ctx.set("Content-Length", `${Buffer.byteLength(body)}`);
    return ctx.res.end(body);
}

/**
 *
 *
 * @param {KoattyContext} ctx
 * @param {Exception} err
 * @returns {*}  
 */
function jsonRend(ctx: Context, err: Exception) {
    let contentType = 'application/json';
    if (ctx.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;
    const { code, message } = err;
    const body = `{"code":${code ?? 1},"message":"${message ?? ""}"}`;
    ctx.set("Content-Length", `${Buffer.byteLength(body)}`);
    return ctx.res.end(body);
}

/**
 * 
 *
 * @param {KoattyContext} ctx
 * @param {Exception} err
 * @returns {*}  
 */
function textRend(ctx: Context, err: Exception) {
    let contentType = 'text/plain';
    if (ctx.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;
    const { code, message } = err;
    const body = `{"code":${code ?? 1},"message":"${message ?? ""}"}`;
    ctx.set("Content-Length", `${Buffer.byteLength(body)}`);
    return ctx.res.end(body);
}

