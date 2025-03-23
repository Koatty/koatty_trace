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
import {  diag, DiagLogLevel, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { Koatty } from 'koatty_core';
import { TraceOptions } from './itrace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_TELEMETRY_SDK_LANGUAGE,
 ATTR_TELEMETRY_SDK_NAME, ATTR_TELEMETRY_SDK_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT, } from "@opentelemetry/semantic-conventions";
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { DefaultLogger, DefaultLogger as logger } from "koatty_logger";
import { Logger } from './logger';

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
  if (!app || !options) {
    throw new Error('app and options parameters are required');
  }

  // 验证并配置OTLP exporter
  const otlpEndpoint = options.OtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!otlpEndpoint) {
    throw new Error('OTLP endpoint is required');
  }

  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
    headers: options.OtlpHeaders || {},
    timeoutMillis: options.OtlpTimeout || 10000
  });

  // Enable logging for debugging
  const logLevel = DefaultLogger.getLevel();
  const diagLogLevel = Object.values(DiagLogLevel).find(
    (level) => level.toString() === logLevel.toString()
  ) || DiagLogLevel.INFO;
  
  diag.setLogger(new Logger(), diagLogLevel as DiagLogLevel);

  // 配置资源属性
  const serviceName = process.env.OTEL_SERVICE_NAME || app.name;
  if (!serviceName) {
    throw new Error('Service name is required');
  }

  const resourceAttributes = Object.assign(
    {
      // 标准语义属性
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || app.version || '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.OTEL_ENV || app.env || 'development',
      // SDK元数据
      [ATTR_TELEMETRY_SDK_NAME]: 'opentelemetry',
      [ATTR_TELEMETRY_SDK_LANGUAGE]: 'nodejs',
      [ATTR_TELEMETRY_SDK_VERSION]: process.env.OTEL_SDK_VERSION || '1.0.0',
      // 默认资源属性
      'process.pid': process.pid
    },
    options.OtlpResourceAttributes || {}
  );

  const sdk = new NodeSDK({
    resource: resourceFromAttributes(resourceAttributes),
    traceExporter,
    instrumentations: options.OtlpInstrumentations || [
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
  const shutdownHandler = async () => {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry SDK shut down successfully');
    } catch (error) {
      logger.error('Error shutting down OpenTelemetry SDK', error);
    } finally {
      app.off("appStop", shutdownHandler); // 确保只执行一次
    }
  };

  try {
    await sdk.start();
    logger.info('OpenTelemetry SDK started successfully');
    
  } catch (err) {
    logger.error(`OpenTelemetry SDK initialization failed: ${err.message}`, {
      stack: err.stack,
      code: err.code,
      config: {
        endpoint: options.OtlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        serviceName: app.name
      }
    });
    // 降级到无操作跟踪器保证应用可用性
    trace.setGlobalTracerProvider(new BasicTracerProvider());
    return;
  } finally {
    app.on("appStop", shutdownHandler);
  }
}
