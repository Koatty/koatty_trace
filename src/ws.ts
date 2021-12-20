/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:24:43
 * @LastEditTime: 2021-12-16 19:58:25
*/
import { inspect } from "util";
import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isPrevent } from "koatty_exception";

/**
 * wsHandler
 *
 * @param {Koatty} app
 * @returns {*}  
 */
export async function wsHandler(ctx: KoattyContext, next: Function, ext?: any): Promise<any> {
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

    // after send message event
    const listener = () => {
        const now = Date.now();
        const msg = `{"action":"${ext.protocol}","code":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","traceId":"${ext.currTraceId}","endTime":"${now}","path":"${ctx.originalPath || '/'}"}`;
        Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
        ctx = null;
    }
    ctx.websocket.addListener("afterSend", listener);
    ctx.websocket.addListener("error", listener);

    // close event
    ctx.websocket.once("close", (socket: any, code: number, reason: Buffer) => {
        Logger.Error("websocket closed: ", Helper.toString(reason));
    });

    // try /catch
    const response: any = ctx.res;
    try {
        response.timeout = null;
        // promise.race
        let res = await Promise.race([new Promise((resolve, reject) => {
            response.timeout = setTimeout(reject, timeout, new Exception('Request Timeout', 1, 408));
            return;
        }), next()]);

        res = inspect(res ?? ctx.body ?? "");
        ctx.websocket.send(inspect(res), () => ctx.websocket.emit('afterSend'));
        return null;
    } catch (err: any) {
        // skip prevent errors
        if (isPrevent(err)) {
            ctx.websocket.send(inspect(ctx.body || ""), () => ctx.websocket.emit('afterSend'));
            return null;
        }
        Logger.Error(err);
        ctx.status = err.status ?? (ctx.status || 2);
        ctx.websocket.emit('error');
        return null;
    } finally {
        clearTimeout(response.timeout);
    }

}
