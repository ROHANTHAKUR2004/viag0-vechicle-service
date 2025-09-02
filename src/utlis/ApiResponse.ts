
class ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  data: T | null;
  message: string;

  constructor(statusCode: number, data: T | null, message = "Success") {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
  }
}
export default ApiResponse;
