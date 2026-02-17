import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Platform, Modal,
  Alert,
} from 'react-native';
import DatePicker from './datePicker';
import { ThemeContext, API_BASE } from './context';

const TASK_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#06b6d4',
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

const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Add/subtract workdays (skips weekends)
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

export const calcEndDate = (start, workdays) => {
  if (!start || !workdays || workdays < 1) return '';
  let d = toDate(start);
  if (!d) return '';
  let remaining = parseInt(workdays) - 1;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return fmt(d);
};

// Calculate start date from predecessor (lag in workdays)
export const calcFromPredecessor = (tasks, task) => {
  if (!task.predecessor) return null;
  const pred = tasks.find(t => t._id === task.predecessor);
  if (!pred) return null;
  const lag = parseInt(task.lag) || 0;
  const relType = task.relType || 'FS';

  if (relType === 'FS') {
    // Finish-Start: next workday after predecessor ends, then add lag workdays
    const baseDate = toDate(pred.end_date);
    if (!baseDate) return null;
    let start = addWorkdays(baseDate, 1); // next workday after finish
    if (lag !== 0) start = addWorkdays(start, lag);
    return fmt(start);
  } else {
    // Start-Start: same start as predecessor, offset by lag workdays
    const baseDate = toDate(pred.start_date);
    if (!baseDate) return null;
    const start = lag === 0 ? baseDate : addWorkdays(baseDate, lag);
    return fmt(start);
  }
};

// Cascade: recalculate all dependent tasks iteratively
export const cascadeAll = (tasks) => {
  const maxPasses = tasks.length + 1;
  let list = [...tasks.map(t => ({ ...t }))];

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    list = list.map(t => {
      if (!t.predecessor) return t;
      const newStart = calcFromPredecessor(list, t);
      if (newStart && newStart !== t.start_date) {
        const newEnd = calcEndDate(newStart, parseInt(t.workdays) || 1);
        changed = true;
        return { ...t, start_date: newStart, end_date: newEnd };
      }
      return t;
    });
    if (!changed) break;
  }
  return list;
};

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

const shortDate = (s) => {
  const d = toDate(s);
  if (!d) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ============================================================
// SCHEDULE TEMPLATES
// ============================================================
// predIdx is 0-based index of predecessor within the template
const TEMPLATES = [
  {
    name: 'Custom Home Build',
    icon: '🏠',
    desc: 'Full residential new construction',
    tasks: [
      { task: 'Permitting & Approvals', workdays: '10', predIdx: null, relType: 'FS', lag: '0' },
      { task: 'Site Work & Excavation', workdays: '5', predIdx: 0, relType: 'FS', lag: '0' },
      { task: 'Foundation', workdays: '10', predIdx: 1, relType: 'FS', lag: '0' },
      { task: 'Foundation Waterproofing', workdays: '3', predIdx: 2, relType: 'FS', lag: '0' },
      { task: 'Backfill', workdays: '2', predIdx: 3, relType: 'FS', lag: '0' },
      { task: 'Underground Plumbing', workdays: '5', predIdx: 4, relType: 'FS', lag: '0' },
      { task: 'Flatwork / Garage Floor', workdays: '3', predIdx: 5, relType: 'FS', lag: '0' },
      { task: 'Framing', workdays: '20', predIdx: 6, relType: 'FS', lag: '0' },
      { task: 'Roofing', workdays: '5', predIdx: 7, relType: 'FS', lag: '0' },
      { task: 'Windows & Exterior Doors', workdays: '5', predIdx: 7, relType: 'FS', lag: '0' },
      { task: 'Plumbing Rough-In', workdays: '8', predIdx: 8, relType: 'FS', lag: '0' },
      { task: 'HVAC Rough-In', workdays: '8', predIdx: 10, relType: 'SS', lag: '0' },
      { task: 'Electrical Rough-In', workdays: '8', predIdx: 10, relType: 'SS', lag: '0' },
      { task: 'Insulation', workdays: '5', predIdx: 12, relType: 'FS', lag: '0' },
      { task: 'Drywall', workdays: '15', predIdx: 13, relType: 'FS', lag: '0' },
      { task: 'Interior Paint', workdays: '10', predIdx: 14, relType: 'FS', lag: '0' },
      { task: 'Cabinets & Millwork', workdays: '8', predIdx: 15, relType: 'FS', lag: '0' },
      { task: 'Countertops', workdays: '3', predIdx: 16, relType: 'FS', lag: '5' },
      { task: 'Tile & Flooring', workdays: '10', predIdx: 16, relType: 'FS', lag: '0' },
      { task: 'Plumbing Trim', workdays: '5', predIdx: 17, relType: 'FS', lag: '0' },
      { task: 'Electrical Trim', workdays: '5', predIdx: 19, relType: 'SS', lag: '0' },
      { task: 'HVAC Trim', workdays: '3', predIdx: 19, relType: 'SS', lag: '0' },
      { task: 'Appliance Install', workdays: '2', predIdx: 19, relType: 'FS', lag: '0' },
      { task: 'Exterior Finishes', workdays: '15', predIdx: 8, relType: 'FS', lag: '0' },
      { task: 'Landscaping & Hardscape', workdays: '10', predIdx: 23, relType: 'FS', lag: '0' },
      { task: 'Final Clean', workdays: '3', predIdx: 22, relType: 'FS', lag: '0' },
      { task: 'Final Inspections', workdays: '5', predIdx: 25, relType: 'FS', lag: '0' },
      { task: 'Punch List', workdays: '5', predIdx: 26, relType: 'FS', lag: '0' },
      { task: 'Closing & Handoff', workdays: '2', predIdx: 27, relType: 'FS', lag: '0' },
    ],
  },
  {
    name: 'Kitchen Remodel',
    icon: '🍳',
    desc: 'Full kitchen renovation',
    tasks: [
      { task: 'Design & Ordering', workdays: '10', predIdx: null, relType: 'FS', lag: '0' },
      { task: 'Permitting', workdays: '5', predIdx: 0, relType: 'SS', lag: '5' },
      { task: 'Demo', workdays: '3', predIdx: 1, relType: 'FS', lag: '0' },
      { task: 'Rough Plumbing', workdays: '3', predIdx: 2, relType: 'FS', lag: '0' },
      { task: 'Rough Electrical', workdays: '3', predIdx: 3, relType: 'SS', lag: '0' },
      { task: 'Drywall Repair', workdays: '3', predIdx: 4, relType: 'FS', lag: '0' },
      { task: 'Paint', workdays: '2', predIdx: 5, relType: 'FS', lag: '0' },
      { task: 'Flooring', workdays: '3', predIdx: 6, relType: 'FS', lag: '0' },
      { task: 'Cabinet Install', workdays: '5', predIdx: 7, relType: 'FS', lag: '0' },
      { task: 'Countertop Template & Install', workdays: '8', predIdx: 8, relType: 'FS', lag: '3' },
      { task: 'Backsplash', workdays: '3', predIdx: 9, relType: 'FS', lag: '0' },
      { task: 'Plumbing Trim', workdays: '2', predIdx: 10, relType: 'FS', lag: '0' },
      { task: 'Electrical Trim', workdays: '2', predIdx: 11, relType: 'SS', lag: '0' },
      { task: 'Appliances', workdays: '1', predIdx: 11, relType: 'FS', lag: '0' },
      { task: 'Punch List & Clean', workdays: '2', predIdx: 13, relType: 'FS', lag: '0' },
    ],
  },
  {
    name: 'Bathroom Remodel',
    icon: '🚿',
    desc: 'Full bathroom renovation',
    tasks: [
      { task: 'Design & Ordering', workdays: '5', predIdx: null, relType: 'FS', lag: '0' },
      { task: 'Permitting', workdays: '3', predIdx: 0, relType: 'FS', lag: '0' },
      { task: 'Demo', workdays: '2', predIdx: 1, relType: 'FS', lag: '0' },
      { task: 'Rough Plumbing', workdays: '3', predIdx: 2, relType: 'FS', lag: '0' },
      { task: 'Rough Electrical', workdays: '2', predIdx: 3, relType: 'SS', lag: '0' },
      { task: 'Waterproofing', workdays: '2', predIdx: 4, relType: 'FS', lag: '0' },
      { task: 'Tile', workdays: '5', predIdx: 5, relType: 'FS', lag: '0' },
      { task: 'Drywall & Paint', workdays: '3', predIdx: 6, relType: 'FS', lag: '0' },
      { task: 'Vanity & Mirror', workdays: '2', predIdx: 7, relType: 'FS', lag: '0' },
      { task: 'Plumbing Trim', workdays: '2', predIdx: 8, relType: 'FS', lag: '0' },
      { task: 'Electrical Trim', workdays: '1', predIdx: 9, relType: 'SS', lag: '0' },
      { task: 'Glass / Shower Door', workdays: '1', predIdx: 9, relType: 'FS', lag: '3' },
      { task: 'Accessories & Punch', workdays: '1', predIdx: 11, relType: 'FS', lag: '0' },
    ],
  },
  {
    name: 'Addition',
    icon: '🔨',
    desc: 'Room or wing addition',
    tasks: [
      { task: 'Architecture & Engineering', workdays: '15', predIdx: null, relType: 'FS', lag: '0' },
      { task: 'Permitting', workdays: '10', predIdx: 0, relType: 'FS', lag: '0' },
      { task: 'Site Prep & Excavation', workdays: '3', predIdx: 1, relType: 'FS', lag: '0' },
      { task: 'Foundation', workdays: '8', predIdx: 2, relType: 'FS', lag: '0' },
      { task: 'Framing', workdays: '12', predIdx: 3, relType: 'FS', lag: '0' },
      { task: 'Roofing & Tie-In', workdays: '5', predIdx: 4, relType: 'FS', lag: '0' },
      { task: 'Windows & Doors', workdays: '3', predIdx: 5, relType: 'SS', lag: '0' },
      { task: 'Plumbing Rough-In', workdays: '5', predIdx: 5, relType: 'FS', lag: '0' },
      { task: 'HVAC Rough-In', workdays: '5', predIdx: 7, relType: 'SS', lag: '0' },
      { task: 'Electrical Rough-In', workdays: '5', predIdx: 7, relType: 'SS', lag: '0' },
      { task: 'Insulation', workdays: '3', predIdx: 9, relType: 'FS', lag: '0' },
      { task: 'Drywall', workdays: '8', predIdx: 10, relType: 'FS', lag: '0' },
      { task: 'Paint', workdays: '5', predIdx: 11, relType: 'FS', lag: '0' },
      { task: 'Flooring', workdays: '5', predIdx: 12, relType: 'FS', lag: '0' },
      { task: 'Trim & Finish', workdays: '5', predIdx: 13, relType: 'FS', lag: '0' },
      { task: 'MEP Trim', workdays: '3', predIdx: 14, relType: 'FS', lag: '0' },
      { task: 'Exterior Finish', workdays: '5', predIdx: 5, relType: 'FS', lag: '5' },
      { task: 'Final Inspection & Punch', workdays: '3', predIdx: 15, relType: 'FS', lag: '0' },
    ],
  },
  {
    name: 'Blank Schedule',
    icon: '📋',
    desc: 'Start from scratch',
    tasks: [],
  },
];

// Build tasks from a template, given a start date
const buildFromTemplate = (template, startDate) => {
  if (!template.tasks.length) return [];
  const now = Date.now();
  const builtTasks = template.tasks.map((t, i) => ({
    _id: now + i,
    task: t.task,
    contractor: '',
    trade: t.trade || '',
    workdays: t.workdays,
    start_date: '',
    end_date: '',
    predecessor: null, // will wire up after all IDs assigned
    relType: t.relType || 'FS',
    lag: t.lag || '0',
  }));

  // Wire predecessor references by _id
  template.tasks.forEach((t, i) => {
    if (t.predIdx !== null && t.predIdx !== undefined && builtTasks[t.predIdx]) {
      builtTasks[i].predecessor = builtTasks[t.predIdx]._id;
    }
  });

  console.log('[TEMPLATE] Built tasks with predecessors:', builtTasks.map((t, i) => ({
    i, task: t.task, _id: t._id, predecessor: t.predecessor, relType: t.relType, lag: t.lag,
  })));

  // Set the first task's start date
  if (startDate && builtTasks.length > 0) {
    builtTasks[0].start_date = startDate;
    builtTasks[0].end_date = calcEndDate(startDate, parseInt(builtTasks[0].workdays) || 1);
  }

  // Cascade all dates
  return cascadeAll(builtTasks);
};

// ============================================================
// TEMPLATE PICKER
// ============================================================
const TemplatePicker = ({ onApply, existingCount }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE}/schedule-templates`);
      if (res.ok) {
        const data = await res.json();
        setSavedTemplates(data);
      }
    } catch (e) { /* ignore */ }
    setLoadingTemplates(false);
  };

  const handleOpen = () => {
    fetchTemplates();
    setSelected(null);
    setStartDate('');
    setOpen(true);
  };

  const handleDelete = async (id) => {
    const doDelete = async () => {
      try {
        await fetch(`${API_BASE}/schedule-templates/${id}`, { method: 'DELETE' });
        setSavedTemplates(prev => prev.filter(t => t.id !== id));
        if (selected?._savedId === id) setSelected(null);
      } catch (e) { /* ignore */ }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this template?')) doDelete();
    } else {
      Alert.alert('Delete Template', 'Are you sure?', [
        { text: 'Cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Convert saved template to the same format as built-in TEMPLATES
  const savedAsBuiltIn = savedTemplates.map(st => ({
    name: st.name,
    icon: st.icon || '📋',
    desc: st.description || `${st.tasks?.length || 0} tasks`,
    tasks: st.tasks || [],
    _savedId: st.id,
  }));

  const allTemplates = [...savedAsBuiltIn, ...TEMPLATES];

  const handleApply = () => {
    if (!selected) return;
    if (selected.tasks.length > 0 && !startDate) return;
    const tasks = buildFromTemplate(selected, startDate);
    onApply(tasks, { name: selected.name, icon: selected.icon, taskCount: tasks.length });
    setOpen(false);
    setSelected(null);
    setStartDate('');
  };

  return (
    <>
      <TouchableOpacity onPress={handleOpen} style={st.templateTrigger} activeOpacity={0.7}>
        <Text style={st.templateTriggerIcon}>📑</Text>
        <Text style={st.templateTriggerTxt}>Use Template</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={st.templatePopup}>
              <Text style={st.templatePopupTitle}>Schedule Templates</Text>
              <Text style={st.templatePopupSub}>
                {existingCount > 0 ? 'This will replace existing tasks' : 'Choose a starting point'}
              </Text>

              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {/* Saved templates */}
                {savedAsBuiltIn.length > 0 && (
                  <>
                    <Text style={st.sectionLabel}>SAVED TEMPLATES</Text>
                    {savedAsBuiltIn.map((tmpl, i) => {
                      const isActive = selected === tmpl;
                      return (
                        <TouchableOpacity
                          key={`saved-${tmpl._savedId}`}
                          onPress={() => setSelected(tmpl)}
                          style={[st.templateCard, isActive && st.templateCardOn]}
                          activeOpacity={0.7}
                        >
                          <Text style={st.templateIcon}>{tmpl.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[st.templateName, isActive && st.templateNameOn]}>{tmpl.name}</Text>
                            <Text style={st.templateDesc}>
                              {tmpl.desc} · {tmpl.tasks.length || 0} tasks
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); handleDelete(tmpl._savedId); }}
                            style={st.templateDeleteBtn}
                          >
                            <Text style={st.templateDeleteTxt}>🗑</Text>
                          </TouchableOpacity>
                          {isActive && <Text style={st.templateCheck}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* Built-in templates */}
                <Text style={[st.sectionLabel, savedAsBuiltIn.length > 0 && { marginTop: 12 }]}>BUILT-IN TEMPLATES</Text>
                {TEMPLATES.map((tmpl, i) => {
                  const isActive = selected === tmpl;
                  return (
                    <TouchableOpacity
                      key={`builtin-${i}`}
                      onPress={() => setSelected(tmpl)}
                      style={[st.templateCard, isActive && st.templateCardOn]}
                      activeOpacity={0.7}
                    >
                      <Text style={st.templateIcon}>{tmpl.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.templateName, isActive && st.templateNameOn]}>{tmpl.name}</Text>
                        <Text style={st.templateDesc}>
                          {tmpl.desc} · {tmpl.tasks.length || 0} tasks
                        </Text>
                      </View>
                      {isActive && <Text style={st.templateCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}

                {loadingTemplates && (
                  <Text style={{ textAlign: 'center', color: C.dm, paddingVertical: 10, fontSize: 16 }}>Loading...</Text>
                )}
              </ScrollView>

              {selected && selected.tasks.length > 0 && (
                <View style={st.templateDateRow}>
                  <DatePicker
                    label="PROJECT START DATE"
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Select start date"
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                </View>
              )}

              <View style={st.templateActions}>
                <TouchableOpacity onPress={() => setOpen(false)} style={st.templateCancelBtn}>
                  <Text style={st.templateCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleApply}
                  disabled={!selected || (selected.tasks.length > 0 && !startDate)}
                  style={[st.templateApplyBtn, (!selected || (selected.tasks.length > 0 && !startDate)) && st.templateApplyBtnOff]}
                  activeOpacity={0.7}
                >
                  <Text style={st.templateApplyTxt}>
                    {selected?.tasks.length ? `Apply ${selected.tasks.length} Tasks` : 'Start Blank'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

// ============================================================
// PREDECESSOR DROPDOWN
// ============================================================
const PredecessorSelect = ({ tasks, currentIdx, value, relType, lag, onChangePred, onChangeRel, onChangeLag }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const available = tasks.filter((_, i) => i < currentIdx);
  const selected = available.find(t => t._id === value);

  return (
    <View style={st.predRow}>
      {/* Predecessor selector */}
      <TouchableOpacity
        onPress={() => available.length > 0 && setOpen(true)}
        style={[st.predSelect, value && st.predSelectOn]}
        activeOpacity={0.7}
      >
        <Text style={st.predIcon}>⛓</Text>
        <Text style={[st.predSelectTxt, !value && { color: C.ph }]} numberOfLines={1}>
          {selected ? selected.task || `Task ${tasks.indexOf(selected) + 1}` : 'Predecessor'}
        </Text>
        <Text style={st.predChevron}>▾</Text>
      </TouchableOpacity>

      {/* FS / SS toggle + Lag (only when predecessor is set) */}
      {value ? (
        <>
          <View style={st.relWrap}>
            {['FS', 'SS'].map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => onChangeRel(r)}
                style={[st.relBtn, relType === r && st.relBtnOn]}
                activeOpacity={0.7}
              >
                <Text style={[st.relBtnTxt, relType === r && st.relBtnTxtOn]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={st.lagWrap}>
            <TouchableOpacity onPress={() => onChangeLag(String((parseInt(lag) || 0) - 1))} style={st.lagBtn}>
              <Text style={st.lagBtnTxt}>−</Text>
            </TouchableOpacity>
            <TextInput
              value={lag} onChangeText={onChangeLag}
              placeholder="0" placeholderTextColor={C.ph}
              keyboardType="numeric" style={st.lagInp}
            />
            <TouchableOpacity onPress={() => onChangeLag(String((parseInt(lag) || 0) + 1))} style={st.lagBtn}>
              <Text style={st.lagBtnTxt}>+</Text>
            </TouchableOpacity>
            <Text style={st.lagLabel}>wd</Text>
          </View>

          <TouchableOpacity onPress={() => onChangePred(null)} style={st.predClearBtn}>
            <Text style={st.predClearTxt}>×</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {/* Dropdown modal */}
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={st.dropPopup}>
              <Text style={st.dropTitle}>Select Predecessor</Text>
              <ScrollView style={{ maxHeight: 260 }}>
                {available.length === 0 ? (
                  <Text style={st.dropEmpty}>Add tasks above first</Text>
                ) : (
                  available.map((t) => {
                    const taskIdx = tasks.indexOf(t);
                    const isActive = t._id === value;
                    return (
                      <TouchableOpacity
                        key={t._id}
                        onPress={() => { onChangePred(t._id); setOpen(false); }}
                        style={[st.dropItem, isActive && st.dropItemOn]}
                        activeOpacity={0.7}
                      >
                        <View style={[st.dropDot, { backgroundColor: TASK_COLORS[taskIdx % TASK_COLORS.length] }]} />
                        <Text style={[st.dropItemTxt, isActive && st.dropItemTxtOn]} numberOfLines={1}>
                          {taskIdx + 1}. {t.task || 'Untitled'}
                        </Text>
                        {t.end_date && (
                          <Text style={st.dropItemDate}>ends {shortDate(t.end_date)}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
              {value && (
                <TouchableOpacity onPress={() => { onChangePred(null); setOpen(false); }} style={st.dropClear}>
                  <Text style={st.dropClearTxt}>Remove Predecessor</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ============================================================
// CONTRACTOR SELECT DROPDOWN
// ============================================================
const ContractorSelect = ({ value, onChange, subs }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = subs.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) ||
      (s.company_name || '').toLowerCase().includes(q) ||
      (s.trades || '').toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={() => { setOpen(true); setSearch(''); }}
        style={[st.inp, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        activeOpacity={0.7}
      >
        <Text style={[{ fontSize: 20, flex: 1 }, value ? { color: C.text } : { color: C.ph }]} numberOfLines={1}>
          {value || 'Contractor'}
        </Text>
        <Text style={{ fontSize: 15, color: C.dm, marginLeft: 4 }}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={st.dropPopup}>
              <Text style={st.dropTitle}>Select Contractor</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search subcontractors..."
                placeholderTextColor={C.ph}
                style={[st.inp, { marginBottom: 8 }]}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 260 }}>
                {filtered.length === 0 ? (
                  <Text style={st.dropEmpty}>No subcontractors found</Text>
                ) : (
                  filtered.map(s => {
                    const isActive = value === s.name;
                    const tradesArr = s.trades ? s.trades.split(',').map(t => t.trim()).filter(Boolean) : [];
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => { onChange(s.name); setOpen(false); }}
                        style={[st.dropItem, isActive && st.dropItemOn]}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[st.dropItemTxt, isActive && st.dropItemTxtOn]} numberOfLines={1}>
                            {s.name}
                          </Text>
                          {s.company_name ? (
                            <Text style={{ fontSize: 15, color: C.dm, marginTop: 1 }}>{s.company_name}</Text>
                          ) : null}
                          {tradesArr.length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                              {tradesArr.slice(0, 3).map(t => (
                                <View key={t} style={{ backgroundColor: 'rgba(59,130,246,0.08)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 12, color: 'rgba(59,130,246,0.8)' }}>{t}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                        {isActive && <Text style={{ fontSize: 21, color: C.gd }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
              {value && (
                <TouchableOpacity onPress={() => { onChange(''); setOpen(false); }} style={st.dropClear}>
                  <Text style={st.dropClearTxt}>Remove Contractor</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ============================================================
// TRADE SELECT DROPDOWN (for templates)
// ============================================================
export const TEMPLATE_TRADES = [
  'Excavation', 'Concrete', 'Plumbing', 'Electrical', 'HVAC', 'Trim',
  'Doors', 'Sheetrock', 'Insulation', 'Gravel', 'Framing', 'Roofing',
  'Painting', 'Flooring', 'Cabinets', 'Countertops', 'Tile',
  'Landscaping', 'Waterproofing', 'Appliances', 'Windows', 'Siding',
  'Gutters', 'Fireplace', 'Cleaning', 'Inspections', 'General',
];

const TradeSelect = ({ value, onChange }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = TEMPLATE_TRADES.filter(t => {
    if (!search.trim()) return true;
    return t.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={() => { setOpen(true); setSearch(''); }}
        style={[st.inp, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        activeOpacity={0.7}
      >
        <Text style={[{ fontSize: 20, flex: 1 }, value ? { color: C.bl } : { color: C.ph }]} numberOfLines={1}>
          {value || 'Trade'}
        </Text>
        <Text style={{ fontSize: 15, color: C.dm, marginLeft: 4 }}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={st.dropPopup}>
              <Text style={st.dropTitle}>Select Trade</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search trades..."
                placeholderTextColor={C.ph}
                style={[st.inp, { marginBottom: 8 }]}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 300 }}>
                {filtered.length === 0 ? (
                  <Text style={st.dropEmpty}>No trades found</Text>
                ) : (
                  filtered.map(trade => {
                    const isActive = value === trade;
                    return (
                      <TouchableOpacity
                        key={trade}
                        onPress={() => { onChange(trade); setOpen(false); }}
                        style={[st.dropItem, isActive && { backgroundColor: 'rgba(59,130,246,0.12)' }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[st.dropItemTxt, isActive && { color: C.bl, fontWeight: '600' }]} numberOfLines={1}>
                          {trade}
                        </Text>
                        {isActive && <Text style={{ fontSize: 21, color: C.bl }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
              {value && (
                <TouchableOpacity onPress={() => { onChange(''); setOpen(false); }} style={st.dropClear}>
                  <Text style={st.dropClearTxt}>Remove Trade</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ScheduleBuilder({ tasks, onTasksChange, templateMode, collapsed, templateInfo, onReviewTemplate, onChangeTemplate }) {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [subs, setSubs] = useState([]);

  // Fetch subcontractors once (not needed in template mode)
  useEffect(() => {
    if (templateMode) return;
    fetch(`${API_BASE}/users`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSubs(data.filter(u => (u.role === 'contractor' || u.role === 'builder') && u.active !== false));
      })
      .catch(() => {});
  }, [templateMode]);

  const today = useMemo(() => new Date(), []);
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const addTask = () => {
    onTasksChange([...tasks, {
      _id: Date.now(), task: '', contractor: '', trade: '', start_date: '', workdays: '1', end_date: '',
      predecessor: null, relType: 'FS', lag: '0',
    }]);
  };

  // Core update with cascade
  const updateTask = useCallback((idx, field, value) => {
    let updated = tasks.map((t, i) => {
      if (i !== idx) return t;
      const next = { ...t, [field]: value };

      // If setting predecessor/relType/lag, calculate start from predecessor
      if (field === 'predecessor' || field === 'relType' || field === 'lag') {
        if (field === 'predecessor' && value === null) {
          // Clearing predecessor — keep dates, allow manual editing
          next.predecessor = null;
          next.relType = 'FS';
          next.lag = '0';
        } else {
          const lookup = { ...next,
            predecessor: field === 'predecessor' ? value : next.predecessor,
            relType: field === 'relType' ? value : next.relType,
            lag: field === 'lag' ? value : next.lag,
          };
          const newStart = calcFromPredecessor(tasks, lookup);
          if (newStart) {
            next.start_date = newStart;
            next.end_date = calcEndDate(newStart, parseInt(next.workdays) || 1);
          }
        }
      }

      // Recalculate end_date when start or workdays change
      if (field === 'start_date' || field === 'workdays') {
        next.end_date = calcEndDate(
          field === 'start_date' ? value : next.start_date,
          parseInt(field === 'workdays' ? value : next.workdays) || 1,
        );
      }
      return next;
    });

    // Cascade to all dependent tasks
    updated = cascadeAll(updated);

    // When assigning a contractor to a task with a trade, auto-assign to all tasks with same trade
    if (field === 'contractor' && !templateMode && value) {
      const trade = updated[idx]?.trade;
      if (trade) {
        updated = updated.map((t, i) => {
          if (i !== idx && t.trade === trade && t.contractor !== value) {
            return { ...t, contractor: value };
          }
          return t;
        });
      }
    }

    onTasksChange(updated);
  }, [tasks, onTasksChange, templateMode]);

  const removeTask = (idx) => {
    const removedId = tasks[idx]._id;
    let updated = tasks.filter((_, i) => i !== idx).map(t =>
      t.predecessor === removedId ? { ...t, predecessor: null, relType: 'FS', lag: '0' } : t
    );
    updated = cascadeAll(updated);
    onTasksChange(updated);
  };

  // Auto-navigate calendar to first task when in collapsed mode
  useEffect(() => {
    if (collapsed && tasks.length > 0) {
      const first = tasks.find(t => t.start_date);
      if (first) {
        const d = toDate(first.start_date);
        if (d) { setYear(d.getFullYear()); setMonth(d.getMonth()); }
      }
    }
  }, [collapsed, tasks.length]);

  const goToFirstTask = () => {
    const first = tasks.find(t => t.start_date);
    if (first) {
      const d = toDate(first.start_date);
      if (d) { setYear(d.getFullYear()); setMonth(d.getMonth()); }
    }
  };

  const handleDayPress = (dayStr) => {
    const emptyIdx = tasks.findIndex(t => !t.start_date && !t.predecessor);
    if (emptyIdx >= 0) {
      updateTask(emptyIdx, 'start_date', dayStr);
    }
  };

  const getWeekTasks = (week) => {
    const weekStart = week[0];
    const weekEnd = week[6];
    return tasks.map((task, idx) => {
      const ts = toDate(task.start_date);
      const te = toDate(task.end_date);
      if (!ts || !te || ts > weekEnd || te < weekStart) return null;
      const startCol = ts < weekStart ? 0 : ts.getDay();
      const endCol = te > weekEnd ? 6 : te.getDay();
      return { ...task, idx, startCol, span: endCol - startCol + 1 };
    }).filter(Boolean);
  };

  const taskColor = (idx) => TASK_COLORS[idx % TASK_COLORS.length];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <View style={st.container}>
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            {collapsed && templateInfo ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <Text style={{ fontSize: 28 }}>{templateInfo.icon || '📋'}</Text>
                  <View>
                    <Text style={st.headerTitle}>{templateInfo.name}</Text>
                    <Text style={st.headerSub}>
                      {tasks.length} task{tasks.length !== 1 ? 's' : ''} scheduled
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={st.headerTitle}>📅 Build Schedule</Text>
                <Text style={st.headerSub}>
                  {tasks.length} task{tasks.length !== 1 ? 's' : ''} · Set predecessors to chain tasks
                </Text>
              </>
            )}
          </View>
          {collapsed ? (
            <TouchableOpacity onPress={onChangeTemplate}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: C.mt }}>Change</Text>
            </TouchableOpacity>
          ) : (
            <TemplatePicker onApply={(builtTasks, tmplInfo) => {
              if (onReviewTemplate) {
                onReviewTemplate(builtTasks, tmplInfo);
              } else {
                onTasksChange(builtTasks);
              }
            }} existingCount={tasks.length} />
          )}
        </View>
      </View>

      {/* ========== TASK LIST (hidden in collapsed mode) ========== */}
      {!collapsed && (
      <View style={st.taskListWrap}>
        {tasks.map((task, idx) => {
          const hasPred = !!task.predecessor;
          const predTask = hasPred ? tasks.find(t => t._id === task.predecessor) : null;
          const predIdx = predTask ? tasks.indexOf(predTask) : -1;

          return (
            <View key={task._id} style={st.taskRow}>
              {/* Task number + color */}
              <View style={st.taskNumCol}>
                <View style={[st.colorDot, { backgroundColor: taskColor(idx) }]} />
                <Text style={st.taskNum}>{idx + 1}</Text>
              </View>

              <View style={{ flex: 1, gap: 6 }}>
                {/* Row 1: name + contractor/trade */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={task.task} onChangeText={v => updateTask(idx, 'task', v)}
                    placeholder="Task name" placeholderTextColor={C.ph}
                    style={[st.inp, { flex: 2 }]}
                  />
                  {templateMode ? (
                    <TradeSelect
                      value={task.trade || ''}
                      onChange={v => updateTask(idx, 'trade', v)}
                    />
                  ) : (
                    <ContractorSelect
                      value={task.contractor}
                      onChange={v => updateTask(idx, 'contractor', v)}
                      subs={subs}
                    />
                  )}
                </View>

                {/* Row 2: predecessor */}
                <PredecessorSelect
                  tasks={tasks}
                  currentIdx={idx}
                  value={task.predecessor}
                  relType={task.relType || 'FS'}
                  lag={task.lag || '0'}
                  onChangePred={v => updateTask(idx, 'predecessor', v)}
                  onChangeRel={v => updateTask(idx, 'relType', v)}
                  onChangeLag={v => updateTask(idx, 'lag', v)}
                />

                {/* Row 3: dates + workdays */}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {hasPred ? (
                    <View style={[st.autoDateBox, { flex: 1 }]}>
                      <Text style={st.autoDateIcon}>🔗</Text>
                      <Text style={st.autoDateTxt}>
                        {task.start_date ? shortDate(task.start_date) : 'Waiting...'}
                      </Text>
                      <Text style={st.autoDateHint}>
                        {task.relType || 'FS'}{(parseInt(task.lag) || 0) >= 0 ? '+' : ''}{task.lag || '0'}wd from #{predIdx + 1}
                      </Text>
                    </View>
                  ) : (
                    <DatePicker
                      value={task.start_date}
                      onChange={v => updateTask(idx, 'start_date', v)}
                      placeholder="Start date"
                      style={{ flex: 1, marginBottom: 0 }}
                    />
                  )}
                  <View style={st.wdWrap}>
                    <TextInput
                      value={task.workdays} onChangeText={v => updateTask(idx, 'workdays', v)}
                      placeholder="Days" placeholderTextColor={C.ph}
                      keyboardType="numeric"
                      style={[st.inp, { width: 50, textAlign: 'center' }]}
                    />
                    <Text style={st.wdLabel}>days</Text>
                  </View>
                  <Text style={st.arrow}>→</Text>
                  <Text style={st.endDate}>{task.end_date ? shortDate(task.end_date) : '—'}</Text>
                </View>
              </View>

              {/* Remove button */}
              <TouchableOpacity onPress={() => removeTask(idx)} style={st.removeBtn}>
                <Text style={st.removeTxt}>×</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity onPress={addTask} style={st.addBtn} activeOpacity={0.7}>
          <Text style={st.addBtnTxt}>+ Add Task</Text>
        </TouchableOpacity>
      </View>
      )}

      {/* ========== MINI CALENDAR ========== */}
      <View style={st.calWrap}>
        <View style={st.calNav}>
          <TouchableOpacity onPress={goToday} style={st.todayBtn}>
            <Text style={st.todayBtnTxt}>Today</Text>
          </TouchableOpacity>
          {tasks.some(t => t.start_date) && (
            <TouchableOpacity onPress={goToFirstTask} style={[st.todayBtn, { marginLeft: 6 }]}>
              <Text style={st.todayBtnTxt}>Go to Schedule</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={prevMonth} style={st.arrowBtn}>
            <Text style={st.arrowBtnTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={st.monthLabel}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={st.arrowBtn}>
            <Text style={st.arrowBtnTxt}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={st.dayHeaderRow}>
          {DAYS.map(d => (
            <View key={d} style={st.dayHeaderCell}>
              <Text style={st.dayHeaderTxt}>{d}</Text>
            </View>
          ))}
        </View>

        {weeks.map((week, wi) => {
          const weekTasks = getWeekTasks(week);
          const lanes = [];
          weekTasks.forEach(t => {
            let placed = false;
            for (let l = 0; l < lanes.length; l++) {
              const last = lanes[l][lanes[l].length - 1];
              if (t.startCol > last.startCol + last.span - 1) { lanes[l].push(t); placed = true; break; }
            }
            if (!placed) lanes.push([t]);
          });
          const rowH = Math.max(72, 26 + lanes.length * 22);

          return (
            <View key={wi} style={[st.weekRow, { minHeight: rowH }]}>
              {week.map((day, di) => {
                const isToday2 = isSameDay(day, today);
                const isMonth = day.getMonth() === month;
                return (
                  <TouchableOpacity
                    key={di} activeOpacity={0.7}
                    onPress={() => handleDayPress(fmt(day))}
                    style={[st.dayCell, di < 6 && st.dayCellBorder, (di === 0 || di === 6) && st.weekendCell]}
                  >
                    <View style={[st.dayNum, isToday2 && st.todayNum]}>
                      <Text style={[st.dayNumTxt, !isMonth && { color: C.w15 }, isToday2 && { color: '#ffffff', fontWeight: '700' }]}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {lanes.map((lane, li) => (
                lane.map(t => (
                  <View key={`${t._id}-${wi}`} style={[
                    st.taskBar,
                    {
                      left: `${(t.startCol / 7) * 100}%`,
                      width: `${(t.span / 7) * 100}%`,
                      top: 24 + li * 22,
                      backgroundColor: taskColor(t.idx),
                    },
                  ]}>
                    <Text style={st.taskBarTxt} numberOfLines={1}>{t.task || 'Untitled'}</Text>
                  </View>
                ))
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const getStyles = (C) => StyleSheet.create({
  container: { borderWidth: 1, borderColor: C.bd, borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: C.bd, backgroundColor: C.w02 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: C.textBold, marginBottom: 4 },
  headerSub: { fontSize: 16, color: C.dm },

  // Task list
  taskListWrap: { padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: C.bd },
  taskRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 10, borderRadius: 10, backgroundColor: C.w03,
    borderWidth: 1, borderColor: C.inputBg,
  },
  taskNumCol: { alignItems: 'center', gap: 4, paddingTop: 6 },
  colorDot: { width: 18, height: 18, borderRadius: 5 },
  taskNum: { fontSize: 14, fontWeight: '700', color: C.dm },
  inp: {
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08,
    borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, fontSize: 20, color: C.text,
  },
  wdWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wdLabel: { fontSize: 15, color: C.dm },
  arrow: { fontSize: 21, color: C.dm },
  endDate: { fontSize: 18, fontWeight: '600', color: C.gd, minWidth: 40 },
  removeBtn: { width: 42, height: 42, borderRadius: 11, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  removeTxt: { fontSize: 27, color: C.rd, fontWeight: '400', marginTop: -1 },
  addBtn: {
    paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.gd,
    backgroundColor: C.bH05, alignItems: 'center',
  },
  addBtnTxt: { fontSize: 20, fontWeight: '600', color: C.gd },

  // Auto-calculated date display
  autoDateBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(59,130,246,0.08)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
    borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10,
  },
  autoDateIcon: { fontSize: 16 },
  autoDateTxt: { fontSize: 20, fontWeight: '600', color: '#60a5fa' },
  autoDateHint: { fontSize: 14, color: C.dm, marginLeft: 4 },

  // Predecessor row
  predRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  predSelect: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.w03, borderWidth: 1, borderColor: C.w06,
    borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10,
  },
  predSelectOn: { borderColor: 'rgba(139,92,246,0.35)', backgroundColor: 'rgba(139,92,246,0.06)' },
  predIcon: { fontSize: 16 },
  predSelectTxt: { flex: 1, fontSize: 18, color: C.text },
  predChevron: { fontSize: 12, color: C.dm },
  predClearBtn: {
    width: 36, height: 36, borderRadius: 9, backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  predClearTxt: { fontSize: 21, color: C.rd },

  // FS / SS toggle
  relWrap: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: C.w08 },
  relBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.w03 },
  relBtnOn: { backgroundColor: C.bH },
  relBtnTxt: { fontSize: 15, fontWeight: '700', color: C.dm },
  relBtnTxtOn: { color: C.gd },

  // Lag
  lagWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  lagBtn: {
    width: 33, height: 33, borderRadius: 8, backgroundColor: C.inputBg,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.w06,
  },
  lagBtnTxt: { fontSize: 20, color: C.mt, fontWeight: '500' },
  lagInp: {
    width: 32, textAlign: 'center', fontSize: 18, fontWeight: '600', color: C.text,
    backgroundColor: C.w04, borderRadius: 4, paddingVertical: 3,
  },
  lagLabel: { fontSize: 14, color: C.dm, marginLeft: 2 },

  // Dropdown modal
  dropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  dropPopup: {
    backgroundColor: C.modalBg, borderRadius: 14, padding: 16, width: 320, maxHeight: 400,
    borderWidth: 1, borderColor: C.w08,
    boxShadow: '0px 10px 30px rgba(0,0,0,0.5)',
  },
  dropTitle: { fontSize: 21, fontWeight: '700', color: C.textBold, marginBottom: 12 },
  dropEmpty: { fontSize: 20, color: C.dm, textAlign: 'center', paddingVertical: 20 },
  dropItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, marginBottom: 4,
  },
  dropItemOn: { backgroundColor: 'rgba(139,92,246,0.12)' },
  dropDot: { width: 15, height: 15, borderRadius: 5 },
  dropItemTxt: { flex: 1, fontSize: 20, color: C.text },
  dropItemTxtOn: { color: '#a78bfa', fontWeight: '600' },
  dropItemDate: { fontSize: 15, color: C.dm },
  dropClear: {
    marginTop: 8, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.06)',
  },
  dropClearTxt: { fontSize: 18, fontWeight: '600', color: '#f87171' },

  // Mini calendar
  calWrap: { backgroundColor: C.mode === 'dark' ? 'rgba(15,25,35,0.5)' : '#ffffff' },
  calNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5,
    borderWidth: 1, borderColor: C.mode === 'light' ? 'rgba(0,0,0,0.12)' : C.w10, backgroundColor: C.mode === 'light' ? '#ffffff' : C.w03,
  },
  todayBtnTxt: { fontSize: 15, fontWeight: '600', color: C.mode === 'light' ? C.text : C.mt },
  arrowBtn: {
    width: 39, height: 39, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04, borderWidth: 1, borderColor: C.mode === 'light' ? 'rgba(0,0,0,0.10)' : C.w06,
  },
  arrowBtnTxt: { fontSize: 24, color: C.mode === 'light' ? C.text : C.mt, fontWeight: '300', marginTop: -1 },
  monthLabel: { fontSize: 20, fontWeight: '700', color: C.mode === 'light' ? C.text : C.textBold, minWidth: 120, textAlign: 'center' },

  dayHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(0,0,0,0.10)' : C.bd },
  dayHeaderCell: { flex: 1, paddingVertical: 6, alignItems: 'center', backgroundColor: C.mode === 'light' ? '#f5f0e8' : 'transparent' },
  dayHeaderTxt: { fontSize: 15, fontWeight: '600', color: C.dm, textTransform: 'uppercase' },

  weekRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(0,0,0,0.06)' : C.w03, position: 'relative' },
  dayCell: { flex: 1, paddingTop: 3, paddingLeft: 4, minHeight: 72, backgroundColor: C.mode === 'light' ? '#ffffff' : 'transparent' },
  dayCellBorder: { borderRightWidth: 1, borderRightColor: C.mode === 'light' ? 'rgba(0,0,0,0.06)' : C.w03 },
  weekendCell: { backgroundColor: C.mode === 'light' ? '#faf7f1' : C.w02 },
  dayNum: { width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  todayNum: { backgroundColor: C.gd },
  dayNumTxt: { fontSize: 15, color: C.text },

  taskBar: {
    position: 'absolute', height: 27, borderRadius: 6, paddingHorizontal: 5,
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 2,
  },
  taskBarTxt: { fontSize: 14, fontWeight: '600', color: '#ffffff', flex: 1 },

  // Template trigger
  templateTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
  },
  templateTriggerIcon: { fontSize: 20 },
  templateTriggerTxt: { fontSize: 18, fontWeight: '600', color: '#a78bfa' },

  // Template popup
  templatePopup: {
    backgroundColor: C.modalBg, borderRadius: 16, padding: 20, width: 380, maxHeight: 560,
    borderWidth: 1, borderColor: C.w08,
    boxShadow: '0px 10px 30px rgba(0,0,0,0.5)',
  },
  templatePopupTitle: { fontSize: 24, fontWeight: '700', color: C.textBold, marginBottom: 4 },
  templatePopupSub: { fontSize: 16, color: C.dm, marginBottom: 14 },
  templateCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 10, marginBottom: 6,
    backgroundColor: C.w02, borderWidth: 1, borderColor: C.inputBg,
  },
  templateCardOn: { backgroundColor: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.35)' },
  templateIcon: { fontSize: 33 },
  templateName: { fontSize: 20, fontWeight: '600', color: C.text },
  templateNameOn: { color: '#a78bfa' },
  templateDesc: { fontSize: 15, color: C.dm, marginTop: 2 },
  templateCheck: { fontSize: 24, color: '#a78bfa', fontWeight: '700' },
  templateDateRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.bd },
  templateActions: {
    flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end',
  },
  templateCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    backgroundColor: C.w04, borderWidth: 1, borderColor: C.w08,
  },
  templateCancelTxt: { fontSize: 18, fontWeight: '600', color: C.mt },
  templateApplyBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8,
    backgroundColor: C.gd,
  },
  templateApplyBtnOff: { opacity: 0.4 },
  templateApplyTxt: { fontSize: 18, fontWeight: '700', color: C.textBold },
  sectionLabel: {
    fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4, marginLeft: 2,
  },
  templateDeleteBtn: {
    width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  templateDeleteTxt: { fontSize: 18 },
});
