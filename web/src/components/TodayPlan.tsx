import { motion, useReducedMotion } from 'framer-motion';
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  House,
  LogIn,
  LogOut,
  TriangleAlert,
} from 'lucide-react';
import type { TodayPlan as Plan } from '../domain/plan';
import { formatDuration, formatTimeOfDay } from '../domain/time';

/**
 * The instruction, not the data. Every other panel reports what happened; this
 * one says what to do about it - when you may log out, or when to arrive by -
 * and whether you were late.
 */

/** A target time is a minute, not a second - and the seconds made it flicker. */
function atMinute(seconds: number): string {
  return formatTimeOfDay(Math.round(seconds / 60) * 60).replace(/:00(?= [AP]M)/, '');
}

export function TodayPlanCard({ plan }: { plan: Plan }) {
  const reduced = useReducedMotion();
  const late = plan.lateBy !== null && plan.lateBy > 60;
  const required = formatDuration(plan.dailyRequired);
  const met = plan.loggedToday >= plan.dailyRequired;

  let Icon = CalendarClock;
  let headline = '';
  let detail = '';
  let tone: 'good' | 'warn' | 'plain' = 'plain';

  switch (plan.state) {
    case 'weekend':
      Icon = CheckCircle2;
      headline = 'No hours owed today';
      detail = plan.weekRemaining > 0
        ? `${formatDuration(plan.weekRemaining)} short of the weekly mark.`
        : 'The week is complete.';
      tone = plan.weekRemaining > 0 ? 'warn' : 'good';
      break;

    case 'wfh':
      Icon = House;
      headline = 'Working from home today';
      detail = `${formatDuration(plan.loggedToday)} credited. Home days are credited rather than clocked, so there is no logout time to hit.`;
      tone = 'plain';
      break;

    case 'not-arrived':
      Icon = LogIn;
      headline = plan.arriveBy !== null ? `Log in by ${atMinute(plan.arriveBy)}` : 'Not logged in yet';
      detail = `An office day owes ${required} from the moment you log in.`;
      tone = 'plain';
      break;

    case 'working':
      Icon = LogOut;
      headline = plan.logoutAt !== null ? `Log out at ${atMinute(plan.logoutAt)}` : 'Working';
      detail = `${formatDuration(plan.remainingToday)} to go · ${formatDuration(plan.loggedToday)} of ${required} logged.`;
      tone = late ? 'warn' : 'plain';
      break;

    case 'can-leave':
      Icon = CheckCircle2;
      headline = 'You can log out now';
      detail = `${formatDuration(plan.loggedToday)} logged - past the ${required} an office day owes.`;
      tone = 'good';
      break;

    case 'signed-off':
      Icon = met ? CheckCircle2 : TriangleAlert;
      headline = 'Signed off for today';
      detail = met
        ? `${formatDuration(plan.loggedToday)} logged, above the ${required} minimum.`
        : `${formatDuration(plan.loggedToday)} logged - ${formatDuration(plan.remainingToday)} short of the ${required} minimum.`;
      tone = met ? 'good' : 'warn';
      break;
  }

  return (
    <motion.section
      className={`plan plan-${tone}`}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="plan-icon" aria-hidden="true"><Icon size={26} strokeWidth={1.8} /></span>
      <div className="plan-body">
        <h2>{headline}</h2>
        <p>{detail}</p>
      </div>

      <div className="plan-flags">
        {plan.lateBy === null ? (
          <span className="flag muted"><AlarmClock size={14} /> no roster recorded</span>
        ) : late ? (
          <span className="flag warn"><TriangleAlert size={14} /> {formatDuration(plan.lateBy)} late</span>
        ) : (
          <span className="flag good">
            <CheckCircle2 size={14} />
            {plan.lateBy < -60 ? `${formatDuration(-plan.lateBy)} early` : 'on time'}
          </span>
        )}
        {/* Context, not an instruction: the week never moves today's target. */}
        <span className="flag muted">
          <CalendarClock size={14} />
          {plan.weekRemaining > 0
            ? `${formatDuration(plan.weekRemaining)} left this week`
            : 'weekly mark reached'}
        </span>
      </div>
    </motion.section>
  );
}
