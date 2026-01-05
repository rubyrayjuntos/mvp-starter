"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryHandler = void 0;
class RetryHandler {
    static async withExponentialBackoff(operation, maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000) {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                // Don't retry on the last attempt
                if (attempt === maxRetries) {
                    break;
                }
                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                // Calculate delay with exponential backoff and jitter
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000, maxDelayMs);
                console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
                await this.sleep(delay);
            }
        }
        throw lastError;
    }
    static isRetryableError(error) {
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
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.RetryHandler = RetryHandler;
