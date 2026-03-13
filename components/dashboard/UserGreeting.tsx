"use client";

import { useEffect, useState } from "react";
import { mockUser, today } from "@/app/dashboard/data";

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function UserGreeting() {
  const [name, setName] = useState(mockUser.name);

  useEffect(() => {
    const stored = localStorage.getItem("overload-name");
    if (stored) setName(stored);
  }, []);

  return (
    <header className="dash-header">
      <h1 className="dash-greeting">
        {timeGreeting()}, <em>{name}</em>
      </h1>
      <p className="dash-subheading">
        {today.date} &nbsp;·&nbsp; {mockUser.streak}-day streak 🔥
      </p>
    </header>
  );
}
