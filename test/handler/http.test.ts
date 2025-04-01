/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-01 15:47:41
 * @LastEditTime: 2025-04-01 15:48:16
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { httpHandler } from '../../src/handler/http';
import { KoattyContext } from 'koatty_core';
import * as catcher from '../../src/catcher';

jest.mock('../../src/catcher');

describe('httpHandler', () => {
  let mockGetInsByClass: jest.Mock;

  it('should handle HTTP request', async () => {
    const ctx = {
      protocol: 'http',
      requestId: 'test-request-id',
      set: jest.fn(),
      headers: {},
      res: {
        once: jest.fn(),
        emit: jest.fn()
      },
      setMetaData: jest.fn(),
      getMetaData: jest.fn()
    } as unknown as KoattyContext;

    const next = jest.fn();
    const ext = {
      requestId: 'test-request-id',
      debug: true
    };

    await httpHandler(ctx, next, ext);
    
    // expect(ctx).toHaveProperty(
    //   'X-Request-Id', 'test-request-id'
    // );
    expect(next).toHaveBeenCalled();
  });

  it('should handle HTTP error', async () => {
    const ctx = {
      protocol: 'http',
      requestId: 'test-request-id',
      set: jest.fn(),
      headers: {},
      res: {
        once: jest.fn(),
        emit: jest.fn()
      },
      setMetaData: jest.fn(),
      getMetaData: jest.fn()
    } as unknown as KoattyContext;

    const next = jest.fn().mockRejectedValue(new Error('test error'));
    const ext = {
      requestId: 'test-request-id',
      debug: true,
    };
    
    await httpHandler(ctx, next, ext);
    
    expect(catcher.catcher).toHaveBeenCalled();
  });

  it('should handle HTTP timeout', async () => {
    const ctx = {
      protocol: 'http',
      requestId: 'test-request-id',
      set: jest.fn(),
      headers: {},
      res: {
        once: jest.fn(),
        emit: jest.fn()
      },
      setMetaData: jest.fn(),
      getMetaData: jest.fn()
    } as unknown as KoattyContext;

    const next = jest.fn().mockImplementation(() => new Promise(() => {}));
    const ext = {
      requestId: 'test-request-id',
      debug: true,
      timeout: 100,
      globalErrorHandler: {
        catch: jest.fn()
      }
    };

    await httpHandler(ctx, next, ext);
    
    expect(catcher.catcher).toHaveBeenCalled();
  });
});
