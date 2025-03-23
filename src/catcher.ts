/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-21 22:10:12
 * @LastEditTime: 2025-03-23 11:35:33
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
  /** 是否开启调试模式 */
  debug?: boolean,
  /** 超时时间，单位毫秒 */
  timeout?: number,
  /** 编码格式 */
  encoding?: string,
  /** 是否终止请求 */
  terminated?: boolean,
  /** OpenTelemetry Span对象，用于链路追踪 */
  span?: Span,
  /** 自定义全局异常处理类 */
  globalErrorHandler?: any,
}

/**
 * Global error catcher for handling exceptions in Koatty framework.
 * 
 * @param ctx - Koatty context object
 * @param err - Error or Exception object to be handled
 * @param span - Optional span object for tracing
 * @param globalErrorHandler - Optional custom global error handler
 * @param _ext - Optional extension options
 * @returns Result of error handling through Exception handler
 * 
 * @description
 * This function processes errors by:
 * 1. Handling existing Exception objects with spans
 * 2. Using custom global error handlers if provided
 * 3. Falling back to default Exception handling
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
