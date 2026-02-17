import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import { ThemeContext } from './context';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getMonthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const weeks = [];
  let cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    if (w < 5 || week[0].getMonth() === month) weeks.push(week);
  }
  return weeks;
};

const displayDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function DatePicker({ value, onChange, label, placeholder, style: wrapStyle }) {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => {
    if (value) { const d = new Date(value + 'T00:00:00'); if (!isNaN(d.getTime())) return d.getFullYear(); }
    return new Date().getFullYear();
  });
  const [month, setMonth] = useState(() => {
    if (value) { const d = new Date(value + 'T00:00:00'); if (!isNaN(d.getTime())) return d.getMonth(); }
    return new Date().getMonth();
  });

  const today = useMemo(() => new Date(), []);
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const handleSelect = (day) => {
    onChange(fmt(day));
    setOpen(false);
  };

  const handleOpen = () => {
    // Sync calendar to current value when opening
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setYear(d.getFullYear());
        setMonth(d.getMonth());
      }
    }
    setOpen(true);
  };

  return (
    <View style={[st.wrapper, wrapStyle]}>
      {label && <Text style={st.label}>{label}</Text>}

      {/* Trigger button */}
      <TouchableOpacity onPress={handleOpen} style={st.trigger} activeOpacity={0.7}>
        <Text style={st.calIcon}>📅</Text>
        <Text style={[st.triggerTxt, !value && st.placeholderTxt]}>
          {value ? displayDate(value) : (placeholder || 'Select date')}
        </Text>
        <Text style={st.chevron}>▾</Text>
      </TouchableOpacity>

      {/* Calendar popup */}
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity
          style={st.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={st.popup}>
              {/* Header with month/year nav */}
              <View style={st.popupHeader}>
                <TouchableOpacity onPress={prevMonth} style={st.navBtn}>
                  <Text style={st.navBtnTxt}>‹</Text>
                </TouchableOpacity>
                <Text style={st.monthYearTxt}>{MONTHS[month]} {year}</Text>
                <TouchableOpacity onPress={nextMonth} style={st.navBtn}>
                  <Text style={st.navBtnTxt}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day-of-week headers */}
              <View style={st.dowRow}>
                {DAYS.map(d => (
                  <View key={d} style={st.dowCell}>
                    <Text style={st.dowTxt}>{d}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar grid */}
              {weeks.map((week, wi) => (
                <View key={wi} style={st.weekRow}>
                  {week.map((day, di) => {
                    const isToday2 = isSameDay(day, today);
                    const isMonth = day.getMonth() === month;
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isWeekend = di === 0 || di === 6;

                    return (
                      <TouchableOpacity
                        key={di}
                        onPress={() => handleSelect(day)}
                        style={[
                          st.dayCell,
                          isSelected && st.dayCellSelected,
                          isToday2 && !isSelected && st.dayCellToday,
                        ]}
                        activeOpacity={0.6}
                      >
                        <Text style={[
                          st.dayTxt,
                          !isMonth && st.dayTxtOther,
                          isWeekend && isMonth && st.dayTxtWeekend,
                          isSelected && st.dayTxtSelected,
                          isToday2 && !isSelected && st.dayTxtToday,
                        ]}>
                          {day.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {/* Footer */}
              <View style={st.popupFooter}>
                <TouchableOpacity onPress={() => handleSelect(today)} style={st.todayBtn}>
                  <Text style={st.todayBtnTxt}>Today</Text>
                </TouchableOpacity>
                {value && (
                  <TouchableOpacity onPress={() => { onChange(''); setOpen(false); }} style={st.clearBtn}>
                    <Text style={st.clearBtnTxt}>Clear</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setOpen(false)} style={st.doneBtn}>
                  <Text style={st.doneBtnTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const getStyles = (C) => StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: {
    fontSize: 10, fontWeight: '700', color: C.mt, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 6,
  },

  // Trigger
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.inputBg,
    borderWidth: 1, borderColor: C.w08,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
  },
  calIcon: { fontSize: 14 },
  triggerTxt: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },
  placeholderTxt: { color: C.ph },
  chevron: { fontSize: 10, color: C.dm },

  // Overlay
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Popup
  popup: {
    backgroundColor: C.modalBg, borderRadius: 16,
    padding: 16, width: 320,
    boxShadow: '0px 10px 30px rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: C.w08,
  },

  // Header
  popupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.inputBg,
    borderWidth: 1, borderColor: C.w08,
  },
  navBtnTxt: { fontSize: 20, color: C.mt, fontWeight: '300', marginTop: -2 },
  monthYearTxt: { fontSize: 15, fontWeight: '700', color: C.textBold },

  // Day-of-week row
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dowTxt: { fontSize: 10, fontWeight: '700', color: C.dm, textTransform: 'uppercase' },

  // Week row
  weekRow: { flexDirection: 'row' },

  // Day cell
  dayCell: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8, marginHorizontal: 1, marginVertical: 1,
  },
  dayCellSelected: { backgroundColor: C.gd },
  dayCellToday: { backgroundColor: 'rgba(59,130,246,0.15)' },
  dayTxt: { fontSize: 13, color: C.text, fontWeight: '500' },
  dayTxtOther: { color: C.w15 },
  dayTxtWeekend: { color: C.w40 },
  dayTxtSelected: { color: C.textBold, fontWeight: '700' },
  dayTxtToday: { color: '#60a5fa', fontWeight: '600' },

  // Footer
  popupFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.w06,
  },
  todayBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  todayBtnTxt: { fontSize: 11, fontWeight: '600', color: '#60a5fa' },
  clearBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  clearBtnTxt: { fontSize: 11, fontWeight: '600', color: '#f87171' },
  doneBtn: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6,
    backgroundColor: C.gd,
  },
  doneBtnTxt: { fontSize: 11, fontWeight: '700', color: C.textBold },
});
