/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2022-03-02 18:44:37
 */
import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isPrevent, StatusCodeConvert } from "koatty_exception";
import { catcher } from '../catcher';

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
        if (!Helper.isTrueEmpty(res)) {
            ctx.body = res;
        }
        if (ctx.body && ctx.status === 404) {
            ctx.status = 200;
        }
        if (ctx.status >= 400) {
            throw new Exception("", 0, ctx.status);
        }
        ctx.rpc.callback(null, ctx.body);
        return null;
    } catch (err: any) {
        // skip prevent errors
        if (isPrevent(err)) {
            ctx.rpc.callback(null, ctx.body ?? "");
            return null;
        }
        return catcher(ctx, err);
    } finally {
        ctx.res.emit("finish");
        clearTimeout(response.timeout);
    }
}
