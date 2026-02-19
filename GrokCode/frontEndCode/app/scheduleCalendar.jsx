import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, TextInput, Alert,
} from 'react-native';
import { ThemeContext } from './context';

const TASK_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e879f9', '#fb923c', '#22d3ee', '#a78bfa',
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ============================================================
// DATE HELPERS
// ============================================================
const toDate = (s) => {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
};

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const daysBetween = (a, b) => Math.round((b - a) / 86400000);

const addWorkdays = (date, days) => {
  let d = new Date(date);
  if (days === 0) return d;
  const dir = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d = addDays(d, dir);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return d;
};

// Count workdays inclusive of both start and end
const workdayCount = (startStr, endStr) => {
  const a = toDate(startStr);
  const b = toDate(endStr);
  if (!a || !b) return 1;
  let count = 0;
  let d = new Date(a);
  while (d <= b) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d = addDays(d, 1);
  }
  return count || 1;
};

// End date from start + N workdays (day 1 = start date)
const calcEndFromWorkdays = (startStr, wd) => {
  let d = toDate(startStr);
  if (!d || wd < 1) return startStr;
  let remaining = wd - 1;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return fmt(d);
};

// Calculate start date from predecessor
const calcStartFromPred = (pred, relType, lagDays) => {
  const lag = parseInt(lagDays) || 0;
  if (relType === 'SS') {
    const base = toDate(pred.start_date);
    if (!base) return null;
    return fmt(lag === 0 ? base : addWorkdays(base, lag));
  }
  const base = toDate(pred.end_date);
  if (!base) return null;
  let start = addWorkdays(base, 1);
  if (lag !== 0) start = addWorkdays(start, lag);
  return fmt(start);
};

// ============================================================
// CASCADE HELPERS
// ============================================================
export const buildDepMap = (schedule) => {
  const m = {};
  schedule.forEach(t => {
    if (t.predecessor_id) {
      if (!m[t.predecessor_id]) m[t.predecessor_id] = [];
      m[t.predecessor_id].push(t.id);
    }
  });
  return m;
};

export const getAllDependents = (taskId, depMap) => {
  const result = new Set();
  const queue = [taskId];
  while (queue.length > 0) {
    const id = queue.shift();
    (depMap[id] || []).forEach(depId => {
      if (!result.has(depId)) { result.add(depId); queue.push(depId); }
    });
  }
  return result;
};

// Calculate lag_days from a task's actual start relative to its predecessor
const calcLagFromPosition = (task, pred) => {
  const relType = task.rel_type || 'FS';
  const taskStart = toDate(task.start_date);
  if (!taskStart) return 0;

  if (relType === 'SS') {
    const base = toDate(pred.start_date);
    if (!base) return 0;
    // Count workdays from base to taskStart (signed)
    if (isSameDay(base, taskStart)) return 0;
    const forward = taskStart > base;
    let count = 0;
    let d = new Date(base);
    if (forward) {
      while (d < taskStart) {
        d = addDays(d, 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) count++;
      }
      return count;
    } else {
      while (d > taskStart) {
        d = addDays(d, -1);
        if (d.getDay() !== 0 && d.getDay() !== 6) count--;
      }
      return count;
    }
  }

  // FS: natural start = pred end + 1 workday
  const predEnd = toDate(pred.end_date);
  if (!predEnd) return 0;
  const naturalStart = addWorkdays(predEnd, 1);
  if (isSameDay(naturalStart, taskStart)) return 0;
  const forward = taskStart > naturalStart;
  let count = 0;
  let d = new Date(naturalStart);
  if (forward) {
    while (d < taskStart) {
      d = addDays(d, 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    return count;
  } else {
    while (d > taskStart) {
      d = addDays(d, -1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count--;
    }
    return count;
  }
};

// Move one task, cascade dependents. Returns { byId, movedLag }
// movedLag is the new lag_days for the moved task (if it has a predecessor)
export const cascadeDates = (schedule, movedId, newStart, newEnd) => {
  const byId = {};
  schedule.forEach(t => { byId[t.id] = { ...t }; });
  byId[movedId] = { ...byId[movedId], start_date: newStart, end_date: newEnd };

  // Calculate new lag for moved task if it has a predecessor
  let movedLag = null;
  const movedTask = byId[movedId];
  if (movedTask.predecessor_id && byId[movedTask.predecessor_id]) {
    movedLag = calcLagFromPosition(movedTask, byId[movedTask.predecessor_id]);
    byId[movedId].lag_days = movedLag;
  }

  // Cascade dependents — skip the moved task itself
  for (let pass = 0; pass < schedule.length + 1; pass++) {
    let changed = false;
    Object.values(byId).forEach(t => {
      if (t.id === movedId) return; // don't recalculate the moved task
      if (!t.predecessor_id) return;
      const pred = byId[t.predecessor_id];
      if (!pred) return;
      const ns = calcStartFromPred(pred, t.rel_type || 'FS', t.lag_days || 0);
      if (!ns || ns === t.start_date) return;
      const dur = workdayCount(t.start_date, t.end_date);
      t.start_date = ns;
      t.end_date = calcEndFromWorkdays(ns, dur);
      changed = true;
    });
    if (!changed) break;
  }
  return { byId, movedLag };
};

const getMonthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const weeks = [];
  let cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur = addDays(cur, 1); }
    if (w < 5 || week[0].getMonth() === month) weeks.push(week);
  }
  return weeks;
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ScheduleCalendar({ schedule, onUpdateTask, onEditTask, onDeleteTask, isBuilder, onDayPress, onAddItem, mode = 'gantt', headerContent, onTaskDoubleClick, onTaskRightClick, goLive, onGoLiveChange, onHold, calYear: extYear, calMonth: extMonth, onMonthChange }) {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [intYear, setIntYear] = useState(() => extYear ?? new Date().getFullYear());
  const [intMonth, setIntMonth] = useState(() => extMonth ?? new Date().getMonth());
  
  // Use external values if provided, internal otherwise
  const year = extYear ?? intYear;
  const month = extMonth ?? intMonth;
  
  const setYear = (v) => { const val = typeof v === 'function' ? v(year) : v; setIntYear(val); onMonthChange?.(val, month); };
  const setMonth = (v) => { const val = typeof v === 'function' ? v(month) : v; setIntMonth(val); onMonthChange?.(year, val); };

  // Sync from external props
  React.useEffect(() => { if (extYear != null) setIntYear(extYear); }, [extYear]);
  React.useEffect(() => { if (extMonth != null) setIntMonth(extMonth); }, [extMonth]);
  // previewMap: null | { id: { start_date, end_date } }
  const [previewMap, setPreviewMap] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [affectedIds, setAffectedIds] = useState(null); // Set

  // Right-click edit popup
  const [editPopup, setEditPopup] = useState(null); // { task, x, y }
  const [editDuration, setEditDuration] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const calRef = useRef(null);
  const cellWidth = useRef(0);
  const gridOrigin = useRef({ x: 0, y: 0 });
  const weeksRef = useRef([]);
  const dragRef = useRef(null); // mutable drag state for pointer handlers
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const onUpdateRef = useRef(onUpdateTask);
  onUpdateRef.current = onUpdateTask;
  const onEditRef = useRef(onEditTask);
  onEditRef.current = onEditTask;
  const onDeleteRef = useRef(onDeleteTask);
  onDeleteRef.current = onDeleteTask;
  const goLiveRef = useRef(goLive);
  goLiveRef.current = goLive;
  const onTaskRightClickRef = useRef(onTaskRightClick);
  onTaskRightClickRef.current = onTaskRightClick;
  const onTaskDoubleClickRef = useRef(onTaskDoubleClick);
  onTaskDoubleClickRef.current = onTaskDoubleClick;
  const dblClickRef = useRef({ taskId: null, time: 0 });
  const suppressDayPress = useRef(false);

  const today = useMemo(() => new Date(), []);
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);
  weeksRef.current = weeks;

  const prevMonth = () => {
    const ny = month === 0 ? year - 1 : year;
    const nm = month === 0 ? 11 : month - 1;
    setIntYear(ny); setIntMonth(nm); onMonthChange?.(ny, nm);
  };
  const nextMonth = () => {
    const ny = month === 11 ? year + 1 : year;
    const nm = month === 11 ? 0 : month + 1;
    setIntYear(ny); setIntMonth(nm); onMonthChange?.(ny, nm);
  };
  const goToday = () => {
    const ny = today.getFullYear(), nm = today.getMonth();
    setIntYear(ny); setIntMonth(nm); onMonthChange?.(ny, nm);
  };

  const taskColor = useCallback((id) => TASK_COLORS[id % TASK_COLORS.length], []);

  // Task First mode: get tasks starting on a specific day
  const getTasksForDay = useCallback((day) => {
    const dayStr = fmt(day);
    const items = previewMap ? schedule.map(t => {
      const ov = previewMap[t.id];
      return ov ? { ...t, start_date: ov.start_date, end_date: ov.end_date } : t;
    }) : schedule;
    return items.filter(t => t.start_date === dayStr);
  }, [schedule, previewMap]);

  // Short date format for task-first chips
  const shortDate = (dateStr) => {
    const d = toDate(dateStr);
    if (!d) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Current bars (with drag preview applied)
  const getWeekTasks = useCallback((week) => {
    const ws = week[0], we = week[6];
    const items = previewMap ? schedule.map(t => {
      const ov = previewMap[t.id];
      return ov ? { ...t, start_date: ov.start_date, end_date: ov.end_date } : t;
    }) : schedule;

    return items.filter(t => {
      const s = toDate(t.start_date), e = toDate(t.end_date);
      return s && e && s <= we && e >= ws;
    }).map(t => {
      const s = toDate(t.start_date), e = toDate(t.end_date);
      const sc = s < ws ? 0 : s.getDay(), ec = e > we ? 6 : e.getDay();
      return { ...t, startCol: sc, span: ec - sc + 1, isBaseline: false };
    });
  }, [schedule, previewMap]);

  // ============================================================
  // DRAG & DROP
  // ============================================================
  const measureGrid = () => {
    if (Platform.OS !== 'web') return;
    const el = calRef.current;
    if (!el || !el.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    gridOrigin.current = { x: rect.left, y: rect.top };
    cellWidth.current = rect.width / 7;
  };

  const getDayFromPointer = (px, py) => {
    const { x, y } = gridOrigin.current;
    const cw = cellWidth.current;
    if (!cw) return null;
    const hH = 36;
    const rx = px - x, ry = py - y - hH;
    if (rx < 0 || ry < 0) return null;
    const col = Math.min(Math.max(Math.floor(rx / cw), 0), 6);
    const ws = weeksRef.current;
    const el = calRef.current;
    let rowH = 150;
    if (el && el.getBoundingClientRect) {
      const tH = el.getBoundingClientRect().height - hH;
      if (tH > 0 && ws.length > 0) rowH = tH / ws.length;
    }
    const row = Math.floor(ry / rowH);
    if (row >= 0 && row < ws.length) return ws[row][col];
    return null;
  };

  // Pointer handlers — use refs for all mutable/latest state
  const handlePointerMove = useRef((e) => {
    const dr = dragRef.current;
    if (!dr) return;

    // Activate drag only after 4px movement threshold (allows dblclick to fire)
    if (!dr.started) {
      const dx = e.clientX - (dr.startX || 0);
      const dy = e.clientY - (dr.startY || 0);
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dr.started = true;
      // Now apply drag visuals
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      // Use functional setState via a queued microtask to avoid stale closure
      dr._setDraggedId?.(dr.taskId);
    }

    const day = getDayFromPointer(e.clientX, e.clientY);
    if (!day) return;

    if (!dr.anchorDay) {
      dr.anchorDay = day;
      dr.lastOffset = 0;
      return;
    }
    const offset = daysBetween(dr.anchorDay, day);
    if (offset === dr.lastOffset) return;

    // When project is live, only allow earlier movement (no delays) — exceptions exempt
    if (goLiveRef.current && offset > 0 && !dr.isException) return;

    dr.lastOffset = offset;

    const dur = daysBetween(dr.origStart, dr.origEnd);
    const ns = addDays(dr.origStart, offset);
    const ne = addDays(ns, dur);
    const nsStr = fmt(ns), neStr = fmt(ne);

    const sched = scheduleRef.current;
    const { byId: pm } = cascadeDates(sched, dr.taskId, nsStr, neStr);
    const dm = buildDepMap(sched);
    const deps = getAllDependents(dr.taskId, dm);
    deps.add(dr.taskId);

    setPreviewMap(pm);
    setAffectedIds(deps);
  }).current;

  const handlePointerUp = useRef(() => {
    const dr = dragRef.current;
    dragRef.current = null;

    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    }

    // Commit changes
    if (dr && dr.lastOffset !== null && dr.lastOffset !== 0) {
      const sched = scheduleRef.current;
      const dur = daysBetween(dr.origStart, dr.origEnd);
      const ns = addDays(dr.origStart, dr.lastOffset);
      const ne = addDays(ns, dur);
      const { byId: pm, movedLag } = cascadeDates(sched, dr.taskId, fmt(ns), fmt(ne));
      const dm = buildDepMap(sched);
      const deps = getAllDependents(dr.taskId, dm);
      deps.add(dr.taskId);

      const updates = [];
      deps.forEach(id => {
        const orig = sched.find(t => t.id === id);
        const upd = pm[id];
        if (orig && upd && (orig.start_date !== upd.start_date || orig.end_date !== upd.end_date)) {
          const entry = { id, start_date: upd.start_date, end_date: upd.end_date };
          // Include new lag_days for the dragged task
          if (id === dr.taskId && movedLag !== null) {
            entry.lag_days = movedLag;
          }
          updates.push(entry);
        }
      });
      if (updates.length > 0 && onUpdateRef.current) {
        onUpdateRef.current(updates);
      }
    }

    setPreviewMap(null);
    setDraggedId(null);
    setAffectedIds(null);
  }).current;

  const handleDragStart = (task, e) => {
    if (!isBuilder || Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (onHold) return; // Block all dragging while on hold
    if (e.button !== 0) return; // Only left-click starts drag

    // Double-click detection: if same task tapped within 350ms, fire double-click callback
    const now = Date.now();
    const dbl = dblClickRef.current;
    if (dbl.taskId === task.id && now - dbl.time < 350) {
      dblClickRef.current = { taskId: null, time: 0 };
      if (onTaskDoubleClickRef.current) {
        e.preventDefault(); e.stopPropagation();
        suppressDayPress.current = true;
        setTimeout(() => { suppressDayPress.current = false; }, 500);
        onTaskDoubleClickRef.current(task);
      }
      return; // Don't start drag
    }
    dblClickRef.current = { taskId: task.id, time: now };

    measureGrid();
    const ts = toDate(task.start_date), te = toDate(task.end_date);
    if (!ts || !te) return;

    dragRef.current = {
      taskId: task.id,
      origStart: ts,
      origEnd: te,
      anchorDay: null,
      lastOffset: null,
      started: false,
      startX: e.clientX,
      startY: e.clientY,
      isException: !!task.is_exception,
      _setDraggedId: setDraggedId,
    };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const mRef = handlePointerMove, uRef = handlePointerUp;
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', mRef);
      document.removeEventListener('pointerup', uRef);
    };
  }, []);

  // ============================================================
  // RIGHT-CLICK EDIT POPUP
  // ============================================================
  const handleContextMenu = (task, e) => {
    if (!isBuilder || Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const currentDur = workdayCount(task.start_date, task.end_date);
    setEditPopup({ task, x: e.clientX, y: e.clientY });
    setEditDuration(String(currentDur));
    setEditReason('');
    setEditSaving(false);
  };

  const closeEditPopup = () => {
    setEditPopup(null);
    setEditDuration('');
    setEditReason('');
    setEditSaving(false);
  };

  const saveEdit = async () => {
    if (!editPopup || !editReason.trim() || editSaving) return;
    const task = editPopup.task;
    const newDur = parseInt(editDuration) || 1;
    const newEnd = calcEndFromWorkdays(task.start_date, newDur);
    if (newEnd === task.end_date) { closeEditPopup(); return; }

    setEditSaving(true);
    try {
      if (onEditRef.current) {
        await onEditRef.current(task.id, { end_date: newEnd }, editReason.trim());
      }
      closeEditPopup();
    } catch (err) {
      console.error('Edit failed:', err);
      setEditSaving(false);
    }
  };

  const handleDeleteTask = (mode) => {
    if (!editPopup || !onDeleteRef.current) return;
    const task = editPopup.task;
    const label = mode === 'chain' ? 'this task and all its successors' : 'this task';
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${label}?\n\n"${task.task}"\n\nThis cannot be undone.`)) {
        onDeleteRef.current(task.id, mode);
        closeEditPopup();
      }
    } else {
      Alert.alert('Delete Task', `Delete ${label}?\n\n"${task.task}"\n\nThis cannot be undone.`, [
        { text: 'Cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { onDeleteRef.current(task.id, mode); closeEditPopup(); } },
      ]);
    }
  };

  // Check if current popup task has successors
  const popupHasSuccessors = editPopup ? schedule.some(t => t.predecessor_id === editPopup.task.id) : false;

  // Close popup on Escape key
  useEffect(() => {
    if (!editPopup || Platform.OS !== 'web') return;
    const handleKey = (e) => { if (e.key === 'Escape') closeEditPopup(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [editPopup]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <View style={st.container}>
      {headerContent && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingRight: 40, borderBottomWidth: 1, borderBottomColor: C.bd }}>
          {headerContent}
        </View>
      )}
      <View style={st.navBar}>
        <View style={st.navLeft}>
          <TouchableOpacity onPress={goToday} style={st.todayBtn}>
            <Text style={st.todayBtnTxt}>Today</Text>
          </TouchableOpacity>
        </View>
        <View style={st.navCenter}>
          <TouchableOpacity onPress={prevMonth} style={st.arrowBtn}>
            <Text style={st.arrowTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={st.monthLabel}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={st.arrowBtn}>
            <Text style={st.arrowTxt}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={st.navRight}>
          {onAddItem ? (
            <TouchableOpacity onPress={onAddItem} style={st.addItemBtn} activeOpacity={0.8}>
              <Text style={st.addItemBtnTxt}>+ New Item</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Toggle row: Go Live */}
      {isBuilder && (
        <View style={st.baselineToggleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {isBuilder && goLive && (
              <View style={[st.baselineToggle, { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                <View style={[st.toggleDot, { backgroundColor: '#10b981' }]} />
                <Text style={[st.baselineToggleTxt, { color: '#10b981' }]}>Live</Text>
              </View>
            )}
            {isBuilder && !goLive && onGoLiveChange && (
              <TouchableOpacity
                onPress={() => onGoLiveChange(true)}
                style={st.baselineToggle}
                activeOpacity={0.7}
              >
                <View style={st.toggleDot} />
                <Text style={st.baselineToggleTxt}>Go Live</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* On Hold Banner */}
      {onHold && (
        <View style={{ backgroundColor: '#f59e0b', paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>⏸  PROJECT ON HOLD</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>Tasks are frozen until hold is released</Text>
        </View>
      )}

      {/* ===== GANTT MODE ===== */}
      {mode === 'gantt' && (
      <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View
          ref={calRef}
          style={[st.grid, Platform.OS === 'web' && { userSelect: 'none' }]}
          onLayout={(e) => { cellWidth.current = e.nativeEvent.layout.width / 7; }}
        >
          <View style={st.dayHeader}>
            {DAYS.map(d => (
              <View key={d} style={st.dayHeaderCell}>
                <Text style={st.dayHeaderTxt}>{d}</Text>
              </View>
            ))}
          </View>

          {weeks.map((week, wi) => {
            const weekTasks = getWeekTasks(week);
            // Build lanes for current tasks
            const lanes = [];
            weekTasks.forEach(task => {
              let placed = false;
              for (let l = 0; l < lanes.length; l++) {
                const last = lanes[l][lanes[l].length - 1];
                if (task.startCol > last.startCol + last.span - 1) {
                  lanes[l].push(task); placed = true; break;
                }
              }
              if (!placed) lanes.push([task]);
            });

            const laneH = 32;
            const rowMinH = Math.max(125, 38 + lanes.length * laneH);

            return (
              <View key={wi} style={[st.weekRow, { minHeight: rowMinH }]}>
                {week.map((day, di) => {
                  const isToday = isSameDay(day, today);
                  const isCurMonth = day.getMonth() === month;
                  return (
                    <TouchableOpacity
                      key={di} activeOpacity={0.7}
                      onPress={() => {
                        if (isBuilder && onDayPress) {
                          onDayPress(`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`);
                        }
                      }}
                      style={[st.dayCell, di < 6 && st.dayCellBorder, (di===0||di===6) && st.weekendCell]}
                    >
                      <View style={[st.dayNumber, isToday && st.todayNumber]}>
                        <Text style={[st.dayNumberTxt, !isCurMonth && st.otherMonthTxt, isToday && st.todayNumberTxt]}>
                          {day.getDate()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Current task bars */}
                {lanes.map((lane, li) => (
                  lane.map(task => {
                    const isExc = task.is_exception;
                    const isOnHold = onHold;
                    const color = isOnHold ? C.rd : (isExc ? C.og : (task.progress === 100 ? C.gn : taskColor(task.id)));
                    const leftPct = `${(task.startCol / 7) * 100}%`;
                    const widthPct = `${(task.span / 7) * 100}%`;
                    const laneTop = 48 + li * laneH;
                    const isDragged = draggedId === task.id;
                    const isCascaded = affectedIds && affectedIds.has(task.id) && !isDragged;

                    return (
                      <View
                        key={`${task.id}-${wi}`}
                        style={[
                          st.taskBar,
                          { left: leftPct, width: widthPct, top: laneTop,
                            borderColor: color,
                            opacity: (isDragged || isCascaded) ? 0.85 : 1 },
                          isExc && !isOnHold && { backgroundColor: C.og, borderColor: C.og },
                          isOnHold && { backgroundColor: C.rd, borderColor: C.rd },
                          isDragged && st.taskBarDragged,
                          isCascaded && st.taskBarCascade,
                        ]}
                        {...(Platform.OS === 'web' && isBuilder ? {
                          onPointerDown: (e) => handleDragStart(task, e),
                          onContextMenu: (e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (onTaskRightClickRef.current) onTaskRightClickRef.current(task);
                            else handleContextMenu(task, e);
                          },
                        } : {})}
                      >
                        {task.progress === 100 && <Text style={[st.taskCheck, (isExc || isOnHold) && { color: '#fff' }]}>✓</Text>}
                        <Text style={[st.taskBarTxt, (isExc || isOnHold) && { color: '#fff' }]} numberOfLines={1}>{task.task}</Text>
                        {task.predecessor_id && <Text style={st.taskBarLink}>🔗</Text>}
                      </View>
                    );
                  })
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {isBuilder && Platform.OS === 'web' && (
        <View style={st.hint}>
          <Text style={st.hintTxt}>Click a day to add · Drag to move · Double-click to edit · Right-click to assign contractor · 🔗 = predecessor</Text>
        </View>
      )}
      </>
      )}

      {/* ===== TASK FIRST MODE ===== */}
      {mode === 'taskfirst' && (
      <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View
          ref={calRef}
          style={[st.grid, Platform.OS === 'web' && { userSelect: 'none' }]}
          onLayout={(e) => { cellWidth.current = e.nativeEvent.layout.width / 7; }}
        >
          <View style={st.dayHeader}>
            {DAYS.map(d => (
              <View key={d} style={st.dayHeaderCell}>
                <Text style={st.dayHeaderTxt}>{d}</Text>
              </View>
            ))}
          </View>

          {weeks.map((week, wi) => {
            // Calculate max tasks in any day this week for row height
            const dayCounts = week.map(day => getTasksForDay(day).length);
            const maxTasks = Math.max(0, ...dayCounts);
            const rowMinH = Math.max(125, 48 + maxTasks * 80);

            return (
              <View key={wi} style={[st.weekRow, { minHeight: rowMinH }]}>
                {week.map((day, di) => {
                  const isToday = isSameDay(day, today);
                  const isCurMonth = day.getMonth() === month;
                  const dayTasks = getTasksForDay(day);

                  return (
                    <TouchableOpacity
                      key={di} activeOpacity={0.7}
                      onPress={() => {
                        if (suppressDayPress.current) { suppressDayPress.current = false; return; }
                        if (isBuilder && onDayPress) {
                          onDayPress(fmt(day));
                        }
                      }}
                      style={[st.dayCell, di < 6 && st.dayCellBorder, (di===0||di===6) && st.weekendCell, { overflow: 'hidden' }]}
                    >
                      <View style={[st.dayNumber, isToday && st.todayNumber]}>
                        <Text style={[st.dayNumberTxt, !isCurMonth && st.otherMonthTxt, isToday && st.todayNumberTxt]}>
                          {day.getDate()}
                        </Text>
                      </View>

                      {/* Task chips */}
                      {dayTasks.map(task => {
                        const isExc = task.is_exception;
                        const isOnHold = onHold;
                        const color = isOnHold ? C.rd : (isExc ? C.og : (task.progress === 100 ? C.gn : taskColor(task.id)));
                        const isDragged = draggedId === task.id;
                        const isCascaded = affectedIds && affectedIds.has(task.id) && !isDragged;
                        const isComplete = task.progress === 100;

                        return (
                          <View
                            key={task.id}
                            style={[
                              st.tfChip,
                              { borderLeftColor: color, opacity: (isDragged || isCascaded) ? 0.7 : 1 },
                              isExc && !isOnHold && { backgroundColor: C.og, borderLeftColor: C.og },
                              isOnHold && { backgroundColor: C.rd, borderLeftColor: C.rd },
                              isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed', borderLeftWidth: 2 },
                              isCascaded && { borderWidth: 2, borderColor: C.gd, borderStyle: 'dashed', borderLeftWidth: 2 },
                            ]}
                            {...(Platform.OS === 'web' && isBuilder ? {
                              onPointerDown: (e) => { suppressDayPress.current = true; setTimeout(() => { suppressDayPress.current = false; }, 500); handleDragStart(task, e); },
                              onContextMenu: (e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (onTaskRightClickRef.current) onTaskRightClickRef.current(task);
                                else handleContextMenu(task, e);
                              },
                            } : {})}
                          >
                            <Text style={[st.tfChipName, isComplete && { textDecorationLine: 'line-through', color: C.dm }, (isExc || isOnHold) && { color: '#fff' }]}>
                              {isComplete ? '✓ ' : ''}{task.task}{task.predecessor_id ? ' 🔗' : ''}
                            </Text>
                            <Text style={[st.tfChipDate, (isExc || isOnHold) && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>→ {shortDate(task.end_date)}</Text>
                          </View>
                        );
                      })}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {isBuilder && Platform.OS === 'web' && (
        <View style={st.hint}>
          <Text style={st.hintTxt}>Click a day to add · Drag to move · Double-click to edit · Right-click to assign contractor · 🔗 = predecessor</Text>
        </View>
      )}
      </>
      )}

      {/* Right-click edit popup — rendered as fixed centered modal */}
      {editPopup && Platform.OS === 'web' && (
        <View style={st.popupOverlay}>
          <TouchableOpacity style={st.popupOverlayBg} activeOpacity={1} onPress={closeEditPopup} />
          <ScrollView
            style={st.popupScroll}
            contentContainerStyle={st.popupScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={st.popupContainer}>
              {/* Header */}
              <View style={st.popupHeader}>
                <Text style={st.popupTitle} numberOfLines={1}>✏️ Edit Task</Text>
                <TouchableOpacity onPress={closeEditPopup} style={st.popupClose}>
                  <Text style={st.popupCloseTxt}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Task info */}
              <View style={st.popupTaskInfo}>
                <Text style={st.popupTaskName} numberOfLines={2}>{editPopup.task.task}</Text>
                <Text style={st.popupTaskDates}>
                  {editPopup.task.start_date} → {editPopup.task.end_date}
                </Text>
                {editPopup.task.contractor ? (
                  <Text style={st.popupTaskContractor}>{editPopup.task.contractor}</Text>
                ) : null}
              </View>

              {/* Duration input */}
              <View style={st.popupField}>
                <Text style={st.popupLabel}>DURATION (WORKDAYS)</Text>
                <View style={st.popupDurationRow}>
                  <TouchableOpacity
                    onPress={() => setEditDuration(d => String(Math.max(1, (parseInt(d)||1) - 1)))}
                    style={st.popupDurBtn}
                  >
                    <Text style={st.popupDurBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <View style={st.popupDurInputWrap}>
                    <TextInput
                      value={editDuration}
                      onChangeText={setEditDuration}
                      keyboardType="number-pad"
                      style={st.popupDurInput}
                      selectTextOnFocus
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditDuration(d => String((parseInt(d)||1) + 1))}
                    style={st.popupDurBtn}
                  >
                    <Text style={st.popupDurBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
                {editDuration && editPopup.task.start_date && (
                  <Text style={st.popupNewEnd}>
                    New end: {calcEndFromWorkdays(editPopup.task.start_date, parseInt(editDuration) || 1)}
                  </Text>
                )}
              </View>

              {/* Reason input */}
              <View style={st.popupField}>
                <Text style={st.popupLabel}>REASON FOR CHANGE *</Text>
                <View style={st.popupReasonWrap}>
                  <TextInput
                    value={editReason}
                    onChangeText={setEditReason}
                    placeholder="e.g., Weather delay, material shortage, scope change..."
                    placeholderTextColor={C.w20}
                    multiline
                    numberOfLines={3}
                    style={st.popupReasonInput}
                  />
                </View>
              </View>

              {/* Actions */}
              <View style={st.popupActions}>
                <TouchableOpacity onPress={closeEditPopup} style={st.popupCancelBtn}>
                  <Text style={st.popupCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveEdit}
                  disabled={!editReason.trim() || editSaving}
                  style={[st.popupSaveBtn, (!editReason.trim() || editSaving) && st.popupSaveBtnDisabled]}
                >
                  <Text style={st.popupSaveTxt}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Delete section */}
              {isBuilder && onDeleteTask && (
                <View style={{ borderTopWidth: 1, borderTopColor: C.w06, marginTop: 12, paddingTop: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm, marginBottom: 8, letterSpacing: 0.5 }}>DANGER ZONE</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleDeleteTask('single')}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.rd + '40', backgroundColor: C.rd + '10', alignItems: 'center' }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.rd }}>Delete Task</Text>
                    </TouchableOpacity>
                    {popupHasSuccessors && (
                      <TouchableOpacity
                        onPress={() => handleDeleteTask('chain')}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd, alignItems: 'center' }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 18, fontWeight: '600', color: '#fff' }}>Delete Chain</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const getStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.mode === 'light' ? '#ffffff' : C.bg, minHeight: 0 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(0,0,0,0.08)' : C.bd,
  },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navRight: { flexDirection: 'row', alignItems: 'center', minWidth: 100, justifyContent: 'flex-end' },
  addItemBtn: {
    backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  addItemBtnTxt: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  todayBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: C.mode === 'light' ? 'rgba(0,0,0,0.12)' : C.w12, backgroundColor: C.mode === 'light' ? '#ffffff' : C.w04,
  },
  todayBtnTxt: { fontSize: 18, fontWeight: '600', color: C.text },
  arrowBtn: {
    width: 48, height: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04, borderWidth: 1, borderColor: C.mode === 'light' ? 'rgba(0,0,0,0.10)' : C.w08,
  },
  arrowTxt: { fontSize: 30, color: C.mode === 'light' ? C.text : C.mt, fontWeight: '300', marginTop: -2 },
  monthLabel: { fontSize: 24, fontWeight: '700', color: C.mode === 'light' ? C.text : C.textBold, minWidth: 160, textAlign: 'center' },
  grid: { flex: 1 },
  dayHeader: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(0,0,0,0.08)' : C.bd,
    backgroundColor: C.mode === 'light' ? '#f5f0e8' : C.w02,
  },
  dayHeaderCell: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  dayHeaderTxt: { fontSize: 16, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 },
  weekRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(0,0,0,0.06)' : C.bd, position: 'relative' },
  dayCell: { flex: 1, paddingTop: 4, paddingLeft: 6, minHeight: 125, backgroundColor: C.mode === 'light' ? '#ffffff' : 'transparent' },
  dayCellBorder: { borderRightWidth: 1, borderRightColor: C.mode === 'light' ? 'rgba(0,0,0,0.06)' : C.w03 },
  weekendCell: { backgroundColor: C.mode === 'light' ? '#faf7f1' : C.w02 },
  dayNumber: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  todayNumber: { backgroundColor: C.gd },
  dayNumberTxt: { fontSize: 18, fontWeight: '500', color: C.text },
  otherMonthTxt: { color: C.mode === 'light' ? 'rgba(0,0,0,0.20)' : C.w20 },
  todayNumberTxt: { color: '#ffffff', fontWeight: '700' },
  taskBar: {
    position: 'absolute', height: 33, borderRadius: 6,
    paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', marginHorizontal: 2,
    backgroundColor: C.mode === 'light' ? 'rgba(0,0,0,0.03)' : C.w04,
    borderWidth: 2.5,
    ...(Platform.OS === 'web' ? { cursor: 'grab', userSelect: 'none' } : {}),
  },
  taskBarDragged: {
    borderWidth: 2, borderColor: C.mode === 'light' ? '#0f172a' : C.textBold, borderStyle: 'dashed',
    ...(Platform.OS === 'web' ? { cursor: 'grabbing' } : {}),
  },
  taskBarCascade: { borderWidth: 2, borderColor: C.gd, borderStyle: 'dashed' },
  taskBarTxt: { fontSize: 16, fontWeight: '600', color: C.text, flex: 1 },
  taskBarLink: { fontSize: 12, marginLeft: 2 },
  taskCheck: { fontSize: 15, color: C.gn, marginRight: 3 },
  baselineToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(0,0,0,0.06)' : C.bd, backgroundColor: C.mode === 'light' ? '#ffffff' : C.w02,
  },
  baselineToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: C.mode === 'light' ? 'rgba(0,0,0,0.10)' : C.w08, backgroundColor: C.mode === 'light' ? '#ffffff' : C.w02,
  },
  toggleDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.w15 },
  baselineToggleTxt: { fontSize: 16, fontWeight: '500', color: C.dm },
  hint: { paddingVertical: 6, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.mode === 'light' ? 'rgba(0,0,0,0.06)' : C.bd },
  hintTxt: { fontSize: 15, color: C.dm },

  // Task First mode chips
  tfChip: {
    flexDirection: 'column', gap: 2,
    marginTop: 4, marginRight: 4,
    paddingVertical: 7, paddingHorizontal: 8,
    backgroundColor: C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04,
    borderRadius: 6, borderLeftWidth: 5, borderLeftColor: C.gd,
    ...(Platform.OS === 'web' && { cursor: 'grab', userSelect: 'none' }),
  },
  tfChipName: { fontSize: 18, fontWeight: '600', color: C.text, lineHeight: 24 },
  tfChipDate: { fontSize: 15, color: C.dm, fontWeight: '500' },

  // Edit popup — centered modal overlay
  popupOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000, alignItems: 'center', justifyContent: 'center',
  },
  popupOverlayBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popupScroll: {
    maxHeight: '90%', width: 340, zIndex: 1001,
  },
  popupScrollContent: {
    flexGrow: 1, justifyContent: 'center',
  },
  popupContainer: {
    backgroundColor: C.modalBg, borderRadius: 12,
    borderWidth: 1, borderColor: C.w12,
    ...(Platform.OS === 'web' ? {
      boxShadow: C.mode === 'dark' ? '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)' : '0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08)',
    } : { elevation: 20 }),
    overflow: 'hidden',
  },
  popupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.w08,
    backgroundColor: C.w03,
  },
  popupTitle: { fontSize: 21, fontWeight: '700', color: C.textBold },
  popupClose: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.w06,
  },
  popupCloseTxt: { fontSize: 27, color: C.mt, marginTop: -1 },
  popupTaskInfo: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.w06,
    backgroundColor: C.w02,
  },
  popupTaskName: { fontSize: 21, fontWeight: '600', color: C.text, marginBottom: 4 },
  popupTaskDates: { fontSize: 16, color: C.dm },
  popupTaskContractor: { fontSize: 16, color: C.mt, marginTop: 2 },
  popupField: { paddingHorizontal: 16, paddingTop: 12 },
  popupLabel: {
    fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8,
  },
  popupDurationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  popupDurBtn: {
    width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10,
  },
  popupDurBtnTxt: { fontSize: 27, color: C.text, fontWeight: '600' },
  popupDurInputWrap: {
    flex: 1, height: 60, borderRadius: 12,
    backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10,
    justifyContent: 'center', paddingHorizontal: 8,
  },
  popupDurInput: {
    color: C.textBold, fontSize: 27, fontWeight: '700', textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  popupNewEnd: { fontSize: 16, color: C.gd, marginTop: 6 },
  popupReasonWrap: {
    borderRadius: 8, padding: 10,
    backgroundColor: C.w04, borderWidth: 1, borderColor: C.w10,
    minHeight: 70,
  },
  popupReasonInput: {
    color: C.text, fontSize: 20, lineHeight: 27, textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  popupActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  popupCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: C.w10,
    backgroundColor: C.w04,
  },
  popupCancelTxt: { fontSize: 20, color: C.mt, fontWeight: '500' },
  popupSaveBtn: {
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: 8,
    backgroundColor: C.gd,
  },
  popupSaveBtnDisabled: { opacity: 0.4 },
  popupSaveTxt: { fontSize: 20, color: C.textBold, fontWeight: '700' },
});
