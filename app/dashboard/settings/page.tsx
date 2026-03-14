"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { mockCheckIns, computePersonalSignature } from "../data";

// ── Helpers ───────────────────────────────────────────────────────────────────

function requestNotifPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return Promise.resolve("denied");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  return Notification.requestPermission();
}

function getRealCheckIns(): Array<{ date: string; stress: number; score: number; note?: string }> {
  const entries: Array<{ date: string; stress: number; score: number; note?: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("checkin-")) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const dateStr = key.replace("checkin-", ""); // YYYY-MM-DD
      entries.push({
        date: dateStr,
        stress: parsed.stress ?? 0,
        score: parsed.score ?? 0,
        note: parsed.note,
      });
    } catch {}
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function stressLabel(s: number): string {
  const map: Record<number, string> = {
    1: "Very calm", 2: "Relaxed", 3: "Moderate", 4: "Stressed", 5: "Overwhelmed",
  };
  return map[s] ?? "—";
}

function buildCSV(): string {
  const rows: string[] = ["Date,Stress Level,Stress Label,Score,Note"];

  // Real check-ins from localStorage first
  const real = getRealCheckIns();
  real.forEach(({ date, stress, score, note }) => {
    const escaped = (note ?? "").replace(/"/g, '""');
    rows.push(`${date},${stress},"${stressLabel(stress)}",${score},"${escaped}"`);
  });

  // Fill in mock check-ins for dates not already in real data
  const realDates = new Set(real.map((r) => r.date));
  mockCheckIns.forEach((entry) => {
    // Convert "Mar 13" style to something usable — skip if duplicate
    if (realDates.size > 0) return; // only fall back when no real data at all
    const escaped = (entry.note ?? "").replace(/"/g, '""');
    rows.push(`${entry.date},${entry.stress},"${entry.stressLabel}",${entry.score},"${escaped}"`);
  });

  // If nothing real exists yet, use mock data
  if (real.length === 0) {
    mockCheckIns.forEach((entry) => {
      const escaped = (entry.note ?? "").replace(/"/g, '""');
      rows.push(`${entry.date},${entry.stress},"${entry.stressLabel}",${entry.score},"${escaped}"`);
    });
  }

  return rows.join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <p className="modal-body">{body}</p>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function GCalModal({ onConnect, onClose }: { onConnect: () => void; onClose: () => void }) {
  const [phase, setPhase] = useState<"idle" | "connecting" | "done">("idle");

  function handleConnect() {
    setPhase("connecting");
    // Simulate OAuth delay
    setTimeout(() => {
      setPhase("done");
      setTimeout(() => {
        onConnect();
      }, 800);
    }, 1800);
  }

  return (
    <div className="modal-backdrop" onClick={phase === "idle" ? onClose : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {phase === "idle" && (
          <>
            <div className="modal-icon">📅</div>
            <div className="modal-title">Connect Google Calendar</div>
            <p className="modal-body">
              Overload will read your calendar density — meetings, blocked focus time, and
              scheduling patterns — to improve your score accuracy. No event content is stored.
            </p>
            <div className="modal-permissions">
              <div className="modal-perm-item">
                <span className="modal-perm-icon">✓</span> Read meeting counts and times
              </div>
              <div className="modal-perm-item">
                <span className="modal-perm-icon">✓</span> Detect focus blocks vs fragmented days
              </div>
              <div className="modal-perm-item modal-perm-never">
                <span className="modal-perm-icon">✗</span> Event titles, descriptions, or attendees
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={onClose}>Cancel</button>
              <button className="modal-confirm" onClick={handleConnect}>
                Connect with Google
              </button>
            </div>
          </>
        )}

        {phase === "connecting" && (
          <div className="modal-connecting">
            <div className="modal-spinner" />
            <div className="modal-connecting-text">Connecting to Google Calendar…</div>
          </div>
        )}

        {phase === "done" && (
          <div className="modal-connecting">
            <div className="modal-done-icon">✓</div>
            <div className="modal-connecting-text">Calendar connected!</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName]                     = useState("");
  const [role, setRole]                     = useState("engineer");
  const [sleep, setSleep]                   = useState("8");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime]     = useState("17:30");
  const [weeklySummary, setWeeklySummary]   = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [gcalConnected, setGcalConnected]   = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showGcalModal, setShowGcalModal]   = useState(false);
  const [cleared, setCleared]               = useState(false);
  const [exported, setExported]             = useState(false);
  const [learnedProfile, setLearnedProfile] = useState<{
    checkinCount: number;
    hardestDay: string | null;
    trigger: string | null;
    trend: string | null;
    isStale: boolean;
  } | null>(null);

  // Bootstrap from localStorage
  useEffect(() => {
    const storedName    = localStorage.getItem("overload-name") || "there";
    const storedRole    = localStorage.getItem("overload-role")  || "engineer";
    const storedSleep   = localStorage.getItem("overload-sleep") || "8";
    const notifEnabled  = localStorage.getItem("overload-notif-enabled") === "1";
    const notifTime     = localStorage.getItem("overload-notif-time") || "17:30";
    const weeklyEnabled = localStorage.getItem("overload-weekly-summary") !== "0";
    const gcal          = localStorage.getItem("overload-gcal-connected") === "1";

    setName(storedName);
    setRole(storedRole);
    setSleep(storedSleep);
    setReminderEnabled(notifEnabled);
    setReminderTime(notifTime);
    setWeeklySummary(weeklyEnabled);
    setGcalConnected(gcal);

    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }

    // Compute learned profile
    let checkinCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("checkin-")) checkinCount++;
    }
    const sig = checkinCount >= 7 ? computePersonalSignature() : null;
    const lastUpdated = localStorage.getItem("overload-profile-updated");
    const isStale = !lastUpdated || (() => {
      const daysSince = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86_400_000);
      return daysSince > 90;
    })();
    setLearnedProfile({
      checkinCount,
      hardestDay: sig?.hardestDay ?? null,
      trigger: sig?.topTrigger ?? null,
      trend: sig?.trend ?? null,
      isStale: checkinCount >= 7 && isStale,
    });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    localStorage.setItem("overload-name", name.trim() || "there");
    localStorage.setItem("overload-role", role);
    localStorage.setItem("overload-sleep", sleep);
    localStorage.setItem("overload-profile-updated", new Date().toISOString().split("T")[0]);
    localStorage.setItem("overload-weekly-summary", weeklySummary ? "1" : "0");

    if (reminderEnabled) {
      const perm = await requestNotifPermission();
      setNotifPermission(perm);
      if (perm === "granted") {
        localStorage.setItem("overload-notif-enabled", "1");
        localStorage.setItem("overload-notif-time", reminderTime);
      } else {
        // Permission denied — save preference but can't schedule
        localStorage.setItem("overload-notif-enabled", "1");
        localStorage.setItem("overload-notif-time", reminderTime);
      }
    } else {
      localStorage.setItem("overload-notif-enabled", "0");
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Toggle reminder with permission request ───────────────────────────────

  async function handleReminderToggle(checked: boolean) {
    if (checked) {
      const perm = await requestNotifPermission();
      setNotifPermission(perm);
    }
    setReminderEnabled(checked);
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  function handleExport() {
    const csv = buildCSV();
    const today = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `overload-history-${today}.csv`);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  }

  // ── Clear Data ────────────────────────────────────────────────────────────

  function handleClearConfirm() {
    // Remove all checkin entries
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith("checkin-") ||
        key.startsWith("burnout-dismissed-") ||
        key.startsWith("recovery-checked-")
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("overload-estimated-score");
    localStorage.removeItem("overload-gcal-connected");
    setGcalConnected(false);
    setShowClearModal(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
  }

  // ── GCal connect ──────────────────────────────────────────────────────────

  function handleGcalConnect() {
    localStorage.setItem("overload-gcal-connected", "1");
    setGcalConnected(true);
    setShowGcalModal(false);
  }

  function handleGcalDisconnect() {
    localStorage.removeItem("overload-gcal-connected");
    setGcalConnected(false);
  }

  const initials = name.trim() ? name.trim()[0].toUpperCase() : "?";

  const notifBlocked = notifPermission === "denied";

  return (
    <div className="dash-content">
      {showClearModal && (
        <ConfirmModal
          title="Clear all data?"
          body="This permanently deletes every check-in, recovery progress, and dismissed alert. Your profile (name, role, sleep) is kept. This cannot be undone."
          confirmLabel="Yes, clear everything"
          onConfirm={handleClearConfirm}
          onCancel={() => setShowClearModal(false)}
        />
      )}

      {showGcalModal && (
        <GCalModal
          onConnect={handleGcalConnect}
          onClose={() => setShowGcalModal(false)}
        />
      )}

      <header className="dash-header">
        <h1 className="dash-greeting">How it knows you</h1>
        <p className="dash-subheading">Tell it when something changes.</p>
      </header>

      {cleared && (
        <div className="settings-flash settings-flash--ok">
          ✓ All check-in data cleared. Starting fresh.
        </div>
      )}

      <div className="settings-sections">

        {/* ── What the app knows ── */}
        {learnedProfile && learnedProfile.checkinCount >= 7 && (
          <div className="dash-card settings-section settings-learned">
            <div className="settings-section-title">What the app has learned</div>
            {learnedProfile.isStale && (
              <div className="settings-stale-notice">
                Your profile was set at onboarding. Does it still reflect you? Update below and save.
              </div>
            )}
            <div className="settings-learned-grid">
              <div className="settings-learned-item">
                <span className="settings-learned-key">Check-ins</span>
                <span className="settings-learned-val">{learnedProfile.checkinCount} total</span>
              </div>
              {learnedProfile.hardestDay && (
                <div className="settings-learned-item">
                  <span className="settings-learned-key">Hardest day</span>
                  <span className="settings-learned-val">{learnedProfile.hardestDay}s</span>
                </div>
              )}
              {learnedProfile.trigger && (
                <div className="settings-learned-item">
                  <span className="settings-learned-key">Main trigger</span>
                  <span className="settings-learned-val">{learnedProfile.trigger.charAt(0).toUpperCase() + learnedProfile.trigger.slice(1)}</span>
                </div>
              )}
              {learnedProfile.trend && (
                <div className="settings-learned-item">
                  <span className="settings-learned-key">Trend</span>
                  <span className={`settings-learned-val settings-trend--${learnedProfile.trend}`}>
                    {learnedProfile.trend === "improving" ? "Load coming down" :
                     learnedProfile.trend === "worsening" ? "Load climbing" : "Holding steady"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Profile ── */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Who you are</div>

          <div className="settings-avatar-row">
            <div className="settings-avatar">{initials}</div>
            <div>
              <div className="settings-row-label">{name || "—"}</div>
              <div className="settings-row-sub">What the app calls you</div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Your name</div>
              <div className="settings-row-sub">Used in your daily greeting</div>
            </div>
            <input
              className="settings-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
            />
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Your role</div>
              <div className="settings-row-sub">Affects how the score is calibrated</div>
            </div>
            <select
              className="settings-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="engineer">Engineer</option>
              <option value="manager">Manager</option>
              <option value="founder">Founder</option>
              <option value="pm">Product Manager</option>
              <option value="designer">Designer</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Sleep baseline</div>
              <div className="settings-row-sub">How much sleep you usually get</div>
            </div>
            <select
              className="settings-select"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            >
              <option value="6">6 hours or less</option>
              <option value="7">About 7 hours</option>
              <option value="8">About 8 hours</option>
              <option value="9">9 hours or more</option>
            </select>
          </div>
        </div>

        {/* ── Notifications ── */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">When to check in</div>

          {notifBlocked && (
            <div className="settings-notif-blocked">
              Notifications are blocked in your browser settings. To enable them, open your
              browser&apos;s site settings and allow notifications for this site.
            </div>
          )}

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Remind me to check in</div>
              <div className="settings-row-sub">
                A nudge at the end of your day, before the evening blurs the memory
              </div>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => handleReminderToggle(e.target.checked)}
                disabled={notifBlocked}
              />
              <span className="settings-toggle-track" />
              <span className="settings-toggle-thumb" />
            </label>
          </div>

          {reminderEnabled && !notifBlocked && (
            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Best time for your nudge</div>
                <div className="settings-row-sub">
                  5:30 PM works for most — end of work, before the evening starts
                </div>
              </div>
              <input
                className="settings-input settings-input--time"
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </div>
          )}

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Monday morning debrief</div>
              <div className="settings-row-sub">
                A recap of last week surfaces on the dashboard every Monday morning
              </div>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={weeklySummary}
                onChange={(e) => setWeeklySummary(e.target.checked)}
              />
              <span className="settings-toggle-track" />
              <span className="settings-toggle-thumb" />
            </label>
          </div>
        </div>

        {/* ── Integrations ── */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Connect your tools</div>
          <p className="settings-section-desc">
            The more context the app has, the more accurate your score. Your data stays on your device — nothing is stored from third-party services.
          </p>

          {/* Google Calendar — live integration */}
          <div className="settings-integration settings-integration--gcal">
            <div className="settings-integration-icon">📅</div>
            <div className="settings-integration-info">
              <div className="settings-integration-name">Google Calendar</div>
              <div className="settings-integration-sub">
                {gcalConnected
                  ? "Reading meeting density · calendar signal active in your score"
                  : "Auto-detect meeting load and blocked focus time"}
              </div>
            </div>
            {gcalConnected ? (
              <div className="settings-integration-connected-wrap">
                <div className="settings-integration-connected">Connected ✓</div>
                <button
                  className="settings-integration-disconnect"
                  onClick={handleGcalDisconnect}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                className="settings-outline-btn"
                onClick={() => setShowGcalModal(true)}
              >
                Connect
              </button>
            )}
          </div>

          {/* Others — coming soon */}
          {[
            { icon: "🍎", name: "Apple Health", description: "Sync sleep duration and activity data" },
            { icon: "🌙", name: "Oura Ring",    description: "Import HRV, sleep stages, and recovery score" },
          ].map((item) => (
            <div key={item.name} className="settings-integration">
              <div className="settings-integration-icon">{item.icon}</div>
              <div className="settings-integration-info">
                <div className="settings-integration-name">{item.name}</div>
                <div className="settings-integration-sub">{item.description}</div>
              </div>
              <div className="settings-integration-badge">Coming soon</div>
            </div>
          ))}
        </div>

        {/* ── Data ── */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Your data</div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Take it with you</div>
              <div className="settings-row-sub">Everything the app knows — yours to keep, as a CSV.</div>
            </div>
            <button
              className={`settings-outline-btn${exported ? " settings-outline-btn--done" : ""}`}
              onClick={handleExport}
            >
              {exported ? "Downloaded ✓" : "Download history"}
            </button>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Start over</div>
              <div className="settings-row-sub">
                Wipe all check-ins and begin again. Your name and profile stay. This cannot be undone.
              </div>
            </div>
            <button
              className="settings-danger-btn"
              onClick={() => setShowClearModal(true)}
            >
              Wipe clean
            </button>
          </div>
        </div>

        {/* ── Save ── */}
        <div className="settings-save-row">
          <button
            className={`settings-save${saved ? " settings-save--saved" : ""}`}
            onClick={handleSave}
          >
            {saved ? "Saved ✓" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
