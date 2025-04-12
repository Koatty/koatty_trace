import { HttpHandler } from "../../src/handler/http";
import { KoattyContext } from "koatty_core";
import { Exception } from "koatty_exception";
import { extensionOptions } from "../../src/trace/itrace";

describe('HttpHandler', () => {
  let handler: HttpHandler;
  let mockCtx: any;
  let mockNext: jest.Mock;
  let mockExt: extensionOptions;

  beforeEach(() => {
    handler = HttpHandler.getInstance();
    mockNext = jest.fn().mockResolvedValue(undefined);
    
    mockExt = {
      timeout: 1000,
      compression: 'none',
      spanManager: {
        getSpan: jest.fn().mockReturnValue({
          spanContext: () => ({ traceId: 'mock-trace-id', spanId: 'mock-span-id' }),
          setAttribute: jest.fn(),
          setAttributes: jest.fn(),
          addEvent: jest.fn(),
          setStatus: jest.fn(),
          updateName: jest.fn(),
          end: jest.fn(),
          isRecording: () => true,
          recordException: jest.fn()
        }),
        setSpanAttributes: jest.fn(),
        activeSpans: new Map(),
        span: {
          spanContext: () => ({ traceId: 'mock-trace-id', spanId: 'mock-span-id' })
        },
        propagator: {
          inject: jest.fn(),
          extract: jest.fn(),
          fields: () => []
        },
        options: {},
        startSpan: jest.fn(),
        endSpan: jest.fn()
      } as any
    };

    mockCtx = {
      method: 'GET',
      status: 200,
      body: 'test response',
      startTime: Date.now(),
      requestId: 'test-request-id',
      originalPath: '/test',
      headers: {},
      res: {
        end: jest.fn(function(this: any, data?: any) {
          if (data) this.body = data;
          return this;
        }),
        once: jest.fn(),
        setTimeout: jest.fn(),
        writeHead: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn(() => null),
        headersSent: false
      },
      get: jest.fn((key: string) => mockCtx.headers[key.toLowerCase()] || ''),
      set: jest.fn((key: string, value: string) => {
        mockCtx.headers[key.toLowerCase()] = value;
      }),
      respond: true,
      writable: true
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = HttpHandler.getInstance();
      const instance2 = HttpHandler.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('handle', () => {
    it('should handle successful request', async () => {
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockNext).toHaveBeenCalled();
      expect(mockCtx.res.end).toHaveBeenCalledWith('test response');
    });

    it('should return error response on timeout', async () => {
      mockNext.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 2000)));
      const result = await handler.handle(mockCtx, mockNext, mockExt);
      expect(result.body).toContain('Deadline exceeded');
    });

    it('should convert 404 to 200 when body exists', async () => {
      mockCtx.status = 404;
      mockCtx.body = 'exists';
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockCtx.status).toBe(200);
    });

    it('should return error response for status >=400', async () => {
      mockCtx.status = 400;
      mockCtx.message = 'Bad Request';
      const result = await handler.handle(mockCtx, mockNext, mockExt);
      expect(result.body).toContain('Bad Request');
    });

    it('should handle empty status codes (204,205,304)', async () => {
      mockCtx.status = 204;
      mockCtx.body = null;
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockCtx.res.end).toHaveBeenCalled();
    });
  });

  describe('response handling', () => {
    it('should handle HEAD method', async () => {
      mockCtx.method = 'HEAD';
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockCtx.res.end).toHaveBeenCalled();
    });

    it('should handle JSON response', async () => {
      mockCtx.body = { key: 'value' };
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockCtx.res.end).toHaveBeenCalledWith(JSON.stringify({ key: 'value' }));
    });

    it('should apply gzip compression when requested', async () => {
      mockExt.compression = 'gzip';
      mockCtx.headers['accept-encoding'] = 'gzip';
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockCtx.set).toHaveBeenCalledWith('Content-Encoding', 'gzip');
    });

    it('should apply brotli compression when requested', async () => {
      mockExt.compression = 'brotli';
      mockCtx.headers['accept-encoding'] = 'br';
      await handler.handle(mockCtx, mockNext, mockExt);
      expect(mockCtx.set).toHaveBeenCalledWith('Content-Encoding', 'br');
    });
  });
});
