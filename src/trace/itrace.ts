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
  requestIdHeaderName?: string;
  requestIdName?: string;
  idFactory?: Function;
  encoding?: string;
  enableTrace?: boolean;
  asyncHooks?: boolean;
  /**
   * Metrics configuration
   */
  metricsConf?: {
    /**
     * Metrics reporter function
     */
    reporter?: (metrics: {
      duration: number;
      status: number;
      path: string;
      attributes: Record<string, any>;
    }) => void;
    /**
     * Default attributes for metrics
     */
    defaultAttributes?: Record<string, any>;
  };
  
  /**
   * OpenTelemetry configuration
   */
  opentelemetryConf?: {
    /**
     * OTLP endpoint URL
     */
    endpoint?: string;
    /**
     * OTLP headers
     */
    headers?: Record<string, string>;
    /**
     * Resource attributes
     */
    resourceAttributes?: Record<string, string>;
    /**
     * Instrumentations to enable
     */
    instrumentations?: Instrumentation[];
    /**
     * Exporter timeout in milliseconds
     */
    timeout?: number;
    /**
     * Maximum lifetime for a span in milliseconds
     */
    spanTimeout?: number;
    /**
   * Request attributes to be added to the span
   */
    spanAttributes?: (ctx: KoattyContext) => Record<string, any>;

    /**
     * Sampling rate (0.0 - 1.0)
     */
    samplingRate?: number;
    /**
     * Maximum number of spans in batch queue
     */
    batchMaxQueueSize?: number;
    /**
     * Maximum number of spans to export in one batch
     */
    batchMaxExportSize?: number;
    /**
     * Delay between batch exports in milliseconds
     */
    batchDelayMillis?: number;
    /**
     * Timeout for batch export in milliseconds
     */
    batchExportTimeout?: number;
  };
  /**
   * Whether to enable topology analysis (default: same as enableTrace)
   */
  enableTopology?: boolean;
  /**
   * Retry configuration
   */
  retryConf?: {
    /**
     * Whether to enable retry mechanism (default: false)
     */
    enabled?: boolean;
    /**
     * Max retry count when error occurs (default: 3)
     */
    count?: number;
    /**
     * Retry interval in milliseconds (default: 1000)
     */
    interval?: number;
    /**
     * Custom function to determine if error should be retried
     */
    conditions?: (error: any) => boolean;
  };
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
  spanManager?: SpanManager,
  /** 自定义全局异常处理类 */
  globalErrorHandler?: any,
  /** 压缩方式 none|gzip|brotli */
  compression?: string,
}
