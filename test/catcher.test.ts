/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-21 22:23:25
 * @LastEditTime: 2025-03-21 22:23:48
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import Koa from 'koa';
import { catcher } from '../src/catcher';
import { createServer, Server } from 'http';

describe('catcher.ts', () => {
  let app: Koa;
  let server: Server;
  const port = 3001;

  beforeAll((done) => {
    app = new Koa();
    // 创建符合Koa中间件规范的错误处理
    app.use(async (ctx, next) => {
      try {
        await next();
        if (ctx.status === 404) {
          ctx.throw(404, 'Not Found');
        }
      } catch (err) {
        catcher(ctx, err, undefined, (err: any, ctx: any) => {
          ctx.status = err.status || 500;
          ctx.body = { 
            code: ctx.status,
            message: err.expose ? err.message : 'Internal Server Error'
          };
        }, { 
          debug: true,
          terminated: true 
        });
      }
    });
    server = createServer(app.callback()).listen(port, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should catch sync errors', async () => {
    app.use(() => { throw new Error('sync error') });
    
    const response = await fetch(`http://localhost:${port}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: 500,
      message: 'Internal Server Error'
    });
  });

  it('should catch async errors', async () => {
    app.use(async () => { 
      await Promise.reject(new Error('async error')) 
    });
    
    const response = await fetch(`http://localhost:${port}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: 500,
      message: 'Internal Server Error'
    });
  });

  it('should handle 404 not found', async () => {
    const response = await fetch(`http://localhost:${port}/not-exist`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 404,
      message: 'Not Found'
    });
  });
});
