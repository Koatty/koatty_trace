/**
 * 
 * @Description: 
 * @Author: richen
 * @Date: 2025-03-20 12:01:50
 * @LastEditTime: 2025-03-20 12:02:12
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

/**
 * TraceOptions
 *
 * @export
 * @interface TraceOptions
 */
export interface TraceOptions {
  RequestIdHeaderName?: string;
  RequestIdName?: string;
  IdFactory?: Function;
  Timeout?: number;
  Encoding?: string;
  EnableTrace?: boolean;
  AsyncHooks?: boolean;
  OtlpEndpoint?: string;
  OtlpHeaders?: Record<string, string>;
}
