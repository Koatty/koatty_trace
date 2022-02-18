/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2022-02-19 00:57:14
 */
import statuses from 'statuses';
import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, GrpcException, isException, isPrevent, StatusCodeConvert } from "koatty_exception";
import { IOCContainer } from "koatty_container";

/**
 * grpcHandler
 *
 * @param {Koatty} app
 * @returns {*}  
 */
export async function grpcHandler(ctx: KoattyContext, next: Function, ext?: any): Promise<any> {
    const timeout = ext.timeout || 10000;
    // set ctx start time
    const startTime = Date.now();
    ctx.setMetaData("startTime", `${startTime}`);

    ctx.rpc.call.metadata.set('X-Powered-By', 'Koatty');
    ctx.rpc.call.sendMetadata(ctx.rpc.call.metadata);

    // event callback
    const listener = () => {
        const now = Date.now();
        const originalPath = ctx.getMetaData("originalPath");
        const startTime = ctx.getMetaData("startTime");
        const status = StatusCodeConvert(ctx.status);
        const msg = `{"action":"${ctx.protocol}","code":"${status}","startTime":"${startTime}","duration":"${(now - Helper.toInt(startTime)) || 0}","traceId":"${ext.currTraceId}","endTime":"${now}","path":"${originalPath}"}`;
        Logger[(status > 0 ? 'Error' : 'Info')](msg);
        // ctx = null;
    };
    ctx.res.once("finish", listener);
    ctx.rpc.call.once("error", listener);

    // try /catch
    const response: any = {};

    try {
        response.timeout = null;
        // promise.race
        const res = await Promise.race([new Promise((resolve, reject) => {
            response.timeout = setTimeout(reject, timeout, new Exception('Deadline exceeded', 1, 4));
            return;
        }), next()]);
        ctx.body = res ?? ctx.body ?? "";
        if (ctx.body && ctx.status === 404) {
            ctx.status = 200;
        }
        ctx.rpc.callback(null, ctx.body);
        return null;
    } catch (err: any) {
        Logger.Error(err.stack);
        return catcher(ctx, err);
    } finally {
        ctx.res.emit("finish");
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
        ctx.rpc.callback(null, ctx.body ?? "");
        return null;
    }
    let flag = false;
    if (isException(err)) {
        flag = true;
    }
    // 查找全局错误处理
    const globalErrorHandler: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");
    if (globalErrorHandler) {
        if (flag) {
            return new globalErrorHandler(
                (<Exception | T>err).message,
                (<Exception | T>err).code,
                (<Exception | T>err).status,
            ).handler(ctx);
        }
        return new globalErrorHandler(err.message).handler(ctx);
    }
    // 使用默认错误处理
    if (flag) {
        return new GrpcException(
            (<Exception | T>err).message,
            (<Exception | T>err).code,
            (<Exception | T>err).status,
        ).handler(ctx);
    }
    return new GrpcException(err.message).handler(ctx);
}