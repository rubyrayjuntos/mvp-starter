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

// src/lambda/textract.ts
var textract_exports = {};
__export(textract_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(textract_exports);
var import_client_textract = require("@aws-sdk/client-textract");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var textract = new import_client_textract.TextractClient({});
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE = process.env.REPORTS_TABLE;
var OUTPUT_BUCKET = process.env.TEXTRACT_OUTPUT_BUCKET || process.env.UPLOADS_BUCKET;
var handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const keyParts = key.split("/");
    if (keyParts.length < 3 || keyParts[0] !== "uploads") {
      console.log(`Skipping non-upload key: ${key}`);
      continue;
    }
    const reportId = keyParts[1];
    console.log(`Starting Textract for report ${reportId}, bucket: ${bucket}, key: ${key}`);
    try {
      console.log("Diagnostic: Attempting synchronous DetectDocumentText on page 1...");
      await textract.send(new DetectDocumentTextCommand({
        Document: {
          S3Object: {
            Bucket: bucket,
            Name: key
          }
        }
      }));
      console.log("Diagnostic sync call successful! Lambda role has S3 access.");
    } catch (e) {
      console.log("Diagnostic sync call failed:", e);
    }
    try {
      const textractResponse = await textract.send(
        new import_client_textract.StartDocumentTextDetectionCommand({
          DocumentLocation: {
            S3Object: {
              Bucket: bucket,
              Name: key
            }
          },
          OutputConfig: {
            S3Bucket: OUTPUT_BUCKET,
            S3Prefix: `textract-output/${reportId}/`
          },
          NotificationChannel: process.env.TEXTRACT_SNS_TOPIC_ARN ? {
            SNSTopicArn: process.env.TEXTRACT_SNS_TOPIC_ARN,
            RoleArn: process.env.TEXTRACT_SNS_ROLE_ARN
          } : void 0
        })
      );
      const jobId = textractResponse.JobId;
      console.log(`Textract job started: ${jobId}`);
      await ddb.send(
        new import_lib_dynamodb.PutCommand({
          TableName: TABLE,
          Item: {
            PK: `REPORT#${reportId}`,
            SK: "METADATA",
            reportId,
            status: "PROCESSING",
            textractJobId: jobId,
            s3Key: key,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        })
      );
      console.log(`Report ${reportId} saved with status PROCESSING`);
    } catch (error) {
      console.error(`Error processing ${key}:`, error);
      await ddb.send(
        new import_lib_dynamodb.PutCommand({
          TableName: TABLE,
          Item: {
            PK: `REPORT#${reportId}`,
            SK: "METADATA",
            reportId,
            status: "ERROR",
            error: String(error),
            s3Key: key,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
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
