/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-21 22:10:12
 * @LastEditTime: 2025-03-23 12:02:14
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { Span } from '@opentelemetry/api';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { KoattyContext } from 'koatty_core';
import { SpanManager } from '../opentelemetry/spanManager';

/**
 * TraceOptions
 *
 * @export
 * @interface TraceOptions
 */
export interface TraceOptions {
  timeout?: number; // response timeout
  /**
   * Request attributes to be added to the span
   */
  spanAttributes?: (ctx: KoattyContext) => Record<string, any>;
  /**
   * Metrics reporter function
   */
  metricsReporter?: (metrics: {
    duration: number;
    status: number;
    path: string;
    attributes: Record<string, any>;
  }) => void;
  requestIdHeaderName?: string;
  requestIdName?: string;
  idFactory?: Function;
  encoding?: string;
  enableTrace?: boolean;
  asyncHooks?: boolean;
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  /**
   * Custom resource attributes for OpenTelemetry
   */
  otlpResourceAttributes?: Record<string, string>;
  /**
   * OpenTelemetry instrumentations to enable
   */
  otlpInstrumentations?: Instrumentation[];
  /**
   * OTLP exporter timeout in milliseconds
   */
  otlpTimeout?: number;
  /**
   * Maximum lifetime for a span in milliseconds (default: 30000)
   */
  spanTimeout?: number;
  /**
   * Sampling rate for spans (0.0 - 1.0)
   */
  /**
   * 采样率 (0.0 - 1.0)
   */
  samplingRate?: number;
  /**
   * Maximum number of spans in batch queue (default: 2048)
   */
  batchMaxQueueSize?: number;
  /**
   * Maximum number of spans to export in one batch (default: 512)
   */
  batchMaxExportSize?: number;
  /**
   * Delay in milliseconds between batch exports (default: 5000)
   */
  batchDelayMillis?: number;
  /**
   * Timeout in milliseconds for batch export (default: 30000)
   */
  batchExportTimeout?: number;
  /**
   * Whether to enable topology (default: false)
   * @default false
   */
  enableTopology?: boolean;
}


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
  spanManager?: SpanManager,
  /** 自定义全局异常处理类 */
  globalErrorHandler?: any,
  /** 压缩方式 none|gzip|brotli */
  compression?: string,
}