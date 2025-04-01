/**
 * @Description: Test cases for trace module
 * @Author: richen
 * @Date: 2025-04-01 11:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import Koa from 'koa';
import { createServer, Server } from 'http';
import { Trace } from '../src/trace';
import { Koatty } from 'koatty_core';

describe('trace.ts', () => {
  let app: Koa;
  let server: Server;
  const port = 3002;
  const mockApp = {
    name: 'testApp',
    appDebug: true,
    getMetaData: jest.fn(),
    server: { status: 200 }
  } as unknown as Koatty;

  beforeEach((done) => {
    app = new Koa();
    server = createServer(app.callback()).listen(port, done);
  });

  afterEach((done) => {
    server.close(done);
  });

  it('should generate and propagate request ID', async () => {
    const options = {
      RequestIdHeaderName: 'X-Request-Id',
      RequestIdName: 'requestId'
    };
    
    const middleware = await Trace(options, mockApp);
    app.use(middleware);
    app.use(async ctx => {
      // ctx.requestId = 'test-request-id';
      ctx.setMetaData = jest.fn();
      ctx.getMetaData = jest.fn();
      // ctx.headers = {};
      ctx.body = JSON.stringify({ requestId: ctx.requestId });
      ctx.type = 'application/json';
    });

    const response = await fetch(`http://localhost:${port}`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.requestId).toBeDefined();
    expect(response.headers.get('X-Request-Id')).toBe(data.requestId);
  });

  it('should integrate with OpenTelemetry when enabled', async () => {
    const mockTracer = {
      startSpan: jest.fn().mockReturnValue({
        setAttribute: jest.fn(),
        end: jest.fn(),
        addEvent: jest.fn(),
        setStatus: jest.fn()
      })
    };
    mockApp.getMetaData = jest.fn().mockReturnValue([mockTracer]);
    
    const options = {
      EnableTrace: true,
      RequestIdHeaderName: 'X-Request-Id'
    };
    
    const middleware = await Trace(options, mockApp);
    app.use(middleware);
    app.use(async ctx => {
      // ctx.requestId = 'otel-request-id';
      ctx.setMetaData = jest.fn();
      ctx.getMetaData = jest.fn();
      // ctx.headers = {
      //   'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      //   'x-request-id': 'otel-request-id'
      // };
      ctx.body = JSON.stringify({ 
        success: true,
        requestId: ctx.requestId
      });
      ctx.type = 'application/json';
    });

    const response = await fetch(`http://localhost:${port}`, {
      headers: {
        'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'x-request-id': 'otel-request-id'
      }
    });
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.requestId).toBe('otel-request-id');
    expect(response.headers.get('X-Request-Id')).toBe('otel-request-id');
    expect(mockTracer.startSpan).toHaveBeenCalled();
  });

  it('should handle gRPC protocol requests', async () => {
    const options = {
      RequestIdName: 'requestId'
    };
    
    const ctx = {
      protocol: 'grpc',
      getMetaData: jest.fn().mockImplementation((key) => {
        if (key === 'originalPath') return ['/test'];
        if (key === '_body') return [{ requestId: 'grpc-request-id' }];
        return [];
      }),
      setMetaData: jest.fn((key: string, value: any) => {
        if (key === 'tracer_span') {
          ctx[key] = value;
        }
        return ctx;
      }),
      requestId: 'grpc-request-id',
      req: {
        httpVersion: '1.1',
        headers: {},
        get: jest.fn(),
        set: jest.fn(),
        socket: {
          encrypted: false
        }
      },
      query: {},
      res: {
        once: jest.fn(),
        emit: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn()
      },
      rpc: {
        call: {
          metadata: {
            set: jest.fn(),
            getMap: jest.fn().mockReturnValue(new Map()),
            get: jest.fn()
          },
          sendMetadata: jest.fn(),
          once: jest.fn(),
          callback: jest.fn().mockImplementation((err, response) => {
            if (err) throw err;
            return response;
          })
        },
        callback: jest.fn()
      },
      respond: false,
      set: jest.fn(),
      headers: {},
      body: null,
      status: 200
    } as any;

    const next = jest.fn();
    
    const middleware = await Trace(options, mockApp);
    await middleware(ctx, next);
    
    expect(ctx.requestId).toBeDefined();
    expect(ctx.rpc?.call?.metadata?.set).toHaveBeenCalled();
  });

  it('should handle WebSocket protocol requests', async () => {
    const options = {
      RequestIdHeaderName: 'X-Request-Id'
    };
    
    const ctx = {
      protocol: 'ws',
      set: jest.fn(),
      requestId: 'ws-request-id',
      respond: false,
      req: {
        httpVersion: '1.1',
        headers: {
          'x-request-id': 'ws-request-id'
        },
        get: jest.fn(),
        socket: {
          encrypted: false
        }
      },
      res: {
        setHeader: jest.fn(),
        getHeader: jest.fn(),
        once: jest.fn((event, callback) => {
          if (event === 'finish') {
            process.nextTick(() => {
              ctx.status = 200;
              callback();
            });
          }
          return ctx.res;
        }),
        emit: jest.fn(),
        on: jest.fn()
      },
      headers: {},
      body: null,
      status: 200,
      getMetaData: jest.fn(),
      setMetaData: jest.fn((key: string, value: any) => {
        if (key === 'tracer_span') {
          ctx[key] = value;
        }
      }),
      query: {},
      request: {
        headers: {
          'x-request-id': 'ws-request-id'
        }
      },
      rpc: {
        call: {
          metadata: {
            set: jest.fn(),
            getMap: jest.fn().mockReturnValue(new Map()),
            get: jest.fn()
          }
        }
      },
      setHeader: jest.fn()
    } as any;

    const next = jest.fn();
    
    const middleware = await Trace(options, mockApp);
    await middleware(ctx, next);
    
    expect(ctx.set).toHaveBeenCalledWith(
      'X-Request-Id', 
      expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
    );
  });

  it('should handle server termination', async () => {
    const terminatedApp = {
      ...mockApp,
      server: { status: 503 }
    };
    
    const ctx = {
      status: 200,
      set: jest.fn(),
      body: null,
      protocol: 'http',
      req: {
        httpVersion: '1.1',
        headers: {},
        get: jest.fn(),
        socket: {
          encrypted: false
        }
      },
      res: {
        end: jest.fn(),
        once: jest.fn((event, callback) => {
          if (event === 'finish') {
            process.nextTick(() => {
              ctx.status = 200;
              callback();
            });
          }
          return ctx.res;
        }),
      }
    } as any;

    const next = jest.fn();
    
    const middleware = await Trace({}, terminatedApp);
    await middleware(ctx, next);
    
    expect(ctx.status).toBe(503);
    expect(ctx.body).toBe('Server is in the process of shutting down');
  });
});
