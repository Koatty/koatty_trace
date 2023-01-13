/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:14:59
 * @LastEditTime: 2023-01-13 12:28:05
 */
import { Helper } from "koatty_lib";
import { catcher } from "../catcher";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isPrevent } from "koatty_exception";

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
    if (!ext.termined) {
      response.timeout = null;
      // promise.race
      await Promise.race([new Promise((resolve, reject) => {
        response.timeout = setTimeout(reject, timeout, new Exception('Request Timeout', 1, 408));
        return;
      }), next()]);
    }

    if (ctx.body !== undefined && ctx.status === 404) {
      ctx.status = 200;
    }

    if (ctx.status >= 400) {
      throw new Exception('', 1, ctx.status);
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

