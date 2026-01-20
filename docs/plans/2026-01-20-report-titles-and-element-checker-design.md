# Report Titles & Statute Element Checker

**Date:** 2026-01-20
**Status:** Approved

## Overview

Two features to improve report organization and legal completeness:

1. **AI-Generated Report Titles** - Auto-generate descriptive titles for reports
2. **Statute Element Checker** - Verify reports meet legal elements of applicable charges

---

## Feature 1: AI-Generated Report Titles

### Behavior

When a report is generated, the AI creates a concise title based on the transcript.

**Title format:**
```
[Incident Type] - [Key Detail] - [Date]
```

**Examples:**
- "DV Assault - 123 Oak St - 01/20/26"
- "Traffic Stop / DUI - Smith, John - 01/20/26"
- "Burglary Report - First National Bank - 01/20/26"

### What the AI considers
- Report type (incident, arrest, supplemental)
- Location or address mentioned
- Primary parties involved (victim/suspect names)
- Nature of the call/crime

### User interaction
- Title auto-populates in an editable field at the top of the editor
- User can accept or modify before saving
- Reports list shows these titles instead of "Untitled"

---

## Feature 2: Statute Element Checker

### Flow

1. **AI suggests charges** - Based on narrative, suggests 1-3 likely charges
2. **User confirms** - Selects which charge(s) being pursued
3. **Element check** - AI compares narrative against statutory elements

### Output format

```
Domestic Violence - 3rd Degree

✓ Domestic relationship established
  "Victim stated suspect is her live-in boyfriend of 2 years"

✓ Physical harm documented
  "Victim had visible redness and swelling to left cheek"

⚠ Intent could be stronger
  Consider adding: suspect's statements, witness observations

✗ Missing: Fear of imminent harm
  No statements about ongoing threat documented
```

### Element statuses
- ✓ Clearly established
- ⚠ Present but could be stronger
- ✗ Missing or not documented

---

## UI Integration

### Report Title
- Editable field at top of "Report Draft" panel
- Shows AI-suggested title with edit indicator
- Saves with report

### Statute Element Checker
- Lives in "Legal Assistant" panel (right side)
- Enhances existing "Analyze" button behavior

**Panel layout:**
```
┌─────────────────────────────┐
│ LEGAL ASSISTANT    [Analyze]│
├─────────────────────────────┤
│ Suggested Charges:          │
│ ☑ DV Assault - 3rd Degree   │
│ ☐ Harassment                │
│        [Check Elements]     │
├─────────────────────────────┤
│ Element Analysis:           │
│ ✓ Domestic relationship...  │
│ ✓ Physical harm...          │
│ ⚠ Intent could be stronger  │
├─────────────────────────────┤
│ (Existing validations,      │
│  case law references, etc.) │
└─────────────────────────────┘
```

---

## Backend Changes

### API changes

**1. Generate endpoint** (`POST /api/generate`)

Updated response:
```json
{
  "generated_content": "...",
  "suggested_title": "DV Assault - 123 Oak St - 01/20/26"
}
```

**2. New endpoint** (`POST /api/reports/:id/check-elements`)

Request:
```json
{
  "charges": ["DV Assault - 3rd Degree", "Harassment"]
}
```

Response:
```json
{
  "suggested_charges": ["DV Assault - 3rd Degree", "Harassment"],
  "analysis": [
    {
      "charge": "DV Assault - 3rd Degree",
      "elements": [
        {
          "element": "Domestic relationship",
          "status": "met",
          "evidence": "Victim stated suspect is her live-in boyfriend",
          "suggestion": null
        },
        {
          "element": "Intent",
          "status": "weak",
          "evidence": "Implied from actions",
          "suggestion": "Add suspect statements or witness observations"
        }
      ]
    }
  ]
}
```

### Database changes

- Use existing `title` column in reports table
- No new tables required

### AI prompts needed

1. **Title generation** - Extract key details, consistent format
2. **Charge suggestion** - Infer likely charges from narrative
3. **Element checker** - Compare narrative against statutory elements

Uses uploaded case law and policies from Settings to inform analysis.

---

## Implementation Tasks

1. Update AI service with new prompts (title, charges, elements)
2. Update generate endpoint to return suggested_title
3. Add check-elements endpoint
4. Update frontend editor with title field
5. Update Legal Assistant panel with charge selection and element display
6. Update reports list to show titles
