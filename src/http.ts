/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:14:59
 * @LastEditTime: 2021-11-19 15:44:16
 */
import { KoattyContext } from "koatty_core";
import { Exception, HttpStatusCode, isException, isPrevent } from "koatty_exception";
import * as Helper from "koatty_lib";
import { DefaultLogger as Logger } from "koatty_logger";

/**
 * httpHandler
 *
 * @param {Koatty} app
 * @returns {*}  
 */
export async function httpHandler(ctx: KoattyContext, next: Function, ext?: any): Promise<any> {
    const timeout = ext.timeout || 10000;
    // set ctx start time
    Helper.define(ctx, 'startTime', Date.now());
    // http version
    Helper.define(ctx, 'version', ctx.req.httpVersion);
    // originalPath
    Helper.define(ctx, 'originalPath', ctx.path);
    // Encoding
    ctx.encoding = ext.encoding;
    // auto send security header
    ctx.set('X-Powered-By', 'Koatty');
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-XSS-Protection', '1;mode=block');

    // response finish
    ctx.res.once('finish', () => {
        const now = Date.now();
        const msg = `{"action":"${ctx.method}","code":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","traceId":"${ext.currTraceId}","endTime":"${now}","path":"${ctx.originalPath || '/'}"}`;
        Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
        // ctx = null;
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
        return catcher(ctx, err);
    } finally {
        clearTimeout(response.timeout);
    }
}


/**
 * error catcher
 *
 * @param {KoattyContext} ctx
 * @param {Error} err
 * @returns {*}  
 */
function catcher(ctx: KoattyContext, err: Exception) {
    try {
        let body: any = ctx.body;
        if (!body) {
            body = err.message || ctx.message || "";
        }
        ctx.status = ctx.status || 500;
        if (isException(err)) {
            err.message = body;
            ctx.status = <HttpStatusCode>err.status;
            return responseBody(ctx, err);
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
 * @param {KoattyContext} ctx
 * @returns {*}  
 */
function responseBody(ctx: KoattyContext, err: Exception) {
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
function parseResContentType(ctx: KoattyContext) {
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
function htmlRend(ctx: KoattyContext, err: Exception) {
    let contentType = 'text/html';
    if (ctx.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;

    const { code, message } = err;
    const body = `<!DOCTYPE html><html><head><title>Error - ${code || 1}</title><meta name="viewport" content="user-scalable=no, width=device-width, initial-scale=1.0, maximum-scale=1.0">
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
function jsonRend(ctx: KoattyContext, err: Exception) {
    let contentType = 'application/json';
    if (ctx.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;
    const { code, message } = err;
    const body = `{"code":${code || 1},"message":"${message ?? ""}"}`;
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
function textRend(ctx: KoattyContext, err: Exception) {
    let contentType = 'text/plain';
    if (ctx.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;
    const { code, message } = err;
    const body = `{"code":${code || 1},"message":"${message ?? ""}"}`;
    ctx.set("Content-Length", `${Buffer.byteLength(body)}`);
    return ctx.res.end(body);
}

