/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-20 17:01:12
 * @LastEditTime: 2025-03-20 17:28:31
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import type { Koatty } from 'koatty_core';
import { initOpenTelemetry } from '../src/opentelemetry';
import { diag } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';

describe('OpenTelemetry Initialization', () => {
  let sdk: NodeSDK;
  
  const mockApp: Koatty = {
    name: 'test-app',
    version: '1.0.0',
    env: 'test',
    options: {},
    appDebug: true,
    appPath: __dirname,
    rootPath: process.cwd(),
    emit: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => this),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    // 简化其他必要属性
  } as unknown as Koatty;

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) {
      await sdk.shutdown();
    }
    // 清理OpenTelemetry全局状态
    require('@opentelemetry/api').diag.disable();
    jest.resetModules();
  });

  test('should initialize with default config', async () => {
    sdk = initOpenTelemetry(mockApp, {
      OtlpEndpoint: 'http://localhost:4318/v1/traces',
    }) as unknown as NodeSDK;
    await sdk.start();
    
    expect(sdk).toBeInstanceOf(NodeSDK);
    expect(mockApp.on).toHaveBeenCalledWith('appStop', expect.any(Function));
  });

  test('should set correct resource attributes', () => {
    const sdk = initOpenTelemetry(mockApp, {});
    
    const resourceAttributes = (sdk as any)._tracerProvider.getResource().attributes;
    expect(resourceAttributes['service.name']).toBe('test-app');
    expect(resourceAttributes['service.version']).toBe('1.0.0');
    expect(resourceAttributes['deployment.environment']).toBe('test');
  });

  test('should handle initialization failure gracefully', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const mockError = new Error('Connection refused');
    
    jest.spyOn(NodeSDK.prototype, 'start').mockImplementation(() => {
      throw mockError;
    });

    expect(() => initOpenTelemetry(mockApp, {})).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      'OpenTelemetry SDK初始化失败: Connection refused',
      {
        stack: mockError.stack,
        code: undefined,
        config: {
          endpoint: 'http://localhost:4318/v1/traces',
          serviceName: 'test-app'
        }
      }
    );
  });
});
