"use client";

import { useEffect, useState } from "react";

type PlanSection = {
  timing: string;
  actions: string[];
};

const STORAGE_KEY = `recovery-checked-${new Date().toISOString().split("T")[0]}`;

export default function RecoveryPlan({
  plan,
  score,
}: {
  plan: PlanSection[];
  score: number;
}) {
  const allActions = plan.flatMap((s) => s.actions);
  const [checked, setChecked] = useState<boolean[]>(() =>
    new Array(allActions.length).fill(false)
  );

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === allActions.length) {
          setChecked(parsed);
        }
      } catch {}
    }
  }, [allActions.length]);

  if (score <= 65) return null;

  function toggle(globalIndex: number) {
    setChecked((prev) => {
      const next = [...prev];
      next[globalIndex] = !next[globalIndex];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const done = checked.filter(Boolean).length;
  const total = allActions.length;
  const pct = Math.round((done / total) * 100);

  let globalIndex = 0;

  return (
    <div className="dash-card recovery">
      <div className="recovery-header">
        <div>
          <div className="recovery-title">How to pull back</div>
          <div className="recovery-sub">
            Small moves. Real difference by the weekend.
          </div>
        </div>
        <div className="recovery-progress-wrap">
          <div className="recovery-progress-label">{done}/{total} done</div>
          <div className="recovery-progress-track">
            <div
              className="recovery-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="recovery-sections">
        {plan.map((section) => (
          <div key={section.timing} className="recovery-section">
            <div className="recovery-timing">{section.timing}</div>
            <div className="recovery-actions">
              {section.actions.map((action) => {
                const idx = globalIndex++;
                const isChecked = checked[idx];
                return (
                  <label key={idx} className={`recovery-item${isChecked ? " recovery-item--done" : ""}`}>
                    <input
                      type="checkbox"
                      className="recovery-checkbox"
                      checked={isChecked}
                      onChange={() => toggle(idx)}
                    />
                    <span className="recovery-action-text">{action}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {done === total && (
        <div className="recovery-complete">
          ✓ Done. Sleep and space are the most effective tools you have. Check in tomorrow — your score should show it.
        </div>
      )}
    </div>
  );
}
