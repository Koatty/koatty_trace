/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2024-11-11 11:36:07
 * @LastEditTime: 2025-03-20 17:35:32
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { IOCContainer } from "koatty_container";
import { KoattyContext } from "koatty_core";
import { Exception, isException } from "koatty_exception";
import { Helper } from "koatty_lib";
import { Span } from "@opentelemetry/api";

/**
 * @description: extensionOptions
 * @return {*}
 */
export interface extensionOptions {
  debug?: boolean,
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
 * @param _ext 
 * @returns 
 */
export function catcher<T extends Exception>(
  ctx: KoattyContext,
  err: Error | Exception | T,
  span?: Span,
  globalErrorHandler?: any,
  _ext?: extensionOptions
) {
  const message = err.message || ctx.message || "";
  const sanitizedMessage = message.includes('"') ? message.replace(/"/g, '\\"') : message;

  // 如果是异常对象，直接返回
  if (isException(err) && span) {
    return (<Exception>err).setSpan(span).handler(ctx);
  }
  // 执行自定义全局异常处理
  const ins: Exception = IOCContainer.getInsByClass(globalErrorHandler,
    [err.message, (<T>err).code, (<T>err).status, err.stack, span])
  if (Helper.isFunction(ins?.handler)) {
    return ins.handler(ctx);
  }

  // 使用默认异常处理
  return new Exception(sanitizedMessage, 1, 500, err.stack, span).handler(ctx);
}

/**
 * @description: 检查对象是否具有构造函数的特定属性
 * @param {any} clazz
 * @return {*}
 */
// function isConstructor(clazz: any): any {
//   return typeof clazz === 'function' && 'prototype' in clazz && 'constructor' in clazz.prototype;
// }
