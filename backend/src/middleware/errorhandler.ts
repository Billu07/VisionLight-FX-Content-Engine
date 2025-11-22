import { Request, Response, NextFunction } from "express";

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error("🚨 Application Error:", {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Default error
  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal Server Error";
  let details = error.details;

  // Handle specific error types
  if (
    error.message.includes("API key") ||
    error.message.includes("credentials")
  ) {
    statusCode = 401;
    message = "Authentication failed - please check your API keys";
  } else if (
    error.message.includes("rate limit") ||
    error.message.includes("quota")
  ) {
    statusCode = 429;
    message = "Service limit exceeded - please try again later";
  } else if (error.message.includes("timeout")) {
    statusCode = 408;
    message = "Request timeout - please try again";
  } else if (error.message.includes("not found")) {
    statusCode = 404;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    details: process.env.NODE_ENV === "development" ? details : undefined,
    timestamp: new Date().toISOString(),
  });
}

// Async error handler wrapper
export const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
