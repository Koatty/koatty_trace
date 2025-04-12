/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-04 20:00:41
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import { KoattyContext } from "koatty_core";
import { Exception } from "koatty_exception";
import { DefaultLogger as Logger } from "koatty_logger";
import { Span } from "@opentelemetry/api";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { Stream } from 'stream';
import { catcher } from "../trace/catcher";
import { BaseHandler, Handler } from "./base";
import { extensionOptions } from "../trace/itrace";
const zlib = require('zlib');
const { brotliCompressSync } = require('brotli-wasm');

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
export class HttpHandler extends BaseHandler implements Handler {
  private static instance: HttpHandler;

  private constructor() {
    super();
  }

  public static getInstance(): HttpHandler {
    if (!HttpHandler.instance) {
      HttpHandler.instance = new HttpHandler();
    }
    return HttpHandler.instance;
  }

  async handle(ctx: KoattyContext, next: Function, ext?: extensionOptions): Promise<any> {
    const timeout = ext.timeout || 10000;

    this.commonPreHandle(ctx, ext);
    ctx?.res?.once('finish', () => {
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
      return respond(ctx, ext);
    } catch (err: any) {
      return this.handleError(err, ctx, ext);
    } finally {
      clearTimeout(response.timeout);
    }
  }
}

/**
 * Response helper with compression support.
 * A copy of koa respond: https://github.com/koajs/koa/blob/aa816ca523e0f7f3ca7623163762a2e63a7b0ee3/lib/application.js#L220
 *
 * @param {KoattyContext} ctx
 * @returns {*}  
 */
export function respond(ctx: KoattyContext, ext?: extensionOptions) {
  let compressStream: NodeJS.ReadWriteStream | null = null;
  let compressSync: ((data: any) => Buffer) | null = null;
  // Check if client accepts compression
  const acceptEncoding = ctx.get('Accept-Encoding') || '';
  let compression = ext.compression || 'none'; // none|gzip|brotli
  if (compression === "none") {
    if (acceptEncoding.includes('gzip')) {
      compression = 'gzip';
    } else if (acceptEncoding.includes('br')) {
      compression = 'brotli';
    }
  }
  
  // Skip compression for small responses and specific content types
  // const shouldCompress = !ctx.response.get('Content-Encoding') && 
  //   !ctx.response.get('Content-Length') &&
  //   !['image', 'audio', 'video', 'font', 'application/octet-stream'].some(type => 
  //     ctx.response.get('Content-Type')?.includes(type)
  //   );
  // allow bypassing koa
  if (false === ctx.respond) return;

  if (!ctx.writable) return;

  // Compression logic
  if (compression !== 'none') {
    if (compression === 'brotli') {
      try {
        ctx.set('Content-Encoding', 'br');
        compressSync = brotliCompressSync;
      } catch (e) {
        Logger.Debug('brotli-wasm not available, falling back to gzip');
      }
    }
    
    if (!compressSync && compression === 'gzip') {
      ctx.set('Content-Encoding', 'gzip');
      compressStream = zlib.createGzip();
    }
  }

  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;

  // Apply compression if enabled
  if (compressSync) {
    if (Buffer.isBuffer(body) || typeof body === 'string') {
      body = compressSync(body);
    }
  } else if (compressStream) {
    if (body instanceof Stream) {
      body = body.pipe(compressStream);
    }
  }

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
  if (compressSync && compression !== 'none') {
    body = compressSync(body);
  }
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(<string>body);
  }
  res.end(body);
}
