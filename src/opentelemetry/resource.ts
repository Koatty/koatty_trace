/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-04 12:21:48
 * @LastEditTime: 2025-04-04 19:11:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { resourceFromAttributes } from '@opentelemetry/resources';
import { Koatty } from 'koatty_core';
import { 
  ATTR_SERVICE_NAME, 
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME, 
  ATTR_TELEMETRY_SDK_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT
} from "@opentelemetry/semantic-conventions";

/**
 * Create OpenTelemetry resource attributes
 * @param app Koatty application instance
 * @param options Trace configuration options
 * @returns Configured resource attributes
 */
export function createResourceAttributes(app: Koatty, options: any) {
  const serviceName = process.env.OTEL_SERVICE_NAME || app.name;
  if (!serviceName) {
    throw new Error('Service name is required');
  }

  return resourceFromAttributes(Object.assign(
    {
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || app.version || '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.OTEL_ENV || app.env || 'development',
      [ATTR_TELEMETRY_SDK_NAME]: 'opentelemetry',
      [ATTR_TELEMETRY_SDK_LANGUAGE]: 'nodejs',
      [ATTR_TELEMETRY_SDK_VERSION]: process.env.OTEL_SDK_VERSION || '1.0.0',
      'process.pid': process.pid
    },
    options.otlpResourceAttributes || {}
  ));
}
