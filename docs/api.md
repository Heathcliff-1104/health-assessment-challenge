# HTTP API

Base path: `/api/v1` except the brief-compatible alias `POST /pay`. All responses use `Cache-Control: private, no-store` and include a request ID.

Authentication is either the `health_session` HttpOnly cookie or `Authorization: Bearer <sessionToken>`. IDs are UUIDs. JSON objects are strict: unknown properties are rejected.

## Response envelopes

Success:

```json
{ "data": {}, "meta": { "requestId": "uuid" } }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The step payload is invalid",
    "fields": { "age": ["This assessment is for adults aged 18 or over"] },
    "requestId": "uuid"
  }
}
```

Expected statuses include `400 MALFORMED_JSON`, `401 AUTHENTICATION_REQUIRED` / `SESSION_INVALID`, `404 RESOURCE_NOT_FOUND`, `409 STEP_OUT_OF_ORDER` / `VERSION_CONFLICT` / `IDEMPOTENCY_CONFLICT`, and `422 VALIDATION_ERROR` / `ASSESSMENT_INCOMPLETE`.

## Endpoints

| Method | Path | Purpose | Required headers |
|---|---|---|---|
| `POST` | `/api/v1/sessions` | Create a 30-day anonymous session and cookie | — |
| `POST` | `/api/v1/assessments` | Return the existing in-progress assessment or create one | Auth |
| `GET` | `/api/v1/assessments/current` | Restore the latest assessment and answers | Auth |
| `PUT` | `/api/v1/assessments/{id}/steps/{step}` | Validate and persist one step | Auth, `If-Match`, `Idempotency-Key` |
| `POST` | `/api/v1/assessments/{id}/complete` | Validate all answers, calculate, persist, return gated result | Auth, `If-Match` |
| `GET` | `/api/v1/assessments/{id}/result` | Return preview or full result based on subscription | Auth |
| `POST` | `/api/v1/pay` or `/pay` | Activate a 30-day simulated subscription | Auth, `Idempotency-Key` |

`If-Match` is the integer `version` from the latest assessment response. A successful step increments it. `Idempotency-Key` accepts 8–128 safe characters (`A-Z`, `a-z`, digits, `. _ : -`).

## Step contracts

Steps must first move forward in this order; already completed earlier steps may be revised using the current version.

```text
gender → goal → body_profile → weight_goal → activity
```

| Step | JSON body |
|---|---|
| `gender` | `{"gender":"female"}`; values: `male`, `female`, `non_binary`, `prefer_not_to_say` |
| `goal` | `{"goal":"lose_weight"}`; values: `lose_weight`, `maintain_weight`, `gain_weight` |
| `body_profile` | `{"age":32,"heightCm":165}` |
| `weight_goal` | `{"weightKg":70,"targetWeightKg":60}` |
| `activity` | `{"activityLevel":"moderate"}`; values: `sedentary`, `light`, `moderate`, `active`, `very_active` |

Ranges: age 18–100 inclusive and integer; height 120–230 cm; both weights 35–300 kg. Target direction must match the goal, maintenance must remain within 2 kg, absolute change may not exceed 50%, and target BMI must remain in the supported 16–40 planning range.

Example response:

```json
{
  "data": {
    "id": "assessment-uuid",
    "status": "in_progress",
    "currentStep": "body_profile",
    "nextStep": "weight_goal",
    "version": 3,
    "answers": {
      "gender": "female",
      "goal": "lose_weight",
      "age": 32,
      "heightCm": 165,
      "weightKg": null,
      "targetWeightKg": null,
      "activityLevel": null
    },
    "updatedAt": "2026-08-26T10:00:00.000Z"
  },
  "meta": { "requestId": "uuid" }
}
```

## Gated results

Preview response deliberately has no protected values:

```json
{
  "data": {
    "access": "preview",
    "assessmentId": "uuid",
    "bmi": 25.7,
    "bmiCategory": "overweight",
    "summary": "Your personalized health plan is ready.",
    "lockedFields": [
      "basalMetabolicRate",
      "totalDailyEnergy",
      "recommendedDailyCalories",
      "predictedTargetDate",
      "weeklyProjection"
    ],
    "upgradeRequired": true
  }
}
```

An active, unexpired subscription returns an allow-listed full result containing those calculated fields and `upgradeRequired: false`.

## Complete cURL sequence

```bash
BASE_URL=http://localhost:3000

curl -sS -c cookies.txt -X POST "$BASE_URL/api/v1/sessions"
curl -sS -b cookies.txt -X POST "$BASE_URL/api/v1/assessments"

# Substitute ASSESSMENT_ID and the current numeric version each time.
curl -sS -b cookies.txt -X PUT \
  "$BASE_URL/api/v1/assessments/$ASSESSMENT_ID/steps/gender" \
  -H 'Content-Type: application/json' -H 'If-Match: 0' \
  -H 'Idempotency-Key: curl-gender-0001' -d '{"gender":"female"}'

# Submit goal, body_profile, weight_goal, and activity using the contracts above.
curl -sS -b cookies.txt -X POST \
  "$BASE_URL/api/v1/assessments/$ASSESSMENT_ID/complete" -H 'If-Match: 5'
curl -sS -b cookies.txt \
  "$BASE_URL/api/v1/assessments/$ASSESSMENT_ID/result"
curl -sS -b cookies.txt -X POST "$BASE_URL/pay" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: curl-payment-0001' \
  -d '{"planCode":"demo_monthly"}'
```
