/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:14:59
 * @LastEditTime: 2022-02-18 18:21:55
 */
import { KoattyContext } from "koatty_core";
import { Helper } from "koatty_lib";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, HttpStatusCode, isException, isPrevent } from "koatty_exception";
import { IOCContainer } from "koatty_container";

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

        ctx.body = res ?? "";

        return null;
    } catch (err: any) {
        Logger.Error(err.stack);
        return catcher(ctx, err);
    } finally {
        clearTimeout(response.timeout);
    }
}

/**
 * error catcher
 *
 * @template T
 * @param {KoattyContext} ctx
 * @param {(Exception | T)} err
 */
function catcher<T extends Exception>(ctx: KoattyContext, err: Error | Exception | T) {
    // skip prevent errors
    if (isPrevent(err)) {
        return null;
    }
    if (isException(err)) {
        return (<Exception | T>err).handler(ctx);
    }
    // 查找全局错误处理
    const globalErrorHandler: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");
    if (globalErrorHandler) {
        return new globalErrorHandler(err.message).handler(ctx);
    }
    // 使用默认错误处理
    return new Exception(err.message).handler(ctx);
}
