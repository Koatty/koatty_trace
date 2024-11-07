/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-19 00:23:06
 * @LastEditTime: 2024-11-07 11:31:40
 */
import { IRpcServerWriteableStream, KoattyContext } from "koatty_core";
import { Exception, StatusCodeConvert } from "koatty_exception";
import { DefaultLogger as Logger } from "koatty_logger";
import { Span, Tags } from "opentracing";
import { catcher, extensionOptions } from '../catcher';

/**
 * gRPCHandler
 *
 * @param {Koatty} app
 * @returns {*}  
 */
export async function gRPCHandler(ctx: KoattyContext, next: Function, ext?: extensionOptions): Promise<any> {
  const timeout = ext.timeout || 10000;
  // Encoding
  ctx.encoding = ext.encoding;

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
    const msg = `{"action":"${ctx.protocol}","status":"${status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","requestId":"${ctx.requestId}","endTime":"${now}","path":"${ctx.originalPath}"}`;
    Logger[(status > 0 ? 'Error' : 'Info')](msg);
    if (span) {
      span.setTag(Tags.HTTP_STATUS_CODE, status);
      span.setTag(Tags.HTTP_METHOD, ctx.method);
      span.setTag(Tags.HTTP_URL, ctx.url);
      span.log({ "request": msg });
      span.finish();
    }

    // ctx = null;
  };
  ctx.res.once("finish", finish);
  (<IRpcServerWriteableStream<any, any>>ctx.rpc.call).once("error", finish);

  // try /catch
  const response: any = {};

  try {
    if (!ext.terminated) {
      response.timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Deadline exceeded')); // 抛出超时异常
        }, timeout);
      });

      await Promise.race([next(), response.timeout]);
    }

    if (ctx.body !== undefined && ctx.status === 404) {
      ctx.status = 200;
    }
    if (ctx.status >= 400) {
      throw new Exception(ctx.message, 0, ctx.status);
    }
    ctx.rpc.callback(null, ctx.body);
    return null;
  } catch (err: any) {
    return catcher(ctx, err, span, ext.globalErrorHandler, ext);
  } finally {
    ctx.res.emit("finish");
    clearTimeout(response.timeout);
  }
}
