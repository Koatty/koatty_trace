/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2022-02-10 17:40:55
 * @LastEditTime: 2023-01-13 10:02:29
 */
import * as Helper from "koatty_lib";
import { Exception } from "./exception";

const PREVENT_NEXT_PROCESS = 'PREVENT_NEXT_PROCESS';
/**
 * Prevent next process
 *
 * @returns {Promise.reject}
 */
export function prevent(): Promise<never> {
  return Promise.reject(new Error(PREVENT_NEXT_PROCESS));
}

/**
 * Check is prevent error
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isPrevent(err: Error): boolean {
  return Helper.isError(err) && err.message === PREVENT_NEXT_PROCESS;
}

/**
 * Check if the error is a predefined exception
 *
 * @template T
 * @param {(Exception | T)} err
 * @returns {boolean}  {err is Exception}
 */
export const isException = <T extends { message: string, code?: number, status?: unknown }>(
  err: Exception | T,
): boolean =>
  err instanceof Exception ||
  !!(err && Object.hasOwnProperty.call(err, "handler") && Object.hasOwnProperty.call(err, "code"));

