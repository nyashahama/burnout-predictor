import { today, forecast, history, mockUser } from "./data";
import ScoreCard from "@/components/dashboard/ScoreCard";
import ForecastChart from "@/components/dashboard/ForecastChart";
import CheckIn from "@/components/dashboard/CheckIn";
import HistoryChart from "@/components/dashboard/HistoryChart";

export default function DashboardPage() {
  return (
    <div className="dash-content">
      <header className="dash-header">
        <h1 className="dash-greeting">
          Good morning, <em>{mockUser.name}</em>
        </h1>
        <p className="dash-subheading">
          {today.date} &nbsp;·&nbsp; {mockUser.streak}-day streak 🔥
        </p>
      </header>

      <div className="dash-grid">
        <ScoreCard data={today} />
        <ForecastChart data={forecast} />
      </div>

      <CheckIn />

      <HistoryChart data={history} />
    </div>
  );
}
