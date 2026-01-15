/**
 * Translates 6-field cron expressions (with seconds) to human-friendly text.
 * Format: second minute hour day month weekday
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return m === '00' ? `${h} ${period}` : `${h}:${m} ${period}`;
}

function parseField(field: string): { type: 'all' | 'value' | 'step' | 'range' | 'list'; value: number; step?: number; values?: number[] } {
  if (field === '*') {
    return { type: 'all', value: 0 };
  }
  if (field.startsWith('*/')) {
    return { type: 'step', value: 0, step: parseInt(field.slice(2), 10) };
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10));
    return { type: 'range', value: start, values: [start, end] };
  }
  if (field.includes(',')) {
    const values = field.split(',').map(n => parseInt(n, 10));
    return { type: 'list', value: values[0], values };
  }
  return { type: 'value', value: parseInt(field, 10) };
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

  const minField = parseField(minute);
  const hourField = parseField(hour);
  const dayField = parseField(day);
  const weekdayField = parseField(weekday);

  // Every X seconds
  if (parseField(second).type === 'step') {
    const step = parseField(second).step!;
    return `Every ${step} second${step > 1 ? 's' : ''}`;
  }

  // Every X minutes
  if (minField.type === 'step' && hourField.type === 'all') {
    const step = minField.step!;
    if (step === 1) return 'Every minute';
    return `Every ${step} minutes`;
  }

  // Every X hours
  if (minField.type === 'value' && hourField.type === 'step') {
    const step = hourField.step!;
    if (step === 1) return 'Every hour';
    return `Every ${step} hours`;
  }

  // At specific time patterns
  if (minField.type === 'value' && hourField.type === 'value') {
    const time = formatTime(hourField.value, minField.value);

    // Daily
    if (dayField.type === 'all' && weekdayField.type === 'all') {
      return `Daily at ${time}`;
    }

    // Weekdays (Mon-Fri)
    if (weekdayField.type === 'range' && weekdayField.values?.[0] === 1 && weekdayField.values?.[1] === 5) {
      return `Weekdays at ${time}`;
    }

    // Weekends (Sat-Sun or 0,6)
    if (weekdayField.type === 'list' &&
        ((weekdayField.values?.includes(0) && weekdayField.values?.includes(6)) ||
         (weekdayField.values?.includes(6) && weekdayField.values?.includes(0)))) {
      return `Weekends at ${time}`;
    }

    // Specific day of week
    if (weekdayField.type === 'value') {
      return `${DAYS[weekdayField.value]}s at ${time}`;
    }

    // Multiple days
    if (weekdayField.type === 'list' && weekdayField.values) {
      const dayNames = weekdayField.values.map(d => DAYS_SHORT[d]).join(', ');
      return `${dayNames} at ${time}`;
    }

    // Day range
    if (weekdayField.type === 'range' && weekdayField.values) {
      const [start, end] = weekdayField.values;
      return `${DAYS_SHORT[start]}-${DAYS_SHORT[end]} at ${time}`;
    }
  }

  // Hourly at specific minute
  if (minField.type === 'value' && hourField.type === 'all') {
    if (minField.value === 0) return 'Every hour';
    return `Hourly at :${minField.value.toString().padStart(2, '0')}`;
  }

  // Every hour during specific hours
  if (minField.type === 'value' && hourField.type === 'range' && hourField.values) {
    const [start, end] = hourField.values;
    return `Hourly from ${formatTime(start, 0)} to ${formatTime(end, 0)}`;
  }

  // Fallback: return original expression
  return cronExpr;
}
