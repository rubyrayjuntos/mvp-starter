"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEGOTIATION_PLAN_PROMPT = exports.ISSUE_EXTRACTION_PROMPT = void 0;
exports.ISSUE_EXTRACTION_PROMPT = `You are an expert at analyzing residential property inspection reports. Extract ALL issues, defects, and concerns from the following inspection report text.

For each issue found, provide:
- Issue: The category (e.g., Roof, Plumbing, Electrical, Foundation, HVAC, Structural, etc.)
- Defect: The specific problem found
- Location: Where in the property this issue is located
- Severity: Low, Medium, or High based on safety and cost impact
- Recommended Action: What should be done (Repair, Replace, Monitor, Further Evaluation, etc.)

IMPORTANT: 
- Extract REAL, SPECIFIC issues from the text, not generic placeholders
- Include the actual details from the report (e.g., "cracked foundation in southeast corner" not just "damage")
- Mark as High severity: safety hazards, structural issues, active leaks, electrical hazards
- Mark as Medium severity: functional problems, wear requiring repair, code violations
- Mark as Low severity: cosmetic issues, minor wear, maintenance items

Return ONLY a valid JSON array with this exact structure:
[
  {
    "Issue": "category name",
    "Defect": "specific problem description",
    "Location": "specific location",
    "Severity": "Low|Medium|High",
    "Recommended Action": "what to do"
  }
]

OCR TEXT FROM INSPECTION REPORT:
{{OCR_TEXT}}

Return only the JSON array, no other text.`;
exports.NEGOTIATION_PLAN_PROMPT = `You are an expert real estate negotiation consultant helping a buyer's agent. Based on the inspection issues below, create a strategic negotiation plan.

INSPECTION ISSUES FOUND:
{{ISSUES}}

BUYER CONTEXT:
{{CONTEXT}}

NEGOTIATION STYLE: {{STYLE}}

Create a comprehensive negotiation plan with:

1. **Executive Summary**: Brief overview of the most critical issues and overall strategy

2. **Prioritized Repair Requests**: List issues in priority order with:
   - What to request (repair, replacement, or credit)
   - Estimated cost (if determinable from severity)
   - Why this is important (safety, functionality, code compliance)

3. **Negotiation Strategy**: 
   - Opening position (what to ask for initially)
   - Fallback positions (what to accept if seller pushes back)
   - Deal-breakers (issues that must be addressed)

4. **Talking Points**: Specific language the agent can use when presenting each issue to the listing agent

5. **Concession Strategy**: What the buyer might offer in return (e.g., faster closing, waiving other contingencies)

Format your response in clear, professional Markdown that the agent can reference during negotiations.`;
