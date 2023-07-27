<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [koatty\_trace](./koatty_trace.md) &gt; [ExceptionHandler](./koatty_trace.exceptionhandler.md)

## ExceptionHandler() function

Indicates that an decorated class is a "ExceptionHandler". @<!-- -->ExceptionHandler()

export class BusinessException extends Exception { constructor(message: string, code: number, status: number) { ... } handler(ctx: KoattyContext) {

...//Handling business exceptions

} }


**Signature:**

```typescript
export declare function ExceptionHandler(): ClassDecorator;
```
**Returns:**

ClassDecorator

{<!-- -->ClassDecorator<!-- -->}
