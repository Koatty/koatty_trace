/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2021-12-23 10:52:30
 */

import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { StatusBuilder } from "@grpc/grpc-js";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, GrpcStatusCodeMap, HttpStatusCode, isException, isPrevent, StatusCodeConvert } from "koatty_exception";

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
        const msg = `{"action":"${ext.protocol}","code":"${status}","startTime":"${startTime}","duration":"${(now - Helper.toInt(startTime)) || 0}","traceId":"${ext.currTraceId}","endTime":"${now}","path":"${originalPath}"}`;
        Logger[(status > 0 ? 'Error' : 'Info')](msg);
        // ctx = null;
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
        // skip prevent errors
        if (isPrevent(err)) {
            ctx.rpc.callback(null, ctx.body ?? "");
            return null;
        }
        return responseError(ctx, err);
    } finally {
        ctx.rpc.call.emit("end");
        clearTimeout(response.timeout);
    }
}

/**
 * build gRPC responseError
 *
 * @param {KoattyContext} ctx
 * @param {(Exception | Error)} err
 * @returns {*}  {Partial<StatusObject>}
 */
function responseError(ctx: KoattyContext, err: Exception | Error) {
    let errObj;
    try {
        let code = 2, message = err.message;
        if (isException(err)) {
            const status = (<Exception>err).status || ctx.status;
            code = StatusCodeConvert(<HttpStatusCode>status);
            message = message || GrpcStatusCodeMap.get(code) || "";
            if (ctx.status === 200) {
                ctx.status = <HttpStatusCode>status;
            }
        }
        if (message !== "") {
            errObj = new StatusBuilder().withCode(code).withDetails(message).build();
        } else {
            errObj = new StatusBuilder().withCode(code).build();
        }
        Logger.Error(errObj);
        ctx.rpc.callback(errObj, null);
        return;
    } catch (error) {
        errObj = new StatusBuilder().withCode(2).build();
        Logger.Error(errObj);
        ctx.rpc.callback(errObj, null);
        return;
    }
}