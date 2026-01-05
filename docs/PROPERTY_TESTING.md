# InspectorAssist - Property Testing Strategy

## Overview

This document outlines a comprehensive property-based testing strategy for InspectorAssist, focusing on testing system behaviors and invariants rather than specific implementations. Property tests validate that the system maintains correctness across a wide range of inputs and scenarios.

## Core System Properties

### 1. Document Processing Properties

#### Property: Document Upload Idempotency
```typescript
// Property: Uploading the same document multiple times should be safe
property('document upload idempotency', 
  forAll(validPdfDocument(), async (document) => {
    const uploadResult1 = await uploadDocument(document);
    const uploadResult2 = await uploadDocument(document);
    
    // Different report IDs but same processing outcome
    expect(uploadResult1.reportId).not.toBe(uploadResult2.reportId);
    expect(uploadResult1.uploadUrl).toBeDefined();
    expect(uploadResult2.uploadUrl).toBeDefined();
  })
);
```

#### Property: Processing Status Progression
```typescript
// Property: Report status must follow valid state transitions
property('status progression invariant',
  forAll(reportId(), async (id) => {
    const statusHistory = await getReportStatusHistory(id);
    
    // Valid transitions: UPLOADED → PROCESSING → COMPLETED|ERROR
    const validTransitions = [
      ['UPLOADED', 'PROCESSING'],
      ['PROCESSING', 'COMPLETED'],
      ['PROCESSING', 'ERROR']
    ];
    
    for (let i = 0; i < statusHistory.length - 1; i++) {
      const transition = [statusHistory[i], statusHistory[i + 1]];
      expect(validTransitions).toContainEqual(transition);
    }
  })
);
```

#### Property: Text Extraction Completeness
```typescript
// Property: OCR should extract meaningful text from valid PDFs
property('textract extraction completeness',
  forAll(validInspectionReport(), async (report) => {
    const extractedText = await processWithTextract(report);
    
    // Extracted text should contain inspection keywords
    const inspectionKeywords = [
      'roof', 'plumbing', 'electrical', 'foundation',
      'hvac', 'windows', 'doors', 'inspection'
    ];
    
    const hasInspectionContent = inspectionKeywords.some(keyword =>
      extractedText.toLowerCase().includes(keyword)
    );
    
    expect(hasInspectionContent).toBe(true);
    expect(extractedText.length).toBeGreaterThan(100);
  })
);
```

### 2. AI Processing Properties

#### Property: Issue Extraction Consistency
```typescript
// Property: Same text should produce consistent issue extraction
property('issue extraction determinism',
  forAll(inspectionText(), async (text) => {
    const issues1 = await extractIssues(text);
    const issues2 = await extractIssues(text);
    
    // Should produce same number of issues
    expect(issues1.length).toBe(issues2.length);
    
    // Issues should have required fields
    issues1.forEach(issue => {
      expect(issue).toHaveProperty('defect');
      expect(issue).toHaveProperty('location');
      expect(issue).toHaveProperty('action');
      expect(issue).toHaveProperty('severity');
      expect(['Low', 'Medium', 'High']).toContain(issue.severity);
      expect(['Repair', 'Replace', 'Further Evaluation']).toContain(issue.action);
    });
  })
);
```

#### Property: Negotiation Plan Relevance
```typescript
// Property: Negotiation plans should reference extracted issues
property('negotiation plan relevance',
  forAll(extractedIssues(), negotiationContext(), async (issues, context) => {
    const plan = await generateNegotiationPlan(issues, context);
    
    // Plan should mention high-severity issues
    const highSeverityIssues = issues.filter(i => i.severity === 'High');
    
    highSeverityIssues.forEach(issue => {
      const mentionsIssue = plan.toLowerCase().includes(
        issue.defect.toLowerCase().split(' ')[0]
      );
      expect(mentionsIssue).toBe(true);
    });
    
    // Plan should be substantial
    expect(plan.length).toBeGreaterThan(500);
    expect(plan).toMatch(/#{1,3}\s+/); // Contains markdown headers
  })
);
```

### 3. Data Integrity Properties

#### Property: DynamoDB Consistency
```typescript
// Property: Report data should remain consistent across operations
property('report data consistency',
  forAll(reportData(), async (data) => {
    // Create report
    await createReport(data);
    
    // Retrieve report
    const retrieved = await getReport(data.reportId);
    
    // Core fields should match
    expect(retrieved.reportId).toBe(data.reportId);
    expect(retrieved.fileName).toBe(data.fileName);
    expect(retrieved.uploadedAt).toBe(data.uploadedAt);
    
    // Update report with issues
    const issues = generateRandomIssues();
    await updateReportIssues(data.reportId, issues);
    
    // Verify update
    const updated = await getReport(data.reportId);
    expect(updated.issues).toEqual(issues);
    expect(updated.updatedAt).not.toBe(data.uploadedAt);
  })
);
```

#### Property: S3 Object Integrity
```typescript
// Property: Uploaded documents should be retrievable and unchanged
property('s3 object integrity',
  forAll(documentBuffer(), fileName(), async (buffer, name) => {
    // Upload document
    const uploadUrl = await generatePresignedUrl(name);
    await uploadToS3(uploadUrl, buffer);
    
    // Retrieve document
    const retrieved = await downloadFromS3(name);
    
    // Content should be identical
    expect(Buffer.compare(buffer, retrieved)).toBe(0);
  })
);
```

### 4. API Contract Properties

#### Property: Authentication Enforcement
```typescript
// Property: All protected endpoints require valid authentication
property('authentication enforcement',
  forAll(apiEndpoint(), async (endpoint) => {
    // Request without token should fail
    const unauthenticatedResponse = await makeRequest(endpoint, {});
    expect(unauthenticatedResponse.status).toBe(401);
    
    // Request with invalid token should fail
    const invalidTokenResponse = await makeRequest(endpoint, {
      headers: { Authorization: 'Bearer invalid-token' }
    });
    expect(invalidTokenResponse.status).toBe(401);
    
    // Request with valid token should succeed (or fail for other reasons)
    const validToken = await getValidJwtToken();
    const authenticatedResponse = await makeRequest(endpoint, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    expect(authenticatedResponse.status).not.toBe(401);
  })
);
```

#### Property: API Response Structure
```typescript
// Property: API responses should follow consistent structure
property('api response structure',
  forAll(validApiRequest(), async (request) => {
    const response = await makeAuthenticatedRequest(request);
    
    if (response.status >= 200 && response.status < 300) {
      // Success responses should have data
      expect(response.body).toBeDefined();
      
      if (request.endpoint.includes('/reports/')) {
        expect(response.body).toHaveProperty('reportId');
      }
    } else if (response.status >= 400) {
      // Error responses should have error message
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    }
  })
);
```

### 5. Performance Properties

#### Property: Processing Time Bounds
```typescript
// Property: Document processing should complete within reasonable time
property('processing time bounds',
  forAll(documentSize(), async (size) => {
    const startTime = Date.now();
    
    const document = generateDocument(size);
    const result = await processDocument(document);
    
    const processingTime = Date.now() - startTime;
    
    // Processing time should scale reasonably with document size
    const maxTimeMs = Math.max(30000, size * 0.1); // 30s base + 0.1ms per byte
    expect(processingTime).toBeLessThan(maxTimeMs);
    
    // Should always complete
    expect(result.status).toBeOneOf(['COMPLETED', 'ERROR']);
  })
);
```

#### Property: Concurrent Processing Safety
```typescript
// Property: System should handle concurrent document uploads safely
property('concurrent processing safety',
  forAll(array(validDocument(), { minLength: 2, maxLength: 10 }), 
    async (documents) => {
      // Process documents concurrently
      const promises = documents.map(doc => processDocument(doc));
      const results = await Promise.all(promises);
      
      // All should complete
      expect(results.length).toBe(documents.length);
      
      // Each should have unique report ID
      const reportIds = results.map(r => r.reportId);
      const uniqueIds = new Set(reportIds);
      expect(uniqueIds.size).toBe(reportIds.length);
      
      // All should eventually reach final state
      for (const result of results) {
        const finalStatus = await waitForFinalStatus(result.reportId);
        expect(['COMPLETED', 'ERROR']).toContain(finalStatus);
      }
    })
);
```

## Test Data Generators

### Document Generators
```typescript
// Generate valid PDF documents for testing
const validPdfDocument = () => 
  fc.record({
    content: fc.lorem({ maxCount: 1000 }),
    fileName: fc.string({ minLength: 5, maxLength: 50 }).map(s => `${s}.pdf`),
    size: fc.integer({ min: 1024, max: 10485760 }) // 1KB to 10MB
  });

// Generate inspection report text
const inspectionText = () =>
  fc.lorem({ maxCount: 500 }).map(text => {
    const inspectionTerms = [
      'roof inspection revealed', 'plumbing system shows',
      'electrical panel needs', 'foundation has minor',
      'HVAC system requires', 'windows need replacement'
    ];
    return text + ' ' + fc.sample(inspectionTerms, 2).join('. ');
  });

// Generate realistic issues
const extractedIssues = () =>
  fc.array(
    fc.record({
      defect: fc.constantFrom(
        'Roof leak', 'Plumbing leak', 'Electrical hazard',
        'Foundation crack', 'HVAC malfunction', 'Window damage'
      ),
      location: fc.constantFrom(
        'Master bedroom', 'Kitchen', 'Basement',
        'Living room', 'Bathroom', 'Attic'
      ),
      action: fc.constantFrom('Repair', 'Replace', 'Further Evaluation'),
      severity: fc.constantFrom('Low', 'Medium', 'High'),
      description: fc.lorem({ maxCount: 20 })
    }),
    { minLength: 1, maxLength: 10 }
  );
```

### API Generators
```typescript
// Generate valid API endpoints
const apiEndpoint = () =>
  fc.constantFrom(
    '/v1/reports/upload',
    '/v1/reports/123e4567-e89b-12d3-a456-426614174000',
    '/v1/reports/123e4567-e89b-12d3-a456-426614174000/plan'
  );

// Generate negotiation context
const negotiationContext = () =>
  fc.record({
    context: fc.constantFrom(
      'First-time buyer, competitive market',
      'Investor purchase, cash offer',
      'Family relocation, tight timeline'
    ),
    style: fc.constantFrom('collaborative', 'assertive', 'diplomatic')
  });
```

## Test Execution Strategy

### 1. Continuous Property Testing
```typescript
// Run property tests in CI/CD pipeline
describe('InspectorAssist Property Tests', () => {
  // Fast properties (< 1 second each)
  test('data integrity properties', () => {
    fc.assert(documentUploadIdempotency, { numRuns: 100 });
    fc.assert(apiResponseStructure, { numRuns: 50 });
  });
  
  // Slow properties (integration tests)
  test('processing properties', () => {
    fc.assert(statusProgressionInvariant, { numRuns: 20 });
    fc.assert(issueExtractionConsistency, { numRuns: 10 });
  }, 300000); // 5 minute timeout
});
```

### 2. Regression Testing
```typescript
// Capture and replay failing test cases
const regressionCases = [
  // Cases that previously failed property tests
  { document: 'edge-case-1.pdf', expectedIssues: 3 },
  { text: 'minimal inspection report', expectedBehavior: 'graceful-handling' }
];

describe('Regression Tests', () => {
  regressionCases.forEach(testCase => {
    test(`handles ${testCase.document}`, async () => {
      // Verify specific case still works
    });
  });
});
```

### 3. Performance Benchmarking
```typescript
// Property-based performance testing
property('performance regression detection',
  forAll(documentSize(), async (size) => {
    const baseline = await getBaselineProcessingTime(size);
    const current = await measureProcessingTime(size);
    
    // Performance should not degrade significantly
    const degradationThreshold = 1.5; // 50% slower
    expect(current).toBeLessThan(baseline * degradationThreshold);
  })
);
```

## Property Test Categories

### 1. Functional Properties
- **Correctness**: System produces expected outputs
- **Completeness**: All required data is processed
- **Consistency**: Same inputs produce same outputs

### 2. Non-Functional Properties
- **Performance**: Operations complete within time bounds
- **Scalability**: System handles increasing load
- **Reliability**: System recovers from failures

### 3. Security Properties
- **Authentication**: Access control is enforced
- **Authorization**: Users can only access their data
- **Data Protection**: Sensitive data is encrypted

### 4. Integration Properties
- **Service Communication**: AWS services interact correctly
- **Data Flow**: Information flows through pipeline intact
- **Error Propagation**: Failures are handled gracefully

## Monitoring Property Violations

### 1. Production Property Monitoring
```typescript
// Monitor properties in production using CloudWatch
const propertyViolationAlarm = new cloudwatch.Alarm(this, 'PropertyViolation', {
  metric: new cloudwatch.Metric({
    namespace: 'InspectorAssist/Properties',
    metricName: 'ViolationCount',
    statistic: 'Sum'
  }),
  threshold: 1,
  evaluationPeriods: 1
});
```

### 2. Automated Property Validation
```typescript
// Lambda function to validate properties on live data
export const validateProperties = async () => {
  const recentReports = await getRecentReports();
  
  for (const report of recentReports) {
    // Validate status progression property
    if (!isValidStatusProgression(report.statusHistory)) {
      await recordPropertyViolation('status-progression', report.reportId);
    }
    
    // Validate issue extraction property
    if (report.issues && !areIssuesWellFormed(report.issues)) {
      await recordPropertyViolation('issue-structure', report.reportId);
    }
  }
};
```

## Benefits of Property-Based Testing

### 1. Comprehensive Coverage
- Tests edge cases automatically
- Discovers unexpected input combinations
- Validates system behavior across input space

### 2. Regression Prevention
- Captures failing cases for future testing
- Ensures fixes don't break existing functionality
- Maintains system invariants over time

### 3. Documentation Value
- Properties serve as executable specifications
- Clarifies expected system behavior
- Helps onboard new developers

### 4. Confidence in Refactoring
- Properties remain valid across implementation changes
- Enables safe code improvements
- Supports architectural evolution

---

*Document Version: 1.0*  
*Last Updated: January 4, 2026*  
*Generated from codebase analysis*
