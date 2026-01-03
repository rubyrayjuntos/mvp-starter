"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({});
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE = process.env.REPORTS_TABLE;
var BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
var PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "..", "..", "prompts", "negotiation-plan.txt"),
  "utf-8"
);
var handler = async (event) => {
  try {
    const reportId = event.pathParameters?.id;
    if (!reportId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Report ID is required" })
      };
    }
    const reportResult = await ddb.send(
      new import_lib_dynamodb.GetCommand({
        TableName: TABLE,
        Key: {
          PK: `REPORT#${reportId}`,
          SK: "METADATA"
        }
      })
    );
    if (!reportResult.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Report not found" })
      };
    }
    const report = reportResult.Item;
    if (report.status !== "ISSUES_EXTRACTED" && report.status !== "PLAN_GENERATED") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Report is not ready for negotiation plan",
          status: report.status
        })
      };
    }
    const body = event.body ? JSON.parse(event.body) : {};
    const style = body.style || "balanced";
    const context = body.context || { age: null, zipCode: null, listingPrice: null };
    const prompt = PROMPT_TEMPLATE.replace("{{ISSUES_JSON}}", JSON.stringify(report.issues)).replace("{{CONTEXT_JSON}}", JSON.stringify(context)).replace("{{STYLE}}", style);
    const response = await bedrock.send(
      new import_client_bedrock_runtime.InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      })
    );
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content[0].text;
    let jsonStr = content;
    const jsonMatch = content.match(/```json?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    const plan = JSON.parse(jsonStr);
    await ddb.send(
      new import_lib_dynamodb.UpdateCommand({
        TableName: TABLE,
        Key: {
          PK: `REPORT#${reportId}`,
          SK: "METADATA"
        },
        UpdateExpression: "SET #status = :status, negotiationPlan = :plan, negotiationStyle = :style, propertyContext = :ctx, updatedAt = :now",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":status": "PLAN_GENERATED",
          ":plan": plan.plan,
          ":style": style,
          ":ctx": context,
          ":now": (/* @__PURE__ */ new Date()).toISOString()
        }
      })
    );
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId,
        style,
        ...plan
      })
    };
  } catch (error) {
    console.error("Negotiation plan error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
