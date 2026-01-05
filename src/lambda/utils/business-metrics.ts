import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({});

export class BusinessMetrics {
  private static readonly NAMESPACE = 'InspectorAssist/Business';

  static async recordDocumentProcessed(processingTimeMs: number, issueCount: number): Promise<void> {
    await cloudwatch.send(new PutMetricDataCommand({
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

  static async recordNegotiationPlanGenerated(planLength: number): Promise<void> {
    await cloudwatch.send(new PutMetricDataCommand({
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

  static async recordError(errorType: string): Promise<void> {
    await cloudwatch.send(new PutMetricDataCommand({
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
