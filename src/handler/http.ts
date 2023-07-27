/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:14:59
 * @LastEditTime: 2023-07-27 23:08:45
 */
import { Helper } from "koatty_lib";
import { catcher } from "../catcher";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isPrevent } from "koatty_exception";
import { Span, Tags } from "opentracing";
import { HttpStatusCode, HttpStatusCodeMap } from "./code";

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

  const span = <Span>ext.span;
  span?.setTag(Tags.HTTP_URL, ctx.originalUrl);
  span?.setTag(Tags.HTTP_METHOD, ctx.method);

  // response finish
  ctx.res.once('finish', () => {
    const now = Date.now();
    const msg = `{"action":"${ctx.method}","code":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","requestId":"${ext.requestId}","endTime":"${now}","path":"${ctx.originalPath || '/'}"}`;
    Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
    span?.log({ "request": msg });
    span?.finish();
    // ctx = null;
  });

  // try /catch
  const response: any = ctx.res;
  try {
    if (!ext.terminated) {
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

/**
 * HTTP Exception handler
 *
 * @export
 * @param {KoattyContext} ctx
 * @param {Exception} err
 * @returns {*}  
 */
export function httpExceptionHandler(ctx: any, err: Exception) {
  try {
    ctx.status = ctx.status || 500;
    if (HttpStatusCodeMap.has(err.status)) {
      ctx.status = <HttpStatusCode>err.status;
    }

    let contentType = 'application/json';
    if (ctx.encoding !== false) {
      contentType = `${contentType}; charset=${ctx.encoding}`;
    }
    ctx.type = contentType;
    const msg = err.message || ctx.message || "";
    const body = `{"code":${err.code || 1},"message":"${msg}","data":${ctx.body ? JSON.stringify(ctx.body) : (ctx.body || null)}}`;
    ctx.set("Content-Length", `${Buffer.byteLength(body)}`);
    return ctx.res.end(body);
  } catch (error) {
    Logger.Error(error);
    return null;
  }
}
