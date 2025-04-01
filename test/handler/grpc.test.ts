/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-01 14:19:41
 * @LastEditTime: 2025-04-01 17:33:33
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { once } from 'events';
import { gRPCHandler } from '../../src/handler/grpc';
import { KoattyContext } from 'koatty_core';
import * as catcher from '../../src/catcher';

jest.mock('../../src/catcher');

describe('gRPCHandler', () => {
  it('should handle gRPC request with metadata', async () => {
    const ctx = {
      protocol: 'grpc',
      requestId: 'test-request-id',
      rpc: {
        call: {
          metadata: {
            set: jest.fn(),
            getMap: jest.fn().mockReturnValue(new Map()),
          },
          sendMetadata: jest.fn().mockImplementation(() => {}),
          once: jest.fn(),
        },
        callback: jest.fn()
      },
      setMetaData: jest.fn(),
      getMetaData: jest.fn(),
      res :{
        once: jest.fn(),
        emit: jest.fn()
      }
    } as unknown as KoattyContext;

    const next = jest.fn();
    const ext = {
      requestId: 'test-request-id',
      debug: true
    };

    await gRPCHandler(ctx, next, ext);
    
    expect((<any>ctx)?.rpc.call.metadata.set).toHaveBeenCalled();
    expect((<any>ctx)?.rpc.call.sendMetadata).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should handle gRPC error', async () => {
    const ctx = {
      protocol: 'grpc',
      requestId: 'test-request-id',
      rpc: {
        call: {
          metadata: {
            set: jest.fn(),
            getMap: jest.fn().mockReturnValue(new Map()),
          },
          once: jest.fn(),
          sendMetadata: jest.fn().mockImplementation(() => {})
        },
        callback: jest.fn()
      },
      setMetaData: jest.fn(),
      getMetaData: jest.fn(),
      res: {
        once: jest.fn(),
        emit: jest.fn()
      }
    } as unknown as KoattyContext;

    const next = jest.fn().mockRejectedValue(new Error('test error'));
    const ext = {
      requestId: 'test-request-id',
      debug: true,
      globalErrorHandler: {
        catch: jest.fn()
      }
    };

    await gRPCHandler(ctx, next, ext);
    
    expect(catcher.catcher).toHaveBeenCalled();
  });
});
