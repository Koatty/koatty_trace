/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2022-02-21 11:32:03
 * @LastEditTime: 2024-01-24 10:45:24
 */

import { KoattyContext } from "koatty_core";
import { Exception, isException } from "koatty_exception";
import { Span, Tags } from "opentracing";

/**
 * @description: extensionOptions
 * @return {*}
 */
export interface extensionOptions {
  timeout?: number,
  encoding?: string,
  terminated?: boolean,
  span?: Span,
  globalErrorHandler?: any,
}
/**
 * Global Error handler
 * @param ctx 
 * @param err 
 * @param span 
 * @param globalErrorHandler 
 * @param ext 
 * @returns 
 */
export function catcher<T extends Exception>(ctx: KoattyContext, err: Error | Exception | T, span?: Span,
  globalErrorHandler?: any, ext?: extensionOptions) {
  err.message = err.message || ctx.message || "";
  if (err.message.includes('"')) {
    err.message = err.message.replaceAll('"', '\\"');
  }
  // 执行自定义全局异常处理
  if (globalErrorHandler) {
    const ins: Exception = new globalErrorHandler(err.message, (<T>err).code ?? 1, (<T>err).status || 500, err.stack, span);
    if (ins.handler) {
      return ins.handler(ctx);
    }
  }
  // 如果是异常对象，直接返回
  if (isException(err)) {
    return (<Exception>err).setSpan(span).handler(ctx);
  }
  // 使用默认异常处理
  return new Exception(err.message, 1, 500, err.stack, span).handler(ctx);
}
