export interface ErrorDetail {
  message: string;
  field?: string;
}

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  errors?: ErrorDetail[];
  path: string;
  timestamp: string;
}
