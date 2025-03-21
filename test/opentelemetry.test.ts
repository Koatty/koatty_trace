import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, trace } from '@opentelemetry/api';
import { Koatty } from 'koatty_core';
import { initOpenTelemetry, startTracer } from '../src/opentelemetry';
import { TraceOptions } from '../src/itrace';
import sinon from 'sinon';

jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/exporter-trace-otlp-http');

describe('OpenTelemetry Integration', () => {
  let mockApp: Koatty;
  let consoleSpy;
  let mockSdk: jest.Mocked<NodeSDK>;
  const originalEnv = process.env;

  beforeEach(() => {
    // 模拟Koatty应用实例
    mockApp = {
      name: 'test-app',
      version: '1.0.0',
      env: 'test',
      on: jest.fn(),
    } as unknown as Koatty;

    // 重置环境变量
    jest.resetModules();
    process.env = { ...originalEnv };

    // 模拟SDK实例
    mockSdk = new NodeSDK() as jest.Mocked<NodeSDK>;
    (NodeSDK as jest.MockedClass<typeof NodeSDK>).mockImplementation(() => mockSdk);

    consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => { });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('initOpenTelemetry', () => {
    it('应该正确配置资源属性', () => {
      // 设置环境变量
      process.env.OTEL_SERVICE_NAME = 'env-service';
      process.env.OTEL_SERVICE_VERSION = '2.0.0';
      process.env.OTEL_ENV = 'staging';

      const options: TraceOptions = { OtlpEndpoint: 'http://custom-endpoint' };
      const sdk = initOpenTelemetry(mockApp, options);

      expect(sdk).toBeInstanceOf(NodeSDK);
      expect(NodeSDK).toHaveBeenCalledWith({
        resource: expect.objectContaining({
          attributes: expect.objectContaining({
            'service.name': 'env-service',
            'service.version': '2.0.0',
            'deployment.environment': 'staging',
            'koatty.version': '1.0.0',
          })
        }),
        traceExporter: expect.any(OTLPTraceExporter),
        instrumentations: expect.arrayContaining([expect.any(Object)])
      });
    });

    it('应该正确配置OTLP导出器', () => {
      const options: TraceOptions = { 
        OtlpEndpoint: 'http://custom-endpoint',
        OtlpHeaders: { 'x-api-key': 'test-key' }
      };
      
      initOpenTelemetry(mockApp, options);
      
      expect(OTLPTraceExporter).toHaveBeenCalledWith({
        url: 'http://custom-endpoint',
        headers: { 'x-api-key': 'test-key' }
      });
    });
  });

  describe('startTracer', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      // 使用replace替代spy/stub避免重复包装
      sandbox.replace(console, 'info', () => {});
      sandbox.replace(console, 'error', () => {});
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('成功启动时应记录日志', async () => {
      
      mockSdk.start = jest.fn().mockResolvedValue(undefined);
      
      startTracer(mockSdk, mockApp, {});
      
      expect(mockSdk.start).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('OpenTelemetry SDK started successfully');
      // expect(sandbox.spies['console.info'].calledWith('OpenTelemetry SDK started successfully')).toBeTruthy();
    });

    it('启动失败时应降级到无操作跟踪器', async () => {
      const error = new Error('Init failed');
      mockSdk.start = jest.fn().mockRejectedValue(error);
      
      await expect(startTracer(mockSdk, mockApp, {})).rejects.toThrow('Init failed');
      
      expect(console.error).toHaveBeenCalledWith(
        'OpenTelemetry SDK初始化失败: Init failed',
        expect.objectContaining({
          config: expect.objectContaining({
            serviceName: 'test-app'
          })
        })
      );
      
      const currentTracer = trace.getTracerProvider().getTracer('test');
      expect(currentTracer).toEqual(trace.getTracerProvider().getTracer('noop'));
    });

    it('应用停止时应关闭SDK', async () => {
      const shutdownSpy = jest.spyOn(mockSdk, 'shutdown');
      const mockStopHandler = jest.fn();
      (mockApp.on as jest.Mock).mockImplementation((event, handler) => {
        if (event === 'appStop') mockStopHandler.mockImplementation(handler);
      });

      startTracer(mockSdk, mockApp, {});
      mockStopHandler(); // 触发appStop事件

      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  // 测试异步上下文传播
  describe('Context Propagation', () => {
    it('应该保持跨异步操作的上下文', async () => {
      const { AsyncLocalStorage } = await import('async_hooks');
      const storage = new AsyncLocalStorage<string>();

      const tracer = trace.getTracer('test');
      tracer.startActiveSpan('test-span', (span) => {
        storage.run('test-context', () => {
          expect(storage.getStore()).toBe('test-context');
          span.end();
        });
      });
    });
  });
});
