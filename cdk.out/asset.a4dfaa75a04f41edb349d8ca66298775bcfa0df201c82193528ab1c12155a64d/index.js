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

// src/lambda/extract-issues.ts
var textract = new import_client_textract.TextractClient({});
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({});
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE = process.env.REPORTS_TABLE;
var MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
var promptTemplate = ISSUE_EXTRACTION_PROMPT;
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
      const reportId = snsData.JobTag || jobId;
      console.log(`Processing Textract results for report: ${reportId}, job: ${jobId}`);
      const textractResults = await textract.send(new import_client_textract.GetDocumentTextDetectionCommand({ JobId: jobId }));
      const allText = textractResults.Blocks?.filter((b) => b.BlockType === "LINE").map((b) => b.Text).join("\n") || "";
      const prompt = promptTemplate.replace("{{OCR_TEXT}}", allText);
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
      const bedrockResponse = await bedrock.send(new import_client_bedrock_runtime.InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload)
      }));
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
    } catch (error) {
      console.error("Error in ExtractIssuesHandler:", error);
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
