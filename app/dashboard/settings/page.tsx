"use client";

import { useState } from "react";
import { mockUser } from "../data";

const integrations = [
  {
    icon: "📅",
    name: "Google Calendar",
    description: "Auto-detect meeting load and blocked focus time",
  },
  {
    icon: "🍎",
    name: "Apple Health",
    description: "Sync sleep duration and activity data",
  },
  {
    icon: "🌙",
    name: "Oura Ring",
    description: "Import HRV, sleep stages, and recovery score",
  },
];

export default function SettingsPage() {
  const [name, setName] = useState(mockUser.name);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const initials = name.trim() ? name.trim()[0].toUpperCase() : "?";

  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">Settings</h1>
        <p className="dash-subheading">Manage your profile and preferences</p>
      </header>

      <div className="settings-sections">
        {/* Profile */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Profile</div>

          <div className="settings-avatar-row">
            <div className="settings-avatar">{initials}</div>
            <div>
              <div className="settings-row-label">{name || "—"}</div>
              <div className="settings-row-sub">Your display name</div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Display name</div>
              <div className="settings-row-sub">Shown in your dashboard greeting</div>
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
        </div>

        {/* Notifications */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Notifications</div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Daily check-in reminder</div>
              <div className="settings-row-sub">
                Get a nudge to log your stress each morning
              </div>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />
              <span className="settings-toggle-track" />
              <span className="settings-toggle-thumb" />
            </label>
          </div>

          {reminderEnabled && (
            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Reminder time</div>
                <div className="settings-row-sub">When to send your daily prompt</div>
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
              <div className="settings-row-label">Weekly summary</div>
              <div className="settings-row-sub">
                Receive a digest of your load trends every Monday
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

        {/* Integrations */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Integrations</div>
          <p className="settings-section-desc">
            Connect your tools to improve score accuracy. Overload never stores
            raw data from third-party apps.
          </p>

          <div className="settings-integrations">
            {integrations.map((item) => (
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
        </div>

        {/* Data */}
        <div className="dash-card settings-section">
          <div className="settings-section-title">Data</div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Export data</div>
              <div className="settings-row-sub">Download your full history as CSV</div>
            </div>
            <button className="settings-outline-btn">Export CSV</button>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Clear history</div>
              <div className="settings-row-sub">Permanently delete all check-ins and scores</div>
            </div>
            <button className="settings-danger-btn">Clear data</button>
          </div>
        </div>

        {/* Save */}
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
