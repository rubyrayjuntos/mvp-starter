"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessMetrics = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const cloudwatch = new client_cloudwatch_1.CloudWatchClient({});
class BusinessMetrics {
    static async recordDocumentProcessed(processingTimeMs, issueCount) {
        await cloudwatch.send(new client_cloudwatch_1.PutMetricDataCommand({
            Namespace: this.NAMESPACE,
            MetricData: [
                {
                    MetricName: 'DocumentsProcessed',
                    Value: 1,
                    Unit: 'Count',
                    Timestamp: new Date(),
                },
                {
                    MetricName: 'ProcessingTime',
                    Value: processingTimeMs,
                    Unit: 'Milliseconds',
                    Timestamp: new Date(),
                },
                {
                    MetricName: 'IssuesExtracted',
                    Value: issueCount,
                    Unit: 'Count',
                    Timestamp: new Date(),
                }
            ]
        }));
    }
    static async recordNegotiationPlanGenerated(planLength) {
        await cloudwatch.send(new client_cloudwatch_1.PutMetricDataCommand({
            Namespace: this.NAMESPACE,
            MetricData: [
                {
                    MetricName: 'NegotiationPlansGenerated',
                    Value: 1,
                    Unit: 'Count',
                    Timestamp: new Date(),
                },
                {
                    MetricName: 'PlanLength',
                    Value: planLength,
                    Unit: 'Count',
                    Timestamp: new Date(),
                }
            ]
        }));
    }
    static async recordError(errorType) {
        await cloudwatch.send(new client_cloudwatch_1.PutMetricDataCommand({
            Namespace: this.NAMESPACE,
            MetricData: [
                {
                    MetricName: 'ProcessingErrors',
                    Value: 1,
                    Unit: 'Count',
                    Timestamp: new Date(),
                    Dimensions: [
                        {
                            Name: 'ErrorType',
                            Value: errorType
                        }
                    ]
                }
            ]
        }));
    }
}
exports.BusinessMetrics = BusinessMetrics;
BusinessMetrics.NAMESPACE = 'InspectorAssist/Business';
