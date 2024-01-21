/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2022-02-21 11:32:03
 * @LastEditTime: 2024-01-21 12:56:26
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
  // 如果是异常对象，直接返回
  if (isException(err)) {
    return (<Exception>err).setSpan(span).handler(ctx);
  }

  // 执行自定义全局异常处理
  const message = (err.message).includes('"') ? (err.message).replaceAll('"', '\\"') : err.message;
  if (globalErrorHandler) {
    const ins: Exception = new globalErrorHandler(message, (<T>err).code ?? 1, (<T>err).status || 500, err.stack, span);
    if (ins.handler) {
      return ins.handler(ctx);
    }
  }

  // 使用默认异常处理
  return new Exception(message, (<T>err).code ?? 1, (<T>err).status || 500, err.stack, span).handler(ctx);
}
