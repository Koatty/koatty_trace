/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2024-01-14 11:55:12
 */
import * as Helper from "koatty_lib";
import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isPrevent, StatusCodeConvert } from "koatty_exception";
import { catcher } from '../catcher';
import { Span, Tags } from "opentracing";

/**
 * gRPCHandler
 *
 * @param {Koatty} app
 * @returns {*}  
 */
export async function gRPCHandler(ctx: KoattyContext, next: Function, ext?: any): Promise<any> {
  const timeout = ext.timeout || 10000;
  // set ctx start time
  Helper.define(ctx, 'startTime', Date.now());
  // originalPath
  Helper.define(ctx, 'originalPath', ctx.path);

  ctx.rpc.call.metadata.set('X-Powered-By', 'Koatty');
  ctx.rpc.call.sendMetadata(ctx.rpc.call.metadata);

  const span = <Span>ext.span;
  if (span) {
    span.setTag(Tags.HTTP_URL, ctx.originalUrl);
    span.setTag(Tags.HTTP_METHOD, ctx.method);
  }


  // event callback
  const finish = () => {
    const now = Date.now();
    const status = StatusCodeConvert(ctx.status);
    const msg = `{"action":"${ctx.protocol}","code":"${status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","requestId":"${ext.requestId}","endTime":"${now}","path":"${ctx.originalPath}"}`;
    Logger[(status > 0 ? 'Error' : 'Info')](msg);
    if (span) {
      span.log({ "request": msg });
      span.finish();
    }

    // ctx = null;
  };
  ctx.res.once("finish", finish);
  ctx.rpc.call.once("error", finish);

  // try /catch
  const response: any = {};

  try {
    if (!ext.terminated) {
      response.timeout = null;
      // promise.race
      await Promise.race([new Promise((resolve, reject) => {
        response.timeout = setTimeout(reject, timeout, new Exception('Deadline exceeded', 1, 4));
        return;
      }), next()]);
    }

    if (ctx.body !== undefined && ctx.status === 404) {
      ctx.status = 200;
    }
    if (ctx.status >= 400) {
      throw new Exception('', 0, ctx.status);
    }
    ctx.rpc.callback(null, ctx.body);
    return null;
  } catch (err: any) {
    return catcher(ctx, span, err, ext.globalErrorHandler);
  } finally {
    ctx.res.emit("finish");
    clearTimeout(response.timeout);
  }
}
