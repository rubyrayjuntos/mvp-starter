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

// src/lambda/negotiation-plan.ts
var negotiation_plan_exports = {};
__export(negotiation_plan_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(negotiation_plan_exports);
var import_client_bedrock_runtime = require("@aws-sdk/client-bedrock-runtime");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// src/lambda/prompts.ts
var NEGOTIATION_PLAN_PROMPT = `You are an expert real estate negotiation assistant. 
Based on the following list of issues extracted from a property inspection report, generate a strategic negotiation plan for a buyer's agent.

ISSUES:
{{ISSUES}}

CONTEXT:
{{CONTEXT}}

STYLE:
{{STYLE}}

The plan should include:
1. A summary of the most critical issues.
2. A prioritized list of repair requests or credits to ask for.
3. Rationale for each request to help the agent explain it to the listing agent.
4. Tips for the agent on how to approach this specific negotiation.

Format the output in professional Markdown.`;

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

// src/lambda/negotiation-plan.ts
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({});
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var bedrockCircuitBreaker = new CircuitBreaker(3, 3e4);
var TABLE = process.env.REPORTS_TABLE;
var MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
var promptTemplate = NEGOTIATION_PLAN_PROMPT;
var handler = async (event) => {
  const reportId = event.pathParameters?.id;
  if (!reportId) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: JSON.stringify({ error: "Missing reportId" })
    };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const { context = "", style = "balanced" } = body;
    const getResult = await ddb.send(new import_lib_dynamodb.GetCommand({
      TableName: TABLE,
      Key: { PK: `REPORT#${reportId}`, SK: "METADATA" }
    }));
    const report = getResult.Item;
    if (!report) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST",
          "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        body: JSON.stringify({ error: "Report not found" })
      };
    }
    if (report.status !== "COMPLETED" || !report.issues) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST",
          "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        body: JSON.stringify({ error: "Issues not yet extracted" })
      };
    }
    const prompt = promptTemplate.replace("{{ISSUES}}", JSON.stringify(report.issues, null, 2)).replace("{{CONTEXT}}", context).replace("{{STYLE}}", style);
    const isTitan = MODEL_ID.includes("titan");
    const payload = isTitan ? {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 4096,
        temperature: 0.7,
        topP: 1
      }
    } : {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2e3,
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
    const plan = isTitan ? responseBody.results[0].outputText : responseBody.content[0].text;
    await ddb.send(new import_lib_dynamodb.PutCommand({
      TableName: TABLE,
      Item: {
        ...report,
        negotiationPlan: plan,
        negotiationStyle: style,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }));
    await BusinessMetrics.recordNegotiationPlanGenerated(plan.length);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: JSON.stringify({ reportId, negotiationPlan: plan })
    };
  } catch (error) {
    console.error("Error generating plan:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: JSON.stringify({ error: "Failed to generate negotiation plan" })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
