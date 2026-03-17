export default function DashboardLoading() {
  const forecastHeights = [74, 68, 52, 35, 47, 42, 33];
  const historyHeights = Array.from(
    { length: 30 },
    (_, i) => 20 + ((i * 17 + 23) % 55)
  );

  return (
    <div className="dash-content">
      <header className="dash-header">
        <div className="skel" style={{ height: 32, width: 240, borderRadius: 8 }} />
        <div className="skel" style={{ height: 13, width: 170, marginTop: 8 }} />
      </header>

      <div className="dash-grid">
        {/* ScoreCard skeleton */}
        <div className="dash-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="skel" style={{ height: 11, width: 130 }} />
            <div className="skel" style={{ height: 24, width: 84, borderRadius: 100 }} />
          </div>
          <div className="skel" style={{ height: 68, width: 110, borderRadius: 8 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[120, 180, 145, 100].map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div
                  className="skel"
                  style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 5, flexShrink: 0 }}
                />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="skel" style={{ height: 12, width: w }} />
                  <div className="skel" style={{ height: 10, width: w + 40 }} />
                </div>
                <div className="skel" style={{ height: 12, width: 46, flexShrink: 0 }} />
              </div>
            ))}
          </div>
          <div className="skel" style={{ height: 72, borderRadius: 12 }} />
        </div>

        {/* ForecastChart skeleton */}
        <div className="dash-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skel" style={{ height: 14, width: 100 }} />
            <div className="skel" style={{ height: 11, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 6, height: 140, alignItems: "flex-end" }}>
            {forecastHeights.map((h, i) => (
              <div
                key={i}
                style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, height: "100%", justifyContent: "flex-end" }}
              >
                <div
                  className="skel"
                  style={{ width: "100%", height: `${h}%`, borderRadius: "4px 4px 0 0" }}
                />
              </div>
            ))}
          </div>
          <div className="skel" style={{ height: 11, width: 200 }} />
        </div>
      </div>

      {/* CheckIn skeleton */}
      <div className="dash-card" style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="skel" style={{ height: 14, width: 110 }} />
          <div className="skel" style={{ height: 11, width: 220 }} />
        </div>
        <div className="skel" style={{ height: 14, width: 250 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" style={{ flex: 1, height: 76, borderRadius: 12 }} />
          ))}
        </div>
        <div className="skel" style={{ height: 38, width: 120, borderRadius: 100 }} />
      </div>

      {/* HistoryChart skeleton */}
      <div className="dash-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="skel" style={{ height: 14, width: 100 }} />
          <div className="skel" style={{ height: 11, width: 230 }} />
        </div>
        <div style={{ display: "flex", gap: 3, height: 120, alignItems: "flex-end" }}>
          {historyHeights.map((h, i) => (
            <div
              key={i}
              className="skel"
              style={{ flex: 1, height: `${h}%`, borderRadius: "2px 2px 0 0" }}
            />
          ))}
        </div>
        <div className="skel" style={{ height: 11, width: 280 }} />
      </div>
    </div>
  );
}
