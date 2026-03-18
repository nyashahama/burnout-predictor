package email

import "fmt"

// Each function returns (subject, html) for one email template.
// HTML is deliberately minimal — no heavy CSS, no images, works everywhere.

// Welcome is sent immediately after registration.
func Welcome(name string) (subject, html string) {
	subject = "Welcome to Overload"
	html = fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to Overload</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <p style="font-size:13px;color:#888;margin:0 0 32px;letter-spacing:0.05em;text-transform:uppercase">Overload</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 20px;line-height:1.3">Hey %s,</h1>
  <p style="font-size:16px;line-height:1.7;margin:0 0 16px;color:#333">You just created your Overload account. Good move.</p>
  <p style="font-size:16px;line-height:1.7;margin:0 0 16px;color:#333">The first check-in is the hardest. After that, it takes 30 seconds and the data starts working for you.</p>
  <p style="font-size:16px;line-height:1.7;margin:0 0 40px;color:#333">The app learns your patterns — when you're most at risk, what triggers your load, what actually helps. None of that happens without the data.</p>
  <a href="https://overload.app/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:500">Open your dashboard →</a>
  <p style="font-size:12px;color:#bbb;margin:48px 0 0">You're receiving this because you created an Overload account. Manage preferences at overload.app/dashboard/settings</p>
</div>
</body>
</html>`, name)
	return
}

// CheckinReminder is the daily nudge. title + body come from score.BuildNotificationText.
func CheckinReminder(title, body string) (subject, html string) {
	subject = title
	html = fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <p style="font-size:13px;color:#888;margin:0 0 32px;letter-spacing:0.05em;text-transform:uppercase">Overload</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 20px;line-height:1.3">%s</h1>
  <p style="font-size:16px;line-height:1.7;margin:0 0 40px;color:#333">%s</p>
  <a href="https://overload.app/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:500">Check in now →</a>
  <p style="font-size:12px;color:#bbb;margin:48px 0 0">Manage reminder preferences at overload.app/dashboard/settings</p>
</div>
</body>
</html>`, title, title, body)
	return
}

// MondayDebrief is the weekly Monday morning summary.
// avgScore is last week's average. topPattern is one sentence from DetectPatterns (may be empty).
func MondayDebrief(name string, avgScore int, scoreDelta int, topPattern string) (subject, html string) {
	subject = "Your week in review"

	var trendLine string
	switch {
	case scoreDelta >= 5:
		trendLine = fmt.Sprintf(`<p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#c0392b">↑ %d points heavier than the week before. Worth watching before it compounds.</p>`, scoreDelta)
	case scoreDelta <= -5:
		trendLine = fmt.Sprintf(`<p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#27ae60">↓ %d points lighter than the week before. Whatever changed — do it again.</p>`, -scoreDelta)
	default:
		trendLine = `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#888">→ Consistent with the week before.</p>`
	}

	patternBlock := ""
	if topPattern != "" {
		patternBlock = fmt.Sprintf(`
  <div style="background:#f7f7f7;border-left:3px solid #1a1a1a;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 32px">
    <p style="font-size:15px;line-height:1.6;margin:0;color:#333">%s</p>
  </div>`, topPattern)
	}

	html = fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your week in review</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <p style="font-size:13px;color:#888;margin:0 0 32px;letter-spacing:0.05em;text-transform:uppercase">Overload · Monday debrief</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;line-height:1.3">Last week, %s</h1>
  <p style="font-size:14px;color:#888;margin:0 0 32px">Here's what the data says.</p>
  <div style="background:#f7f7f7;border-radius:12px;padding:24px;margin:0 0 16px;display:inline-block">
    <div style="font-size:13px;color:#888;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em">Average load score</div>
    <div style="font-size:48px;font-weight:700;line-height:1;color:#1a1a1a">%d</div>
  </div>
  %s
  %s
  <a href="https://overload.app/dashboard/history" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:500">See full history →</a>
  <p style="font-size:12px;color:#bbb;margin:48px 0 0">Manage email preferences at overload.app/dashboard/settings</p>
</div>
</body>
</html>`, name, avgScore, trendLine, patternBlock)
	return
}

// StreakAlert fires in the evening when the user hasn't checked in and has an active streak.
func StreakAlert(name string, streak int) (subject, html string) {
	subject = fmt.Sprintf("Your %d-day streak is at risk", streak)
	html = fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <p style="font-size:13px;color:#888;margin:0 0 32px;letter-spacing:0.05em;text-transform:uppercase">Overload</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 20px;line-height:1.3">%d days in a row, %s.</h1>
  <p style="font-size:16px;line-height:1.7;margin:0 0 16px;color:#333">You haven't checked in today. Your streak ends at midnight.</p>
  <p style="font-size:16px;line-height:1.7;margin:0 0 40px;color:#333">30 seconds. That's all.</p>
  <a href="https://overload.app/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:500">Check in now →</a>
  <p style="font-size:12px;color:#bbb;margin:48px 0 0">Manage email preferences at overload.app/dashboard/settings</p>
</div>
</body>
</html>`, subject, streak, name)
	return
}

// ReEngage fires after 2+ missed days for users with a recent history.
func ReEngage(name string) (subject, html string) {
	subject = "The data is still here"
	html = fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:0">
<div style="max-width:560px;margin:0 auto;padding:48px 24px">
  <p style="font-size:13px;color:#888;margin:0 0 32px;letter-spacing:0.05em;text-transform:uppercase">Overload</p>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 20px;line-height:1.3">Hey %s,</h1>
  <p style="font-size:16px;line-height:1.7;margin:0 0 16px;color:#333">You've been quiet for a few days. The streak is gone — that's fine.</p>
  <p style="font-size:16px;line-height:1.7;margin:0 0 16px;color:#333">Everything the app learned about you is still there. One check-in tonight picks right back up.</p>
  <p style="font-size:16px;line-height:1.7;margin:0 0 40px;color:#333">How are you actually carrying it right now?</p>
  <a href="https://overload.app/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:500">Check in →</a>
  <p style="font-size:12px;color:#bbb;margin:48px 0 0">Manage email preferences at overload.app/dashboard/settings</p>
</div>
</body>
</html>`, subject, name)
	return
}
