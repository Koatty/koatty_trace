/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-01 14:20:23
 * @LastEditTime: 2025-04-01 17:40:58
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-04-01 14:20:23
 * @LastEditTime: 2025-04-01 14:59:39
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { wsHandler } from '../../src/handler/ws';
import { KoattyContext } from 'koatty_core';
import * as catcher from '../../src/catcher';

jest.mock('../../src/catcher');
describe('wsHandler', () => {
  it('should handle WebSocket request', async () => {
    const ctx = {
      protocol: 'ws',
      requestId: 'test-request-id',
      set: jest.fn(),
      req: {
        headers: {
          'x-request-id': 'test-request-id'
        }
      },
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

    await wsHandler(ctx, next, ext);
    
    expect(ctx.set).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should handle WebSocket error', async () => {
    const ctx = {
      protocol: 'ws',
      requestId: 'test-request-id',
      set: jest.fn(),
      req: {
        headers: {
          'x-request-id': 'test-request-id'
        }
      },
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
      globalErrorHandler: {
        catch: jest.fn()
      }
    };

    await wsHandler(ctx, next, ext);
    
    expect(catcher.catcher).toHaveBeenCalled();
  });
});
