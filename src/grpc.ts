/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2022-02-14 10:12:38
 */

import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { StatusBuilder } from "@grpc/grpc-js";
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
        ctx = null;
    };
    ctx.rpc.call.once("end", listener);
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
        ctx.rpc.callback(null, res ?? ctx.body ?? "");
        return null;
    } catch (err: any) {
        Logger.Error(err.stack);
        return catcher(ctx, err);
    } finally {
        ctx.rpc.call.emit("end");
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
    if (isException(err)) {
        return (<Exception | T>err).handler(ctx);
    }
    // 查找全局错误处理
    const globalErrorHandler: any = IOCContainer.getClass("ExceptionHandler", "COMPONENT");
    if (globalErrorHandler) {
        return new globalErrorHandler(err.message).handler(ctx);
    }
    // 使用默认错误处理
    return new GrpcException(err.message).handler(ctx);
}