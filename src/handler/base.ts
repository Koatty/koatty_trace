/**
 * 
 * @Description: 协议处理器基础接口
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-04 19:11:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { KoattyContext, KoattyNext } from "koatty_core";
import { extensionOptions, catcher } from "../catcher";
import { DefaultLogger as Logger } from "koatty_logger";
import { Span } from '@opentelemetry/api';
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";


export interface Handler {
  handle(ctx: KoattyContext, next: KoattyNext, ext: extensionOptions): Promise<any>;
}

export abstract class BaseHandler implements Handler {
  abstract handle(ctx: KoattyContext, next: KoattyNext, ext: extensionOptions): Promise<any>;
  
  protected commonPreHandle(ctx: KoattyContext, ext: extensionOptions) {
    // Encoding
    ctx.encoding = ext?.encoding;
    this.setSecurityHeaders(ctx);
    this.startTraceSpan(ctx, ext);
  }

  protected commonPostHandle(ctx: KoattyContext, ext: extensionOptions, msg?: string) {
    this.logRequest(ctx, ext, msg);
    this.endTraceSpan(ctx, ext, msg);
  }

  protected handleError(err: Error, ctx: KoattyContext, ext: extensionOptions) {
    return catcher(ctx, err, <Span>ext.span, ext.globalErrorHandler, ext);
  }

  private setSecurityHeaders(ctx: KoattyContext) {
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('X-XSS-Protection', '1; mode=block');
  }

  private startTraceSpan(ctx: KoattyContext, ext: extensionOptions) {
    if (ext.span) {
      ext.span.setAttribute(SemanticAttributes.HTTP_URL, ctx.originalUrl);
      ext.span.setAttribute(SemanticAttributes.HTTP_METHOD, ctx.method);
    }
  }

  private endTraceSpan(ctx: KoattyContext, ext: extensionOptions, msg?: string) {
    if (ext.span) {
      ext.span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, ctx.status);
      ext.span.setAttribute(SemanticAttributes.HTTP_METHOD, ctx.method);
      ext.span.setAttribute(SemanticAttributes.HTTP_URL, ctx.url);
      ext.span.addEvent("request", { "message": msg });
      ext.span.end();
    }
  }

  private logRequest(ctx: KoattyContext, ext: extensionOptions, msg: string) {
    Logger[(ctx.status >= 400 ? 'Error' : 'Info')](msg);
  }
}

/**
 * 处理器类型枚举
 */
export enum ProtocolType {
  HTTP = 'http',
  GRPC = 'grpc',
  WS = 'ws'
}
