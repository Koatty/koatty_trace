/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-21 22:07:11
 * @LastEditTime: 2025-03-23 11:46:32
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { KoattyContext } from "koatty_core";
import { Exception } from "koatty_exception";
import { DefaultLogger as Logger } from "koatty_logger";
import { Span } from "@opentelemetry/api";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { inspect } from "util";
import { catcher, extensionOptions } from "../catcher";

/**
 * WebSocket request handler middleware for Koatty framework.
 * Handles WebSocket connections, adds security headers, tracing spans, and timeout control.
 * 
 * @param {KoattyContext} ctx - The Koatty context object
 * @param {Function} next - The next middleware function
 * @param {extensionOptions} ext - Extension options including timeout, encoding, span and error handlers
 * @returns {Promise<any>} Returns null on success or error response from catcher
 * @throws {Exception} Throws exception when status code >= 400 or timeout exceeded
 */
export async function wsHandler(ctx: KoattyContext, next: Function, ext?: extensionOptions): Promise<any> {
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


  // after send message event
  const finish = () => {
    const now = Date.now();
    const msg = `{"action":"${ctx.protocol}","status":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","requestId":"${ctx.requestId}","endTime":"${now}","path":"${ctx.originalPath || '/'}"}`;
    Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
    if (span) {
      span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, ctx.status);
      span.setAttribute(SemanticAttributes.HTTP_METHOD, ctx.method);
      span.setAttribute(SemanticAttributes.HTTP_URL, ctx.url);
      span.addEvent("request", { "message": msg });
      span.end();
    }
    // ctx = null;
  }
  ctx?.res?.once("finish", finish);

  // ctx.websocket.once("error", finish);
  // ctx.websocket.once("connection", () => {
  //     Logger.Info("websocket connected");
  // });
  // ctx.websocket.once("close", (socket: any, code: number, reason: Buffer) => {
  //     Logger.Error("websocket closed: ", Helper.toString(reason));
  // });

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
    ctx.websocket.send(inspect(ctx.body || ''), null);
    return null;
  } catch (err: any) {
    return catcher(ctx, err, span, ext.globalErrorHandler, ext);
  } finally {
    ctx.res.emit("finish");
  }

}
