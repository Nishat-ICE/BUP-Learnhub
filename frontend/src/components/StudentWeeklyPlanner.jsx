import React from "react";
import { BookOpen, CalendarDays, Clock3, Sparkles } from "lucide-react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

function toDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseToDateKey(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return "";
  return toDateKey(parsed);
}

function getActiveSunToThuWindow() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0=Sun .. 4=Thu, 5=Fri, 6=Sat

  const sunday = new Date(today);
  if (dow === 5) {
    sunday.setDate(today.getDate() + 2);
  } else if (dow === 6) {
    sunday.setDate(today.getDate() + 1);
  } else {
    sunday.setDate(today.getDate() - dow);
  }

  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const key = toDateKey(d);
    days.push({
      dayName: DAY_NAMES[i],
      dateKey: key,
      isToday: key === toDateKey(today),
      shortDate: d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    });
  }

  const todayName =
    dow >= 0 && dow <= 4
      ? DAY_NAMES[dow]
      : dow === 5
      ? "Friday"
      : "Saturday";

  return {
    isNextWeekMode: dow === 5 || dow === 6,
    todayKey: toDateKey(today),
    todayName,
    todayFormatted: today.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }),
    rangeLabel: `${days[0].shortDate} - ${days[4].shortDate}`,
    days
  };
}

export default function StudentWeeklyPlanner({
  scheduleItems = [],
  role = "student"
}) {
  const windowInfo = getActiveSunToThuWindow();
  const isFaculty = role === "faculty";

  const getEventsForDay = (dayObj) =>
    scheduleItems.filter((item) => {
      if (item.recurringDay) {
        return (
          String(item.recurringDay).toLowerCase() ===
          dayObj.dayName.toLowerCase()
        );
      }
      return parseToDateKey(item.date) === dayObj.dateKey;
    });

  const todayDayObj = windowInfo.days.find((d) => d.isToday) || {
    dayName: windowInfo.todayName,
    dateKey: windowInfo.todayKey
  };
  const todayEvents = getEventsForDay(todayDayObj);
  const todayClasses = todayEvents.filter(
    (e) => e.kind === "class" || e.kind === "reschedule"
  );
  const todayTasks = todayEvents.filter(
    (e) => e.kind !== "class" && e.kind !== "reschedule"
  );

  return (
    <>
      {/* TOP BANNER: TODAY'S CLASSES & TASKS AT A GLANCE */}
      <section className="panel swp-today-banner">
        <div className="swp-today-head">
          <div>
            <span className="swp-kicker">
              <Sparkles size={13} /> TODAY&apos;S SCHEDULE AT A GLANCE (
              {windowInfo.todayFormatted})
            </span>
            <h3>
              {isFaculty
                ? "Your Classes & Academic Tasks Today"
                : "Your Classes & Deadlines Today"}
            </h3>
          </div>
          <span className="swp-count-pill">
            {todayClasses.length} Classes | {todayTasks.length} Tasks Today
          </span>
        </div>

        {todayEvents.length === 0 ? (
          <p className="swp-today-empty">
            No scheduled classes or tasks for today ({windowInfo.todayName}).
            Check your Sunday - Thursday weekly schedule below!
          </p>
        ) : (
          <div className="swp-today-grid">
            {todayEvents.map((ev) => (
              <div className={`swp-event-item ${ev.kind}`} key={`today-${ev.id}`}>
                <span className="swp-event-tag">{ev.tag}</span>
                <strong>{ev.title}</strong>
                {ev.meta && (
                  <small>
                    <Clock3 size={12} /> {ev.meta}
                  </small>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FULL SUNDAY - THURSDAY WEEKLY PLANNER */}
      <section className="panel swp-panel">
        <div className="swp-header">
          <div>
            <span className="swp-kicker">
              {windowInfo.isNextWeekMode
                ? "NEXT WEEK SCHEDULE (AUTO-UPDATED ON FRIDAY)"
                : "WEEKLY SCHEDULE (SUNDAY TO THURSDAY)"}
            </span>
            <h3>
              {isFaculty
                ? "Faculty Weekly Class & Assessment Schedule (Sun - Thu)"
                : "Student Weekly Class & Task Schedule (Sun - Thu)"}
            </h3>
            <p>
              Shows your weekly classes along with assignment deadlines, quizzes,
              and class reschedules. Automatically rolls over every Friday.
            </p>
          </div>

          <div className="swp-range-badge">
            <CalendarDays size={16} />
            <span>{windowInfo.rangeLabel}</span>
          </div>
        </div>

        <div className="swp-grid">
          {windowInfo.days.map((day) => {
            const dayEvents = getEventsForDay(day);

            return (
              <div
                className={day.isToday ? "swp-day-card today" : "swp-day-card"}
                key={day.dateKey}
              >
                <div className="swp-day-top">
                  <div>
                    <strong>{day.dayName}</strong>
                    <small>{day.shortDate}</small>
                  </div>
                  {day.isToday && <span className="swp-today-pill">Today</span>}
                </div>

                {dayEvents.length === 0 ? (
                  <p className="swp-no-event">No class or task</p>
                ) : (
                  <div className="swp-event-list">
                    {dayEvents.map((ev) => (
                      <div className={`swp-event-item ${ev.kind}`} key={ev.id}>
                        <span className="swp-event-tag">{ev.tag}</span>
                        <strong>{ev.title}</strong>
                        {ev.meta && (
                          <small>
                            <Clock3 size={12} /> {ev.meta}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}