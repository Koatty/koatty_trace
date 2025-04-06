/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-21 22:10:12
 * @LastEditTime: 2025-03-23 12:02:14
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { Instrumentation } from '@opentelemetry/instrumentation';

/**
 * TraceOptions
 *
 * @export
 * @interface TraceOptions
 */
export interface TraceOptions {
  RequestIdHeaderName?: string;
  RequestIdName?: string;
  IdFactory?: Function;
  Timeout?: number;
  Encoding?: string;
  EnableTrace?: boolean;
  AsyncHooks?: boolean;
  OtlpEndpoint?: string;
  OtlpHeaders?: Record<string, string>;
  /**
   * Custom resource attributes for OpenTelemetry
   */
  OtlpResourceAttributes?: Record<string, string>;
  /**
   * OpenTelemetry instrumentations to enable
   */
  OtlpInstrumentations?: Instrumentation[];
  /**
   * OTLP exporter timeout in milliseconds
   */
  OtlpTimeout?: number;
  /**
   * Maximum lifetime for a span in milliseconds (default: 30000)
   */
  SpanTimeout?: number;
  /**
   * Sampling rate for spans (0.0 - 1.0)
   */
  SamplingRate?: number;
  /**
   * Maximum number of spans in batch queue (default: 2048)
   */
  BatchMaxQueueSize?: number;
  /**
   * Maximum number of spans to export in one batch (default: 512)
   */
  BatchMaxExportSize?: number;
  /**
   * Delay in milliseconds between batch exports (default: 5000)
   */
  BatchDelayMillis?: number;
  /**
   * Timeout in milliseconds for batch export (default: 30000)
   */
  BatchExportTimeout?: number;
}
