import React from "react";
import { CalendarDays, Clock3 } from "lucide-react";

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

// Compute active Sunday-Thursday window:
// - Sun (0) to Thu (4): current week's Sunday..Thursday
// - Fri (5) or Sat (6): automatically rolls forward to NEXT Sunday..Thursday
function getActiveSunToThuWindow() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0=Sun .. 4=Thu, 5=Fri, 6=Sat

  const sunday = new Date(today);
  if (dow === 5) {
    // Friday -> jump +2 days to upcoming Sunday
    sunday.setDate(today.getDate() + 2);
  } else if (dow === 6) {
    // Saturday -> jump +1 day to upcoming Sunday
    sunday.setDate(today.getDate() + 1);
  } else {
    // Sunday..Thursday -> start from this week's Sunday
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

  return {
    isNextWeekMode: dow === 5 || dow === 6,
    rangeLabel: `${days[0].shortDate} - ${days[4].shortDate}`,
    days
  };
}

export default function StudentWeeklyPlanner({ scheduleItems = [] }) {
  const windowInfo = getActiveSunToThuWindow();

  return (
    <section className="panel swp-panel">
      <div className="swp-header">
        <div>
          <span className="swp-kicker">
            {windowInfo.isNextWeekMode
              ? "NEXT WEEK SCHEDULE (AUTO-UPDATED ON FRIDAY)"
              : "THIS WEEK'S ACADEMIC SCHEDULE (SUN - THU)"}
          </span>
          <h3>Weekly Academic Schedule (Sunday to Thursday)</h3>
          <p>
            Automatically updates every Friday to show your upcoming Sunday -
            Thursday deadlines, quizzes, and class reschedules.
          </p>
        </div>

        <div className="swp-range-badge">
          <CalendarDays size={16} />
          <span>{windowInfo.rangeLabel}</span>
        </div>
      </div>

      <div className="swp-grid">
        {windowInfo.days.map((day) => {
          const dayEvents = scheduleItems.filter(
            (item) => parseToDateKey(item.date) === day.dateKey
          );

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
                <p className="swp-no-event">No scheduled task</p>
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
  );
}