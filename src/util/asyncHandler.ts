import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 does not forward rejected promises from async route handlers to `next` — wrap handlers that use `await`. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
