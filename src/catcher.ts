/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2024-11-11 11:36:07
 * @LastEditTime: 2025-03-31 17:51:22
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
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
  globalErrorHandler?: T,
  _ext?: extensionOptions
) {
  const sanitizedMessage = getMessage(ctx, err);
  const status = getStatus(ctx, err);
  const code = (<T>err).code || 1;

  // 如果是异常对象，直接返回
  if (isException(err)) {
    return (<Exception>err).setCode(code).setStatus(status).
      setMessage(sanitizedMessage).setSpan(span).handler(ctx);
  }
  // 执行自定义全局异常处理
  const ins: Exception = IOCContainer.getInsByClass(globalErrorHandler,
    [sanitizedMessage, code, status, err.stack, span])
  if (Helper.isFunction(ins?.handler)) {
    return ins.handler(ctx);
  }

  // 使用默认异常处理
  return new Exception(sanitizedMessage, code, status, err.stack, span).handler(ctx);
}

/**
 * Get HTTP status code from error object or context
 * @param ctx KoattyContext - The Koatty context object
 * @param err Error | Exception - The error object
 * @returns number - HTTP status code
 * @description
 * Determines appropriate HTTP status code based on:
 * 1. Error object's status property if exists
 * 2. 500 for general Error instances
 * 3. 404 for unmatched routes
 * 4. Context status or 500 as fallback
 */
function getStatus<T extends Exception>(ctx: KoattyContext,
  err: Error | Exception | T) {
  let status = 500; // 默认 500（服务器错误）
  if ('status' in err && typeof err.status === 'number') {
    status = err.status;
  } else if (err instanceof Error) {
    status = 500; // 确保 throw new Error() 不会误判为 404
  } else if (ctx.status === 404 && !(ctx.response as any)._explicitStatus) {
    status = 404; // 未匹配路由的默认 404
  } else {
    status = ctx.status || 500;
  }
  return status;
}

/**
 * Get error message from error object or context
 * @param ctx KoattyContext instance
 * @param err Error or Exception object
 * @returns Processed error message with escaped double quotes
 * @template T Type extends Exception
 */
function getMessage<T extends Exception>(ctx: KoattyContext,
  err: Error | Exception | T) {
  let message = "";
  try {
    // 优先从错误对象获取消息
    if (err && typeof err.message === 'string') {
      message = err.message;
    } else if (ctx && typeof ctx.message === 'string') {
      message = ctx.message;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    // 防止任何意外的访问错误
    message = "";
  }
  return message.includes('"') ? message.replace(/"/g, '\\"') : message;
}


/**
 * Sanitizes a stack trace by removing or redacting sensitive information.
 * This includes file paths, IP addresses, email addresses, and authentication tokens.
 * 
 * @param stack - The stack trace string to sanitize
 * @returns The sanitized stack trace with sensitive information replaced by '[REDACTED]'
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sanitizeStack(stack?: string): string {
  if (!stack) return '';

  // 常见需要脱敏的模式
  const sensitivePatterns = [
    // 文件路径 (Windows & Unix)
    /([A-Za-z]:\\[^\s]+|\/[^\s]+)/g,
    // IP地址
    /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g,
    // 邮箱
    /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g,
    // 密钥/令牌
    /(Bearer\s+[a-zA-Z0-9-._~+/]+=*)/gi,
    /(access_?token=|key=|secret=)([a-zA-Z0-9-._~+/]+=*)/gi
  ];

  let sanitized = stack;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  return sanitized;
}