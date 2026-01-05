"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lambda/extract-issues.ts
var extract_issues_exports = {};
__export(extract_issues_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(extract_issues_exports);
var import_client_textract = require("@aws-sdk/client-textract");
var import_client_bedrock_runtime = require("@aws-sdk/client-bedrock-runtime");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// src/lambda/prompts.ts
var ISSUE_EXTRACTION_PROMPT = `Extract all issues and defects from the following property inspection report text. 
Group them by category (e.g., Roof, Plumbing, Electrical).
For each issue, describe:
- The specific defect
- Its location
- The recommended action (e.g., Repair, Replace, Further Evaluation)
- Severity (Low, Medium, High)

Format the output as a clean JSON array of objects.

OCR TEXT:
{{OCR_TEXT}}`;

// src/lambda/utils/circuit-breaker.ts
var CircuitBreaker = class {
  constructor(failureThreshold = 5, recoveryTimeoutMs = 6e4) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = "CLOSED";
  }
  async execute(operation) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeoutMs) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }
  getState() {
    return this.state;
  }
};

// src/lambda/utils/business-metrics.ts
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var cloudwatch = new import_client_cloudwatch.CloudWatchClient({});
var BusinessMetrics = class {
  static {
    this.NAMESPACE = "InspectorAssist/Business";
  }
  static async recordDocumentProcessed(processingTimeMs, issueCount) {
    await cloudwatch.send(new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: this.NAMESPACE,
      MetricData: [
        {
          MetricName: "DocumentsProcessed",
          Value: 1,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        },
        {
          MetricName: "ProcessingTime",
          Value: processingTimeMs,
          Unit: "Milliseconds",
          Timestamp: /* @__PURE__ */ new Date()
        },
        {
          MetricName: "IssuesExtracted",
          Value: issueCount,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        }
      ]
    }));
  }
  static async recordNegotiationPlanGenerated(planLength) {
    await cloudwatch.send(new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: this.NAMESPACE,
      MetricData: [
        {
          MetricName: "NegotiationPlansGenerated",
          Value: 1,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        },
        {
          MetricName: "PlanLength",
          Value: planLength,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        }
      ]
    }));
  }
  static async recordError(errorType) {
    await cloudwatch.send(new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: this.NAMESPACE,
      MetricData: [
        {
          MetricName: "ProcessingErrors",
          Value: 1,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date(),
          Dimensions: [
            {
              Name: "ErrorType",
              Value: errorType
            }
          ]
        }
      ]
    }));
  }
};

// src/lambda/utils/retry-handler.ts
var RetryHandler = class {
  static async withExponentialBackoff(operation, maxRetries = 3, baseDelayMs = 1e3, maxDelayMs = 3e4) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }
        if (!this.isRetryableError(error)) {
          throw error;
        }
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1e3,
          maxDelayMs
        );
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
    throw lastError;
  }
  static isRetryableError(error) {
    const retryableErrors = [
      "ThrottlingException",
      "ServiceUnavailableException",
      "InternalServerError",
      "RequestTimeout",
      "TooManyRequestsException",
      "ProvisionedThroughputExceededException"
    ];
    const errorCode = error?.name || error?.code || error?.__type;
    return retryableErrors.includes(errorCode) || error?.statusCode >= 500 && error?.statusCode < 600;
  }
  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/lambda/extract-issues.ts
var textract = new import_client_textract.TextractClient({});
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({});
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var bedrockCircuitBreaker = new CircuitBreaker(3, 3e4);
var TABLE = process.env.REPORTS_TABLE;
var MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
var handler = async (event) => {
  for (const record of event.Records) {
    const snsData = JSON.parse(record.Sns.Message);
    const jobId = snsData.JobId;
    const status = snsData.Status;
    if (status !== "SUCCEEDED") {
      console.error(`Textract job ${jobId} failed with status ${status}`);
      const reportId = snsData.JobTag || jobId;
      await ddb.send(new import_lib_dynamodb.UpdateCommand({
        TableName: TABLE,
        Key: { PK: `REPORT#${reportId}`, SK: "METADATA" },
        UpdateExpression: "SET #s = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": "ERROR",
          ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
        }
      }));
      continue;
    }
    try {
      const startTime = Date.now();
      const reportId = snsData.JobTag || jobId;
      console.log(`Processing Textract results for report: ${reportId}, job: ${jobId}`);
      let allText = "";
      let nextToken;
      do {
        const textractResults = await RetryHandler.withExponentialBackoff(async () => {
          return await textract.send(new import_client_textract.GetDocumentTextDetectionCommand({
            JobId: jobId,
            NextToken: nextToken
          }));
        });
        const pageText = textractResults.Blocks?.filter((b) => b.BlockType === "LINE").map((b) => b.Text).join("\n") || "";
        allText += pageText + "\n";
        nextToken = textractResults.NextToken;
        if (allText.length > 2e4)
          break;
      } while (nextToken);
      console.log(`Extracted ${allText.length} characters of text.`);
      const prompt = ISSUE_EXTRACTION_PROMPT.replace("{{OCR_TEXT}}", allText);
      const isTitan = MODEL_ID.includes("titan");
      const payload = isTitan ? {
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: 4096,
          temperature: 0,
          topP: 1
        }
      } : {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4e3,
        messages: [{ role: "user", content: prompt }]
      };
      const bedrockResponse = await bedrockCircuitBreaker.execute(async () => {
        return await bedrock.send(new import_client_bedrock_runtime.InvokeModelCommand({
          modelId: MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(payload)
        }));
      });
      const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
      const extractedContent = isTitan ? responseBody.results[0].outputText : responseBody.content[0].text;
      let issues = [];
      try {
        const jsonMatch = extractedContent.match(/\[.*\]/s);
        issues = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch (e) {
        console.error("Failed to parse issues JSON:", e);
        issues = [{ defect: "Manual review required", description: extractedContent }];
      }
      await ddb.send(new import_lib_dynamodb.UpdateCommand({
        TableName: TABLE,
        Key: { PK: `REPORT#${reportId}`, SK: "METADATA" },
        UpdateExpression: "SET #s = :status, issues = :issues, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": "COMPLETED",
          ":issues": issues,
          ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
        }
      }));
      console.log(`Report ${reportId} processed successfully with ${issues.length} issues.`);
      const processingTime = Date.now() - startTime;
      await BusinessMetrics.recordDocumentProcessed(processingTime, issues.length);
    } catch (error) {
      console.error("Error in ExtractIssuesHandler:", error);
      await BusinessMetrics.recordError("PROCESSING_ERROR");
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
