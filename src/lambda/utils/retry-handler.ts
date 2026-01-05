export class RetryHandler {
  static async withExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs
        );
        
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }
  
  private static isRetryableError(error: any): boolean {
    // AWS SDK errors that are retryable
    const retryableErrors = [
      'ThrottlingException',
      'ServiceUnavailableException',
      'InternalServerError',
      'RequestTimeout',
      'TooManyRequestsException',
      'ProvisionedThroughputExceededException'
    ];
    
    const errorCode = error?.name || error?.code || error?.__type;
    return retryableErrors.includes(errorCode) || 
           (error?.statusCode >= 500 && error?.statusCode < 600);
  }
  
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
