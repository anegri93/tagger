/** Error genérico del SDK. */
export class TaggerError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'TaggerError';
  }
}

/** API devolvió 4xx con datos del cliente inválidos. */
export class ValidationError extends TaggerError {
  constructor(message: string, body: unknown) {
    super(message, 400, body);
    this.name = 'ValidationError';
  }
}

/** API rechazó por API key inválida o ausente. */
export class AuthError extends TaggerError {
  constructor(body: unknown) {
    super('API key inválida o ausente', 401, body);
    this.name = 'AuthError';
  }
}

/** Recurso no encontrado. */
export class NotFoundError extends TaggerError {
  constructor(message: string, body: unknown) {
    super(message, 404, body);
    this.name = 'NotFoundError';
  }
}

/** Conflicto de estado (409): slug duplicado, recurso en uso, etc. */
export class ConflictError extends TaggerError {
  constructor(message: string, body: unknown) {
    super(message, 409, body);
    this.name = 'ConflictError';
  }
}

/** Error del servidor (5xx). */
export class ServerError extends TaggerError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body);
    this.name = 'ServerError';
  }
}

/** Timeout o falla de red. */
export class NetworkError extends TaggerError {
  constructor(message: string, cause?: unknown) {
    super(message, 0, cause);
    this.name = 'NetworkError';
  }
}
