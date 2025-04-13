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
 * Initialize Prometheus exporter
 * @param {Koatty} app 
 * @param {TraceOptions} options 
 * @returns {MeterProvider|null}
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
 * Register default application metrics
 * @param {MeterProvider} meterProvider 
 * @param {Koatty} app 
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
