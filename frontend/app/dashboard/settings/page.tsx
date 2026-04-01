"use client";

import { useEffect, useState } from "react";
import { Download, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { parseNotificationPrefs, parseUserResponse } from "@/lib/validators";
import { safeParseJson } from "@/lib/storage";
import { getTodayString } from "@/lib/date";
import type { NotificationPrefs, UpdateProfileRequest, UserResponse } from "@/lib/types";

function buildCSV() {
  const rows: string[] = ["Date,Stress Level,Score,Note"];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("checkin-")) continue;
    const parsed = safeParseJson<{ stress?: number; score?: number; note?: string }>(localStorage.getItem(key), {});
    rows.push(`${key.replace("checkin-", "")},${parsed.stress ?? 0},${parsed.score ?? 0},"${(parsed.note ?? "").replace(/"/g, '""')}"`);
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

export default function SettingsPage() {
  const { api, user, updateUser } = useAuth();
  const [profile, setProfile] = useState<UserResponse | null>(user);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("engineer");
  const [sleep, setSleep] = useState("8");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/api/user", parseUserResponse),
      api.get("/api/notifications/prefs", parseNotificationPrefs),
    ])
      .then(([profileData, prefs]) => {
        setProfile(profileData);
        setNotifPrefs(prefs);
        setName(profileData.name);
        setRole(profileData.role);
        setSleep(String(profileData.sleep_baseline));
        setReminderEnabled(prefs.checkin_reminder);
        setWeeklySummary(prefs.monday_debrief_email);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load settings.");
      });
  }, [api]);

  async function saveProfile() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updates: UpdateProfileRequest = {
        name: name.trim() || "there",
        role,
        sleep_baseline: Number(sleep),
      };
      const updated = await api.patch("/api/user", updates, parseUserResponse);
      setProfile(updated);
      updateUser(updated);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotifPrefs(prefs: Partial<NotificationPrefs>) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.patch("/api/notifications/prefs", prefs, parseNotificationPrefs);
      setNotifPrefs(updated);
      setMessage("Notification preferences saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    downloadCSV(buildCSV(), `overload-history-${getTodayString()}.csv`);
    setMessage("History downloaded.");
  }

  function handleClearData() {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("checkin-") || key?.startsWith("recovery-checked-")) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    setMessage("Local check-in data cleared.");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Profile, notification preferences, and exported data.</p>
      </div>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>These fields shape the baseline used by the score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Name</Label>
              <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-role">Role</Label>
              <Select id="settings-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="engineer">Engineer</option>
                <option value="manager">Manager</option>
                <option value="founder">Founder</option>
                <option value="pm">Product Manager</option>
                <option value="designer">Designer</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-sleep">Sleep baseline</Label>
              <Select id="settings-sleep" value={sleep} onChange={(e) => setSleep(e.target.value)}>
                <option value="6">6 hours or less</option>
                <option value="7">About 7 hours</option>
                <option value="8">About 8 hours</option>
                <option value="9">9 hours or more</option>
              </Select>
            </div>
            <Button onClick={() => void saveProfile()} disabled={saving}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Keep the check-in cadence consistent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <div className="font-medium">Daily reminder</div>
                <div className="text-sm text-muted-foreground">Prompt yourself to log a check-in.</div>
              </div>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={(checked) => {
                  setReminderEnabled(checked);
                  void saveNotifPrefs({ checkin_reminder: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <div className="font-medium">Monday debrief</div>
                <div className="text-sm text-muted-foreground">Show the weekly recap on Monday mornings.</div>
              </div>
              <Switch
                checked={weeklySummary}
                onCheckedChange={(checked) => {
                  setWeeklySummary(checked);
                  void saveNotifPrefs({ monday_debrief_email: checked });
                }}
              />
            </div>
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Google Calendar integration is intentionally disabled until the real implementation exists.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Export or clear the browser-stored check-in history.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Download history
          </Button>
          <Button variant="destructive" onClick={handleClearData}>
            <Trash2 className="h-4 w-4" />
            Clear local history
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
