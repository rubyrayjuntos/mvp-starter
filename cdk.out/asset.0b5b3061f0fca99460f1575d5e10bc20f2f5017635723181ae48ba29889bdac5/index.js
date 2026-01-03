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
var import_client_s3 = require("@aws-sdk/client-s3");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var textract = new import_client_textract.TextractClient({});
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({});
var s3 = new import_client_s3.S3Client({});
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE = process.env.REPORTS_TABLE;
var BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
var PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "..", "..", "prompts", "issue-extraction.txt"),
  "utf-8"
);
async function getTextractResults(jobId) {
  const blocks = [];
  let nextToken;
  do {
    const response = await textract.send(
      new import_client_textract.GetDocumentTextDetectionCommand({
        JobId: jobId,
        NextToken: nextToken
      })
    );
    if (response.Blocks) {
      blocks.push(...response.Blocks);
    }
    nextToken = response.NextToken;
  } while (nextToken);
  const lines = blocks.filter((b) => b.BlockType === "LINE" && b.Text).sort((a, b) => {
    const pageA = a.Page || 1;
    const pageB = b.Page || 1;
    if (pageA !== pageB)
      return pageA - pageB;
    const topA = a.Geometry?.BoundingBox?.Top || 0;
    const topB = b.Geometry?.BoundingBox?.Top || 0;
    return topA - topB;
  }).map((b) => b.Text);
  return lines.join("\n");
}
async function invokeBedrock(ocrText) {
  const prompt = PROMPT_TEMPLATE.replace("{{OCR_TEXT}}", ocrText);
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
  return JSON.parse(jsonStr);
}
var handler = async (event) => {
  for (const record of event.Records) {
    const notification = JSON.parse(record.Sns.Message);
    if (notification.Status !== "SUCCEEDED") {
      console.error(`Textract job ${notification.JobId} failed with status: ${notification.Status}`);
      continue;
    }
    const keyParts = notification.DocumentLocation.S3ObjectName.split("/");
    const reportId = keyParts[1];
    console.log(`Processing Textract results for report ${reportId}, job ${notification.JobId}`);
    try {
      const ocrText = await getTextractResults(notification.JobId);
      console.log(`Extracted ${ocrText.length} characters of text`);
      const result = await invokeBedrock(ocrText);
      console.log(`Extracted ${result.issues.length} issues`);
      await ddb.send(
        new import_lib_dynamodb.UpdateCommand({
          TableName: TABLE,
          Key: {
            PK: `REPORT#${reportId}`,
            SK: "METADATA"
          },
          UpdateExpression: "SET #status = :status, issues = :issues, ocrTextLength = :len, updatedAt = :now",
          ExpressionAttributeNames: {
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":status": "ISSUES_EXTRACTED",
            ":issues": result.issues,
            ":len": ocrText.length,
            ":now": (/* @__PURE__ */ new Date()).toISOString()
          }
        })
      );
      console.log(`Report ${reportId} updated with extracted issues`);
    } catch (error) {
      console.error(`Error processing report ${reportId}:`, error);
      await ddb.send(
        new import_lib_dynamodb.UpdateCommand({
          TableName: TABLE,
          Key: {
            PK: `REPORT#${reportId}`,
            SK: "METADATA"
          },
          UpdateExpression: "SET #status = :status, #error = :error, updatedAt = :now",
          ExpressionAttributeNames: {
            "#status": "status",
            "#error": "error"
          },
          ExpressionAttributeValues: {
            ":status": "ERROR",
            ":error": String(error),
            ":now": (/* @__PURE__ */ new Date()).toISOString()
          }
        })
      );
      throw error;
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
