/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2022-02-21 11:32:03
 * @LastEditTime: 2024-01-16 08:10:27
 */

import { KoattyContext } from "koatty_core";
import { DefaultLogger as Logger } from "koatty_logger";
import { Exception, isException } from "koatty_exception";
import { Helper } from "koatty_lib";
import { Span, Tags } from "opentracing";

/**
* Global Error handler
*
* @template T
* @param {KoattyContext} ctx
* @param {(Exception | T)} err
*/
export function catcher<T extends Exception>(ctx: KoattyContext, span: Span,
  err: Error | Exception | T, globalErrorHandler: any) {
  // LOG
  Logger.Error(err.stack);

  if (span) {
    span.setTag(Tags.ERROR, true);
    span.setTag(Tags.HTTP_STATUS_CODE, (<T>err).status || 500);
    span.log({ 'event': 'error', 'error.object': err, 'message': err.message, 'stack': err.stack });
  }
  // 执行指定异常处理
  if (isException(err) && Helper.isFunction((<any>err).handler)) {
    return (<any>err).handler(ctx);
  }
  // 执行全局异常处理
  const message = (err.message).includes('"') ? (err.message).replaceAll('"', '\\"') : err.message;
  if (globalErrorHandler) {
    return new globalErrorHandler(message, (<T>err).code ?? 1, (<T>err).status || 500).handler(ctx);
  }

  // 使用默认异常处理
  return new Exception(message, (<T>err).code ?? 1, (<T>err).status || 500).default(ctx);
}
