/*
 * @Author: richen
 * @Date: 2020-11-20 17:37:32
 * @LastEditors: linyyyang<linyyyang@tencent.com>
 * @LastEditTime: 2020-12-15 16:06:01
 * @License: BSD (3-Clause)
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as lib from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { v4 as uuid4 } from "uuid";

/**
 *
 *
 * @export
 * @class HttpError
 * @extends {Error}
 */
export class HttpError extends Error {
    public status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/**
 *
 *
 * @template T
 * @param {(HttpError | T)} err
 * @returns {*}  {err is HttpError}
 */
export const isHttpError = <T extends { message: string; status?: number }>(
    err: HttpError | T,
): err is HttpError =>
    err instanceof HttpError ||
    !!(err && typeof err.status === 'number' && typeof err.message === 'string');


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
        ctx.status = (typeof status === 'number') ? status : 500;
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
export interface TraceOptions {
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
                logger.Write("TRACE", {
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