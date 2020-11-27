/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: linyyyang<linyyyang@tencent.com>
 * @LastEditTime: 2020-11-27 16:44:10
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as lib from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { v4 as uuid4 } from "uuid";

/**
 *
 *
 * @param {*} app
 * @param {*} ctx
 * @param {*} options
 * @param {*} body
 * @returns
 */
const htmlRend = async function (app: any, ctx: any, options: TraceOptions, body: any) {
    let contentType = 'text/html';
    if (options.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${options.encoding}`;
    }
    ctx.type = contentType;
    let res = ''; let stack = '';
    const resBody = {
        code: options.error_code || 1, // 此处和框架输出统一
        message: ctx.message,
    };
    if (lib.isError(body)) {
        const { code, message } = <any>body;
        resBody.code = code || resBody.code;
        resBody.message = message;
        stack = body.stack;
    }

    if (options.error_path) {
        if (ctx.compile) {
            ctx._assign = resBody;
            logger.Info('auto render the error template.');
            res = await ctx.compile(`${options.error_path}/${ctx.status}.html`, ctx._assign || {});
        } else {
            logger.Warn('`tkoatty-view `middleware is not included, so it only outputs file content.');
            res = await lib.readFile(`${options.error_path}/${ctx.status}.html`, 'utf-8');
        }
    } else {
        res = `<!DOCTYPE html><html><head><title>Error - ${resBody.code}</title><meta name="viewport" content="user-scalable=no, width=device-width, initial-scale=1.0, maximum-scale=1.0">
            <style>body {padding: 50px 80px;font: 14px 'Microsoft YaHei','微软雅黑',Helvetica,Sans-serif;}h1, h2 {margin: 0;padding: 10px 0;}h1 {font-size: 2em;}h2 {font-size: 1.2em;font-weight: 200;color: #aaa;}pre {font-size: .8em;}</style>
            </head><body><div id="error"><h1>Error</h1><p>Oops! Your visit is rejected!</p><h2>Message:</h2><pre><code>${resBody.message || ''}</code></pre>`;
        // if (app.appDebug || body.expose) {
        if (app.appDebug) {
            res = `${res}<h2>Stack:</h2><pre><code>${stack || ''}</code></pre>`;
        }
        res = `${res}</div></body></html>`;
    }
    return ctx.res.end(res);
};
/**
 *
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @param {*} options
 * @param {*} body
 * @returns {*}  
 */
const jsonRend = function (app: any, ctx: any, options: TraceOptions, body: any) {
    let contentType = 'application/json';
    if (options.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${options.encoding}`;
    }
    ctx.type = contentType;
    let { message } = ctx;
    let code = options.error_code || 1; // 此处和框架输出统一
    if (lib.isError(body)) {
        const { cod, msg } = <any>body;
        code = cod || code;
        message = msg || message;
    }
    return ctx.res.end(`{"code": ${code},"message":"${message || ''}"}`);
};

/**
 *
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @param {*} options
 * @param {*} body
 * @returns {*}  
 */
const textRend = function (app: any, ctx: any, options: TraceOptions, body: any) {
    let contentType = 'text/plain';
    if (options.encoding !== false && contentType.indexOf('charset=') === -1) {
        contentType = `${contentType}; charset=${options.encoding}`;
    }
    ctx.type = contentType;
    let { message } = ctx;
    let code = options.error_code || 1; // 此处和框架输出统一
    if (lib.isError(body)) {
        const { cod, msg } = <any>body;
        code = cod || code;
        message = msg || message;
    }
    return ctx.res.end(`Error: code: ${code}, message: ${message || ''} `);
};
/**
 *
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @param {*} options
 * @param {*} body
 * @returns {*}  
 */
const defaultRend = function (app: any, ctx: any, options: TraceOptions, body: any) {
    let { message } = ctx;
    let code = options.error_code || 1; // 此处和框架输出统一
    if (lib.isError(body)) {
        const { cod, msg } = <any>body;
        code = cod || code;
        message = msg || message;
    }
    return ctx.res.end(`Error: code: ${code}, message: ${message || ''} `);
};
/**
 *
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @param {*} options
 * @param {*} body
 * @returns {*}  {Promise<any>}
 */
const responseBody = async function (app: any, ctx: any, options: TraceOptions, body: any): Promise<any> {
    try {
        const contentType = parseResContentType(ctx);
        // accepted types
        switch (contentType) {
            case 'json':
                await jsonRend(app, ctx, options, body);
                break;
            case 'html':
                await htmlRend(app, ctx, options, body);
                break;
            case 'text':
                await textRend(app, ctx, options, body);
                break;
            default:
                await defaultRend(app, ctx, options, body);
                break;
        }
    } catch (err) {
        logger.Error(err);
    }
    return null;
};

/**
 * parse response content-type
 *
 * @param {KoattyContext} ctx
 * @returns {*}  
 */
const parseResContentType = function (ctx: any) {
    if (ctx.response.type === '') {
        return ctx.accepts('json', 'html', 'text');
    }
    const type = ctx.response.is('json', 'html', 'text');
    if (type) {
        return type;
    }
    return '';
};

/**
 * error catcher
 *
 * @param {Koatty} app
 * @param {KoattyContext} ctx
 * @param {*} options
 * @param {Error} err
 * @returns {*}  
 */
const catcher = async function (app: any, ctx: any, options: TraceOptions, err: Error) {
    if (!app.isPrevent(err)) {
        app.emit('error', err, ctx);
        const { status } = <any>err;
        ctx.status = (typeof status === 'number') ? status : (options.error_code || 500);
        return responseBody(app, ctx, options, err);
    }
    return null;
};

/**
 * default options
 */
const defaultOptions = {
    timeout: 10, // http服务超时时间,单位s
    error_code: 500, // 报错时的状态码
    error_path: '', // 错误模板目录配置.该目录下放置404.html、502.html等,框架会自动根据status进行渲染(支持模板变量,依赖`koatty_view`中间件;如果`koatty_view`中间件未加载,仅输出模板内容)
};

/**
 *
 *
 * @interface TraceOptions
 */
interface TraceOptions {
    timeout: number;
    error_code: number;
    error_path: string;
    encoding?: any;
}

/**
 *
 *
 * @export
 * @param {*} options
 * @param {*} app
 * @returns {*}  
 */
export function trace(options: TraceOptions, app: any) {
    options = { ...defaultOptions, ...options };

    if (options.error_path && (options.error_path).startsWith('./')) {
        options.error_path = (options.error_path).replace('./', `${process.env.ROOT_PATH}/`);
    }
    // ms
    options.timeout = (options.timeout || 30) * 1000;
    options.encoding = app.config('encoding') || 'utf-8';

    return async function (ctx: any, next: Function) {
        // set ctx start time
        lib.define(ctx, 'startTime', Date.now());
        // http version
        lib.define(ctx, 'version', ctx.req.httpVersion);
        // originalPath
        lib.define(ctx, 'originalPath', ctx.path);
        // auto send security header
        ctx.set('X-Powered-By', 'Koatty');
        ctx.set('X-Content-Type-Options', 'nosniff');
        ctx.set('X-XSS-Protection', '1;mode=block');

        // 如果app有traceInstance，说明开启全链路debug/trace，生成traceId
        let currTraceId = '';
        if (app.trace) {
            // 兼容不同的key
            const traceId = ctx.headers.traceId || ctx.query.traceId;
            const requestId = ctx.headers.requestId || ctx.query.requestId;

            // 来源traceId
            const parentId = traceId || requestId;
            // 当前traceId，如果来源traceId不为空，则复用来源traceId
            currTraceId = parentId || `koatty-${uuid4()}`;
            app.trace.set('parentId', parentId || '');
            app.trace.set('traceId', currTraceId);
            app.trace.set('ctx', ctx);
            ctx.set('X-Trace-Id', currTraceId);
        }

        // response finish
        ctx.res.once('finish', () => {
            const { method, startTime, status, originalPath } = ctx;
            const now = Date.now();
            if (currTraceId) {
                const duration = (now - startTime) || 0;
                logger.Write("trace", {
                    action: method,
                    code: status,
                    startTime,
                    duration,
                    traceId: currTraceId,
                    endTime: now,
                    cmd: originalPath || '/',
                });
            }
            logger[(ctx.status >= 400 ? 'Error' : 'Info')](`${method} ${status} ${originalPath || '/'}`);
            ctx = null;
        });
        // try /catch
        const response: any = ctx.res;
        try {
            response.timeout = null;
            // promise.race
            const res = await Promise.race([new Promise((resolve, reject) => {
                const err: any = new Error('Request Timeout');
                err.status = 408;
                response.timeout = setTimeout(reject, options.timeout, err);
                return;
            }), next()]);
            if (res && ctx.status !== 304) {
                ctx.body = res;
            }
            if (ctx.body !== undefined && ctx.status === 404) {
                ctx.status = 200;
            }
            // error
            if (ctx.status >= 400) {
                ctx.throw(ctx.status, ctx.url);
            }
            return null;
        } catch (err) {
            return catcher(app, ctx, options, err);
        } finally {
            clearTimeout(response.timeout);
        }

    };
}