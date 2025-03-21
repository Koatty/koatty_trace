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
import {  trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { Koatty } from 'koatty_core';
import { TraceOptions } from './itrace';
import { DefaultLogger as logger } from "koatty_logger";

/**
 * Initialize OpenTelemetry SDK for Koatty application
 * 
 * @param {Koatty} app - The Koatty application instance
 * @param {TraceOptions} options - Configuration options for tracing
 * @returns {NodeSDK} Configured OpenTelemetry SDK instance
 * 
 * @description
 * Sets up OpenTelemetry with OTLP exporter and auto-instrumentations for Node.js.
 * Configures service attributes, SDK metadata, and custom properties.
 */
export function initOpenTelemetry(app: Koatty, options: TraceOptions) {
  const traceExporter = new OTLPTraceExporter({
    // 根据实际安装版本使用正确的配置参数
    url: options.OtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    headers: options.OtlpHeaders || {}
  });

  // Enable logging for debugging
  // diag.setLogger(new Logger(), DiagLogLevel.INFO);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      // 标准语义属性
      'service.name': process.env.OTEL_SERVICE_NAME || app.name || 'koatty-app',
      'service.version': process.env.OTEL_SERVICE_VERSION || app.version || '1.0.0',
      'deployment.environment': process.env.OTEL_ENV || app.env || 'development',
      
      // SDK元数据
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.version': process.env.OTEL_SDK_VERSION || '1.0.0',
      
      // 自定义属性
      'koatty.version': app.version,
      'process.pid': process.pid
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

  return sdk;
}


/**
 * Start OpenTelemetry tracer with provided SDK and configuration
 * 
 * @param sdk - OpenTelemetry NodeSDK instance
 * @param app - Koatty application instance
 * @param options - Trace configuration options
 * 
 * @description
 * Initializes OpenTelemetry SDK and sets up tracing. If initialization fails,
 * falls back to a no-op tracer to maintain application availability.
 * Automatically shuts down the SDK when the application stops.
 * 
 * @throws {Error} Logs error if SDK initialization fails
 */
export async function startTracer(sdk: NodeSDK, app: Koatty, options: TraceOptions) {
  try {
    await sdk.start();
    logger.info('OpenTelemetry SDK started successfully');
  } catch (err) {
    logger.error(`OpenTelemetry SDK初始化失败: ${err.message}`, {
      stack: err.stack,
      code: err.code,
      config: {
        endpoint: options.OtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        serviceName: app.name
      }
    });

    // 降级到无操作跟踪器保证应用可用性
    const noopTracer = trace.getTracerProvider().getTracer('noop');
    trace.setGlobalTracerProvider({
      getTracer: () => noopTracer
    });
  }
  app.on("appStop", () => {
    sdk
      .shutdown()
      .then(() => logger.info('OpenTelemetry SDK shut down successfully'))
      .catch((error) => logger.error('Error shutting down OpenTelemetry SDK', error))
      .finally(() => process.exit(0));
  });
}
