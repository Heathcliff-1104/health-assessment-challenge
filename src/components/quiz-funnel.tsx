"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STEPS = ["gender", "goal", "body_profile", "weight_goal", "activity"] as const;
type Step = (typeof STEPS)[number];

interface AssessmentDto {
  id: string;
  status: "in_progress" | "completed";
  currentStep: Step | null;
  nextStep: Step | null;
  version: number;
  answers: {
    gender: string | null;
    goal: string | null;
    age: number | null;
    heightCm: number | null;
    weightKg: number | null;
    targetWeightKg: number | null;
    activityLevel: string | null;
  };
  updatedAt: string;
}

interface ProjectionPoint {
  week: number;
  date: string;
  weightKg: number;
}

interface PreviewResult {
  access: "preview";
  assessmentId: string;
  bmi: number;
  bmiCategory: string;
  lockedFields: string[];
  upgradeRequired: true;
}

interface FullResult {
  access: "full";
  assessmentId: string;
  bmi: number;
  bmiCategory: string;
  recommendedDailyCalories: number;
  predictedTargetDate: string;
  weeklyProjection: ProjectionPoint[];
  upgradeRequired: false;
}

type ResultDto = PreviewResult | FullResult;

interface ApiEnvelope<T> {
  data: T;
}

interface DraftAnswers {
  gender: string;
  goal: string;
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  activityLevel: string;
}

const EMPTY_DRAFT: DraftAnswers = {
  gender: "",
  goal: "",
  age: "",
  heightCm: "",
  weightKg: "",
  targetWeightKg: "",
  activityLevel: "",
};

const BMI_LABELS: Record<string, string> = {
  underweight: "Below the general range",
  healthy_range: "Within the general range",
  overweight: "Above the general range",
  obesity_range: "Well above the general range",
};

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message ?? "Something went wrong. Please try again.";
    const fieldMessage = body?.error?.fields
      ? Object.values(body.error.fields).flat().join(" ")
      : "";
    throw new Error(fieldMessage || message);
  }
  return (body as ApiEnvelope<T>).data;
}

function Logo() {
  return (
    <div className="brand" aria-label="Luma Health">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Luma</span>
    </div>
  );
}

function ProjectionChart({ points }: { points: ProjectionPoint[] }) {
  const chart = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return null;
    const values = points.map((point) => point.weightKg);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const coordinates = points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 82 - ((point.weightKg - min) / range) * 62;
        return `${x},${y}`;
      })
      .join(" ");
    return { coordinates, start: values[0], end: values.at(-1) };
  }, [points]);

  if (!chart) return null;
  return (
    <div className="chart-card">
      <div className="chart-heading">
        <div>
          <span className="eyebrow">Your trajectory</span>
          <strong>Steady progress, built to last</strong>
        </div>
        <span className="chart-delta">
          {chart.start} → {chart.end} kg
        </span>
      </div>
      <svg viewBox="0 0 100 92" role="img" aria-label="Projected weight trend">
        <defs>
          <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2e8069" stopOpacity=".25" />
            <stop offset="1" stopColor="#2e8069" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 82 H100" className="chart-grid" />
        <polyline points={chart.coordinates} className="chart-line" />
      </svg>
    </div>
  );
}

export function QuizFunnel() {
  const [assessment, setAssessment] = useState<AssessmentDto | null>(null);
  const [result, setResult] = useState<ResultDto | null>(null);
  const [draft, setDraft] = useState<DraftAnswers>(EMPTY_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hydrateAssessment = useCallback((value: AssessmentDto) => {
    setAssessment(value);
    setDraft({
      gender: value.answers.gender ?? "",
      goal: value.answers.goal ?? "",
      age: value.answers.age?.toString() ?? "",
      heightCm: value.answers.heightCm?.toString() ?? "",
      weightKg: value.answers.weightKg?.toString() ?? "",
      targetWeightKg: value.answers.targetWeightKg?.toString() ?? "",
      activityLevel: value.answers.activityLevel ?? "",
    });
    const nextIndex = value.nextStep ? STEPS.indexOf(value.nextStep) : STEPS.length - 1;
    setStepIndex(Math.max(0, nextIndex));
  }, []);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const current = await apiRequest<AssessmentDto | null>(
          "/api/v1/assessments/current",
        );
        if (!active || !current) return;
        hydrateAssessment(current);
        if (current.status === "completed") {
          const restoredResult = await apiRequest<ResultDto>(
            `/api/v1/assessments/${current.id}/result`,
          );
          if (active) setResult(restoredResult);
        }
      } catch {
        // A first-time visitor has no session yet; the welcome screen is intentional.
      } finally {
        if (active) setLoading(false);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, [hydrateAssessment]);

  async function startAssessment() {
    setSaving(true);
    setError("");
    try {
      if (!assessment || assessment.status === "completed") {
        if (!assessment) {
          await apiRequest("/api/v1/sessions", { method: "POST" });
        }
        const created = await apiRequest<AssessmentDto>("/api/v1/assessments", {
          method: "POST",
        });
        hydrateAssessment(created);
      }
      setResult(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to begin assessment");
    } finally {
      setSaving(false);
    }
  }

  function payloadForStep(step: Step): Record<string, string | number> {
    switch (step) {
      case "gender":
        return { gender: draft.gender };
      case "goal":
        return { goal: draft.goal };
      case "body_profile":
        return { age: Number(draft.age), heightCm: Number(draft.heightCm) };
      case "weight_goal":
        return {
          weightKg: Number(draft.weightKg),
          targetWeightKg: Number(draft.targetWeightKg),
        };
      case "activity":
        return { activityLevel: draft.activityLevel };
    }
  }

  async function saveCurrentStep() {
    if (!assessment) return;
    const step = STEPS[stepIndex];
    setSaving(true);
    setError("");
    try {
      const updated = await apiRequest<AssessmentDto>(
        `/api/v1/assessments/${assessment.id}/steps/${step}`,
        {
          method: "PUT",
          headers: {
            "If-Match": String(assessment.version),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(payloadForStep(step)),
        },
      );
      hydrateAssessment(updated);

      if (step === "activity") {
        const completed = await apiRequest<ResultDto>(
          `/api/v1/assessments/${assessment.id}/complete`,
          {
            method: "POST",
            headers: { "If-Match": String(updated.version) },
          },
        );
        setAssessment({ ...updated, status: "completed", version: updated.version + 1 });
        setResult(completed);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this answer");
    } finally {
      setSaving(false);
    }
  }

  async function unlockPlan() {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest("/pay", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ planCode: "demo_monthly" }),
      });
      const full = await apiRequest<FullResult>(
        `/api/v1/assessments/${result.assessmentId}/result`,
      );
      setResult(full);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to unlock the plan");
    } finally {
      setSaving(false);
    }
  }

  async function startFreshAssessment() {
    setSaving(true);
    setError("");
    try {
      const created = await apiRequest<AssessmentDto>("/api/v1/assessments", {
        method: "POST",
      });
      setResult(null);
      hydrateAssessment(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to begin assessment");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell loading-screen">
        <Logo />
        <div className="loading-orb" aria-label="Restoring your progress" />
      </main>
    );
  }

  if (result?.access === "full") {
    return (
      <main className="app-shell result-shell">
        <header className="topbar"><Logo /><span className="saved-pill">Plan unlocked</span></header>
        <section className="result-hero">
          <span className="success-mark">✓</span>
          <p className="eyebrow">Your personal baseline</p>
          <h1>Your plan is ready to meet you where you are.</h1>
          <p>Small, consistent changes shaped around your body and your pace.</p>
        </section>
        <section className="metric-grid">
          <article><span>BMI</span><strong>{result.bmi}</strong><small>{BMI_LABELS[result.bmiCategory]}</small></article>
          <article><span>Daily target</span><strong>{result.recommendedDailyCalories}</strong><small>estimated kcal / day</small></article>
          <article><span>Target date</span><strong>{new Date(`${result.predictedTargetDate}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</strong><small>at a steady, sustainable pace</small></article>
        </section>
        <ProjectionChart points={result.weeklyProjection} />
        <div className="notice-card"><strong>A thoughtful estimate, not a diagnosis.</strong><p>These numbers are general wellness guidance. Speak with a qualified professional before making significant nutrition or exercise changes.</p></div>
        <button className="text-button" onClick={startFreshAssessment} disabled={saving}>
          {saving ? "Preparing…" : "Start a fresh assessment"}
        </button>
      </main>
    );
  }

  if (result?.access === "preview") {
    return (
      <main className="app-shell paywall-shell">
        <header className="topbar"><Logo /><span className="saved-pill">Assessment complete</span></header>
        <section className="paywall-copy">
          <span className="success-mark">✓</span>
          <p className="eyebrow">Your personalized plan is ready</p>
          <h1>We found a realistic path toward your goal.</h1>
          <p>Your current BMI is <strong>{result.bmi}</strong> — {BMI_LABELS[result.bmiCategory]?.toLowerCase()}.</p>
        </section>
        <section className="locked-plan">
          <div className="locked-header"><div><span className="eyebrow">Inside your plan</span><h2>Built around your answers</h2></div><span className="lock-icon">⌁</span></div>
          <div className="locked-row"><span className="mini-icon">◎</span><div><strong>Your daily calorie target</strong><small>Personalized to your activity and goal</small></div><span>Locked</span></div>
          <div className="locked-row"><span className="mini-icon">↗</span><div><strong>Your projected timeline</strong><small>A week-by-week progress curve</small></div><span>Locked</span></div>
          <div className="locked-row"><span className="mini-icon">◇</span><div><strong>Your metabolic baseline</strong><small>The calculation behind your plan</small></div><span>Locked</span></div>
        </section>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button className="primary-button" onClick={unlockPlan} disabled={saving}>
          {saving ? "Unlocking…" : "Unlock my plan — demo"}
        </button>
        <p className="demo-note">Demo payment only. No card and no real charge.</p>
      </main>
    );
  }

  if (!assessment) {
    return (
      <main className="app-shell welcome-shell">
        <header className="topbar"><Logo /><span className="privacy-pill">Private by design</span></header>
        <section className="welcome-copy">
          <span className="kicker">A 2-minute wellness check</span>
          <h1>A plan that starts with <em>you.</em></h1>
          <p>Answer five focused questions. We’ll turn your goals, body data and routine into a clear first step.</p>
        </section>
        <div className="journey-visual" aria-hidden="true">
          <div className="orbit orbit-one"><span /></div>
          <div className="orbit orbit-two"><span /></div>
          <div className="center-orb"><span>your<br />pace</span></div>
          <span className="float-label label-one">move</span>
          <span className="float-label label-two">nourish</span>
          <span className="float-label label-three">progress</span>
        </div>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button className="primary-button" onClick={startAssessment} disabled={saving}>
          {saving ? "Preparing your check…" : "Start my assessment"}
        </button>
        <div className="trust-row"><span>✓ Saves as you go</span><span>✓ No account needed</span><span>✓ No medical claims</span></div>
      </main>
    );
  }

  const currentStep = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const canContinue =
    currentStep === "gender" ? Boolean(draft.gender) :
    currentStep === "goal" ? Boolean(draft.goal) :
    currentStep === "body_profile" ? Boolean(draft.age && draft.heightCm) :
    currentStep === "weight_goal" ? Boolean(draft.weightKg && draft.targetWeightKg) :
    Boolean(draft.activityLevel);

  return (
    <main className="app-shell quiz-shell">
      <header className="quiz-header">
        <button className="back-button" aria-label="Previous question" disabled={stepIndex === 0 || saving} onClick={() => { setError(""); setStepIndex((value) => Math.max(0, value - 1)); }}>←</button>
        <Logo />
        <span className="saved-pill">{saving ? "Saving…" : "Saved"}</span>
      </header>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <p className="step-count">Question {stepIndex + 1} of {STEPS.length}</p>

      <section className="question-card">
        {currentStep === "gender" && <>
          <p className="eyebrow">Let’s begin</p><h1>How should we personalize your estimate?</h1><p className="question-help">This helps us estimate your baseline energy needs.</p>
          <div className="option-grid two-column">
            {[["female","Female","♀"],["male","Male","♂"],["non_binary","Non-binary","◇"],["prefer_not_to_say","Prefer not to say","—"]].map(([value,label,icon]) => <button key={value} aria-label={label} className={`option-card ${draft.gender === value ? "selected" : ""}`} onClick={() => setDraft((state) => ({ ...state, gender: value }))}><span className="option-icon" aria-hidden="true">{icon}</span><strong>{label}</strong></button>)}
          </div>
        </>}

        {currentStep === "goal" && <>
          <p className="eyebrow">Your direction</p><h1>What would feel like meaningful progress?</h1><p className="question-help">Choose the outcome you want this plan to support.</p>
          <div className="option-list">
            {[["lose_weight","Lose weight","Move toward a lighter, sustainable baseline","↘"],["maintain_weight","Maintain weight","Build healthier routines around where I am","→"],["gain_weight","Gain weight","Support gradual, intentional growth","↗"]].map(([value,label,help,icon]) => <button key={value} className={`wide-option ${draft.goal === value ? "selected" : ""}`} onClick={() => setDraft((state) => ({ ...state, goal: value }))}><span className="option-icon">{icon}</span><span><strong>{label}</strong><small>{help}</small></span><span className="option-check">✓</span></button>)}
          </div>
        </>}

        {currentStep === "body_profile" && <>
          <p className="eyebrow">Your baseline</p><h1>Tell us a little about your body.</h1><p className="question-help">Used only to calculate your wellness estimate.</p>
          <div className="input-stack">
            <label><span>Age</span><div className="input-wrap"><input inputMode="numeric" type="number" min="18" max="100" value={draft.age} onChange={(event) => setDraft((state) => ({ ...state, age: event.target.value }))} placeholder="32" /><small>years</small></div></label>
            <label><span>Height</span><div className="input-wrap"><input inputMode="decimal" type="number" min="120" max="230" step="0.1" value={draft.heightCm} onChange={(event) => setDraft((state) => ({ ...state, heightCm: event.target.value }))} placeholder="165" /><small>cm</small></div></label>
          </div>
        </>}

        {currentStep === "weight_goal" && <>
          <p className="eyebrow">Your destination</p><h1>Where are you now — and where do you want to go?</h1><p className="question-help">We’ll check that your target fits a supported planning range.</p>
          <div className="input-stack">
            <label><span>Current weight</span><div className="input-wrap"><input inputMode="decimal" type="number" min="35" max="300" step="0.1" value={draft.weightKg} onChange={(event) => setDraft((state) => ({ ...state, weightKg: event.target.value }))} placeholder="70" /><small>kg</small></div></label>
            <label><span>Target weight</span><div className="input-wrap"><input inputMode="decimal" type="number" min="35" max="300" step="0.1" value={draft.targetWeightKg} onChange={(event) => setDraft((state) => ({ ...state, targetWeightKg: event.target.value }))} placeholder="60" /><small>kg</small></div></label>
          </div>
        </>}

        {currentStep === "activity" && <>
          <p className="eyebrow">Your real life</p><h1>How active is a typical week?</h1><p className="question-help">Think about your usual routine, not your best week.</p>
          <div className="option-list compact">
            {[["sedentary","Mostly seated","Little structured movement","1"],["light","Lightly active","1–2 active days","2"],["moderate","Moderately active","3–4 active days","3"],["active","Very active","5–6 active days","4"],["very_active","Highly active","Hard training or physical work","5"]].map(([value,label,help,icon]) => <button key={value} className={`wide-option ${draft.activityLevel === value ? "selected" : ""}`} onClick={() => setDraft((state) => ({ ...state, activityLevel: value }))}><span className="level-icon">{icon}</span><span><strong>{label}</strong><small>{help}</small></span><span className="option-check">✓</span></button>)}
          </div>
        </>}
      </section>

      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="primary-button" disabled={!canContinue || saving} onClick={saveCurrentStep}>
        {saving ? (currentStep === "activity" ? "Building your plan…" : "Saving…") : (currentStep === "activity" ? "Build my plan" : "Continue")}
      </button>
      <p className="privacy-footnote">Your answers are stored securely so you can return later.</p>
    </main>
  );
}
