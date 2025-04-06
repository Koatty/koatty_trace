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
import { BaseHandler, Handler } from './base';

export class WsHandler extends BaseHandler implements Handler {
  private static instance: WsHandler;

  private constructor() {
    super();
  }

  public static getInstance(): WsHandler {
    if (!WsHandler.instance) {
      WsHandler.instance = new WsHandler();
    }
    return WsHandler.instance;
  }

  async handle(ctx: KoattyContext, next: Function, ext?: extensionOptions): Promise<any> {
    const timeout = ext?.timeout || 10000;
    
    this.commonPreHandle(ctx, ext);
    ctx?.res?.once("finish", () => {
      const now = Date.now();
      const msg = `{"action":"${ctx.method}","status":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${(now - ctx.startTime) || 0}","requestId":"${ctx.requestId}","endTime":"${now}","path":"${ctx.originalPath || '/'}"}`;
      this.commonPostHandle(ctx, ext, msg);
      // ctx = null;
    });

    // try /catch
    const response: any = ctx.res;
    try {
      if (!ext.terminated) {
        response.timeout = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Deadline exceeded'));
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
      ctx?.websocket?.send(inspect(ctx.body || ''), null);
      return null;
    } catch (err: any) {
      return this.handleError(err, ctx, ext);
    } finally {
      ctx.res.emit("finish");
    }
  }
}
