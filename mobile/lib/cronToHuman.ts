/**
 * Translates 6-field cron expressions (with seconds) to human-friendly text.
 * Format: second minute hour day month weekday
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return m === '00' ? `${h} ${period}` : `${h}:${m} ${period}`;
}

function formatTimeRange(hours: number[]): string {
  if (hours.length === 0) return '';
  if (hours.length === 1) return formatTime(hours[0], 0);

  // Check if consecutive
  const sorted = [...hours].sort((a, b) => a - b);
  let isConsecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isConsecutive = false;
      break;
    }
  }

  if (isConsecutive && sorted.length > 2) {
    return `${formatTime(sorted[0], 0)} - ${formatTime(sorted[sorted.length - 1], 0)}`;
  }

  return hours.map(h => formatTime(h, 0)).join(', ');
}

interface ParsedField {
  type: 'all' | 'value' | 'step' | 'range' | 'list';
  value: number;
  step?: number;
  values?: number[];
  raw: string;
}

function parseField(field: string): ParsedField {
  if (field === '*') {
    return { type: 'all', value: 0, raw: field };
  }
  if (field.startsWith('*/')) {
    return { type: 'step', value: 0, step: parseInt(field.slice(2), 10), raw: field };
  }
  if (field.includes(',')) {
    // Handle mixed list with ranges: "1,3,5" or "1-5,10,15"
    const values: number[] = [];
    field.split(',').forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n, 10));
        for (let i = start; i <= end; i++) values.push(i);
      } else {
        values.push(parseInt(part, 10));
      }
    });
    return { type: 'list', value: values[0], values, raw: field };
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10));
    const values: number[] = [];
    for (let i = start; i <= end; i++) values.push(i);
    return { type: 'range', value: start, values, raw: field };
  }
  return { type: 'value', value: parseInt(field, 10), raw: field };
}

function describeWeekdays(field: ParsedField): string | null {
  if (field.type === 'all') return null;

  if (field.type === 'value') {
    return DAYS[field.value] + 's';
  }

  if (field.type === 'range' && field.values) {
    const [start, end] = [field.values[0], field.values[field.values.length - 1]];
    // Mon-Fri = Weekdays
    if (start === 1 && end === 5) return 'Weekdays';
    // Sat-Sun = Weekends
    if ((start === 0 && end === 6) || (start === 6 && end === 0)) return 'Weekends';
    return `${DAYS_SHORT[start]} - ${DAYS_SHORT[end]}`;
  }

  if (field.type === 'list' && field.values) {
    // Check for weekends
    if (field.values.length === 2) {
      const sorted = [...field.values].sort();
      if (sorted[0] === 0 && sorted[1] === 6) return 'Weekends';
    }
    // Check for weekdays
    if (field.values.length === 5) {
      const sorted = [...field.values].sort();
      if (sorted.join(',') === '1,2,3,4,5') return 'Weekdays';
    }
    return field.values.map(d => DAYS_SHORT[d]).join(', ');
  }

  return null;
}

function describeMonths(field: ParsedField): string | null {
  if (field.type === 'all') return null;

  if (field.type === 'value') {
    return `in ${MONTHS[field.value - 1]}`;
  }

  if (field.type === 'list' && field.values) {
    if (field.values.length === 12) return null; // All months
    const names = field.values.map(m => MONTHS_SHORT[m - 1]);
    return `in ${names.join(', ')}`;
  }

  if (field.type === 'range' && field.values) {
    const start = MONTHS_SHORT[field.values[0] - 1];
    const end = MONTHS_SHORT[field.values[field.values.length - 1] - 1];
    return `${start} - ${end}`;
  }

  if (field.type === 'step') {
    return `every ${field.step} months`;
  }

  return null;
}

function describeDayOfMonth(field: ParsedField): string | null {
  if (field.type === 'all') return null;

  if (field.type === 'value') {
    return `on the ${ordinal(field.value)}`;
  }

  if (field.type === 'list' && field.values) {
    if (field.values.length <= 3) {
      return `on the ${field.values.map(ordinal).join(', ')}`;
    }
    return `on ${field.values.length} days`;
  }

  if (field.type === 'range' && field.values) {
    return `on the ${ordinal(field.values[0])} - ${ordinal(field.values[field.values.length - 1])}`;
  }

  if (field.type === 'step') {
    return `every ${field.step} days`;
  }

  return null;
}

export function cronToHuman(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);

  // Handle both 5-field and 6-field cron expressions
  let second: string, minute: string, hour: string, day: string, month: string, weekday: string;

  if (parts.length === 6) {
    [second, minute, hour, day, month, weekday] = parts;
  } else if (parts.length === 5) {
    second = '0';
    [minute, hour, day, month, weekday] = parts;
  } else {
    return cronExpr; // Return as-is if invalid
  }

  const secField = parseField(second);
  const minField = parseField(minute);
  const hourField = parseField(hour);
  const dayField = parseField(day);
  const monthField = parseField(month);
  const weekdayField = parseField(weekday);

  // ============ FREQUENCY-BASED PATTERNS ============

  // Every X seconds
  if (secField.type === 'step') {
    const step = secField.step!;
    if (step === 1) return 'Every second';
    return `Every ${step} seconds`;
  }

  // Every X minutes
  if (minField.type === 'step' && hourField.type === 'all' && dayField.type === 'all') {
    const step = minField.step!;
    if (step === 1) return 'Every minute';
    if (step === 2) return 'Every 2 minutes';
    if (step === 5) return 'Every 5 minutes';
    if (step === 10) return 'Every 10 minutes';
    if (step === 15) return 'Every 15 minutes';
    if (step === 30) return 'Every 30 minutes';
    return `Every ${step} minutes`;
  }

  // Every X hours
  if (minField.type === 'value' && hourField.type === 'step' && dayField.type === 'all') {
    const step = hourField.step!;
    const atMin = minField.value === 0 ? '' : ` at :${minField.value.toString().padStart(2, '0')}`;
    if (step === 1) return `Every hour${atMin}`;
    if (step === 2) return `Every 2 hours${atMin}`;
    if (step === 3) return `Every 3 hours${atMin}`;
    if (step === 4) return `Every 4 hours${atMin}`;
    if (step === 6) return `Every 6 hours${atMin}`;
    if (step === 8) return `Every 8 hours${atMin}`;
    if (step === 12) return `Twice daily${atMin}`;
    return `Every ${step} hours${atMin}`;
  }

  // ============ HOURLY PATTERNS ============

  // Hourly at specific minute
  if (minField.type === 'value' && hourField.type === 'all' && dayField.type === 'all' && weekdayField.type === 'all') {
    if (minField.value === 0) return 'Every hour, on the hour';
    return `Hourly at :${minField.value.toString().padStart(2, '0')}`;
  }

  // Hourly during specific hour range
  if (minField.type === 'value' && hourField.type === 'range' && hourField.values && dayField.type === 'all') {
    const start = hourField.values[0];
    const end = hourField.values[hourField.values.length - 1];
    const atMin = minField.value === 0 ? '' : ` at :${minField.value.toString().padStart(2, '0')}`;
    return `Hourly, ${formatTime(start, 0)} - ${formatTime(end, 0)}${atMin}`;
  }

  // ============ MULTIPLE TIMES PER DAY ============

  // Multiple specific times per day
  if (minField.type === 'value' && hourField.type === 'list' && hourField.values && dayField.type === 'all' && weekdayField.type === 'all') {
    const times = hourField.values.map(h => formatTime(h, minField.value));
    if (times.length === 2) return `Twice daily at ${times[0]} and ${times[1]}`;
    if (times.length === 3) return `3 times daily at ${times.join(', ')}`;
    return `${times.length} times daily`;
  }

  // ============ SPECIFIC TIME PATTERNS ============

  if (minField.type === 'value' && hourField.type === 'value') {
    const time = formatTime(hourField.value, minField.value);
    const weekdayDesc = describeWeekdays(weekdayField);
    const dayDesc = describeDayOfMonth(dayField);
    const monthDesc = describeMonths(monthField);

    // Daily at specific time
    if (dayField.type === 'all' && weekdayField.type === 'all' && monthField.type === 'all') {
      return `Daily at ${time}`;
    }

    // Weekly patterns (specific weekdays)
    if (dayField.type === 'all' && weekdayField.type !== 'all' && monthField.type === 'all') {
      return `${weekdayDesc} at ${time}`;
    }

    // Monthly on specific day
    if (dayField.type === 'value' && weekdayField.type === 'all' && monthField.type === 'all') {
      return `Monthly ${dayDesc} at ${time}`;
    }

    // Monthly on multiple days
    if (dayField.type === 'list' && weekdayField.type === 'all' && monthField.type === 'all') {
      return `Monthly ${dayDesc} at ${time}`;
    }

    // First/last of month
    if (dayField.type === 'value' && dayField.value === 1 && weekdayField.type === 'all' && monthField.type === 'all') {
      return `1st of each month at ${time}`;
    }

    // Yearly (specific month and day)
    if (dayField.type === 'value' && monthField.type === 'value') {
      return `Yearly on ${MONTHS[monthField.value - 1]} ${ordinal(dayField.value)} at ${time}`;
    }

    // Specific months with weekday
    if (weekdayField.type !== 'all' && monthField.type !== 'all') {
      return `${weekdayDesc} at ${time} ${monthDesc}`;
    }

    // Day of month with specific months
    if (dayField.type !== 'all' && monthField.type !== 'all' && weekdayField.type === 'all') {
      return `${dayDesc} at ${time} ${monthDesc}`;
    }
  }

  // ============ RANGE/STEP MINUTE PATTERNS ============

  // Every X minutes during specific hours
  if (minField.type === 'step' && hourField.type === 'range' && hourField.values) {
    const start = hourField.values[0];
    const end = hourField.values[hourField.values.length - 1];
    return `Every ${minField.step} min, ${formatTime(start, 0)} - ${formatTime(end, 0)}`;
  }

  // Every X minutes during specific hour list
  if (minField.type === 'step' && hourField.type === 'list' && hourField.values) {
    const hours = formatTimeRange(hourField.values);
    return `Every ${minField.step} min at ${hours}`;
  }

  // ============ DAY STEP PATTERNS ============

  // Every N days
  if (dayField.type === 'step' && minField.type === 'value' && hourField.type === 'value') {
    const time = formatTime(hourField.value, minField.value);
    if (dayField.step === 2) return `Every other day at ${time}`;
    return `Every ${dayField.step} days at ${time}`;
  }

  // ============ COMPLEX WEEKDAY + TIME PATTERNS ============

  // Weekdays during business hours
  if (minField.type === 'value' && hourField.type === 'range' && hourField.values) {
    const weekdayDesc = describeWeekdays(weekdayField);
    const start = hourField.values[0];
    const end = hourField.values[hourField.values.length - 1];
    if (weekdayDesc) {
      return `${weekdayDesc}, hourly ${formatTime(start, 0)} - ${formatTime(end, 0)}`;
    }
  }

  // ============ SPECIAL NAMED SCHEDULES ============

  // Midnight daily
  if (minute === '0' && hour === '0' && dayField.type === 'all' && weekdayField.type === 'all') {
    return 'Daily at midnight';
  }

  // Noon daily
  if (minute === '0' && hour === '12' && dayField.type === 'all' && weekdayField.type === 'all') {
    return 'Daily at noon';
  }

  // Weekly (once per week on specific day)
  if (minField.type === 'value' && hourField.type === 'value' &&
      dayField.type === 'all' && weekdayField.type === 'value') {
    const time = formatTime(hourField.value, minField.value);
    return `Weekly on ${DAYS[weekdayField.value]} at ${time}`;
  }

  // ============ FALLBACK ============
  return cronExpr;
}
