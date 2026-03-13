import {
  today,
  forecast,
  history,
  trendDelta,
  consecutiveDangerDays,
  recoveryPlan,
} from "./data";
import ScoreCard from "@/components/dashboard/ScoreCard";
import ForecastChart from "@/components/dashboard/ForecastChart";
import CheckIn from "@/components/dashboard/CheckIn";
import HistoryChart from "@/components/dashboard/HistoryChart";
import UserGreeting from "@/components/dashboard/UserGreeting";
import BurnoutAlert from "@/components/dashboard/BurnoutAlert";
import RecoveryPlan from "@/components/dashboard/RecoveryPlan";

const dangerDaysAhead = forecast.filter((d) => d.score > 65).length - 1; // exclude today
const firstRecoveryDay = forecast.find((d, i) => i > 0 && d.score <= 40);

export default function DashboardPage() {
  return (
    <div className="dash-content">
      <BurnoutAlert
        score={today.score}
        trend={trendDelta}
        dangerStreak={consecutiveDangerDays}
        dangerDaysAhead={Math.max(0, dangerDaysAhead)}
        recoveryDate={firstRecoveryDay?.date ?? "this weekend"}
      />

      <UserGreeting />

      <div className="dash-grid">
        <ScoreCard
          data={today}
          trend={trendDelta}
          dangerStreak={consecutiveDangerDays}
        />
        <ForecastChart data={forecast} />
      </div>

      <CheckIn />

      <RecoveryPlan plan={recoveryPlan} score={today.score} />

      <HistoryChart data={history} />
    </div>
  );
}
