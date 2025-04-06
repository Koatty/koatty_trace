/**
 * @Description: GraphQL协议处理器
 */
import { KoattyContext, KoattyNext } from "koatty_core";
import { Exception } from "koatty_exception";
import { DefaultLogger as Logger } from "koatty_logger";
import { Span } from '@opentelemetry/api';
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { catcher, extensionOptions } from "../catcher";
import { BaseHandler, Handler } from "./base";

export class GraphQLHandler extends BaseHandler implements Handler {
  private static instance: GraphQLHandler;

  private constructor() {
    super();
  }

  public static getInstance(): GraphQLHandler {
    if (!GraphQLHandler.instance) {
      GraphQLHandler.instance = new GraphQLHandler();
    }
    return GraphQLHandler.instance;
  }

  async handle(ctx: KoattyContext, next: KoattyNext, ext?: extensionOptions): Promise<any> {
    const timeout = ext?.timeout || 10000;

    this.commonPreHandle(ctx, ext);
    ctx?.res?.once('finish', () => {
      const now = Date.now();
      const msg = `{"action":"GraphQL","status":"${ctx.status}","startTime":"${ctx.startTime}","duration":"${now - ctx.startTime}","requestId":"${ctx.requestId}","endTime":"${now}","path":"${ctx.originalPath || '/graphql'}"}`;
      this.commonPostHandle(ctx, ext, msg);
    });

    try {
      // Parse GraphQL query with type assertion
      const body = ctx.getMetaData("_body")[0];

      // Add GraphQL specific tracing
      if (ext?.span) {
        ext.span.setAttribute('graphql.operation', body.operationName || 'anonymous');
        ext.span.setAttribute('graphql.query', body.query);
      }

      await next();
      
      if (ctx.status >= 400) {
        throw new Exception(ctx.message, 1, ctx.status);
      }
      return ctx.body;
    } catch (err) {
      return this.handleError(err, ctx, ext);
    }
  }
}
