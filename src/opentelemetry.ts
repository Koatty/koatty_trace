/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-19 18:31:54
 * @LastEditTime: 2025-03-20 13:32:46
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, DiagLogLevel, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { Koatty } from 'koatty_core';
import { TraceOptions } from './itrace';
import { DefaultLogger as logger } from "koatty_logger";
import { Logger } from './logger';

/**
 * Initialize OpenTelemetry SDK
 *
 * @param {Koatty} app
 */
export function initOpenTelemetry(app: Koatty, options: TraceOptions) {
  const traceExporter = new OTLPTraceExporter({
    url: options.OtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
  });

  // Enable logging for debugging
  diag.setLogger(new Logger(), DiagLogLevel.INFO);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": app.name || 'koatty-app',
      'service.version': app.version || '1.0.0',
      'environment': app.env || process.env.NODE_ENV || 'development'
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-grpc': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-koa': {
          enabled: true,
        }
      })
    ],
  });

  try {
    sdk.start();
    logger.info('OpenTelemetry SDK started successfully');
  } catch (err) {
    logger.error('OpenTelemetry SDK failed to start', err);
    // 回退到NoopTracerProvider避免进程崩溃
    trace.setGlobalTracerProvider(trace.getTracerProvider());
  }
  app.on("appStop", () => {
    sdk
      .shutdown()
      .then(() => logger.info('OpenTelemetry SDK shut down successfully'))
      .catch((error) => logger.error('Error shutting down OpenTelemetry SDK', error))
      .finally(() => process.exit(0));
  });
}
