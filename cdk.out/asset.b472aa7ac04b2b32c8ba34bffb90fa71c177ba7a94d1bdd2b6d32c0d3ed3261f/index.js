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

// src/lambda/upload.ts
var upload_exports = {};
__export(upload_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(upload_exports);
var import_client_s3 = require("@aws-sdk/client-s3");
var import_s3_request_presigner = require("@aws-sdk/s3-request-presigner");
var import_crypto = require("crypto");
var s3 = new import_client_s3.S3Client({});
var BUCKET = process.env.UPLOADS_BUCKET;
var handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    if (!body.filename) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS,POST",
          "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        body: JSON.stringify({ error: "filename is required" })
      };
    }
    if (!body.filename.toLowerCase().endsWith(".pdf")) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Only PDF files are supported" })
      };
    }
    const reportId = (0, import_crypto.randomUUID)();
    const key = `uploads/${reportId}/${body.filename}`;
    const command = new import_client_s3.PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: body.contentType || "application/pdf"
    });
    const expiresIn = 900;
    const uploadUrl = await (0, import_s3_request_presigner.getSignedUrl)(s3, command, { expiresIn });
    const response = {
      reportId,
      uploadUrl,
      expiresIn
    };
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error("Upload handler error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
