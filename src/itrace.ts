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
}
