/**
 * 
 * @Description: 协议处理器工厂类
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-04 19:11:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { ProtocolType } from './base';
import type { Handler } from './base';
import { HttpHandler } from './http';
import { GrpcHandler } from './grpc';
import { WsHandler } from './ws';


export class HandlerFactory {
  private static handlers = new Map<ProtocolType, Handler>();

  /**
   * 初始化默认处理器
   */
  static {
    this.register(ProtocolType.HTTP, HttpHandler.getInstance());
    this.register(ProtocolType.GRPC, GrpcHandler.getInstance());
    this.register(ProtocolType.WS, WsHandler.getInstance());
  }

  /**
   * 注册协议处理器
   * @param type 协议类型 
   * @param handler 处理器实例
   */
  static register(type: ProtocolType, handler: Handler) {
    this.handlers.set(type, handler);
  }

  /**
   * 获取协议处理器
   * @param type 协议类型
   * @returns 对应的处理器实例
   */
  static getHandler(type: ProtocolType): Handler {
    const handler = this.handlers.get(type);
    // Fallback to HTTP handler if protocol not supported
    return handler || this.handlers.get(ProtocolType.HTTP)!;
  }
}
