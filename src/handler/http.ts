/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-21 22:07:11
 * @LastEditTime: 2025-03-23 11:55:03
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { KoattyContext } from "koatty_core";
import { Exception } from "koatty_exception";
import { DefaultLogger as Logger } from "koatty_logger";
import { Span } from "@opentelemetry/api";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { Stream } from 'stream';
import { catcher, extensionOptions } from "../catcher";

// StatusEmpty
const StatusEmpty = [204, 205, 304];

/**
 * HTTP request handler middleware for Koatty framework.
 * Handles request timeout, security headers, logging, tracing and error handling.
 * 
 * @param {KoattyContext} ctx - Koatty context object
 * @param {Function} next - Next middleware function
 * @param {extensionOptions} [ext] - Extension options including timeout, encoding, span and other settings
 * @returns {Promise<any>} Response data after handling the request
 * 
 * @throws {Exception} When request timeout occurs or status code >= 400
 * 
 * Features:
 * - Sets security headers
 * - Handles request timeout (default 10s)
 * - Logs request/response details
 * - OpenTelemetry tracing support
 * - Automatic error handling
 */
export async function httpHandler(ctx: KoattyContext, next: Function, ext?: extensionOptions): Promise<any> {
  const timeout = ext.timeout || 10000;
  // Encoding
  ctx.encoding = ext.encoding;
  // auto send security header
  ctx.set('X-Powered-By', 'Koatty');
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('X-XSS-Protection', '1;mode=block');

  const span = <Span>ext.span;
  if (span) {
    span.setAttribute(SemanticAttributes.HTTP_URL, ctx.originalUrl);
    span.setAttribute(SemanticAttributes.HTTP_METHOD, ctx.method);
  }

  // response finish
  ctx?.res?.once('finish', () => {
    const now = Date.now();
    const msg = `{"action":"${ctx.method}","status":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","requestId":"${ctx.requestId}","endTime":"${now}","path":"${ctx.originalPath || '/'}"}`;
    Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
    if (span) {
      span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, ctx.status);
      span.setAttribute(SemanticAttributes.HTTP_METHOD, ctx.method);
      span.setAttribute(SemanticAttributes.HTTP_URL, ctx.url);
      span.addEvent("request", { "message": msg });
      span.end();
    }
    // ctx = null;
  });

  // try /catch
  const response: any = ctx.res;
  try {
    if (!ext.terminated) {
      response.timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Deadline exceeded')); // 抛出超时异常
        }, timeout);
      });

      await Promise.race([next(), response.timeout]).then(() => {
        clearTimeout(response.timeout);
      }).catch((err) => {
        clearTimeout(response.timeout);
        throw err;
      });
    }

    if (ctx.body !== undefined && ctx.status === 404) {
      ctx.status = 200;
    }

    if (ctx.status >= 400) {
      throw new Exception(ctx.message, 1, ctx.status);
    }
    return respond(ctx);
  } catch (err: any) {
    return catcher(ctx, err, span, ext.globalErrorHandler, ext);
  } finally {
    clearTimeout(response.timeout);
  }
}

/**
 * Response helper.
 * A copy of koa respond: https://github.com/koajs/koa/blob/aa816ca523e0f7f3ca7623163762a2e63a7b0ee3/lib/application.js#L220
 *
 * @param {KoattyContext} ctx
 * @returns {*}  
 */
export function respond(ctx: KoattyContext) {
  // allow bypassing koa
  if (false === ctx.respond) return;

  if (!ctx.writable) return;

  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;

  // ignore body
  if (StatusEmpty.includes(code)) {
    // strip headers
    ctx.body = null;
    return res.end();
  }

  if ('HEAD' === ctx.method) {
    if (!res.headersSent && !(<any>ctx.response).has('Content-Length')) {
      const { length } = ctx.response;
      if (Number.isInteger(length)) ctx.length = length;
    }
    return res.end();
  }

  // status body
  if (null == body) {
    if ((<any>ctx.response)._explicitNullBody) {
      ctx.response.remove('Content-Type');
      ctx.response.remove('Transfer-Encoding');
      return res.end();
    }
    if (ctx.req.httpVersionMajor >= 2) {
      body = String(code);
    } else {
      body = ctx.message || String(code);
    }
    if (!res.headersSent) {
      ctx.type = 'text';
      ctx.length = Buffer.byteLength(<string>body);
    }
    return res.end(body);
  }

  // status
  if (code === 404) {
    ctx.status = 200;
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body);
  if ('string' === typeof body) return res.end(body);
  if (body instanceof Stream) return (<Stream>body).pipe(res);

  // body: json
  body = JSON.stringify(body);
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(<string>body);
  }
  res.end(body);
}
