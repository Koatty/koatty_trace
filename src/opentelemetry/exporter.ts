/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-04 19:11:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';

/**
 * Custom OTLP Trace Exporter with retry mechanism
 */
export class RetryOTLPTraceExporter extends OTLPTraceExporter {
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config: any) {
    super(config);
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  async export(spans: any, resultCallback: (result: ExportResult) => void) {
    let lastError: Error;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await super.export(spans, resultCallback);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
    resultCallback({code: ExportResultCode.FAILED, error: lastError});
  }
}
