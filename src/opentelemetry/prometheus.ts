/**
 * Prometheus metrics exporter
 * @Description: Handle business metrics reporting
 * @Author: richen
 * @Date: 2025-04-13
 * @License: BSD (3-Clause)
 */
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { TraceOptions } from '../trace/itrace';
import { Koatty } from 'koatty_core';

/**
 * Initialize and configure Prometheus metrics exporter
 * 
 * @param {Koatty} app - The Koatty application instance
 * @param {TraceOptions} options - Configuration options for tracing
 * @returns {MeterProvider | null} Returns MeterProvider instance if metrics enabled, null otherwise
 * 
 * @description
 * This function sets up Prometheus metrics exporter based on the provided configuration.
 * It only initializes the exporter in production environment or when metricsEndpoint is specified.
 * The function configures the exporter with the specified endpoint and port, and registers default metrics.
 */
export function initPrometheusExporter(app: Koatty, options: TraceOptions): MeterProvider | null {
// Environment detection
  const isProduction = options.metricsConf?.metricsEndpoint
    || process.env.NODE_ENV === 'production';

  if (!isProduction || !options.metricsConf?.metricsEndpoint) {
    return null;
  }

  const exporter = new PrometheusExporter({
    endpoint: options.metricsConf.metricsEndpoint,
    port: options.metricsConf.metricsPort || 9464
  });

  const meterProvider = new MeterProvider({
    readers: [exporter]
  });

  // Register default metrics
  registerDefaultMetrics(meterProvider, app);

  return meterProvider;
}

/**
 * Register default metrics for OpenTelemetry monitoring
 * 
 * @param meterProvider - The OpenTelemetry MeterProvider instance
 * @param app - The Koatty application instance
 * @returns Object containing metrics counters and histogram
 *          - requestCounter: Counter for total HTTP requests
 *          - errorCounter: Counter for HTTP errors
 *          - responseTime: Histogram for response time in seconds
 */
function registerDefaultMetrics(meterProvider: MeterProvider, app: Koatty) {
  const meter = meterProvider.getMeter(app.name);

  // Request metrics
  const requestCounter = meter.createCounter('http_requests_total', {
    description: 'Total HTTP requests',
    unit: '1'
  });

  // Error metrics
  const errorCounter = meter.createCounter('http_errors_total', {
    description: 'Total HTTP errors',
    unit: '1'
  });

  // Response time histogram
  const responseTime = meter.createHistogram('http_response_time_seconds', {
    description: 'HTTP response time in seconds',
    unit: 's',
    advice: { explicitBucketBoundaries:[0.1, 0.5, 1, 2.5, 5, 10]}
  });

  return {
    requestCounter,
    errorCounter,
    responseTime
  };
}
