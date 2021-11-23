/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2021-11-23 12:46:40
 */

import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { StatusBuilder } from "@grpc/grpc-js";
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

    ctx.call.metadata.set('X-Powered-By', 'Koatty');
    ctx.call.sendMetadata(ctx.call.metadata);

    ctx.call.on("end", () => {
        const now = Date.now();
        const originalPath = ctx.getMetaData("originalPath");
        const startTime = ctx.getMetaData("startTime");
        const status = StatusCodeConvert(ctx.status);
        const msg = `{"action":"${ext.protocol}","code":"${status}","startTime":"${startTime}","duration":"${(now - Helper.toInt(startTime)) || 0}","traceId":"${ext.currTraceId}","endTime":"${now}","path":"${originalPath}"}`;
        ctx.logger[(status > 0 ? 'Error' : 'Info')](msg);
        // ctx = null;
    });

    // try /catch
    const response: any = {};

    try {
        response.timeout = null;
        // promise.race
        const res = await Promise.race([new Promise((resolve, reject) => {
            response.timeout = setTimeout(reject, timeout, new Exception('Deadline exceeded', 1, 4));
            return;
        }), next()]);
        ctx.rpcCallback(null, res ?? ctx.body ?? "");
        return null;
    } catch (err: any) {
        // skip prevent errors
        if (isPrevent(err)) {
            ctx.rpcCallback(null, ctx.body ?? "");
            return null;
        }
        return responseError(ctx, err);
    } finally {
        ctx.call.emit("end");
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
        ctx.logger.Error(errObj);
        ctx.rpcCallback(errObj, null);
        return;
    } catch (error) {
        errObj = new StatusBuilder().withCode(2).build();
        ctx.logger.Error(errObj);
        ctx.rpcCallback(errObj, null);
        return;
    }
}