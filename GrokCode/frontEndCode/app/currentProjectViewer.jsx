import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Dimensions, Image, AppState,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AuthContext, ThemeContext, API_BASE } from './context';
import ScheduleCalendar from './scheduleCalendar';
import DatePicker from './datePicker';
import { calcEndDate as sbCalcEndDate, TEMPLATE_TRADES as _TRADES } from './scheduleBuilder';

const TEMPLATE_TRADES = _TRADES || [
  'Excavation', 'Concrete', 'Plumbing', 'Electrical', 'HVAC', 'Trim',
  'Doors', 'Sheetrock', 'Insulation', 'Gravel', 'Framing', 'Roofing',
  'Painting', 'Flooring', 'Cabinets', 'Countertops', 'Tile',
  'Landscaping', 'Waterproofing', 'Appliances', 'Windows', 'Siding',
  'Gutters', 'Fireplace', 'Cleaning', 'Inspections', 'General',
];

// ============================================================
// THEME & HELPERS
// ============================================================
const f$ = n => { const v = Number(n || 0); const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? '-$' + abs : '$' + abs; };
// Format phone for display: (###) ###-####
export const fPhone = (v) => {
  if (!v) return '';
  const digits = String(v).replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
};
// Mask phone input as user types
const maskPhone = (v) => fPhone(v);
const fD = d => {
  if (!d) return '--';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};
const sD = d => {
  if (!d) return '--';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
};

const ini = n => n?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';

// Calculate task progress from dates
export const calcTaskProgress = (item) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const start = item.start_date ? new Date(item.start_date + 'T00:00:00') : null;
  const end = item.end_date ? new Date(item.end_date + 'T00:00:00') : null;
  let pct = 0;
  let status = 'upcoming';
  if (start && end) {
    if (today < start) { pct = 0; status = 'upcoming'; }
    else if (today > end) { pct = 100; status = 'complete'; }
    else {
      let total = 0, elapsed = 0;
      let d = new Date(start);
      while (d <= end) {
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          total++;
          if (d <= today) elapsed++;
        }
        d.setDate(d.getDate() + 1);
      }
      pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
      status = 'in-progress';
    }
  }
  return { pct, status };
};

const SCREEN_W = Dimensions.get('window').width;

// ============================================================
// SHARED COMPONENTS
// ============================================================
const Lbl = ({ children }) => { const C = React.useContext(ThemeContext); const s = React.useMemo(() => getStyles(C), [C]); return <Text style={s.lbl}>{children}</Text>; };

const Card = ({ children, style: st, onPress }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  return (
  <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress} style={[s.card, st]}>
    {children}
  </TouchableOpacity>
  );
};

const Btn = ({ children, onPress, disabled, bg, style: st }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  return (
  <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
    style={[s.btn, bg && { backgroundColor: bg }, disabled && s.btnOff, st]}>
    {typeof children === 'string' ? <Text style={s.btnTxt}>{children}</Text> : children}
  </TouchableOpacity>
  );
};

const Badge = ({ status }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  const map = {
    approved: [C.gn, 'Approved'], pending_customer: [C.yl, 'Awaiting Customer'],
    pending_builder: [C.yl, 'Awaiting Builder'], confirmed: [C.gn, 'Confirmed'],
    pending: [C.yl, 'Pending'], rejected: [C.rd, 'Rejected'], expired: [C.rd, 'Expired'],
  };
  const [color, label] = map[status] || [C.dm, status || 'Unknown'];
  return (
    <View style={[s.badge, { backgroundColor: color + '18' }]}>
      <Text style={[s.badgeTxt, { color }]}>{label}</Text>
    </View>
  );
};

const Bar = ({ pct, color, h = 8 }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  return (
  <View style={[s.barBg, { height: h }]}>
    <View style={[s.barFill, { width: `${Math.min(pct || 0, 100)}%`, backgroundColor: color || C.gd, height: h }]} />
  </View>
  );
};

const Empty = ({ icon = '📋', text = 'Nothing here yet', sub }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  return (
  <View style={s.empty}>
    <Text style={{ fontSize: 60, marginBottom: 12 }}>{icon}</Text>
    <Text style={s.emptyTxt}>{text}</Text>
    {sub && <Text style={s.emptySub}>{sub}</Text>}
  </View>
  );
};

const Inp = ({ label, value, onChange, placeholder, type, rows, style: st }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  return (
  <View style={[{ marginBottom: 14 }, st]}>
    {label && <Lbl>{label}</Lbl>}
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={C.ph}
      keyboardType={type === 'number' ? 'numeric' : type === 'email' ? 'email-address' : 'default'}
      secureTextEntry={type === 'password'} multiline={!!rows} numberOfLines={rows}
      style={[s.inp, rows && { height: rows * 40, textAlignVertical: 'top' }]} />
  </View>
);
};

const ModalSheet = ({ visible, onClose, title, children }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  return (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={s.modalBg}>
        <View style={s.modalContent}>
          <View style={s.modalHead}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: C.mt, fontSize: 42 }}>×</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);
};

// ============================================================
// HOVERABLE TAB (web hover highlight)
// ============================================================
const HoverTab = ({ onPress, active, style, activeStyle, children }) => {
  const C = React.useContext(ThemeContext);
  const [hovered, setHovered] = React.useState(false);
  const hoverBg = C.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const webProps = Platform.OS === 'web' ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={[style, active && activeStyle, hovered && !active && { backgroundColor: hoverBg, borderRadius: 6 }]}
      {...webProps}>
      {children}
    </TouchableOpacity>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const CurrentProjectViewer = ({ embedded, project: projectProp, clientView, onClientViewToggle, activeTab, activeSub, onTabChange, onSubChange, onProjectUpdate, onProjectDeleted, scheduleVersion, onScheduleChange, syncRef, calYear, calMonth, onMonthChange, subdivisions = [] }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  const bl = React.useMemo(() => getBLStyles(C), [C]);
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = React.useContext(AuthContext);
  const project = projectProp || route?.params?.project;

  const isB = clientView ? false : user?.role === 'builder';
  const isC = clientView ? true  : user?.role === 'customer';
  const isCon = clientView ? false : user?.role === 'contractor';

  // Editable info fields (builder only)
  const INFO_DEFAULTS = {
    name: '', number: '', street_address: '', city: '', addr_state: '', zip_code: '',
    customer_phone: '', email: '',
    start_date: '', sqft: '', bedrooms: '', bathrooms: '',
    garage: '', garage_sqft: '', lot_size: '', stories: '', story_details: [], original_price: '0', reconciliation: '0',
    subdivision_id: null,
  };
  const [editInfo, setEditInfo] = useState(INFO_DEFAULTS);
  const [infoDirty, setInfoDirty] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);  const [showAddrState, setShowAddrState] = useState(false);
  const [showSubdivPicker, setShowSubdivPicker] = useState(false);

  // Go Live toggle
  const [goLive, setGoLive] = useState(false);
  useEffect(() => {
    if (project) setGoLive(!!project.go_live);
  }, [project?.id, project?.go_live]);

  // On Hold tracking
  const onHold = project?.on_hold || false;

  const toggleGoLive = async (val) => {
    if (!val) return; // Go Live is one-way, cannot be turned off
    // Confirm before going live
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Go Live?\n\nThis will:\n• Set the baseline from current task positions\n• Prevent tasks from being delayed or extended\n• Make the project visible to contractors and customers\n\nThis action cannot be undone.')
      : await new Promise(res => Alert.alert('Go Live?', 'This will set baselines, restrict task delays/extensions, and make the project visible to contractors/customers. This cannot be undone.',
          [{ text: 'Cancel', onPress: () => res(false) }, { text: 'Go Live', style: 'default', onPress: () => res(true) }]));
    if (!confirmed) return;

    setGoLive(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${project.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ go_live: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        onProjectUpdate?.(updated);
        // Re-fetch schedule to get the baselines that were just set
        const schRes = await fetch(`${API_BASE}/projects/${project.id}/schedule`);
        if (schRes.ok) {
          const schData = await schRes.json();
          if (Array.isArray(schData)) setSchedule(schData);
        }
      } else { setGoLive(false); }
    } catch (e) { console.warn('Toggle go_live error:', e); setGoLive(false); }
  };

  const setField = (key, val) => { setEditInfo(prev => ({ ...prev, [key]: val })); setInfoDirty(true); };

  useEffect(() => {
    if (project) {
      setEditInfo({
        name: project.name || '',
        number: project.number || '',
        street_address: project.street_address || '',
        city: project.city || '',
        addr_state: project.state || '',
        zip_code: project.zip_code || '',
        email: project.email || '',
        customer_phone: project.customer_phone || '',
        start_date: project.start_date || '',
        sqft: String(project.sqft || ''),
        bedrooms: String(project.bedrooms || ''),
        bathrooms: String(project.bathrooms || ''),
        garage: project.garage || '',
        garage_sqft: String(project.garage_sqft || ''),
        lot_size: project.lot_size || '',
        stories: String(project.stories || ''),
        story_details: Array.isArray(project.story_details) ? project.story_details : [],
        original_price: String(project.original_price || 0),
        reconciliation: String(project.reconciliation || 0),
        subdivision_id: project.subdivision_id || null,
      });
      setInfoDirty(false);
    }
  }, [project?.id]);

  // Alias for price summary compatibility
  const editContractPrice = editInfo.original_price;
  const editReconciliation = editInfo.reconciliation;

  const saveInfoFields = async () => {
    setInfoSaving(true);
    try {
      const body = {
        name: editInfo.name.trim(),
        street_address: editInfo.street_address.trim(),
        city: editInfo.city.trim(),
        state: editInfo.addr_state,
        zip_code: editInfo.zip_code.trim(),
        email: editInfo.email.trim(),
        customer_phone: editInfo.customer_phone.trim(),
        start_date: editInfo.start_date,
        est_completion: (() => {
          if (!editInfo.start_date) return '';
          const d = new Date(editInfo.start_date + 'T00:00:00');
          if (isNaN(d.getTime())) return '';
          d.setFullYear(d.getFullYear() + 1);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        })(),
        sqft: parseInt(editInfo.sqft) || 0,
        bedrooms: parseInt(editInfo.bedrooms) || 0,
        bathrooms: parseInt(editInfo.bathrooms) || 0,
        garage: editInfo.garage.trim(),
        garage_sqft: parseInt(editInfo.garage_sqft) || 0,
        lot_size: editInfo.lot_size.trim(),
        stories: parseInt(editInfo.stories) || 0,
        story_details: editInfo.story_details || [],
        original_price: parseFloat(editInfo.original_price) || 0,
        reconciliation: parseFloat(editInfo.reconciliation) || 0,
        subdivision_id: editInfo.subdivision_id || null,
      };
      const res = await fetch(`${API_BASE}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (onProjectUpdate) onProjectUpdate(body);
        setInfoDirty(false);
        Alert.alert('Saved', 'Project updated successfully');
      }
    } catch (e) { Alert.alert('Error', 'Failed to save'); }
    setInfoSaving(false);
  };

  // Tabs — use lifted state if provided, otherwise local
  const defaultTab = 'schedule';
  const [localTab, setLocalTab] = useState(activeTab || defaultTab);
  const [localSub, setLocalSub] = useState(activeSub || 'calendar');
  const tab = activeTab !== undefined ? activeTab : localTab;
  const _sub = activeSub !== undefined ? activeSub : localSub;
  const sub = _sub === 'list' ? 'calendar' : _sub;
  const setTab = (v) => { if (onTabChange) onTabChange(v); else setLocalTab(v); };
  const setSub = (v) => { if (onSubChange) onSubChange(v); else setLocalSub(v); };
  const [modal, setModal] = useState(null);

  // Data stores
  const [schedule, setSchedule] = useState([]);
  // Schedule views are now sub-tabs (calendar, list, baseline)
  const [prefillDate, setPrefillDate] = useState('');
  const [listEditTask, setListEditTask] = useState(null);
  const [listContractor, setListContractor] = useState('');
  const [subsList, setSubsList] = useState([]);
  const [subsSearch, setSubsSearch] = useState('');
  const [taskInfoEdit, setTaskInfoEdit] = useState(null); // {id, task, trade, workdays, predecessor_id, rel_type, lag_days}
  const [predDropOpen, setPredDropOpen] = useState(false);
  const [tradeDropOpen, setTradeDropOpen] = useState(false);
  const [tradeFilter, setTradeFilter] = useState([]); // active trade filters for list view
  const [showTradeFilter, setShowTradeFilter] = useState(false);
  const lastTapRef = useRef({}); // { taskId: timestamp } for double-tap detection
  const [changeOrders, setChangeOrders] = useState([]);
  const [selections, setSelections] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [docTemplates, setDocTemplates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exemptions, setExemptions] = useState([]);
  const [newExDate, setNewExDate] = useState('');
  const [newExDesc, setNewExDesc] = useState('');

  // API helper
  const api = useCallback(async (path, opts = {}) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) throw new Error('Request failed');
      return await res.json();
    } catch (e) {
      console.warn('API error:', path, e.message);
      return null;
    }
  }, []);

  // Clear data stores when project changes (no remount since key removed)
  const projectId = project?.id;
  useEffect(() => {
    setSchedule([]);
    setChangeOrders([]);
    setSelections([]);
    setDocuments([]);
    setPhotos([]);
    setVideos([]);
    setListEditTask(null);
  }, [projectId]);

  // Update schedule tasks (supports single or batch from cascading drag)
  const updateScheduleTask = useCallback(async (updatesOrId, singleUpdates) => {
    // New format: array of {id, start_date, end_date, lag_days?} from cascading drag
    if (Array.isArray(updatesOrId)) {
      const batch = updatesOrId;
      // Optimistic update
      setSchedule(prev => prev.map(t => {
        const u = batch.find(b => b.id === t.id);
        if (!u) return t;
        const updated = { ...t, start_date: u.start_date, end_date: u.end_date };
        if (u.lag_days !== undefined) updated.lag_days = u.lag_days;
        return updated;
      }));
      const result = await api('/schedule/batch-update', { method: 'PUT', body: batch });
      if (!result) {
        api(`/projects/${project.id}/schedule`).then(d => d && setSchedule(d));
      }
    } else {
      // Legacy single-task format
      const taskId = updatesOrId;
      setSchedule(prev => prev.map(t => t.id === taskId ? { ...t, ...singleUpdates } : t));
      const result = await api(`/schedule/${taskId}`, { method: 'PUT', body: singleUpdates });
      if (!result) {
        api(`/projects/${project.id}/schedule`).then(d => d && setSchedule(d));
      }
    }
    onScheduleChange?.();
  }, [project?.id, onScheduleChange]);

  // Edit a schedule task with reason (creates audit log, server cascades dependents)
  const editScheduleTask = useCallback(async (taskId, updates, reason) => {
    const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
    const body = { ...updates, reason, edited_by: editedBy };
    const result = await api(`/schedule/${taskId}/edit`, { method: 'PUT', body });
    if (result && Array.isArray(result)) {
      // Server returns full cascaded schedule
      setSchedule(result);
    } else if (result) {
      // Fallback: re-fetch
      const fresh = await api(`/projects/${project.id}/schedule`);
      if (fresh) setSchedule(fresh);
    }
    onScheduleChange?.();
    return result;
  }, [project?.id, onScheduleChange, user]);

  const deleteScheduleTask = useCallback(async (taskId, mode) => {
    const url = mode === 'chain' ? `/schedule/${taskId}/chain` : `/schedule/${taskId}`;
    const result = await api(url, { method: 'DELETE' });
    if (result) {
      const deleted = new Set(result.deleted || []);
      setSchedule(prev => prev.filter(t => !deleted.has(t.id)));
      // Unlink successors for single delete
      if (result.unlinked && result.unlinked.length > 0) {
        setSchedule(prev => prev.map(t =>
          result.unlinked.includes(t.id)
            ? { ...t, predecessor_id: null, rel_type: 'FS', lag_days: 0 }
            : t
        ));
      }
    }
    onScheduleChange?.();
  }, [project?.id, onScheduleChange]);

  // Tab config — role-based like buildersync
  const scheduleSubs = goLive ? ['calendar', 'baseline', 'progress'] : ['calendar', 'progress'];
  const tabs = isB
    ? [
        { id: 'schedule', label: 'Schedule', subs: scheduleSubs },
        { id: 'info', label: 'Info', subs: ['jobinfo', 'price'] },
        { id: 'changeorders', label: 'Change Orders' },
        { id: 'selections', label: 'Selections' },
        { id: 'docs', label: 'Docs', subs: ['documents', 'photos', 'videos'] },
      ]
    : isC
    ? [
        { id: 'schedule', label: 'Schedule', subs: ['calendar'] },
        { id: 'info', label: 'Info', subs: ['price'] },
        { id: 'changeorders', label: 'Change Orders' },
        { id: 'selections', label: 'Selections' },
        { id: 'docs', label: 'Photos', subs: ['photos'] },
      ]
    : isCon
    ? [
        { id: 'schedule', label: 'Schedule', subs: ['calendar'] },
        { id: 'info', label: 'Info', subs: ['jobinfo'] },
      ]
    : [
        { id: 'schedule', label: 'Schedule', subs: ['calendar'] },
        { id: 'info', label: 'Info', subs: ['jobinfo'] },
        { id: 'docs', label: 'Docs', subs: ['documents', 'photos'] },
      ];

  const subLabels = {
    jobinfo: 'Job Info', price: 'Job Price Summary',
    calendar: 'Calendar', baseline: 'Baseline', progress: 'Job Progress',
    changeorders: 'Change Orders', selections: 'Selections',
    documents: 'Documents', photos: 'Photos', videos: 'Videos',
  };

  // Calendar sub-view: Gantt vs List
  const [calView, setCalView] = useState(activeSub === 'list' ? 'list' : 'gantt');

  // Handle external navigation to list view (activeSub='list' → sub='calendar' + calView='list')
  useEffect(() => {
    if (activeSub === 'list') {
      setCalView('list');
      if (onSubChange) onSubChange('calendar');
    }
  }, [activeSub]);

  const viewToggle = ['gantt', 'taskfirst', 'list'].map(v => (
    <TouchableOpacity key={v} onPress={() => setCalView(v)}
      style={[s.schedViewBtn, calView === v && s.schedViewBtnOn]} activeOpacity={0.7}>
      <Text style={[s.schedViewBtnTxt, calView === v && s.schedViewBtnTxtOn]}>{v === 'gantt' ? 'Gantt' : v === 'taskfirst' ? 'Task First' : 'List'}</Text>
    </TouchableOpacity>
  ));

  const curTab = tabs.find(t => t.id === tab);

  const switchTab = (t) => {
    setTab(t.id);
    setSub(t.subs?.[0] || null);
  };

  // Load schedule once when project loads
  useEffect(() => {
    if (!project) return;
    api(`/projects/${project.id}/schedule`).then(d => d && setSchedule(d));
  }, [project?.id]);

  // Load other data when tab/sub changes
  useEffect(() => {
    if (!project) return;
    const pid = project.id;

    if ((tab === 'info' && sub === 'price') || (tab === 'schedule' && sub === 'progress')) {
      api(`/projects/${pid}/change-orders`).then(d => d && setChangeOrders(d));
      api(`/projects/${pid}/selections`).then(d => d && setSelections(d));
    }
    if (tab === 'changeorders') {
      api(`/projects/${pid}/change-orders`).then(d => d && setChangeOrders(d));
    }
    if (tab === 'selections') {
      api(`/projects/${pid}/selections`).then(d => d && setSelections(d));
    }
    if (tab === 'docs') {
      if (sub === 'documents') {
        api(`/projects/${pid}/documents?type=document`).then(d => d && setDocuments(d));
        api(`/document-templates?scope=projects`).then(d => d && setDocTemplates(d));
      }
      if (sub === 'photos') api(`/projects/${pid}/documents?type=photo`).then(d => d && setPhotos(d));
      if (sub === 'videos') api(`/projects/${pid}/documents?type=video`).then(d => d && setVideos(d));
    }
  }, [tab, sub, project]);

  // Re-fetch schedule when sub calendar makes changes (scheduleVersion bumps)
  const schedVerRef = React.useRef(scheduleVersion);
  useEffect(() => {
    if (scheduleVersion === schedVerRef.current) { schedVerRef.current = scheduleVersion; return; }
    schedVerRef.current = scheduleVersion;
    if (project) {
      api(`/projects/${project.id}/schedule`).then(d => d && setSchedule(d));
    }
  }, [scheduleVersion, project]);

  // ============================================================
  // AUTOSAVE SYSTEM — syncs progress, phase, status to backend
  // Triggers: 5-min interval, AppState background, beforeunload, schedule changes, sign-out
  // ============================================================
  const scheduleRef = useRef(schedule);
  const projectRef = useRef(project);
  const onProjectUpdateRef = useRef(onProjectUpdate);
  scheduleRef.current = schedule;
  projectRef.current = project;
  onProjectUpdateRef.current = onProjectUpdate;

  const syncProjectData = useCallback(async () => {
    const sched = scheduleRef.current;
    const proj = projectRef.current;
    if (!proj || sched.length === 0) return;

    const overallPct = Math.round(sched.reduce((sum, t) => sum + calcTaskProgress(t).pct, 0) / sched.length);
    const allDone = sched.every(t => calcTaskProgress(t).pct >= 100);
    const phase = allDone ? 'Closed' : 'Open';
    const today = new Date(); today.setHours(0,0,0,0);
    const inProgress = sched.find(t => {
      const s2 = t.start_date ? new Date(t.start_date + 'T00:00:00') : null;
      const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : null;
      return s2 && e && s2 <= today && today <= e;
    });
    const completed = sched.filter(t => {
      const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : null;
      return e && e < today;
    });
    const lastCompleted = completed.length > 0 ? completed.sort((a, b) => (a.end_date > b.end_date ? 1 : -1))[completed.length - 1] : null;
    const currentTask = inProgress || lastCompleted;
    const status = currentTask ? (currentTask.task || currentTask.name || 'Untitled') : 'Not started';

    // Compute start_date and est_completion from schedule
    const starts = sched.filter(t => t.start_date).map(t => t.start_date).sort();
    const ends = sched.filter(t => t.end_date).map(t => t.end_date).sort();
    const schedStart = starts.length > 0 ? starts[0] : '';
    const schedEnd = ends.length > 0 ? ends[ends.length - 1] : '';
    // est_completion = 1 year from start
    let estCompletion = '';
    if (schedStart) {
      const d = new Date(schedStart + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 1);
        estCompletion = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
    }

    try {
      await fetch(`${API_BASE}/projects/${proj.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: overallPct, phase, status, start_date: schedStart, est_completion: estCompletion }),
      });
      if (onProjectUpdateRef.current) {
        onProjectUpdateRef.current({ ...proj, progress: overallPct, phase, status, start_date: schedStart, est_completion: estCompletion });
      }
    } catch (e) { /* silent */ }
  }, []);

  // Expose sync function to parent via ref
  useEffect(() => {
    if (syncRef) syncRef.current = syncProjectData;
    return () => { if (syncRef) syncRef.current = null; };
  }, [syncProjectData, syncRef]);

  // 5-minute interval autosave
  useEffect(() => {
    const interval = setInterval(syncProjectData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncProjectData]);

  // Debounced sync on schedule changes (3 second debounce)
  const debounceRef = useRef(null);
  useEffect(() => {
    if (schedule.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(syncProjectData, 3000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [schedule, syncProjectData]);

  // AppState listener — sync when app goes to background
  useEffect(() => {
    const handleAppState = (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        syncProjectData();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub?.remove();
  }, [syncProjectData]);

  // Web: beforeunload — sync when browser/tab closes
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleBeforeUnload = () => { syncProjectData(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncProjectData]);

  // Sign change order
  const signCO = async (coId, role) => {
    try {
      const res = await fetch(`${API_BASE}/change-orders/${coId}/sign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Cannot Sign', data.error || 'Request failed');
        if (data.co) setChangeOrders(prev => prev.map(c => c.id === coId ? data.co : c));
        setModal(null);
        return;
      }
      setChangeOrders(prev => prev.map(c => c.id === coId ? data : c));
      Alert.alert('Success', 'Change order signed!');
      setModal(null);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to sign change order');
    }
  };

  // ============================================================
  // FALLBACK
  // ============================================================
  if (!project) {
    return (
      <View style={[s.center, { backgroundColor: C.bg }]}>
        <Empty text="No project selected" />
        {navigation && !embedded && (
          <Btn onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
            <Text style={s.btnTxt}>← Back to Projects</Text>
          </Btn>
        )}
      </View>
    );
  }

  // ============================================================
  // TAB CONTENT
  // ============================================================
  const renderContent = () => {
    // --- INFO: JOB INFO ---
    if (tab === 'info' && sub === 'jobinfo') {
      const GARAGE_OPTIONS = ['2-car', '3-car', '4-car'];

      const infoField = (label, field, keyboard, placeholder) => {
        const isPhone = keyboard === 'phone-pad';
        const displayVal = isPhone ? fPhone(editInfo[field]) : editInfo[field];
        return (
        <View style={{ marginBottom: 14 }}>
          <Text style={s.infoLbl}>{label}</Text>
          {isB ? (
            <TextInput
              value={isPhone ? fPhone(editInfo[field]) : editInfo[field]}
              onChangeText={v => setField(field, isPhone ? v.replace(/\D/g, '').slice(0, 10) : v)}
              keyboardType={keyboard || 'default'}
              style={{ fontSize: 22, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }}
              placeholder={placeholder || '—'}
              placeholderTextColor={C.ph}
            />
          ) : (
            <Text style={s.infoVal}>{displayVal || '—'}</Text>
          )}
        </View>
        );
      };

      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={s.avatar}><Text style={s.avatarTxt}>{ini(editInfo.name || project.name)}</Text></View>
            {isB ? (
              <TextInput
                value={editInfo.name}
                onChangeText={v => setField('name', v)}
                style={{ fontSize: 30, fontWeight: '700', color: C.text, textAlign: 'center', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 8, width: '100%', marginBottom: 6 }}
                placeholder="Project Name"
                placeholderTextColor={C.ph}
              />
            ) : (
              <Text style={s.projName}>{editInfo.name || project.name}</Text>
            )}
            {(() => {
              const addr = [editInfo.street_address, editInfo.city].filter(Boolean).join(', ');
              const suffix = [editInfo.addr_state, editInfo.zip_code].filter(Boolean).join(' ');
              const full = addr + (suffix ? ' ' + suffix : '');
              return full ? <Text style={s.projAddr}>{full}</Text> : null;
            })()}
            {(() => {
              let isClosed, taskLabel;
              if (schedule.length > 0) {
                const allDone = schedule.every(t => calcTaskProgress(t).pct >= 100);
                isClosed = allDone;
                const today = new Date(); today.setHours(0,0,0,0);
                const inProgress = schedule.find(t => {
                  const s = t.start_date ? new Date(t.start_date + 'T00:00:00') : null;
                  const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : null;
                  return s && e && s <= today && today <= e;
                });
                const completed = schedule.filter(t => {
                  const e = t.end_date ? new Date(t.end_date + 'T00:00:00') : null;
                  return e && e < today;
                });
                const lastCompleted = completed.length > 0 ? completed.sort((a, b) => (a.end_date > b.end_date ? 1 : -1))[completed.length - 1] : null;
                const currentTask = inProgress || lastCompleted;
                taskLabel = currentTask ? (currentTask.task || currentTask.name || 'Untitled') : 'Not started';
              } else {
                // Fallback to saved project values
                isClosed = (project.phase || '').toLowerCase() === 'closed';
                taskLabel = project.status || 'No tasks';
              }
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, gap: 8, marginTop: 12, backgroundColor: isClosed ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isClosed ? '#ef4444' : C.gn }} />
                  <Text style={{ fontSize: 20, fontWeight: '600', color: isClosed ? '#ef4444' : C.gnB }}>{isClosed ? 'Closed' : 'Open'} - {taskLabel}</Text>
                </View>
              );
            })()}
          </View>

          {(() => {
            const overallPct = schedule.length > 0
              ? Math.round(schedule.reduce((sum, t) => sum + calcTaskProgress(t).pct, 0) / schedule.length)
              : (project.progress || 0);
            return (
              <Card>
                <Lbl>OVERALL PROGRESS</Lbl>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Bar pct={overallPct} h={10} />
                  <Text style={{ fontSize: 24, fontWeight: '700', color: C.gd, minWidth: 44, textAlign: 'right' }}>{overallPct}%</Text>
                </View>
              </Card>
            );
          })()}

          {/* Contract Price Card */}
          <Card style={{ marginBottom: 14 }}>
            <Lbl>CONTRACT PRICE</Lbl>
            {isB ? (
              <TextInput
                value={editInfo.original_price}
                onChangeText={v => setField('original_price', v)}
                keyboardType="numeric"
                style={{ fontSize: 30, fontWeight: '700', color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, marginBottom: 12 }}
                placeholder="0"
                placeholderTextColor={C.ph}
              />
            ) : (
              <Text style={{ fontSize: 30, fontWeight: '700', color: C.text, marginBottom: 12 }}>{f$(parseFloat(editInfo.original_price) || 0)}</Text>
            )}

            <Lbl>RECONCILIATION AFTER DRAFTING</Lbl>
            {isB ? (
              <TextInput
                value={editInfo.reconciliation}
                onChangeText={v => setField('reconciliation', v)}
                keyboardType="numeric"
                style={{ fontSize: 30, fontWeight: '700', color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, marginBottom: 12 }}
                placeholder="0"
                placeholderTextColor={C.ph}
              />
            ) : (
              <Text style={{ fontSize: 30, fontWeight: '700', color: C.text, marginBottom: 12 }}>{f$(parseFloat(editInfo.reconciliation) || 0)}</Text>
            )}

            <View style={{ borderTopWidth: 1, borderTopColor: C.w10, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 21, fontWeight: '700', color: C.mt }}>Contract Total</Text>
              <Text style={{ fontSize: 30, fontWeight: '700', color: C.gd }}>{f$((parseFloat(editInfo.original_price) || 0) + (parseFloat(editInfo.reconciliation) || 0))}</Text>
            </View>
          </Card>

          {/* Project Details Card */}
          <Card>
            <Text style={s.cardTitle}>Project Details</Text>

            {/* Subdivision */}
            {subdivisions.length > 0 && (
              <View style={{ marginBottom: 14, zIndex: 20 }}>
                <Text style={s.infoLbl}>SUBDIVISION</Text>
                {isB ? (
                  <>
                    <TouchableOpacity onPress={() => setShowSubdivPicker(p => !p)}
                      style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, color: editInfo.subdivision_id ? C.text : C.ph }}>
                        {editInfo.subdivision_id ? (subdivisions.find(sd => sd.id === editInfo.subdivision_id)?.name || 'Unknown') : 'None'}
                      </Text>
                      <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                    </TouchableOpacity>
                    {showSubdivPicker && (
                      <Modal visible transparent animationType="fade">
                        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowSubdivPicker(false)}>
                          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                            <View style={{ width: 280, maxHeight: 350, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w10, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } : { elevation: 20 }) }}>
                              <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                                <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>Subdivision</Text>
                              </View>
                              <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                <TouchableOpacity onPress={() => { setField('subdivision_id', null); setShowSubdivPicker(false); }}
                                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: !editInfo.subdivision_id ? C.gd + '22' : 'transparent' }}>
                                  <Text style={{ fontSize: 21, color: !editInfo.subdivision_id ? C.gd : C.text }}>None</Text>
                                </TouchableOpacity>
                                {subdivisions.map(sd => (
                                  <TouchableOpacity key={sd.id} onPress={() => { setField('subdivision_id', sd.id); setShowSubdivPicker(false); }}
                                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: editInfo.subdivision_id === sd.id ? C.gd + '22' : 'transparent' }}>
                                    <Text style={{ fontSize: 21, color: editInfo.subdivision_id === sd.id ? C.gd : C.text }}>📁 {sd.name}</Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            </View>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    )}
                  </>
                ) : (
                  <Text style={s.infoVal}>{editInfo.subdivision_id ? (subdivisions.find(sd => sd.id === editInfo.subdivision_id)?.name || '—') : '—'}</Text>
                )}
              </View>
            )}

            <View style={{ marginBottom: 14 }}>
              <Text style={s.infoLbl}>PROJECT NUMBER</Text>
              <Text style={s.infoVal}>{editInfo.number || '—'}</Text>
            </View>
            {infoField("PHONE", "customer_phone", "phone-pad", "(208) 555-1234")}
            {infoField("EMAIL", "email", "email-address", "client@email.com")}
            {infoField("STREET ADDRESS", "street_address", undefined, "1245 Oakwood Dr")}
            <View style={{ flexDirection: 'row', gap: 12, zIndex: 10 }}>
              <View style={{ flex: 2 }}>{infoField("CITY", "city", undefined, "Eagle")}</View>
              <View style={{ flex: 1, marginBottom: 14 }}>
                <Text style={s.infoLbl}>STATE</Text>
                {isB ? (
                  <>
                    <TouchableOpacity onPress={() => setShowAddrState(p => !p)}
                      style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, color: editInfo.addr_state ? C.text : C.ph }}>{editInfo.addr_state || 'ST'}</Text>
                      <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                    </TouchableOpacity>
                    <Modal visible={showAddrState} transparent animationType="fade">
                      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowAddrState(false)}>
                        <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                          <View style={{ width: 220, maxHeight: 350, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w10, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } : { elevation: 20 }) }}>
                            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                              <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>Select State</Text>
                            </View>
                            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                              {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
                                'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
                                'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s2 => (
                                <TouchableOpacity key={s2} onPress={() => { setField('addr_state', s2); setShowAddrState(false); }}
                                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: editInfo.addr_state === s2 ? C.gd + '22' : 'transparent' }}>
                                  <Text style={{ fontSize: 21, color: editInfo.addr_state === s2 ? C.gd : C.text }}>{s2}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </Modal>
                  </>
                ) : (
                  <Text style={s.infoVal}>{editInfo.addr_state || '—'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>{infoField("ZIP", "zip_code", "numeric", "83616")}</View>
            </View>
            <View style={s.divider} />

            <View style={{ marginBottom: 14 }}>
              <Text style={s.infoLbl}>CONTRACT DATE</Text>
              <Text style={s.infoVal}>{project.date ? (() => {
                try { return new Date(project.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
                catch { return '--'; }
              })() : '--'}</Text>
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={s.infoLbl}>START DATE</Text>
              <Text style={s.infoVal}>{fD(editInfo.start_date) || '—'}</Text>
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={s.infoLbl}>ESTIMATED COMPLETION</Text>
              <Text style={s.infoVal}>{(() => {
                if (!editInfo.start_date) return '—';
                try {
                  const d = new Date(editInfo.start_date + 'T00:00:00');
                  if (isNaN(d.getTime())) return '—';
                  d.setFullYear(d.getFullYear() + 1);
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                } catch { return '—'; }
              })()}</Text>
              {editInfo.start_date ? (
                <Text style={{ fontSize: 13, color: C.dm, fontStyle: 'italic', marginTop: 2 }}>1 year from start date</Text>
              ) : null}
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={s.infoLbl}>CURRENT COMPLETION</Text>
              <Text style={s.infoVal}>{(() => {
                const ends = schedule.filter(t => t.end_date).map(t => t.end_date).sort();
                if (ends.length === 0) return '—';
                return fD(ends[ends.length - 1]);
              })()}</Text>
              <Text style={{ fontSize: 13, color: C.dm, fontStyle: 'italic', marginTop: 2 }}>Based on last scheduled task</Text>
            </View>
            <View style={s.divider} />

            <Text style={s.cardTitle}>House Specs</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>{infoField("TOTAL SQUARE FT", "sqft", "numeric", "0")}</View>
              <View style={{ flex: 1 }}>
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.infoLbl}>STORIES</Text>
                  {isB ? (
                    <TextInput
                      value={editInfo.stories}
                      onChangeText={v => {
                        const num = parseInt(v) || 0;
                        const prev = editInfo.story_details || [];
                        const details = [...prev];
                        while (details.length < num) details.push({ title: '', sqft: '' });
                        if (details.length > num) details.length = num;
                        setEditInfo(p => ({ ...p, stories: v, story_details: details }));
                        setInfoDirty(true);
                      }}
                      keyboardType="numeric"
                      style={{ fontSize: 22, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }}
                      placeholder="0"
                      placeholderTextColor={C.ph}
                    />
                  ) : (
                    <Text style={s.infoVal}>{editInfo.stories || '—'}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Per-story breakdown */}
            {(() => {
              const numStories = parseInt(editInfo.stories) || 0;
              if (numStories < 1) return null;
              const STORY_TITLES = ['Main Level', '2nd Story', 'Basement'];
              const details = editInfo.story_details || [];
              const totalSqft = parseInt(editInfo.sqft) || 0;
              const garageSqft = parseInt(editInfo.garage_sqft) || 0;
              const storySqft = details.reduce((sum, d) => sum + (parseInt(d.sqft) || 0), 0);
              const usedSqft = storySqft + garageSqft;
              const remaining = totalSqft - usedSqft;

              return (
                <View style={{ marginBottom: 14, gap: 8 }}>
                  {details.map((story, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                      <View style={{ flex: 2 }}>
                        <Text style={[s.infoLbl, { marginBottom: 4 }]}>STORY {i + 1}</Text>
                        {isB ? (
                          <View>
                            <TouchableOpacity
                              onPress={() => {
                                const updated = [...details];
                                updated[i] = { ...updated[i], _showPicker: !updated[i]._showPicker };
                                setField('story_details', updated);
                              }}
                              style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 20, color: story.title ? C.text : C.ph }}>{story.title || 'Select level'}</Text>
                              <Text style={{ fontSize: 15, color: C.dm }}>▾</Text>
                            </TouchableOpacity>
                            {story._showPicker && (
                              <View style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
                                {STORY_TITLES.map(t => (
                                  <TouchableOpacity key={t} onPress={() => {
                                    const updated = [...details];
                                    updated[i] = { title: t, sqft: updated[i].sqft };
                                    setField('story_details', updated);
                                  }}
                                    style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: story.title === t ? C.gd + '22' : 'transparent' }}>
                                    <Text style={{ fontSize: 18, color: story.title === t ? C.gd : C.text }}>{t}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={s.infoVal}>{story.title || '—'}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.infoLbl, { marginBottom: 4 }]}>SQ FT</Text>
                        {isB ? (
                          <TextInput
                            value={String(story.sqft || '')}
                            onChangeText={v => {
                              const val = parseInt(v) || 0;
                              const otherStories = details.reduce((sum, d, j) => j === i ? sum : sum + (parseInt(d.sqft) || 0), 0);
                              const garageUsed = parseInt(editInfo.garage_sqft) || 0;
                              if (val + otherStories + garageUsed > totalSqft && totalSqft > 0) return;
                              const updated = [...details];
                              updated[i] = { title: updated[i].title, sqft: v };
                              setField('story_details', updated);
                            }}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={C.ph}
                            style={{ fontSize: 22, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }}
                          />
                        ) : (
                          <Text style={s.infoVal}>{story.sqft || '—'}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                  {totalSqft > 0 && (
                    <Text style={{ fontSize: 13, color: remaining < 0 ? '#ef4444' : C.dm, fontStyle: 'italic', marginTop: 2 }}>
                      {remaining === 0 ? 'All square footage allocated' : `${remaining.toLocaleString()} sq ft remaining (incl. garage)`}
                    </Text>
                  )}
                </View>
              );
            })()}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>{infoField("BEDROOMS", "bedrooms", "numeric", "0")}</View>
              <View style={{ flex: 1 }}>{infoField("BATHROOMS", "bathrooms", "numeric", "0")}</View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.infoLbl}>GARAGE</Text>
                  {isB ? (
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                      {GARAGE_OPTIONS.map(opt => {
                        const on = editInfo.garage === opt;
                        return (
                          <TouchableOpacity key={opt} onPress={() => setField('garage', on ? '' : opt)}
                            style={{ paddingHorizontal: 8, paddingVertical: 14, borderRadius: 6, borderWidth: 1, borderColor: on ? C.gd : C.w10, backgroundColor: on ? C.gd + '22' : 'transparent', flex: 1, alignItems: 'center', justifyContent: 'center' }}
                            activeOpacity={0.7}>
                            <Text style={{ fontSize: 16, color: on ? C.gd : C.mt, fontWeight: on ? '600' : '400' }}>{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={s.infoVal}>{editInfo.garage || '—'}</Text>
                  )}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.infoLbl}>GARAGE SQ FT</Text>
                  {isB ? (
                    <TextInput
                      value={editInfo.garage_sqft}
                      onChangeText={v => {
                        const val = parseInt(v) || 0;
                        const totalSqft = parseInt(editInfo.sqft) || 0;
                        const storySqft = (editInfo.story_details || []).reduce((sum, d) => sum + (parseInt(d.sqft) || 0), 0);
                        if (val + storySqft > totalSqft && totalSqft > 0) return;
                        setField('garage_sqft', v);
                      }}
                      keyboardType="numeric"
                      style={{ fontSize: 22, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }}
                      placeholder="0"
                      placeholderTextColor={C.ph}
                    />
                  ) : (
                    <Text style={s.infoVal}>{editInfo.garage_sqft || '—'}</Text>
                  )}
                </View>
              </View>
            </View>
            {infoField("LOT SIZE", "lot_size", undefined, "e.g., 0.45 acres")}
          </Card>

          {isB && infoDirty && (
            <TouchableOpacity onPress={saveInfoFields} disabled={infoSaving}
              style={{ backgroundColor: C.gd, paddingVertical: 14, borderRadius: 10, marginTop: 8, alignItems: 'center', opacity: infoSaving ? 0.6 : 1 }}
              activeOpacity={0.8}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>{infoSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      );
    }

    // --- INFO: PRICE SUMMARY ---
    if (tab === 'info' && sub === 'price') {
      const approved = changeOrders.filter(c => c.status === 'approved');
      const pending = changeOrders.filter(c => c.status !== 'approved');
      const coTotal = approved.reduce((sum, c) => sum + c.amount, 0);
      const origPrice = parseFloat(editContractPrice) || 0;
      const reconciliation = parseFloat(editReconciliation) || 0;
      const baseContract = origPrice + reconciliation;

      // Confirmed selections with upgrade prices
      const confirmedSels = selections.filter(sl => sl.status === 'confirmed' && sl.selected);
      const selectionLines = confirmedSels.map(sel => {
        const opt = (sel.options || []).find(o => (typeof o === 'object' ? o.name : o) === sel.selected);
        const isObj = typeof opt === 'object';
        const price = isObj ? (opt.comes_standard ? 0 : (opt.price || 0)) : 0;
        return { item: sel.item, selected: sel.selected, price };
      });
      const selectionTotal = selectionLines.reduce((sum, l) => sum + l.price, 0);
      const grandTotal = baseContract + coTotal + selectionTotal;

      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
          <Text style={s.sectionTitle}>Job Price Summary</Text>
          <Text style={{ color: C.mt, fontSize: 21, marginBottom: 20 }}>{project.name}</Text>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={s.priceRow}>
              <Text style={[s.priceLbl, { fontWeight: '600' }]}>Contract Price</Text>
              <Text style={s.priceAmt}>{f$(origPrice)}</Text>
            </View>

            {reconciliation !== 0 && (
              <View style={s.priceRow}>
                <Text style={s.priceLbl}>Reconciliation After Drafting</Text>
                <Text style={[s.priceAmt, { color: reconciliation > 0 ? C.yl : C.gn }]}>
                  {reconciliation > 0 ? `+${f$(reconciliation)}` : f$(reconciliation)}
                </Text>
              </View>
            )}

            {reconciliation !== 0 && (
              <View style={[s.priceRow, { borderTopWidth: 2, borderTopColor: C.gd + '40' }]}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: C.text }}>Base Contract</Text>
                <Text style={{ fontSize: 30, fontWeight: '700', color: C.gd }}>{f$(baseContract)}</Text>
              </View>
            )}
          </Card>

          {/* Change Orders section */}
          <Card style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
            <View style={[s.priceRow, { backgroundColor: C.bH05 }]}>
              <Text style={[s.lbl, { color: C.gd, marginBottom: 0 }]}>CHANGE ORDERS</Text>
            </View>
            {approved.length === 0 ? (
              <View style={[s.priceRow, { justifyContent: 'center' }]}>
                <Text style={{ fontSize: 20, color: C.dm, fontStyle: 'italic' }}>No approved change orders yet</Text>
              </View>
            ) : (
              approved.map(co => (
                <View key={co.id} style={s.priceRow}>
                  <Text style={[s.priceLbl, { flex: 1 }]} numberOfLines={1}>{co.title}</Text>
                  <Text style={[s.priceAmt, { color: co.amount >= 0 ? C.yl : C.gn }]}>
                    {co.amount >= 0 ? `+${f$(co.amount)}` : f$(co.amount)}
                  </Text>
                </View>
              ))
            )}
            <View style={[s.priceRow, { borderTopWidth: 1, borderTopColor: C.w10 }]}>
              <Text style={{ fontSize: 21, fontWeight: '700', color: C.text }}>Change Orders Total</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: coTotal > 0 ? C.yl : coTotal < 0 ? C.gn : C.mt }}>
                {coTotal > 0 ? `+${f$(coTotal)}` : f$(coTotal)}
              </Text>
            </View>
          </Card>

          {/* Selections section */}
          <Card style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
            <View style={[s.priceRow, { backgroundColor: C.bH05 }]}>
              <Text style={[s.lbl, { color: C.gd, marginBottom: 0 }]}>SELECTIONS</Text>
            </View>
            {confirmedSels.length === 0 ? (
              <View style={[s.priceRow, { justifyContent: 'center' }]}>
                <Text style={{ fontSize: 20, color: C.dm, fontStyle: 'italic' }}>No confirmed selections yet</Text>
              </View>
            ) : (
              selectionLines.map((line, i) => (
                <View key={i} style={s.priceRow}>
                  <Text style={[s.priceLbl, { flex: 1 }]} numberOfLines={1}>{line.item} — {line.selected}</Text>
                  <Text style={[s.priceAmt, line.price > 0 ? { color: C.yl } : { color: C.gn }]}>
                    {line.price > 0 ? `+${f$(line.price)}` : 'Standard'}
                  </Text>
                </View>
              ))
            )}
            <View style={[s.priceRow, { borderTopWidth: 1, borderTopColor: C.w10 }]}>
              <Text style={{ fontSize: 21, fontWeight: '700', color: C.text }}>Selections Total</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: selectionTotal > 0 ? C.yl : C.gn }}>{selectionTotal > 0 ? `+${f$(selectionTotal)}` : f$(0)}</Text>
            </View>
          </Card>

          {/* Grand total */}
          <Card style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
            <View style={s.priceRow}>
              <Text style={s.priceLbl}>Base Contract</Text>
              <Text style={s.priceAmt}>{f$(baseContract)}</Text>
            </View>
            <View style={s.priceRow}>
              <Text style={s.priceLbl}>Change Orders</Text>
              <Text style={[s.priceAmt, { color: coTotal > 0 ? C.yl : coTotal < 0 ? C.gn : C.mt }]}>
                {coTotal > 0 ? `+${f$(coTotal)}` : f$(coTotal)}
              </Text>
            </View>
            <View style={s.priceRow}>
              <Text style={s.priceLbl}>Selection Upgrades</Text>
              <Text style={[s.priceAmt, { color: selectionTotal > 0 ? C.yl : C.mt }]}>{selectionTotal > 0 ? `+${f$(selectionTotal)}` : f$(0)}</Text>
            </View>
            <View style={[s.priceRow, { borderTopWidth: 2, borderTopColor: C.gd + '40' }]}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: C.text }}>Total Cost</Text>
              <Text style={{ fontSize: 30, fontWeight: '700', color: C.gd }}>{f$(grandTotal)}</Text>
            </View>
          </Card>

          {pending.length > 0 && (
            <View style={s.warnBox}>
              <Text style={s.warnTxt}>⚠ {pending.length} pending change order(s) not yet reflected</Text>
            </View>
          )}
        </ScrollView>
      );
    }

    // --- SCHEDULE ---
    if (tab === 'schedule') {
      return (
        <View style={{ flex: 1, minHeight: 0 }}>
          {sub === 'calendar' && (
            <>
              {calView === 'gantt' && (
                <ScheduleCalendar
                  schedule={schedule}
                  onUpdateTask={updateScheduleTask}
                  onEditTask={editScheduleTask}
                  onDeleteTask={deleteScheduleTask}
                  isBuilder={isB}
                  onDayPress={(date) => { setPrefillDate(date); setModal('newschedule'); }}
                  onAddItem={isB ? () => setModal('newschedule') : undefined}
                  headerContent={viewToggle}
                  goLive={goLive}
                  onGoLiveChange={isB ? toggleGoLive : undefined}
                  onHold={onHold}
                  onTaskDoubleClick={(task) => {
                    setPredDropOpen(false);
                    setTradeDropOpen(false);
                    setTaskInfoEdit({
                      id: task.id,
                      task: task.task || '',
                      trade: task.trade || '',
                      workdays: String((() => {
                        if (!task.start_date || !task.end_date) return 1;
                        const s = new Date(task.start_date + 'T00:00:00');
                        const e = new Date(task.end_date + 'T00:00:00');
                        if (isNaN(s) || isNaN(e)) return 1;
                        let count = 1; let d = new Date(s);
                        while (d < e) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++; }
                        return count;
                      })()),
                      predecessor_id: task.predecessor_id || null,
                      rel_type: task.rel_type || 'FS',
                      lag_days: String(task.lag_days || '0'),
                      start_date: task.start_date || '',
                      end_date: task.end_date || '',
                    });
                  }}
                  onTaskRightClick={async (task) => {
                    setListEditTask(task); setListContractor(task.contractor || ''); setSubsSearch('');
                    try {
                      const res = await fetch(`${API_BASE}/users`);
                      const data = await res.json();
                      if (Array.isArray(data)) setSubsList(data.filter(u => (u.role === 'contractor' || u.role === 'builder') && u.active !== false));
                    } catch(e) { console.warn('fetch subs:', e); }
                  }}
                  calYear={calYear}
                  calMonth={calMonth}
                  onMonthChange={onMonthChange}
                />
              )}

              {calView === 'taskfirst' && (
                <ScheduleCalendar
                  schedule={schedule}
                  onUpdateTask={updateScheduleTask}
                  onEditTask={editScheduleTask}
                  onDeleteTask={deleteScheduleTask}
                  isBuilder={isB}
                  onDayPress={(date) => { setPrefillDate(date); setModal('newschedule'); }}
                  onAddItem={isB ? () => setModal('newschedule') : undefined}
                  mode="taskfirst"
                  headerContent={viewToggle}
                  goLive={goLive}
                  onGoLiveChange={isB ? toggleGoLive : undefined}
                  onHold={onHold}
                  onTaskDoubleClick={(task) => {
                    setPredDropOpen(false);
                    setTradeDropOpen(false);
                    setTaskInfoEdit({
                      id: task.id,
                      task: task.task || '',
                      trade: task.trade || '',
                      workdays: String((() => {
                        if (!task.start_date || !task.end_date) return 1;
                        const s = new Date(task.start_date + 'T00:00:00');
                        const e = new Date(task.end_date + 'T00:00:00');
                        if (isNaN(s) || isNaN(e)) return 1;
                        let count = 1; let d = new Date(s);
                        while (d < e) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++; }
                        return count;
                      })()),
                      predecessor_id: task.predecessor_id || null,
                      rel_type: task.rel_type || 'FS',
                      lag_days: String(task.lag_days || '0'),
                      start_date: task.start_date || '',
                      end_date: task.end_date || '',
                    });
                  }}
                  onTaskRightClick={async (task) => {
                    setListEditTask(task); setListContractor(task.contractor || ''); setSubsSearch('');
                    try {
                      const res = await fetch(`${API_BASE}/users`);
                      const data = await res.json();
                      if (Array.isArray(data)) setSubsList(data.filter(u => (u.role === 'contractor' || u.role === 'builder') && u.active !== false));
                    } catch(e) { console.warn('fetch subs:', e); }
                  }}
                  calYear={calYear}
                  calMonth={calMonth}
                  onMonthChange={onMonthChange}
                />
              )}

              {calView === 'list' && (
                <>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingRight: 40, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                  {viewToggle}
                </View>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
                  {isB && (
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <TouchableOpacity
                        onPress={() => setShowTradeFilter(p => !p)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: tradeFilter.length > 0 ? 'rgba(59,130,246,0.12)' : C.w06, borderWidth: 1, borderColor: tradeFilter.length > 0 ? C.bl + '40' : C.w10 }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 18 }}>🔍</Text>
                        <Text style={{ fontSize: 17, fontWeight: '600', color: tradeFilter.length > 0 ? C.bl : C.dm }}>
                          {tradeFilter.length > 0 ? `Filter (${tradeFilter.length})` : 'Filter'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setModal('newschedule')} style={s.schedAddBtn} activeOpacity={0.8}>
                        <Text style={s.schedAddBtnTxt}>+ New Item</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Trade filter panel */}
                  {showTradeFilter && (() => {
                    const usedTrades = [...new Set(schedule.map(t => t.trade).filter(Boolean))].sort();
                    if (usedTrades.length === 0) return (
                      <View style={{ padding: 14, marginBottom: 10, backgroundColor: C.w04, borderRadius: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 17, color: C.dm }}>No trades assigned to tasks yet</Text>
                      </View>
                    );
                    return (
                      <View style={{ padding: 12, marginBottom: 10, backgroundColor: C.w04, borderRadius: 10, gap: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 1 }}>FILTER BY TRADE</Text>
                          {tradeFilter.length > 0 && (
                            <TouchableOpacity onPress={() => setTradeFilter([])} activeOpacity={0.7}>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: C.bl }}>Clear All</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {usedTrades.map(trade => {
                            const isOn = tradeFilter.includes(trade);
                            const count = schedule.filter(t => t.trade === trade).length;
                            return (
                              <TouchableOpacity
                                key={trade}
                                onPress={() => setTradeFilter(prev => isOn ? prev.filter(t => t !== trade) : [...prev, trade])}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: isOn ? 'rgba(59,130,246,0.15)' : C.w06, borderWidth: 1, borderColor: isOn ? C.bl + '40' : C.w10 }}
                                activeOpacity={0.7}
                              >
                                <Text style={{ fontSize: 16, fontWeight: isOn ? '700' : '500', color: isOn ? C.bl : C.text }}>{trade}</Text>
                                <Text style={{ fontSize: 13, color: isOn ? C.bl : C.dm }}>({count})</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })()}

                  {(() => {
                    const filtered = tradeFilter.length > 0 ? schedule.filter(t => t.trade && tradeFilter.includes(t.trade)) : schedule;
                    return filtered.length === 0 ? <Empty text={tradeFilter.length > 0 ? "No tasks match filter" : "No schedule items"} /> : filtered.map(item => {
                    const { pct, status } = calcTaskProgress(item);
                    const hasSlip = item.baseline_end && item.end_date && item.baseline_end !== item.end_date;
                    const statusColor = status === 'complete' ? C.gn : status === 'in-progress' ? C.gd : status === 'overdue' ? C.rd : '#4a5568';
                    const statusLabel = status === 'complete' ? 'Complete' : status === 'in-progress' ? 'In Progress' : 'Upcoming';
                    return (
                      <View key={item.id}
                        {...(Platform.OS === 'web' ? {
                          onContextMenu: async (e) => {
                            if (!isB) return;
                            e.preventDefault();
                            setListEditTask(item); setListContractor(item.contractor || ''); setSubsSearch('');
                            try {
                              const res = await fetch(`${API_BASE}/users`);
                              const data = await res.json();
                              if (Array.isArray(data)) setSubsList(data.filter(u => (u.role === 'contractor' || u.role === 'builder') && u.active !== false));
                            } catch(e2) { console.warn('fetch subs:', e2); }
                          },
                        } : {})}
                      >
                      <TouchableOpacity activeOpacity={0.7}
                        onPress={() => {
                          if (!isB) return;
                          const now = Date.now();
                          const last = lastTapRef.current[item.id] || 0;
                          lastTapRef.current[item.id] = now;
                          if (now - last < 400) {
                            lastTapRef.current[item.id] = 0;
                            setPredDropOpen(false);
                            setTradeDropOpen(false);
                            setTaskInfoEdit({
                              id: item.id,
                              task: item.task || '',
                              trade: item.trade || '',
                              workdays: String((() => {
                                if (!item.start_date || !item.end_date) return 1;
                                const s2 = new Date(item.start_date + 'T00:00:00');
                                const e2 = new Date(item.end_date + 'T00:00:00');
                                if (isNaN(s2) || isNaN(e2)) return 1;
                                let count = 1; let d = new Date(s2);
                                while (d < e2) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++; }
                                return count;
                              })()),
                              predecessor_id: item.predecessor_id || null,
                              rel_type: item.rel_type || 'FS',
                              lag_days: String(item.lag_days || '0'),
                              start_date: item.start_date || '',
                              end_date: item.end_date || '',
                            });
                          }
                        }}
                        onLongPress={async () => {
                          if (!isB) return;
                          setListEditTask(item); setListContractor(item.contractor || ''); setSubsSearch('');
                          try {
                            const res = await fetch(`${API_BASE}/users`);
                            const data = await res.json();
                            if (Array.isArray(data)) setSubsList(data.filter(u => (u.role === 'contractor' || u.role === 'builder') && u.active !== false));
                          } catch(e) { console.warn('fetch subs:', e); }
                        }}
                      >
                        <Card style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={{ fontSize: 21, fontWeight: '600', color: C.text }}>{item.task}</Text>
                                {hasSlip && <Text style={{ fontSize: 15, color: C.rd }}>⚠ slipped</Text>}
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <Text style={{ fontSize: 18, color: C.dm }}>{item.contractor || 'Unassigned'}</Text>
                                {item.trade ? (
                                  <View style={{ backgroundColor: 'rgba(59,130,246,0.1)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.bl }}>{item.trade}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 16, color: C.mt }}>{sD(item.start_date)} — {sD(item.end_date)}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusColor }} />
                                <Text style={{ fontSize: 15, fontWeight: '600', color: statusColor }}>{statusLabel}</Text>
                              </View>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Bar pct={pct} color={statusColor} />
                            <Text style={{ fontSize: 18, fontWeight: '600', color: statusColor, minWidth: 32, textAlign: 'right' }}>{pct}%</Text>
                          </View>
                        </Card>
                      </TouchableOpacity>
                      </View>
                    );
                  });
                  })()}
                </ScrollView>
                </>
              )}

              {/* Assign Subcontractor Modal */}
                {listEditTask && (
                  <Modal visible animationType="fade" transparent>
                    <View style={s.listModalOverlay}>
                      <View style={s.listModalBox}>
                        <View style={s.listModalHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.listModalTitle}>{listEditTask.task}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                              <Text style={s.listModalSub}>{sD(listEditTask.start_date)} — {sD(listEditTask.end_date)}</Text>
                              {listEditTask.trade ? (
                                <View style={{ backgroundColor: 'rgba(59,130,246,0.12)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>{listEditTask.trade}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                          <TouchableOpacity onPress={() => setListEditTask(null)} style={s.listModalCloseBtn}>
                            <Text style={s.listModalCloseTxt}>×</Text>
                          </TouchableOpacity>
                        </View>
                        {listEditTask.contractor ? (
                          <View style={s.listModalCurrent}>
                            <Text style={s.listModalCurrentLabel}>CURRENTLY ASSIGNED</Text>
                            <Text style={s.listModalCurrentVal}>{listEditTask.contractor}</Text>
                          </View>
                        ) : null}
                        <View style={{ padding: 18, flex: 1 }}>
                          <Text style={s.listModalFieldLabel}>SELECT SUBCONTRACTOR</Text>
                          <TextInput
                            value={subsSearch}
                            onChangeText={setSubsSearch}
                            placeholder="Search subcontractors..."
                            placeholderTextColor={C.w20}
                            style={[s.listModalInput, { marginBottom: 10 }]}
                            autoFocus
                          />
                          <ScrollView style={{ maxHeight: 220, borderRadius: 8, borderWidth: 1, borderColor: C.w06 }} nestedScrollEnabled>
                            {(() => {
                              const taskTrade = listEditTask.trade;
                              let filtered = subsList;
                              // If task has a trade, hide subs without matching trade (builders always shown)
                              if (taskTrade) {
                                filtered = filtered.filter(sub2 => {
                                  if (sub2.role === 'builder') return true;
                                  const subTrades = (sub2.trades || '').toLowerCase().split(',').map(t => t.trim());
                                  return subTrades.includes(taskTrade.toLowerCase());
                                });
                              }
                              // Apply search filter
                              if (subsSearch.trim()) {
                                const q = subsSearch.toLowerCase();
                                filtered = filtered.filter(sub2 =>
                                  (sub2.company_name || '').toLowerCase().includes(q) ||
                                  (sub2.name || '').toLowerCase().includes(q) ||
                                  (sub2.trades || '').toLowerCase().includes(q)
                                );
                              }
                              // Sort: builders first, then subs
                              filtered.sort((a, b) => {
                                if (a.role === 'builder' && b.role !== 'builder') return -1;
                                if (a.role !== 'builder' && b.role === 'builder') return 1;
                                return 0;
                              });
                              if (filtered.length === 0) {
                                return (
                                  <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: C.dm, fontSize: 20 }}>No subcontractors found</Text>
                                  </View>
                                );
                              }
                              return filtered.map(sub2 => {
                                const isBuilder = sub2.role === 'builder';
                                const isSelected = listContractor === sub2.name;
                                const tradesArr = sub2.trades ? sub2.trades.split(',').map(t => t.trim()).filter(Boolean) : [];
                                const displayName = isBuilder ? sub2.name : (sub2.company_name || sub2.name);
                                return (
                                  <TouchableOpacity
                                    key={sub2.id}
                                    onPress={() => setListContractor(sub2.name)}
                                    style={[s.listModalSubItem, isSelected && s.listModalSubItemOn]}
                                    activeOpacity={0.7}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={[s.listModalSubName, isSelected && { color: C.bl }]}>
                                          {displayName}
                                        </Text>
                                        {isBuilder && (
                                          <View style={{ backgroundColor: 'rgba(218,165,32,0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
                                            <Text style={{ fontSize: 12, fontWeight: '700', color: C.gd }}>BUILDER</Text>
                                          </View>
                                        )}
                                      </View>
                                      {tradesArr.length > 0 && (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                          {tradesArr.map(t => (
                                            <View key={t} style={{ backgroundColor: taskTrade && t.toLowerCase() === taskTrade.toLowerCase() ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
                                              <Text style={{ fontSize: 14, color: taskTrade && t.toLowerCase() === taskTrade.toLowerCase() ? C.bl : 'rgba(59,130,246,0.8)', fontWeight: taskTrade && t.toLowerCase() === taskTrade.toLowerCase() ? '700' : '400' }}>{t}</Text>
                                            </View>
                                          ))}
                                        </View>
                                      )}
                                    </View>
                                    {isSelected && <Text style={{ fontSize: 24, color: C.bl }}>✓</Text>}
                                  </TouchableOpacity>
                                );
                              });
                            })()}
                          </ScrollView>
                        </View>
                        <View style={s.listModalActions}>
                          <TouchableOpacity onPress={() => setListEditTask(null)} style={s.listModalCancelBtn}>
                            <Text style={s.listModalCancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              const newContractor = listContractor.trim();
                              await updateScheduleTask(listEditTask.id, { contractor: newContractor });
                              // Propagate to all tasks with the same trade
                              const taskTrade = listEditTask.trade;
                              if (taskTrade && newContractor) {
                                const sameTradeTasks = schedule.filter(t => t.id !== listEditTask.id && t.trade === taskTrade && t.contractor !== newContractor);
                                for (const t of sameTradeTasks) {
                                  await updateScheduleTask(t.id, { contractor: newContractor });
                                }
                              }
                              setListEditTask(null);
                            }}
                            style={[s.listModalSaveBtn, !listContractor.trim() && s.listModalSaveBtnOff]}
                            disabled={!listContractor.trim()}
                          >
                            <Text style={s.listModalSaveTxt}>Assign</Text>
                          </TouchableOpacity>
                        </View>
                        {isB && (
                          <View style={{ borderTopWidth: 1, borderTopColor: C.w06, margin: 18, marginTop: 0, paddingTop: 12 }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm, marginBottom: 8, letterSpacing: 0.5 }}>DANGER ZONE</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                onPress={() => {
                                  const doDelete = () => { deleteScheduleTask(listEditTask.id, 'single'); setListEditTask(null); };
                                  if (Platform.OS === 'web') {
                                    if (window.confirm(`Delete "${listEditTask.task}"?\n\nSuccessors will keep their current dates but lose their predecessor link.\n\nThis cannot be undone.`)) doDelete();
                                  } else {
                                    Alert.alert('Delete Task', `Delete "${listEditTask.task}"?\n\nThis cannot be undone.`, [
                                      { text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete },
                                    ]);
                                  }
                                }}
                                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.rd + '40', backgroundColor: C.rd + '10', alignItems: 'center' }}
                                activeOpacity={0.7}
                              >
                                <Text style={{ fontSize: 18, fontWeight: '600', color: C.rd }}>Delete Task</Text>
                              </TouchableOpacity>
                              {schedule.some(t => t.predecessor_id === listEditTask.id) && (
                                <TouchableOpacity
                                  onPress={() => {
                                    const doDelete = () => { deleteScheduleTask(listEditTask.id, 'chain'); setListEditTask(null); };
                                    if (Platform.OS === 'web') {
                                      if (window.confirm(`Delete "${listEditTask.task}" and ALL successor tasks?\n\nThis cannot be undone.`)) doDelete();
                                    } else {
                                      Alert.alert('Delete Chain', `Delete "${listEditTask.task}" and all successor tasks?\n\nThis cannot be undone.`, [
                                        { text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete },
                                      ]);
                                    }
                                  }}
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
                    </View>
                  </Modal>
                )}

                {/* Task Info Edit Modal */}
                {taskInfoEdit && (
                  <Modal visible animationType="fade" transparent>
                    <View style={s.listModalOverlay}>
                      <View style={[s.listModalBox, { maxWidth: 700 }]}>
                        <View style={s.listModalHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.listModalTitle}>Edit Task</Text>
                          </View>
                          <TouchableOpacity onPress={() => { setTaskInfoEdit(null); setPredDropOpen(false); setTradeDropOpen(false); }} style={s.listModalCloseBtn}>
                            <Text style={s.listModalCloseTxt}>×</Text>
                          </TouchableOpacity>
                        </View>

                        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                        <View style={{ padding: 18, gap: 14 }}>
                          {/* Row 1: Task Name + Trade + Workdays */}
                          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
                            <View style={{ flex: 3 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 1, marginBottom: 5 }}>TASK NAME</Text>
                              <TextInput
                                value={taskInfoEdit.task}
                                onChangeText={v => setTaskInfoEdit(prev => ({ ...prev, task: v }))}
                                placeholder="Task name"
                                placeholderTextColor={C.ph}
                                style={[s.listModalInput]}
                              />
                            </View>
                            <View style={{ flex: 2 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 1, marginBottom: 5 }}>TRADE</Text>
                              <TouchableOpacity
                                onPress={() => { setPredDropOpen(false); setTradeDropOpen(p => !p); }}
                                style={[s.listModalInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                activeOpacity={0.7}
                              >
                                <Text style={{ fontSize: 20, color: taskInfoEdit.trade ? C.bl : C.ph, flex: 1 }} numberOfLines={1}>
                                  {taskInfoEdit.trade || 'Select trade'}
                                </Text>
                                <Text style={{ fontSize: 14, color: C.dm, marginLeft: 6 }}>{tradeDropOpen ? '▲' : '▼'}</Text>
                              </TouchableOpacity>
                            </View>
                            <View style={{ width: 90 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 1, marginBottom: 5 }}>WORKDAYS</Text>
                              <TextInput
                                value={taskInfoEdit.workdays}
                                onChangeText={v => setTaskInfoEdit(prev => ({ ...prev, workdays: v.replace(/\D/g, '') }))}
                                keyboardType="numeric"
                                placeholder="1"
                                placeholderTextColor={C.ph}
                                style={[s.listModalInput, { textAlign: 'center' }]}
                              />
                            </View>
                          </View>

                          {/* Trade dropdown list (collapsed by default) */}
                          {tradeDropOpen && (
                            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.w06, overflow: 'hidden', maxHeight: 200 }}>
                              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                <TouchableOpacity
                                  onPress={() => { setTaskInfoEdit(prev => ({ ...prev, trade: '' })); setTradeDropOpen(false); }}
                                  style={{ paddingVertical: 9, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04, backgroundColor: !taskInfoEdit.trade ? 'rgba(59,130,246,0.08)' : 'transparent' }}
                                >
                                  <Text style={{ fontSize: 18, color: !taskInfoEdit.trade ? C.bl : C.dm, fontWeight: !taskInfoEdit.trade ? '600' : '400' }}>None</Text>
                                </TouchableOpacity>
                                {TEMPLATE_TRADES.map(t => {
                                  const isActive = taskInfoEdit.trade === t;
                                  return (
                                    <TouchableOpacity
                                      key={t}
                                      onPress={() => { setTaskInfoEdit(prev => ({ ...prev, trade: t })); setTradeDropOpen(false); }}
                                      style={{ paddingVertical: 9, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04, backgroundColor: isActive ? 'rgba(59,130,246,0.08)' : 'transparent' }}
                                    >
                                      <Text style={{ fontSize: 18, color: isActive ? C.bl : C.text, fontWeight: isActive ? '600' : '400' }}>{t}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          )}

                          {/* Row 2: Predecessor dropdown + FS/SS + Lag */}
                          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
                            {/* Predecessor dropdown trigger */}
                            <View style={{ flex: 3 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 1, marginBottom: 5 }}>PREDECESSOR</Text>
                              <TouchableOpacity
                                onPress={() => { setTradeDropOpen(false); setPredDropOpen(p => !p); }}
                                style={[s.listModalInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                activeOpacity={0.7}
                              >
                                <Text style={{ fontSize: 20, color: taskInfoEdit.predecessor_id ? '#a78bfa' : C.ph, flex: 1 }} numberOfLines={1}>
                                  {(() => {
                                    if (!taskInfoEdit.predecessor_id) return 'None';
                                    const pred = schedule.find(t => t.id === taskInfoEdit.predecessor_id);
                                    if (!pred) return 'None';
                                    return `${schedule.indexOf(pred) + 1}. ${pred.task || 'Untitled'}`;
                                  })()}
                                </Text>
                                <Text style={{ fontSize: 14, color: C.dm, marginLeft: 6 }}>{predDropOpen ? '▲' : '▼'}</Text>
                              </TouchableOpacity>
                            </View>

                            {/* FS / SS */}
                            <View>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 1, marginBottom: 5 }}>TYPE</Text>
                              <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.w08 }}>
                                {['FS', 'SS'].map(r => (
                                  <TouchableOpacity
                                    key={r}
                                    onPress={() => { if (taskInfoEdit.predecessor_id) setTaskInfoEdit(prev => ({ ...prev, rel_type: r })); }}
                                    style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: (taskInfoEdit.rel_type || 'FS') === r && taskInfoEdit.predecessor_id ? 'rgba(139,92,246,0.15)' : C.w02 }}
                                  >
                                    <Text style={{ fontSize: 18, fontWeight: '700', color: (taskInfoEdit.rel_type || 'FS') === r && taskInfoEdit.predecessor_id ? '#a78bfa' : C.dm }}>{r}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>

                            {/* Lag */}
                            <View style={{ width: 90 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 1, marginBottom: 5 }}>LAG</Text>
                              <TextInput
                                value={taskInfoEdit.lag_days}
                                onChangeText={v => { if (taskInfoEdit.predecessor_id) setTaskInfoEdit(prev => ({ ...prev, lag_days: v.replace(/[^0-9-]/g, '') })); }}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={C.ph}
                                editable={!!taskInfoEdit.predecessor_id}
                                style={[s.listModalInput, { textAlign: 'center', opacity: taskInfoEdit.predecessor_id ? 1 : 0.4 }]}
                              />
                            </View>
                          </View>

                          {/* Predecessor dropdown list (collapsed by default) */}
                          {predDropOpen && (
                            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.w06, overflow: 'hidden', maxHeight: 200 }}>
                              <ScrollView nestedScrollEnabled>
                                <TouchableOpacity
                                  onPress={() => { setTaskInfoEdit(prev => ({ ...prev, predecessor_id: null, rel_type: 'FS', lag_days: '0' })); setPredDropOpen(false); }}
                                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04, backgroundColor: !taskInfoEdit.predecessor_id ? 'rgba(59,130,246,0.08)' : 'transparent' }}
                                >
                                  <Text style={{ fontSize: 18, color: !taskInfoEdit.predecessor_id ? C.bl : C.dm, fontWeight: !taskInfoEdit.predecessor_id ? '600' : '400' }}>None</Text>
                                </TouchableOpacity>
                                {schedule.filter(t => t.id !== taskInfoEdit.id).map(t => {
                                  const isActive = taskInfoEdit.predecessor_id === t.id;
                                  const taskIdx = schedule.indexOf(t);
                                  return (
                                    <TouchableOpacity
                                      key={t.id}
                                      onPress={() => { setTaskInfoEdit(prev => ({ ...prev, predecessor_id: t.id })); setPredDropOpen(false); }}
                                      style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04, backgroundColor: isActive ? 'rgba(139,92,246,0.1)' : 'transparent' }}
                                    >
                                      <Text style={{ fontSize: 18, color: isActive ? '#a78bfa' : C.text, fontWeight: isActive ? '600' : '400' }} numberOfLines={1}>
                                        {taskIdx + 1}. {t.task || 'Untitled'}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          )}
                        </View>
                        </ScrollView>

                        {/* Save / Cancel */}
                        <View style={[s.listModalActions, { gap: 10 }]}>
                          <TouchableOpacity onPress={() => { setTaskInfoEdit(null); setPredDropOpen(false); setTradeDropOpen(false); }} style={s.listModalCancelBtn}>
                            <Text style={s.listModalCancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              const wd = parseInt(taskInfoEdit.workdays) || 1;
                              const updates = {
                                task: taskInfoEdit.task.trim(),
                                trade: taskInfoEdit.trade.trim(),
                                predecessor_id: taskInfoEdit.predecessor_id,
                                rel_type: taskInfoEdit.rel_type || 'FS',
                                lag_days: parseInt(taskInfoEdit.lag_days) || 0,
                              };
                              if (taskInfoEdit.start_date) {
                                updates.end_date = sbCalcEndDate(taskInfoEdit.start_date, wd);
                              }
                              await editScheduleTask(taskInfoEdit.id, updates, 'Task updated');
                              setTaskInfoEdit(null);
                              setPredDropOpen(false);
                              setTradeDropOpen(false);
                            }}
                            style={[s.listModalSaveBtn, !taskInfoEdit.task.trim() && s.listModalSaveBtnOff]}
                            disabled={!taskInfoEdit.task.trim()}
                          >
                            <Text style={s.listModalSaveTxt}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
            </>
          )}

          {sub === 'baseline' && (
            <BaselineView schedule={schedule} project={project} api={api} />
          )}

          {sub === 'progress' && (() => {
            const taskProgress = schedule.map(item => ({ ...item, ...calcTaskProgress(item) }));
            const schDone = taskProgress.filter(x => x.pct === 100).length;
            const overallPct = schedule.length > 0
              ? Math.round(taskProgress.reduce((sum, t) => sum + t.pct, 0) / schedule.length)
              : 0;
            const pCO = changeOrders.filter(x => x.status !== 'approved').length;
            const pSel = selections.filter(x => x.status === 'pending').length;
            const approvedCOTotal = changeOrders.filter(x => x.status === 'approved').reduce((sum, co) => sum + (co.amount || 0), 0);
            const contractPrice = (project.original_price || 0) + approvedCOTotal;
            const stats = [
              ['Progress', overallPct + '%', C.gd],
              ['Tasks', `${schDone}/${schedule.length}`, C.gn],
              ['Contract', f$(contractPrice), C.blB],
              ['Pending COs', pCO, pCO ? C.rd : C.gn],
              ['Pending Sel', pSel, pSel ? C.yl : C.gn],
            ];

            return (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
                <Text style={s.sectionTitle}>Job Progress</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {stats.map(([label, val, color]) => (
                    <View key={label} style={s.statCard}>
                      <Lbl>{label}</Lbl>
                      <Text style={{ fontSize: 30, fontWeight: '700', color }}>{val}</Text>
                    </View>
                  ))}
                </View>
                {schedule.length > 0 && (
                  <Card>
                    <Text style={s.cardTitle}>Schedule Progress</Text>
                    {taskProgress.map(item => {
                      const barColor = item.pct === 100 ? C.gn : item.status === 'in-progress' ? C.gd : '#2d3748';
                      return (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <Text style={{ fontSize: 16, color: C.mt, width: 120 }} numberOfLines={1}>{item.task}</Text>
                          <Bar pct={item.pct} color={barColor} />
                          <Text style={{ fontSize: 15, color: C.dm, width: 28, textAlign: 'right' }}>{item.pct}%</Text>
                        </View>
                      );
                    })}
                  </Card>
                )}
              </ScrollView>
            );
          })()}
        </View>
      );
    }

    // --- CHANGE ORDERS ---
    if (tab === 'changeorders') {
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={s.sectionTitle}>Change Orders</Text>
            {isB && (
              <TouchableOpacity onPress={() => setModal('coTypePicker')} activeOpacity={0.7}
                style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 26, fontWeight: '700', color: C.textBold }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
          {changeOrders.length === 0 ? <Empty icon="📄" text="No change orders" /> : changeOrders.map(co => (
            <Card key={co.id} onPress={() => setModal({ type: 'co', data: co })} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 22, fontWeight: '600', color: C.text, flex: 1 }} numberOfLines={1}>{co.title}</Text>
                <Badge status={co.status} />
              </View>
              <Text style={{ fontSize: 20, color: C.mt, marginBottom: 8 }} numberOfLines={2}>{co.description}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 18, color: C.dm }}>Created {fD(co.created_at)}</Text>
                  {co.due_date && (
                    <Text style={{ fontSize: 18, color: co.due_date && new Date(co.due_date + 'T23:59:59') < new Date() && co.status !== 'approved' ? C.rd : C.dm, marginTop: 2 }}>
                      Due {fD(co.due_date)}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 24, fontWeight: '700', color: co.amount >= 0 ? C.yl : C.gn }}>
                  {co.amount >= 0 ? '+' : ''}{f$(co.amount)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
                {[['Builder', co.builder_sig], ['Customer', co.customer_sig]].map(([l, signed]) => (
                  <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.sigDot, signed && s.sigDotOn]}>
                      {signed && <Text style={{ color: C.textBold, fontSize: 14, fontWeight: '700' }}>✓</Text>}
                    </View>
                    <Text style={{ fontSize: 18, color: C.mt }}>{l}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </ScrollView>
      );
    }

    // --- SELECTIONS ---
    if (tab === 'selections') {
      const canPick = isB || isC;
      const pick = async (psId, optName, currentStatus) => {
        if (currentStatus === 'confirmed') return; // locked
        setSelections(prev => prev.map(sel => sel.project_selection_id === psId ? { ...sel, selected: optName, status: 'selected' } : sel));
        api(`/project-selections/${psId}`, { method: 'PUT', body: { selected: optName } });
      };
      const confirmSelection = async (psId) => {
        setSelections(prev => prev.map(sel => sel.project_selection_id === psId ? { ...sel, status: 'confirmed' } : sel));
        api(`/project-selections/${psId}`, { method: 'PUT', body: { confirm: true } });
        setModal(null);
      };

      // Group by category
      const grouped = {};
      selections.forEach(sel => {
        const cat = sel.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(sel);
      });

      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
          <Text style={[s.sectionTitle, { marginBottom: 16 }]}>Selections</Text>

          {selections.length === 0 ? <Empty icon="🎨" text="No selections yet" sub={isC ? "Your builder will add selections here" : "Add selections in Settings → Manage Selections"} /> : (
            Object.entries(grouped).map(([cat, sels]) => (
              <View key={cat} style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.gd, letterSpacing: 1, marginBottom: 10 }}>{cat.toUpperCase()}</Text>
                {sels.map(sel => {
                  const isConfirmed = sel.status === 'confirmed';
                  const hasSelection = !!sel.selected;
                  const needsConfirm = hasSelection && !isConfirmed;
                  return (
                  <Card key={sel.project_selection_id || sel.id} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 24, fontWeight: '600', color: C.text }}>{sel.item}</Text>
                      </View>
                      {isConfirmed ? (
                        <View style={{ backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: C.gn }}>✓ Confirmed</Text>
                        </View>
                      ) : hasSelection ? (
                        <View style={{ backgroundColor: C.bH12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: C.gd }}>Selected</Text>
                        </View>
                      ) : (
                        <Badge status="pending" />
                      )}
                    </View>
                    {/* Option cards */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {(sel.options || []).map((opt, i) => {
                        const isObj = typeof opt === 'object';
                        const optName = isObj ? opt.name : opt;
                        const imgPath = isObj ? opt.image_path : null;
                        const price = isObj ? opt.price : null;
                        const standard = isObj ? opt.comes_standard : false;
                        const active = sel.selected === optName;
                        return (
                          <TouchableOpacity key={i}
                            onPress={() => canPick && !isConfirmed && sel.project_selection_id && pick(sel.project_selection_id, optName, sel.status)}
                            activeOpacity={canPick && !isConfirmed ? 0.7 : 1}
                            style={{
                              width: 150, borderRadius: 10, overflow: 'hidden',
                              borderWidth: active ? 2 : 1,
                              borderColor: active ? (isConfirmed ? C.gn : C.gd) : C.w12,
                              backgroundColor: active ? (C.mode === 'dark' ? C.bH08 : C.bH05) : C.w03,
                              opacity: isConfirmed && !active ? 0.5 : 1,
                            }}>
                            {imgPath ? (
                              <Image source={{ uri: `${API_BASE}${imgPath}` }} style={{ width: '100%', height: 100 }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: '100%', height: 100, backgroundColor: C.w06, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 42, opacity: 0.4 }}>📷</Text>
                              </View>
                            )}
                            <View style={{ padding: 10 }}>
                              <Text style={{ fontSize: 20, fontWeight: '600', color: active ? C.gd : C.text }} numberOfLines={2}>{active ? '✓ ' : ''}{optName}</Text>
                              {standard ? (
                                <Text style={{ fontSize: 18, color: C.gn, fontWeight: '600', marginTop: 4 }}>Standard</Text>
                              ) : price != null && price > 0 ? (
                                <Text style={{ fontSize: 18, color: C.mt, marginTop: 4 }}>+{f$(price)}</Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {/* Confirm button */}
                    {needsConfirm && canPick && (
                      <TouchableOpacity
                        onPress={() => setModal({ type: 'confirmsel', psId: sel.project_selection_id, item: sel.item, selected: sel.selected })}
                        style={{ backgroundColor: C.gd, paddingVertical: 12, borderRadius: 8, marginTop: 14, alignItems: 'center' }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>Confirm Selection</Text>
                      </TouchableOpacity>
                    )}
                  </Card>
                  );
                })}
              </View>
            ))
          )}

          {/* Confirm Selection Modal */}
          {modal?.type === 'confirmsel' && (
            <Modal visible animationType="fade" transparent>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <View style={{
                  backgroundColor: C.modalBg, borderRadius: 16, padding: 28, width: '90%', maxWidth: 440,
                  borderWidth: 1, borderColor: C.w10,
                  ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' } : { elevation: 20 }),
                }}>
                  <Text style={{ fontSize: 30, fontWeight: '700', color: C.textBold, textAlign: 'center', marginBottom: 8 }}>Confirm Selection</Text>
                  <Text style={{ fontSize: 22, fontWeight: '600', color: C.gd, textAlign: 'center', marginBottom: 16 }}>{modal.item}: {modal.selected}</Text>

                  <View style={{
                    backgroundColor: C.mode === 'dark' ? C.bH08 : C.bH05,
                    borderWidth: 1, borderColor: C.gd + '30',
                    borderRadius: 10, padding: 16, marginBottom: 24,
                  }}>
                    <Text style={{ fontSize: 21, lineHeight: 33, color: C.mt, textAlign: 'center' }}>
                      Once you confirm, you will not have the ability to make a change except through contacting your contractor.
                    </Text>
                  </View>

                  {/* Signature line */}
                  <View style={{ borderBottomWidth: 1, borderBottomColor: C.w15, marginBottom: 6, paddingBottom: 2 }}>
                    <Text style={{ fontSize: 21, color: C.text, fontWeight: '600' }}>{user?.name || 'Signature'}</Text>
                  </View>
                  <Text style={{ fontSize: 16, color: C.dm, marginBottom: 24 }}>Electronic Signature</Text>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity onPress={() => setModal(null)}
                      style={{ flex: 1, paddingVertical: 13, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: 21, fontWeight: '600', color: C.mt }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmSelection(modal.psId)}
                      style={{ flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center' }}
                      activeOpacity={0.8}>
                      <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>Sign & Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </ScrollView>
      );
    }

    // --- DOCUMENTS ---
    if (tab === 'docs') {
      if (sub === 'documents') {
        // Group uploaded docs by template_id
        const docsByTemplate = {};
        const unlinkedDocs = [];
        documents.forEach(d => {
          if (d.template_id) {
            if (!docsByTemplate[d.template_id]) docsByTemplate[d.template_id] = [];
            docsByTemplate[d.template_id].push(d);
          } else {
            unlinkedDocs.push(d);
          }
        });

        const openFile = (url) => {
          const full = url.startsWith('http') ? url : `${API_BASE}${url}`;
          if (Platform.OS === 'web') {
            window.open(full, '_blank');
          } else {
            Linking.openURL(full);
          }
        };

        const deleteDoc = async (docId) => {
          try {
            const res = await fetch(`${API_BASE}/documents/${docId}`, { method: 'DELETE' });
            if (res.ok) setDocuments(prev => prev.filter(d => d.id !== docId));
          } catch (e) { Alert.alert('Error', e.message); }
        };

        const formatSize = (bytes) => {
          if (!bytes) return '';
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };

        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.sectionTitle}>Documents</Text>
              {(isB || isCon) && (
                <TouchableOpacity onPress={() => setModal('uploaddoc')}
                  style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.8}>
                  <Text style={{ fontSize: 27, color: C.chromeTxt, fontWeight: '600', marginTop: -1 }}>+</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Required documents from templates */}
            {docTemplates.map(tmpl => {
              const uploads = docsByTemplate[tmpl.id] || [];
              const hasUpload = uploads.length > 0;
              return (
                <Card key={tmpl.id} style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                    <Text style={{ fontSize: 24 }}>{tmpl.doc_type === 'folder' ? '📁' : '📄'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{tmpl.name}</Text>
                      <Text style={{ fontSize: 14, color: hasUpload ? C.gn : C.yl, marginTop: 2 }}>
                        {hasUpload ? `✓ ${uploads.length} file${uploads.length > 1 ? 's' : ''} uploaded` : '⏳ Not yet uploaded'}
                      </Text>
                    </View>
                    {(isB || isCon) && (
                      <TouchableOpacity
                        onPress={() => setModal({ type: 'uploaddoc', templateId: tmpl.id, templateName: tmpl.name })}
                        style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' }}
                        activeOpacity={0.8}>
                        <Text style={{ fontSize: 27, color: C.chromeTxt, fontWeight: '600', marginTop: -1 }}>+</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {uploads.map(d => (
                    <View key={d.id} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderTopWidth: 1, borderTopColor: C.w06,
                      backgroundColor: C.w06 + '40',
                    }}>
                      <Text style={{ fontSize: 18 }}>📎</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 17, fontWeight: '500', color: C.text }} numberOfLines={1}>{d.name}</Text>
                        <Text style={{ fontSize: 13, color: C.dm }}>{fD(d.created_at)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.file_size ? ` · ${formatSize(d.file_size)}` : ''}</Text>
                      </View>
                      {d.file_url ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity onPress={() => openFile(d.file_url)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.bl + '20' }}
                            activeOpacity={0.7}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>View</Text>
                          </TouchableOpacity>
                          {(isB || isCon) && (
                            <TouchableOpacity onPress={() => deleteDoc(d.id)}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.rd + '15' }}
                              activeOpacity={0.7}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: C.rd }}>Delete</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </Card>
              );
            })}

            {/* Unlinked documents (uploaded without a template) */}
            {unlinkedDocs.length > 0 && (
              <>
                {docTemplates.length > 0 && (
                  <Text style={{ fontSize: 18, fontWeight: '600', color: C.dm, marginTop: 16, marginBottom: 8 }}>Other Documents</Text>
                )}
                {unlinkedDocs.map(d => (
                  <Card key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <View style={s.docIcon}><Text style={{ fontSize: 24 }}>📄</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{d.name}</Text>
                      <Text style={{ fontSize: 15, color: C.dm, marginTop: 2 }}>{d.category} · {fD(d.created_at)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.file_size ? ` · ${formatSize(d.file_size)}` : ''}</Text>
                    </View>
                    {d.file_url ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity onPress={() => openFile(d.file_url)}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.bl + '20' }}
                          activeOpacity={0.7}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>View</Text>
                        </TouchableOpacity>
                        {(isB || isCon) && (
                          <TouchableOpacity onPress={() => deleteDoc(d.id)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.rd + '15' }}
                            activeOpacity={0.7}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: C.rd }}>Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : null}
                  </Card>
                ))}
              </>
            )}

            {docTemplates.length === 0 && documents.length === 0 && (
              <Empty icon="📁" text="No documents uploaded" />
            )}
          </ScrollView>
        );
      }
      if (sub === 'photos') {
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.sectionTitle}>Photos</Text>
              {(isB || isCon) && <Btn onPress={() => setModal('uploadphoto')}><Text style={s.btnTxt}>⬆ Upload</Text></Btn>}
            </View>
            {photos.length === 0 ? <Empty icon="📷" text="No photos uploaded" /> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {photos.map(p => (
                  <View key={p.id} style={s.photoCard}>
                    <View style={[s.photoThumb, { backgroundColor: `hsl(${(p.id * 47) % 360}, 30%, 22%)` }]}>
                      <Text style={{ fontSize: 42 }}>📷</Text>
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ fontSize: 15, color: C.dm, marginTop: 2 }}>{p.category} · {sD(p.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        );
      }
      if (sub === 'videos') {
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.sectionTitle}>Videos</Text>
              {(isB || isCon) && <Btn onPress={() => setModal('uploadvideo')}><Text style={s.btnTxt}>⬆ Upload</Text></Btn>}
            </View>
            {videos.length === 0 ? <Empty icon="🎬" text="No videos uploaded yet" /> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {videos.map(v => (
                  <View key={v.id} style={s.photoCard}>
                    <View style={[s.photoThumb, { backgroundColor: C.modalBg }]}>
                      <Text style={{ fontSize: 42 }}>🎬</Text>
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }} numberOfLines={1}>{v.name}</Text>
                      <Text style={{ fontSize: 15, color: C.dm, marginTop: 2 }}>{sD(v.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        );
      }
    }

    return null;
  };

  // ============================================================
  // MODALS
  // ============================================================
  const renderModal = () => {
    // --- Change Order Detail with Digital Signatures ---
    if (modal?.type === 'co') {
      const co = modal.data;
      const isExpired = co.due_date && new Date(co.due_date + 'T23:59:59') < new Date();
      const canBuilderSign = isB && !co.builder_sig;
      const canCustomerSign = isC && !co.customer_sig && !isExpired;

      return (
        <ModalSheet visible title="Change Order" onClose={() => setModal(null)}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: C.text, marginBottom: 4 }}>{co.title}</Text>
          <Text style={{ fontSize: 21, color: C.mt, lineHeight: 33, marginBottom: 14 }}>{co.description}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ color: C.dm, fontSize: 20 }}>Created: {fD(co.created_at)}</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: co.amount >= 0 ? C.yl : C.gn }}>
              {co.amount >= 0 ? '+' : ''}{f$(co.amount)}
            </Text>
          </View>

          {co.due_date && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: C.dm, fontSize: 20 }}>Due: {fD(co.due_date)}</Text>
              {isExpired && co.status !== 'approved' && (
                <View style={{ backgroundColor: C.rd + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: C.rd }}>Expired</Text>
                </View>
              )}
            </View>
          )}

          <Text style={{ fontSize: 21, fontWeight: '600', color: C.text, marginBottom: 14 }}>Digital Signatures</Text>

          {/* Builder signature */}
          <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }]}>
            <View>
              <Text style={{ fontSize: 21, fontWeight: '600', color: C.text }}>Builder</Text>
              <Text style={{ fontSize: 18, color: C.dm, marginTop: 2 }}>
                {co.builder_sig ? `Signed ${fD(co.builder_sig_date)}` : 'Not yet signed'}
              </Text>
            </View>
            {co.builder_sig ? (
              <Text style={{ color: C.gn, fontSize: 20, fontWeight: '600' }}>✓ Signed</Text>
            ) : canBuilderSign ? (
              <Btn onPress={() => signCO(co.id, 'builder')} style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                <Text style={s.btnTxt}>✍ Sign</Text>
              </Btn>
            ) : (
              <Text style={{ color: C.dm, fontSize: 18 }}>Awaiting</Text>
            )}
          </View>

          {/* Customer signature */}
          <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }]}>
            <View>
              <Text style={{ fontSize: 21, fontWeight: '600', color: C.text }}>Customer</Text>
              <Text style={{ fontSize: 18, color: C.dm, marginTop: 2 }}>
                {co.customer_sig ? `Signed ${fD(co.customer_sig_date)}` : 'Not yet signed'}
              </Text>
            </View>
            {co.customer_sig ? (
              <Text style={{ color: C.gn, fontSize: 20, fontWeight: '600' }}>✓ Signed</Text>
            ) : canCustomerSign ? (
              <Btn onPress={() => signCO(co.id, 'customer')} bg={C.gn} style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                <Text style={s.btnTxt}>✍ Sign</Text>
              </Btn>
            ) : isExpired && isC && !co.customer_sig ? (
              <Text style={{ color: C.rd, fontSize: 18, fontWeight: '600' }}>Expired</Text>
            ) : (
              <Text style={{ color: C.dm, fontSize: 18 }}>Awaiting</Text>
            )}
          </View>

          <View style={[s.warnBox, {
            backgroundColor: co.status === 'approved' ? 'rgba(16,185,129,0.08)'
              : isExpired && co.status !== 'approved' ? 'rgba(239,68,68,0.08)' : undefined,
            borderColor: co.status === 'approved' ? 'rgba(16,185,129,0.2)'
              : isExpired && co.status !== 'approved' ? 'rgba(239,68,68,0.2)' : undefined,
          }]}>
            <Text style={[s.warnTxt, {
              color: co.status === 'approved' ? C.gnB
                : isExpired && co.status !== 'approved' ? C.rd : C.yl
            }]}>
              {co.status === 'approved'
                ? '✓ Approved — reflected in Price Summary'
                : isExpired && co.status !== 'approved'
                  ? 'This change order has expired — the due date has passed'
                  : 'Requires both signatures to update Price Summary'}
            </Text>
          </View>
        </ModalSheet>
      );
    }

    // --- Change Order Type Picker ---
    if (modal === 'coTypePicker') {
      return (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }} activeOpacity={1} onPress={() => setModal(null)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{
                backgroundColor: C.modalBg, borderRadius: 16, width: 320, overflow: 'hidden',
                borderWidth: 1, borderColor: C.w10,
                ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' } : { elevation: 20 }),
              }}>
                <View style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold, textAlign: 'center' }}>New Change Order</Text>
                </View>
                <TouchableOpacity onPress={() => setModal('newco')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.w06 }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 28 }}>📝</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>Custom Change Order</Text>
                    <Text style={{ fontSize: 16, color: C.dm, marginTop: 2 }}>Enter title, description & cost</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setModal('newselco')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 20 }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 28 }}>🔄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>Selection Change Order</Text>
                    <Text style={{ fontSize: 16, color: C.dm, marginTop: 2 }}>Change an existing selection</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      );
    }

    // --- New Change Order ---
    if (modal === 'newco') {
      return <NewChangeOrderModal project={project} api={api} user={user} onClose={() => setModal(null)} onCreated={(co) => {
        setChangeOrders(prev => [co, ...prev]);
        setModal(null);
        Alert.alert('Success', 'Change order created & signed as builder');
      }} />;
    }

    // --- Selection Change Order ---
    if (modal === 'newselco') {
      return <SelectionChangeOrderModal project={project} api={api} selections={selections} user={user}
        onClose={() => setModal(null)}
        onCreated={(co) => {
          setChangeOrders(prev => [co, ...prev]);
          setModal(null);
          Alert.alert('Success', 'Selection change order created & signed');
        }}
      />;
    }

    // --- New Schedule Item ---
    if (modal === 'newschedule') {
      return <NewScheduleModal project={project} user={user} api={api} prefillDate={prefillDate}
        onClose={() => { setModal(null); setPrefillDate(''); }}
        onCreated={(item) => {
          setSchedule(prev => [...prev, item]);
          setModal(null);
          setPrefillDate('');
          Alert.alert('Success', 'Schedule item added');
        }}
      />;
    }

    // --- Upload Document / Photo / Video ---
    const isUploadModal = modal === 'uploaddoc' || modal === 'uploadphoto' || modal === 'uploadvideo' || (modal && modal.type === 'uploaddoc');
    if (isUploadModal) {
      const mediaType = modal === 'uploadphoto' ? 'photo' : modal === 'uploadvideo' ? 'video' : 'document';
      const templateId = modal?.templateId || null;
      const templateName = modal?.templateName || null;
      return <UploadModal
        project={project} user={user} api={api} mediaType={mediaType}
        templateId={templateId} templateName={templateName}
        onClose={() => setModal(null)}
        onCreated={(doc) => {
          if (mediaType === 'photo') setPhotos(prev => [doc, ...prev]);
          else if (mediaType === 'video') setVideos(prev => [doc, ...prev]);
          else setDocuments(prev => [doc, ...prev]);
          setModal(null);
          Alert.alert('Success', `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} uploaded`);
        }}
      />;
    }

    return null;
  };

  // ============================================================
  // LAYOUT
  // ============================================================
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, minHeight: 0 }}>
      {renderModal()}

      {/* Client View banner */}
      {clientView && (
        <View style={{
          backgroundColor: C.gn + '18',
          borderBottomWidth: 1,
          borderBottomColor: C.gn + '40',
          paddingVertical: 10,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>🏠</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.gn }}>Client View</Text>
            <Text style={{ fontSize: 14, color: C.dm }}>— Viewing as customer</Text>
          </View>
          {onClientViewToggle && (
            <TouchableOpacity
              onPress={onClientViewToggle}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: C.gn + '25' }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gn }}>Exit</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Header — hidden when embedded in dashboard */}
      {!embedded && (
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.headerBack} activeOpacity={0.7}>
            <Text style={s.headerBackTxt}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle} numberOfLines={1}>{project.name}</Text>
            {project.number ? <Text style={{ fontSize: 15, color: C.dm, marginTop: 1 }}>{project.number}</Text> : null}
          </View>
          <View style={{ width: 32 }} />
        </View>
      )}

      {/* Main tabs — only shown when not embedded (embedded: tabs are in dashboard header) */}
      {!embedded && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: C.mode === 'light' ? 'rgba(255,255,255,0.08)' : C.bd, backgroundColor: C.mode === 'dark' ? 'rgba(15,25,35,0.5)' : C.headerBg }}
          contentContainerStyle={{ flexGrow: 1 }}>
          {tabs.map(t => (
            <HoverTab key={t.id} onPress={() => switchTab(t)} active={tab === t.id}
              style={s.tab} activeStyle={s.tabOn}>
              <Text style={[s.tabTxt, { color: C.mode === 'light' ? C.chromeDm : C.mt }, tab === t.id && s.tabTxtOn, tab === t.id && C.mode === 'light' && { color: C.chromeTxt }]}>{t.label}</Text>
            </HoverTab>
          ))}
        </ScrollView>
      )}

      {/* Sub tabs */}
      {curTab?.subs && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: C.bd }}
          contentContainerStyle={{ flexGrow: 1 }}>
          {curTab.subs.map(s2 => (
            <HoverTab key={s2} onPress={() => setSub(s2)} active={sub === s2}
              style={s.subTab} activeStyle={s.subTabOn}>
              <Text style={[s.subTabTxt, sub === s2 && s.subTabTxtOn]}>{subLabels[s2]}</Text>
            </HoverTab>
          ))}
        </ScrollView>
      )}

      {/* Content */}
      <View style={{ flex: 1, minHeight: 0 }}>
        {renderContent()}
      </View>
    </View>
  );
};

// ============================================================
// ISOLATED MODAL COMPONENTS
// ============================================================

const NewChangeOrderModal = ({ project, api, onClose, onCreated, user }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [signStep, setSignStep] = useState(false);

  const create = async () => {
    const amt = isCredit ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    setLoading(true);
    try {
      const res = await api(`/projects/${project.id}/change-orders`, {
        method: 'POST',
        body: { title, description: desc, amount: amt, due_date: dueDate || null },
      });
      if (!res) {
        Alert.alert('Error', 'Failed to create change order. Please try again.');
        return;
      }
      onCreated(res);
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  if (signStep) {
    return (
      <Modal visible animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{
            backgroundColor: C.modalBg, borderRadius: 16, padding: 28, width: '90%', maxWidth: 440,
            borderWidth: 1, borderColor: C.w10,
            ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' } : { elevation: 20 }),
          }}>
            <Text style={{ fontSize: 30, fontWeight: '700', color: C.textBold, textAlign: 'center', marginBottom: 8 }}>
              Sign Change Order
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '600', color: C.gd, textAlign: 'center', marginBottom: 16 }}>
              {title} — {isCredit ? '-' : '+'}{f$(Math.abs(parseFloat(amount || 0)))}
            </Text>

            <View style={{
              backgroundColor: C.mode === 'dark' ? C.bH08 : C.bH05,
              borderWidth: 1, borderColor: C.gd + '30',
              borderRadius: 10, padding: 16, marginBottom: 24,
            }}>
              <Text style={{ fontSize: 21, lineHeight: 33, color: C.mt, textAlign: 'center' }}>
                By signing, you are submitting this change order to the customer for approval.
                {dueDate ? `\nDue date: ${fD(dueDate)}` : ''}
              </Text>
            </View>

            <View style={{ borderBottomWidth: 1, borderBottomColor: C.w15, marginBottom: 6, paddingBottom: 2 }}>
              <Text style={{ fontSize: 21, color: C.text, fontWeight: '600' }}>{user?.name || 'Signature'}</Text>
            </View>
            <Text style={{ fontSize: 16, color: C.dm, marginBottom: 24 }}>Electronic Signature</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setSignStep(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}
                activeOpacity={0.7}>
                <Text style={{ fontSize: 21, fontWeight: '600', color: C.mt }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={create} disabled={loading}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
                activeOpacity={0.8}>
                <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>
                  {loading ? 'Sending...' : 'Sign & Send'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <ModalSheet visible title="New Change Order" onClose={onClose}>
      <Inp label="TITLE" value={title} onChange={setTitle} placeholder="e.g., Upgrade master bath tile" />
      <Inp label="DESCRIPTION" value={desc} onChange={setDesc} placeholder="Describe the change..." rows={3} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Inp label="AMOUNT ($)" value={amount} onChange={setAmount} type="number" placeholder="0" style={{ flex: 1 }} />
        <View style={{ marginBottom: 14 }}>
          <Lbl>TYPE</Lbl>
          <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.bd }}>
            <TouchableOpacity onPress={() => setIsCredit(false)} style={[s.typeBtn, !isCredit && { backgroundColor: C.yl + '22' }]}>
              <Text style={[s.typeBtnTxt, !isCredit && { color: C.yl }]}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsCredit(true)} style={[s.typeBtn, isCredit && { backgroundColor: C.gn + '22' }]}>
              <Text style={[s.typeBtnTxt, isCredit && { color: C.gnB }]}>Credit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <DatePicker value={dueDate} onChange={setDueDate} label="DUE DATE" placeholder="Select due date" />
      <Btn onPress={() => {
        if (!title || !amount) return Alert.alert('Error', 'Title and amount are required');
        setSignStep(true);
      }} disabled={!title || !amount}>
        <Text style={s.btnTxt}>Sign & Send</Text>
      </Btn>
    </ModalSheet>
  );
};

const SelectionChangeOrderModal = ({ project, api, selections, onClose, onCreated, user }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [newOption, setNewOption] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [signStep, setSignStep] = useState(false);

  const getOptPrice = (options, optName) => {
    const opt = (options || []).find(o => (typeof o === 'object' ? o.name : o) === optName);
    if (!opt || typeof opt !== 'object') return 0;
    return opt.comes_standard ? 0 : (opt.price || 0);
  };

  const currentPrice = selectedItem ? getOptPrice(selectedItem.options, selectedItem.selected) : 0;
  const newPrice = newOption ? getOptPrice(selectedItem?.options, newOption) : 0;
  const priceDiff = newPrice - currentPrice;
  const coTitle = selectedItem && newOption ? `Selection Change: ${selectedItem.item} — ${selectedItem.selected} → ${newOption}` : '';
  const coDesc = selectedItem && newOption ? `Changed ${selectedItem.item} from ${selectedItem.selected} to ${newOption}` : '';

  const create = async () => {
    setLoading(true);
    try {
      const res = await api(`/projects/${project.id}/change-orders`, {
        method: 'POST',
        body: { title: coTitle, description: coDesc, amount: priceDiff, due_date: dueDate || null },
      });
      if (!res) {
        Alert.alert('Error', 'Failed to create change order. Please try again.');
        return;
      }
      onCreated(res);
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  // Available selections (those with a current choice)
  const available = selections.filter(sel => sel.selected);

  if (signStep) {
    return (
      <Modal visible animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{
            backgroundColor: C.modalBg, borderRadius: 16, padding: 28, width: '90%', maxWidth: 440,
            borderWidth: 1, borderColor: C.w10,
            ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' } : { elevation: 20 }),
          }}>
            <Text style={{ fontSize: 30, fontWeight: '700', color: C.textBold, textAlign: 'center', marginBottom: 8 }}>
              Sign Change Order
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '600', color: C.gd, textAlign: 'center', marginBottom: 16 }} numberOfLines={2}>
              {selectedItem?.item}: {selectedItem?.selected} → {newOption}
            </Text>

            <View style={{
              backgroundColor: C.mode === 'dark' ? C.bH08 : C.bH05,
              borderWidth: 1, borderColor: C.gd + '30',
              borderRadius: 10, padding: 16, marginBottom: 16,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 18, color: C.dm }}>Price difference</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: priceDiff >= 0 ? C.yl : C.gn }}>
                  {priceDiff >= 0 ? '+' : ''}{f$(priceDiff)}
                </Text>
              </View>
              <Text style={{ fontSize: 18, lineHeight: 28, color: C.mt, textAlign: 'center' }}>
                By signing, you are submitting this selection change order to the customer for approval.
                {dueDate ? `\nDue date: ${fD(dueDate)}` : ''}
              </Text>
            </View>

            <View style={{ borderBottomWidth: 1, borderBottomColor: C.w15, marginBottom: 6, paddingBottom: 2 }}>
              <Text style={{ fontSize: 21, color: C.text, fontWeight: '600' }}>{user?.name || 'Signature'}</Text>
            </View>
            <Text style={{ fontSize: 16, color: C.dm, marginBottom: 24 }}>Electronic Signature</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setSignStep(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}
                activeOpacity={0.7}>
                <Text style={{ fontSize: 21, fontWeight: '600', color: C.mt }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={create} disabled={loading}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
                activeOpacity={0.8}>
                <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>
                  {loading ? 'Sending...' : 'Sign & Send'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <ModalSheet visible title="Selection Change Order" onClose={onClose}>
      {/* Step 1: Pick a selection */}
      {!selectedItem && (
        <>
          <Lbl>SELECT ITEM TO CHANGE</Lbl>
          {available.length === 0 ? (
            <Text style={{ fontSize: 20, color: C.dm, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 }}>
              No selections with a current choice
            </Text>
          ) : (
            available.map(sel => (
              <TouchableOpacity key={sel.project_selection_id || sel.id} onPress={() => setSelectedItem(sel)}
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
                  borderRadius: 10, borderWidth: 1, borderColor: C.bd, backgroundColor: C.mode === 'dark' ? C.w06 : '#fff',
                }}
                activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{sel.item}</Text>
                  <Text style={{ fontSize: 17, color: C.dm, marginTop: 2 }}>Currently: {sel.selected}</Text>
                </View>
                <Text style={{ fontSize: 20, color: C.dm }}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </>
      )}

      {/* Step 2: Show current + pick new option */}
      {selectedItem && !newOption && (
        <>
          <TouchableOpacity onPress={() => setSelectedItem(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Text style={{ fontSize: 20, color: C.gd }}>‹</Text>
            <Text style={{ fontSize: 18, color: C.gd, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>

          <View style={{
            borderRadius: 10, borderWidth: 1, borderColor: C.gd + '40', backgroundColor: C.bH05,
            padding: 14, marginBottom: 16,
          }}>
            <Text style={{ fontSize: 16, color: C.dm, fontWeight: '600', marginBottom: 4 }}>CURRENT SELECTION</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>{selectedItem.item}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ fontSize: 20, color: C.gd, fontWeight: '600' }}>{selectedItem.selected}</Text>
              <Text style={{ fontSize: 18, color: currentPrice > 0 ? C.yl : C.gn, fontWeight: '600' }}>
                {currentPrice > 0 ? f$(currentPrice) : 'Standard'}
              </Text>
            </View>
          </View>

          <Lbl>CHOOSE NEW OPTION</Lbl>
          {(selectedItem.options || []).filter(opt => {
            const optName = typeof opt === 'object' ? opt.name : opt;
            return optName !== selectedItem.selected;
          }).map((opt, i) => {
            const isObj = typeof opt === 'object';
            const optName = isObj ? opt.name : opt;
            const price = isObj ? (opt.comes_standard ? 0 : (opt.price || 0)) : 0;
            const standard = isObj ? opt.comes_standard : false;
            const diff = price - currentPrice;
            return (
              <TouchableOpacity key={i} onPress={() => setNewOption(optName)}
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
                  borderRadius: 10, borderWidth: 1, borderColor: C.bd, backgroundColor: C.mode === 'dark' ? C.w06 : '#fff',
                }}
                activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{optName}</Text>
                  <Text style={{ fontSize: 16, color: standard ? C.gn : C.dm, marginTop: 2 }}>
                    {standard ? 'Standard' : price > 0 ? f$(price) : 'Included'}
                  </Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: diff > 0 ? C.yl : diff < 0 ? C.gn : C.dm }}>
                  {diff > 0 ? `+${f$(diff)}` : diff < 0 ? f$(diff) : '$0'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* Step 3: Review + due date + sign */}
      {selectedItem && newOption && (
        <>
          <TouchableOpacity onPress={() => setNewOption(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Text style={{ fontSize: 20, color: C.gd }}>‹</Text>
            <Text style={{ fontSize: 18, color: C.gd, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>

          <View style={{
            borderRadius: 10, borderWidth: 1, borderColor: C.bd, backgroundColor: C.mode === 'dark' ? C.w06 : '#fff',
            padding: 16, marginBottom: 16,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 10 }}>{selectedItem.item}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={{ fontSize: 18, color: C.dm, textDecorationLine: 'line-through' }}>{selectedItem.selected}</Text>
              <Text style={{ fontSize: 18, color: C.dm }}>→</Text>
              <Text style={{ fontSize: 18, color: C.gd, fontWeight: '600' }}>{newOption}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.w10 }}>
              <Text style={{ fontSize: 18, color: C.dm }}>Price difference</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: priceDiff >= 0 ? C.yl : C.gn }}>
                {priceDiff >= 0 ? '+' : ''}{f$(priceDiff)}
              </Text>
            </View>
          </View>

          <DatePicker value={dueDate} onChange={setDueDate} label="DUE DATE" placeholder="Select due date" />
          <Btn onPress={() => setSignStep(true)}>
            <Text style={s.btnTxt}>Sign & Send</Text>
          </Btn>
        </>
      )}
    </ModalSheet>
  );
};

const NewScheduleModal = ({ project, user, api, onClose, onCreated, prefillDate }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  const [task, setTask] = useState('');
  const [startDate, setStartDate] = useState(prefillDate || '');
  const [workdays, setWorkdays] = useState('1');
  const [contractor, setContractor] = useState('');
  const [loading, setLoading] = useState(false);

  // Calculate end date from start + workdays (skip weekends)
  const calcEndDate = (start, days) => {
    if (!start || !days || days < 1) return '';
    let d = new Date(start + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    let remaining = parseInt(days) - 1; // first day counts
    while (remaining > 0) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) remaining--;
    }
    return d.toISOString().split('T')[0];
  };

  const endDate = calcEndDate(startDate, parseInt(workdays) || 1);

  const create = async () => {
    if (!task.trim()) return Alert.alert('Error', 'Task title is required');
    if (!startDate) return Alert.alert('Error', 'Start date is required');
    setLoading(true);
    try {
      const body = {
        task: task.trim(), start_date: startDate, end_date: endDate,
        baseline_start: startDate, baseline_end: endDate,
        contractor: contractor.trim(),
      };
      const res = await api(`/projects/${project.id}/schedule`, { method: 'POST', body });
      onCreated(res || { id: Date.now(), job_id: project.id, ...body });
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  // Quick workday presets
  const presets = [1, 2, 3, 5, 10, 15, 20];

  return (
    <ModalSheet visible title="New Schedule Item" onClose={onClose}>
      <Inp label="TASK TITLE" value={task} onChange={setTask} placeholder="e.g., Pour Foundation" />
      <Inp label="CONTRACTOR / ASSIGNED TO" value={contractor} onChange={setContractor} placeholder="e.g., Mike Harmon" />
      <DatePicker label="START DATE" value={startDate} onChange={setStartDate} placeholder="Select start date" />
      <Lbl>WORKDAYS</Lbl>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {presets.map(p => (
          <TouchableOpacity key={p} onPress={() => setWorkdays(String(p))}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
              borderWidth: 1, borderColor: parseInt(workdays) === p ? C.gd : C.w08,
              backgroundColor: parseInt(workdays) === p ? C.bH12 : C.w03,
            }}>
            <Text style={{ fontSize: 20, color: parseInt(workdays) === p ? C.gd : C.mt, fontWeight: parseInt(workdays) === p ? '700' : '400' }}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Inp label="CUSTOM DAYS" value={workdays} onChange={setWorkdays} placeholder="1" type="number" />
        </View>
        <View style={{ flex: 1 }}>
          <Lbl>END DATE</Lbl>
          <View style={{ backgroundColor: C.w04, borderWidth: 1, borderColor: C.w08, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 22, color: endDate ? C.text : C.dm }}>{endDate || 'Auto-calculated'}</Text>
          </View>
        </View>
      </View>
      <Btn onPress={create} disabled={loading || !task.trim() || !startDate}>
        <Text style={s.btnTxt}>{loading ? 'Creating...' : 'Add to Schedule'}</Text>
      </Btn>
    </ModalSheet>
  );
};


const UploadModal = ({ project, user, api, mediaType, templateId, templateName, onClose, onCreated }) => {
  const C = React.useContext(ThemeContext);
  const s = React.useMemo(() => getStyles(C), [C]);
  const [name, setName] = useState(templateName || '');
  const [category, setCategory] = useState('General');
  const [loading, setLoading] = useState(false);
  const [fileData, setFileData] = useState(null); // { b64, ext, originalName, size }
  const docCategories = ['General', 'Plans', 'Permits', 'Contracts', 'Reports', 'Specs'];

  const pickFile = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    if (mediaType === 'photo') input.accept = 'image/*';
    else if (mediaType === 'video') input.accept = 'video/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop() || 'bin';
      const reader = new FileReader();
      reader.onload = () => {
        setFileData({ b64: reader.result, ext, originalName: file.name, size: file.size });
        if (!name || name === templateName) setName(file.name.replace(/\.[^/.]+$/, ''));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const upload = async () => {
    if (!name) return Alert.alert('Error', 'Name is required');
    if (!fileData) return Alert.alert('Error', 'Please select a file');
    setLoading(true);
    try {
      // Upload the actual file
      const uploadRes = await fetch(`${API_BASE}/upload-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: fileData.b64, ext: fileData.ext, name: fileData.originalName }),
      });
      if (!uploadRes.ok) throw new Error('File upload failed');
      const uploadData = await uploadRes.json();

      // Create document record with file_url
      const body = {
        name, category, media_type: mediaType,
        file_size: uploadData.file_size || fileData.size || 0,
        file_url: uploadData.path,
        uploaded_by: user?.name || '',
        template_id: templateId || null,
      };
      const res = await api(`/projects/${project.id}/documents`, { method: 'POST', body });
      if (!res) {
        Alert.alert('Error', 'Failed to save document record');
        return;
      }
      onCreated(res);
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  const typeLabel = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);

  return (
    <ModalSheet visible title={templateName ? `Upload: ${templateName}` : `Upload ${typeLabel}`} onClose={onClose}>
      <TouchableOpacity onPress={pickFile} activeOpacity={0.7}
        style={[s.uploadZone, fileData && { borderColor: C.gn, backgroundColor: C.gn + '10' }]}>
        {fileData ? (
          <>
            <Text style={{ fontSize: 36, marginBottom: 6 }}>✓</Text>
            <Text style={{ color: C.gn, fontSize: 18, fontWeight: '600' }}>{fileData.originalName}</Text>
            <Text style={{ color: C.dm, fontSize: 15, marginTop: 2 }}>
              {fileData.size < 1024 * 1024 ? `${(fileData.size / 1024).toFixed(1)} KB` : `${(fileData.size / (1024 * 1024)).toFixed(1)} MB`}
            </Text>
            <Text style={{ color: C.bl, fontSize: 15, marginTop: 6 }}>Tap to change file</Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 42, marginBottom: 6 }}>⬆</Text>
            <Text style={{ color: C.gd, fontSize: 20, fontWeight: '600' }}>Tap to select file</Text>
            <Text style={{ color: C.dm, fontSize: 15, marginTop: 4 }}>Choose a file from your device</Text>
          </>
        )}
      </TouchableOpacity>
      <Inp label="DISPLAY NAME" value={name} onChange={setName} placeholder={`${typeLabel} name`} />
      {mediaType === 'document' && !templateId && (
        <View style={{ marginBottom: 14 }}>
          <Lbl>CATEGORY</Lbl>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {docCategories.map(c => (
              <TouchableOpacity key={c} onPress={() => setCategory(c)}
                style={[{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
                  category === c
                    ? { borderColor: C.gd, backgroundColor: C.bH12 }
                    : { borderColor: C.w08 }
                ]}>
                <Text style={{ fontSize: 18, color: category === c ? C.gd : C.mt }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {mediaType === 'photo' && <Inp label="CATEGORY" value={category} onChange={setCategory} placeholder="e.g., Foundation, Framing" />}
      <Btn onPress={upload} disabled={loading || !name || !fileData}>
        <Text style={s.btnTxt}>{loading ? 'Uploading...' : 'Upload'}</Text>
      </Btn>
    </ModalSheet>
  );
};

// ============================================================
// BASELINE COMPARISON VIEW
// ============================================================
const _toDate = (s) => { if (!s) return null; const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; };
const _wdCount = (s, e) => {
  const a = _toDate(s), b = _toDate(e);
  if (!a || !b) return 0;
  let c = 0, d = new Date(a);
  while (d <= b) { if (d.getDay() !== 0 && d.getDay() !== 6) c++; d.setDate(d.getDate() + 1); }
  return c;
};
const _fmtDate = (s) => {
  const d = _toDate(s);
  if (!d) return '—';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};
const _slipTxt = (n) => {
  if (n === 0) return '0 workdays';
  const abs = Math.abs(n);
  return `${n > 0 ? '+' : '-'}${abs} workday${abs !== 1 ? 's' : ''}`;
};

const BaselineView = ({ schedule, project, api }) => {
  const C = React.useContext(ThemeContext);
  const bl = React.useMemo(() => getBLStyles(C), [C]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editLogs, setEditLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch all edit logs once for edit count column
  React.useEffect(() => {
    if (project && api) {
      api(`/projects/${project.id}/schedule-edit-log`).then(logs => {
        if (logs) setAllLogs(logs);
      });
    }
  }, [project, api]);

  // Build edit count map: schedule_id -> number of edits
  const editCountMap = {};
  allLogs.forEach(l => {
    editCountMap[l.schedule_id] = (editCountMap[l.schedule_id] || 0) + 1;
  });

  const handleRowPress = async (task) => {
    setSelectedTask(task);
    setEditLogs([]);
    if (project && api) {
      setLogsLoading(true);
      try {
        const logs = await api(`/projects/${project.id}/schedule-edit-log`);
        if (logs) {
          setEditLogs(logs.filter(l => l.schedule_id === task.id));
        }
      } catch (e) { console.warn('Failed to load edit logs:', e); }
      finally { setLogsLoading(false); }
    }
  };

  if (!schedule || schedule.length === 0) {
    return <Empty icon="📊" text="No schedule items" sub="Add tasks to see baseline comparison" />;
  }

  const hasBaseline = schedule.some(t => t.baseline_start && t.baseline_end);
  if (!hasBaseline) {
    return <Empty icon="📊" text="No baseline set" sub="Baselines are set when the project goes live" />;
  }

  // Summary stats (based on duration slip)
  const totalTasks = schedule.filter(t => t.baseline_end).length;
  const slipped = schedule.filter(t => {
    const exp = _wdCount(t.baseline_start, t.baseline_end);
    const act = _wdCount(t.start_date, t.end_date);
    return exp > 0 && act - exp > 0;
  }).length;
  const onTrack = schedule.filter(t => {
    const exp = _wdCount(t.baseline_start, t.baseline_end);
    const act = _wdCount(t.start_date, t.end_date);
    return exp > 0 && act - exp === 0;
  }).length;
  const ahead = schedule.filter(t => {
    const exp = _wdCount(t.baseline_start, t.baseline_end);
    const act = _wdCount(t.start_date, t.end_date);
    return exp > 0 && act - exp < 0;
  }).length;

  return (
    <View style={{ flex: 1 }}>
      {/* Summary cards */}
      <View style={bl.summaryRow}>
        <View style={[bl.summaryCard, { borderLeftColor: C.bl }]}>
          <Text style={bl.summaryNum}>{totalTasks}</Text>
          <Text style={bl.summaryLbl}>Total Tasks</Text>
        </View>
        <View style={[bl.summaryCard, { borderLeftColor: C.gn }]}>
          <Text style={[bl.summaryNum, { color: C.gn }]}>{onTrack}</Text>
          <Text style={bl.summaryLbl}>On Track</Text>
        </View>
        <View style={[bl.summaryCard, { borderLeftColor: C.gd }]}>
          <Text style={[bl.summaryNum, { color: C.gd }]}>{ahead}</Text>
          <Text style={bl.summaryLbl}>Ahead</Text>
        </View>
        <View style={[bl.summaryCard, { borderLeftColor: C.rd }]}>
          <Text style={[bl.summaryNum, { color: C.rd }]}>{slipped}</Text>
          <Text style={bl.summaryLbl}>Slipped</Text>
        </View>
      </View>

      {/* Table */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'}>
          <View>
            {/* Header row 1 — group headers */}
            <View style={bl.headerRow}>
              <View style={[bl.cell, bl.cellCheck]} />
              <View style={[bl.cell, bl.cellTitle]} />
              <View style={[bl.cellGroup, { width: 280 }]}>
                <Text style={bl.groupTxt}>Duration</Text>
              </View>
              <View style={[bl.cell, bl.cellSlip]} />
              <View style={[bl.cellGroup, { width: 260 }]}>
                <Text style={bl.groupTxt}>Start Date</Text>
              </View>
              <View style={[bl.cellGroup, { width: 260 }]}>
                <Text style={bl.groupTxt}>End Date</Text>
              </View>
              <View style={[bl.cell, bl.cellSlip]} />
              <View style={[bl.cell, bl.cellShifts]} />
            </View>

            {/* Header row 2 — column labels */}
            <View style={[bl.headerRow, bl.headerRow2]}>
              <View style={[bl.cell, bl.cellCheck]}>
                <Text style={bl.colTxt}>✓</Text>
              </View>
              <View style={[bl.cell, bl.cellTitle]}>
                <Text style={bl.colTxt}>Title</Text>
              </View>
              <View style={[bl.cell, bl.cellDur]}>
                <Text style={bl.colTxt}>Expected</Text>
              </View>
              <View style={[bl.cell, bl.cellDur]}>
                <Text style={bl.colTxt}>Actual</Text>
              </View>
              <View style={[bl.cell, bl.cellSlip]}>
                <Text style={bl.colTxt}>Duration Slip</Text>
              </View>
              <View style={[bl.cell, bl.cellDate]}>
                <Text style={bl.colTxt}>Expected</Text>
              </View>
              <View style={[bl.cell, bl.cellDate]}>
                <Text style={bl.colTxt}>Actual</Text>
              </View>
              <View style={[bl.cell, bl.cellDate]}>
                <Text style={bl.colTxt}>Expected</Text>
              </View>
              <View style={[bl.cell, bl.cellDate]}>
                <Text style={bl.colTxt}>Actual</Text>
              </View>
              <View style={[bl.cell, bl.cellSlip]}>
                <Text style={bl.colTxt}>Total Days{'\n'}Slipped</Text>
              </View>
              <View style={[bl.cell, bl.cellShifts]}>
                <Text style={bl.colTxt}>Edits</Text>
              </View>
            </View>

            {/* Data rows */}
            {schedule.map((task, idx) => {
              const expDur = _wdCount(task.baseline_start, task.baseline_end);
              const actDur = _wdCount(task.start_date, task.end_date);
              const durSlip = actDur - expDur;
              // Total days slipped: workday difference between baseline end and actual end
              const bEnd = _toDate(task.baseline_end), aEnd = _toDate(task.end_date);
              let totalSlip = 0;
              if (bEnd && aEnd) {
                const fwd = aEnd >= bEnd;
                let d = new Date(bEnd);
                if (fwd) { while (d < aEnd) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) totalSlip++; } }
                else { while (d > aEnd) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) totalSlip--; } }
              }
              const editCount = editCountMap[task.id] || 0;
              const isComplete = calcTaskProgress(task).pct === 100;
              const isOdd = idx % 2 === 1;

              return (
                <TouchableOpacity
                  key={task.id}
                  activeOpacity={0.7}
                  onPress={() => handleRowPress(task)}
                  style={[bl.dataRow, isOdd && bl.dataRowAlt]}
                >
                  {/* Complete */}
                  <View style={[bl.cell, bl.cellCheck]}>
                    <View style={[bl.checkCircle, isComplete && bl.checkCircleOn]}>
                      {isComplete && <Text style={bl.checkMark}>✓</Text>}
                    </View>
                  </View>

                  {/* Title */}
                  <View style={[bl.cell, bl.cellTitle]}>
                    <Text style={bl.titleTxt} numberOfLines={2}>{task.task}</Text>
                  </View>

                  {/* Duration Expected */}
                  <View style={[bl.cell, bl.cellDur]}>
                    <Text style={bl.valTxt}>{expDur > 0 ? `${expDur} workday${expDur !== 1 ? 's' : ''}` : '—'}</Text>
                  </View>

                  {/* Duration Actual */}
                  <View style={[bl.cell, bl.cellDur]}>
                    <Text style={bl.valTxt}>{actDur > 0 ? `${actDur} workday${actDur !== 1 ? 's' : ''}` : '—'}</Text>
                  </View>

                  {/* Duration Slip */}
                  <View style={[bl.cell, bl.cellSlip, durSlip > 0 && bl.slipCellBad]}>
                    <Text style={[bl.valTxt, durSlip > 0 ? bl.slipBad : durSlip < 0 ? bl.slipGood : null]}>
                      {_slipTxt(durSlip)}
                    </Text>
                  </View>

                  {/* Start Expected */}
                  <View style={[bl.cell, bl.cellDate]}>
                    <Text style={bl.valTxt}>{_fmtDate(task.baseline_start)}</Text>
                  </View>

                  {/* Start Actual */}
                  <View style={[bl.cell, bl.cellDate]}>
                    <Text style={bl.valTxt}>{_fmtDate(task.start_date)}</Text>
                  </View>

                  {/* End Expected */}
                  <View style={[bl.cell, bl.cellDate]}>
                    <Text style={bl.valTxt}>{_fmtDate(task.baseline_end)}</Text>
                  </View>

                  {/* End Actual */}
                  <View style={[bl.cell, bl.cellDate]}>
                    <Text style={bl.valTxt}>{_fmtDate(task.end_date)}</Text>
                  </View>

                  {/* Total Days Slipped */}
                  <View style={[bl.cell, bl.cellSlip, totalSlip > 0 && bl.slipCellBad]}>
                    <Text style={[bl.valTxt, totalSlip > 0 ? bl.slipBad : totalSlip < 0 ? bl.slipGood : null]}>
                      {_slipTxt(totalSlip)}
                    </Text>
                  </View>

                  {/* Edits */}
                  <View style={[bl.cell, bl.cellShifts]}>
                    <Text style={[bl.valTxt, editCount > 0 && bl.slipBad]}>
                      {editCount}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Edit History Popup */}
      {selectedTask && (
        <Modal visible animationType="fade" transparent>
          <View style={bl.modalOverlay}>
            <View style={bl.modalBox}>
              {/* Header */}
              <View style={bl.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={bl.modalTitle}>{selectedTask.task}</Text>
                  <Text style={bl.modalSub}>
                    {_fmtDate(selectedTask.start_date)} → {_fmtDate(selectedTask.end_date)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedTask(null)} style={bl.modalCloseBtn}>
                  <Text style={bl.modalCloseTxt}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Task summary */}
              <View style={bl.modalSummaryRow}>
                <View style={bl.modalSummaryItem}>
                  <Text style={bl.modalSummaryLabel}>Baseline Duration</Text>
                  <Text style={bl.modalSummaryVal}>
                    {_wdCount(selectedTask.baseline_start, selectedTask.baseline_end)} workdays
                  </Text>
                </View>
                <View style={bl.modalSummaryItem}>
                  <Text style={bl.modalSummaryLabel}>Current Duration</Text>
                  <Text style={bl.modalSummaryVal}>
                    {_wdCount(selectedTask.start_date, selectedTask.end_date)} workdays
                  </Text>
                </View>
                <View style={bl.modalSummaryItem}>
                  <Text style={bl.modalSummaryLabel}>Duration Slip</Text>
                  <Text style={[bl.modalSummaryVal, {
                    color: (_wdCount(selectedTask.start_date, selectedTask.end_date) - _wdCount(selectedTask.baseline_start, selectedTask.baseline_end)) > 0
                      ? C.rd : (_wdCount(selectedTask.start_date, selectedTask.end_date) - _wdCount(selectedTask.baseline_start, selectedTask.baseline_end)) < 0 ? C.gn : C.mt,
                  }]}>
                    {_slipTxt(_wdCount(selectedTask.start_date, selectedTask.end_date) - _wdCount(selectedTask.baseline_start, selectedTask.baseline_end))}
                  </Text>
                </View>
              </View>

              {/* Edit log list */}
              <View style={bl.modalLogHeader}>
                <Text style={bl.modalLogTitle}>📝 Edit History</Text>
              </View>

              <ScrollView style={bl.modalLogScroll} contentContainerStyle={{ paddingBottom: 16 }}>
                {logsLoading ? (
                  <View style={{ padding: 30, alignItems: 'center' }}>
                    <ActivityIndicator color={C.gd} />
                    <Text style={{ color: C.dm, fontSize: 32, marginTop: 8 }}>Loading edit history...</Text>
                  </View>
                ) : editLogs.length === 0 ? (
                  <View style={{ padding: 30, alignItems: 'center' }}>
                    <Text style={{ fontSize: 72, marginBottom: 8 }}>✅</Text>
                    <Text style={{ color: C.dm, fontSize: 34 }}>No edits recorded for this task</Text>
                    <Text style={{ color: C.dm, fontSize: 28, marginTop: 4 }}>Task is still at its original schedule</Text>
                  </View>
                ) : (
                  editLogs.map((log, i) => {
                    const fieldLabel = {
                      end_date: 'End Date', start_date: 'Start Date',
                      task: 'Task Name', contractor: 'Contractor',
                      progress: 'Progress', lag_days: 'Lag Days',
                    }[log.field_changed] || log.field_changed;

                    // Calculate days slipped for date fields
                    let slipInfo = null;
                    if ((log.field_changed === 'end_date' || log.field_changed === 'start_date') && log.old_value && log.new_value) {
                      const oldD = _toDate(log.old_value), newD = _toDate(log.new_value);
                      if (oldD && newD) {
                        const fwd = newD >= oldD;
                        let slip = 0;
                        let d = new Date(oldD);
                        if (fwd) { while (d < newD) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) slip++; } }
                        else { while (d > newD) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) slip--; } }
                        slipInfo = slip;
                      }
                    }

                    const editDate = log.edited_at ? new Date(log.edited_at) : null;
                    const editDateStr = editDate ? _fmtDate(log.edited_at.split('T')[0]) : '—';
                    const editTimeStr = editDate
                      ? editDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                      : '';

                    return (
                      <View key={log.id || i} style={[bl.logEntry, i > 0 && bl.logEntryBorder]}>
                        {/* Date & editor row */}
                        <View style={bl.logTopRow}>
                          <View style={bl.logDateBadge}>
                            <Text style={bl.logDateTxt}>{editDateStr}</Text>
                            {editTimeStr ? <Text style={bl.logTimeTxt}>{editTimeStr}</Text> : null}
                          </View>
                          {log.edited_by ? (
                            <View style={bl.logEditorBadge}>
                              <Text style={bl.logEditorTxt}>👤 {log.edited_by}</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Change details */}
                        <View style={bl.logChangeRow}>
                          <Text style={bl.logFieldLabel}>{fieldLabel}</Text>
                          <View style={bl.logChangeValues}>
                            <Text style={bl.logOldVal}>{log.field_changed.includes('date') ? _fmtDate(log.old_value) : log.old_value}</Text>
                            <Text style={bl.logArrow}>→</Text>
                            <Text style={bl.logNewVal}>{log.field_changed.includes('date') ? _fmtDate(log.new_value) : log.new_value}</Text>
                          </View>
                        </View>

                        {/* Slip indicator */}
                        {slipInfo !== null && slipInfo !== 0 && (
                          <View style={[bl.logSlipBadge, { backgroundColor: slipInfo > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' }]}>
                            <Text style={{ fontSize: 28, fontWeight: '700', color: slipInfo > 0 ? C.rd : C.gn }}>
                              {slipInfo > 0 ? '⚠' : '✓'} {_slipTxt(slipInfo)}
                            </Text>
                          </View>
                        )}

                        {/* Reason */}
                        <View style={bl.logReasonBox}>
                          <Text style={bl.logReasonLabel}>Reason:</Text>
                          <Text style={bl.logReasonTxt}>{log.reason}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const getBLStyles = (C) => StyleSheet.create({
  summaryRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.bd,
  },
  summaryCard: {
    flex: 1, backgroundColor: C.w03, borderRadius: 10,
    padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: C.w06,
  },
  summaryNum: { fontSize: 33, fontWeight: '800', color: C.textBold, marginBottom: 2 },
  summaryLbl: { fontSize: 15, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Table structure
  headerRow: {
    flexDirection: 'row', backgroundColor: C.w04,
    borderBottomWidth: 1, borderBottomColor: C.w08,
  },
  headerRow2: { backgroundColor: C.w02 },
  dataRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.w04,
    minHeight: 48, alignItems: 'center',
  },
  dataRowAlt: { backgroundColor: C.w02 },

  // Cell sizing
  cell: { paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  cellCheck: { width: 50, alignItems: 'center' },
  cellTitle: { width: 200 },
  cellDur: { width: 140 },
  cellSlip: { width: 130 },
  cellDate: { width: 130 },
  cellShifts: { width: 65, alignItems: 'center' },
  cellGroup: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.w06 },

  // Text
  groupTxt: { fontSize: 18, fontWeight: '700', color: C.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  colTxt: { fontSize: 16, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.3 },
  titleTxt: { fontSize: 20, fontWeight: '500', color: C.text },
  valTxt: { fontSize: 18, color: C.mt },

  // Slip indicators
  slipBad: { color: C.rd, fontWeight: '600' },
  slipGood: { color: C.gn, fontWeight: '600' },
  slipCellBad: { backgroundColor: 'rgba(239,68,68,0.08)' },

  // Complete circle
  checkCircle: {
    width: 33, height: 33, borderRadius: 17, borderWidth: 2,
    borderColor: C.w15, alignItems: 'center', justifyContent: 'center',
  },
  checkCircleOn: { backgroundColor: C.gn, borderColor: C.gn },
  checkMark: { fontSize: 18, color: C.textBold, fontWeight: '700' },

  // Edit history modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modalBox: {
    width: '100%', maxWidth: 780, maxHeight: '90%',
    backgroundColor: C.modalBg, borderRadius: 16,
    borderWidth: 1, borderColor: C.w10,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    } : { elevation: 20 }),
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.w06,
  },
  modalTitle: { fontSize: 42, fontWeight: '700', color: C.textBold },
  modalSub: { fontSize: 32, color: C.dm, marginTop: 3 },
  modalCloseBtn: {
    width: 60, height: 60, borderRadius: 12,
    backgroundColor: C.w06,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  modalCloseTxt: { fontSize: 52, color: C.mt, fontWeight: '300', marginTop: -1 },
  modalSummaryRow: {
    flexDirection: 'row', gap: 10, padding: 14,
    borderBottomWidth: 1, borderBottomColor: C.w06,
  },
  modalSummaryItem: {
    flex: 1, backgroundColor: C.w03,
    borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.inputBg,
  },
  modalSummaryLabel: { fontSize: 24, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  modalSummaryVal: { fontSize: 36, fontWeight: '700', color: C.text },
  modalLogHeader: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  modalLogTitle: { fontSize: 34, fontWeight: '700', color: C.text },
  modalLogScroll: { flex: 1, paddingHorizontal: 16 },

  // Log entries
  logEntry: { paddingVertical: 14 },
  logEntryBorder: { borderTopWidth: 1, borderTopColor: C.w06 },
  logTopRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  logDateBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: C.inputBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  logDateTxt: { fontSize: 28, fontWeight: '600', color: C.mt },
  logTimeTxt: { fontSize: 26, color: C.dm },
  logEditorBadge: {
    backgroundColor: C.bH12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  logEditorTxt: { fontSize: 28, fontWeight: '600', color: C.gd },
  logChangeRow: { marginBottom: 8 },
  logFieldLabel: { fontSize: 26, fontWeight: '700', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  logChangeValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logOldVal: {
    fontSize: 34, color: C.rd, fontWeight: '500',
    backgroundColor: 'rgba(239,68,68,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  logArrow: { fontSize: 34, color: C.dm },
  logNewVal: {
    fontSize: 34, color: C.gn, fontWeight: '500',
    backgroundColor: 'rgba(34,197,94,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  logSlipBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 8,
  },
  logReasonBox: {
    backgroundColor: C.w03, borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: C.gd,
  },
  logReasonLabel: { fontSize: 24, fontWeight: '700', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  logReasonTxt: { fontSize: 34, color: C.mt, lineHeight: 50 },
});


// ============================================================
// STYLES
// ============================================================
const getStyles = (C) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 50 : 34, paddingBottom: 8, paddingHorizontal: 12, backgroundColor: C.headerBg, borderBottomWidth: 1, borderBottomColor: C.bd },
  headerBack: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { fontSize: 33, color: C.gd, fontWeight: '300', marginTop: -1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: C.textBold },
  scroll: { padding: 20, paddingBottom: 40, maxWidth: 680, width: '100%', alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  sectionTitle: { fontSize: 33, fontWeight: '700', color: C.textBold, marginBottom: 4 },

  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabOn: { borderBottomWidth: 2, borderBottomColor: C.gd },
  tabTxt: { fontSize: 21, fontWeight: '500', color: C.mt },
  tabTxtOn: { fontWeight: '600', color: C.textBold },
  subTab: { paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  subTabOn: { borderBottomWidth: 2, borderBottomColor: C.gd },
  subTabTxt: { fontSize: 16, fontWeight: '500', color: C.mt },
  subTabTxtOn: { fontWeight: '600', color: C.textBold },

  // Schedule view toggle (pill buttons)
  schedViewBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.bd,
  },
  schedViewBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: C.mode === 'light' ? 'rgba(0,0,0,0.12)' : C.w08,
    backgroundColor: C.mode === 'light' ? '#ffffff' : C.w02,
  },
  schedViewBtnOn: {
    borderColor: C.gd, backgroundColor: C.bH12,
  },
  schedViewBtnTxt: { fontSize: 16, fontWeight: '500', color: C.mt },
  schedViewBtnTxtOn: { color: C.gd, fontWeight: '600' },
  schedAddBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6,
    backgroundColor: C.gd,
  },
  schedAddBtnTxt: { fontSize: 18, fontWeight: '700', color: '#ffffff' },

  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.bd, borderRadius: 14, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 24, fontWeight: '700', color: C.textBold, marginBottom: 14 },
  lbl: { fontSize: 16, fontWeight: '600', color: C.dm, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  inp: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 22, color: C.text },

  btn: { backgroundColor: C.gd, paddingVertical: 14, borderRadius: 10, alignItems: 'center', boxShadow: `0px 4px 8px ${C.gdD}4D` },
  btnOff: { backgroundColor: C.dm, boxShadow: 'none' },
  btnTxt: { color: C.textBold, fontSize: 22, fontWeight: '700' },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeTxt: { fontSize: 16, fontWeight: '600' },
  barBg: { flex: 1, backgroundColor: C.w06, borderRadius: 4, overflow: 'hidden' },
  barFill: { borderRadius: 4 },

  avatar: { width: 108, height: 108, borderRadius: 27, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: `0px 4px 8px ${C.gdD}66` },
  avatarTxt: { fontSize: 36, fontWeight: '700', color: C.textBold },
  projName: { fontSize: 36, fontWeight: '700', color: C.textBold, textAlign: 'center' },
  projAddr: { fontSize: 21, color: C.mt, textAlign: 'center', marginTop: 6 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginTop: 12, gap: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.gn },
  statusTxt: { fontSize: 20, fontWeight: '600', color: C.gnB },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  infoLbl: { fontSize: 16, fontWeight: '600', color: C.dm, letterSpacing: 0.8 },
  infoVal: { fontSize: 22, fontWeight: '500', color: C.text, textAlign: 'right', flex: 1, marginLeft: 16 },
  divider: { height: 1, backgroundColor: C.w06, marginVertical: 12 },

  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.w04 },
  priceLbl: { fontSize: 21, color: C.text },
  priceAmt: { fontSize: 22, fontWeight: '600', color: C.text },
  warnBox: { padding: 14, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: 10, marginTop: 14 },
  warnTxt: { fontSize: 20, color: C.yl },

  weatherBadge: { backgroundColor: C.inputBg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  weatherTxt: { fontSize: 16, color: C.mt },
  checkbox: { width: 33, height: 33, borderRadius: 9, borderWidth: 2, borderColor: C.w20, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.gn, borderColor: C.gn },

  sigDot: { width: 24, height: 24, borderRadius: 6, backgroundColor: C.w10, alignItems: 'center', justifyContent: 'center' },
  sigDotOn: { backgroundColor: C.gn },


  docIcon: { width: 60, height: 60, borderRadius: 15, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' },
  photoCard: { width: (SCREEN_W - 50) / 2, backgroundColor: C.card, borderWidth: 1, borderColor: C.bd, borderRadius: 12, overflow: 'hidden' },
  photoThumb: { height: 150, alignItems: 'center', justifyContent: 'center' },
  statCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.bd, borderRadius: 12, padding: 16, width: (SCREEN_W - 50) / 2 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { color: C.mt, fontSize: 24, fontWeight: '600' },
  emptySub: { color: C.ph, fontSize: 20, marginTop: 6 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: C.modalBg, borderRadius: 20, padding: 24, maxHeight: '85%', width: '90%', maxWidth: 560 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 27, fontWeight: '700', color: C.textBold },

  typeBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.inputBg },
  typeBtnTxt: { fontSize: 20, fontWeight: '600', color: C.dm },

  uploadZone: { padding: 28, borderWidth: 2, borderStyle: 'dashed', borderColor: C.w10, borderRadius: 12, alignItems: 'center', backgroundColor: C.w02, marginBottom: 16 },

  // List view — assign subcontractor modal
  listModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  listModalBox: {
    width: '100%', maxWidth: 480, maxHeight: '80%',
    backgroundColor: C.modalBg, borderRadius: 16,
    borderWidth: 1, borderColor: C.w10,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    } : { elevation: 20 }),
  },
  listModalHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.w06,
  },
  listModalTitle: { fontSize: 24, fontWeight: '700', color: C.textBold },
  listModalSub: { fontSize: 18, color: C.dm, marginTop: 3 },
  listModalCloseBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: C.w06,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  listModalCloseTxt: { fontSize: 30, color: C.mt, fontWeight: '300', marginTop: -1 },
  listModalCurrent: {
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.w06,
    backgroundColor: C.w02,
  },
  listModalCurrentLabel: { fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  listModalCurrentVal: { fontSize: 21, fontWeight: '600', color: C.gd },
  listModalFieldLabel: { fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  listModalInput: {
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w12,
    borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 22, color: C.text,
  },
  listModalActions: {
    flexDirection: 'row', gap: 10, padding: 18, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: C.w06,
  },
  listModalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08,
  },
  listModalCancelTxt: { fontSize: 21, fontWeight: '600', color: C.mt },
  listModalSaveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.gd,
  },
  listModalSaveBtnOff: { opacity: 0.4 },
  listModalSaveTxt: { fontSize: 21, fontWeight: '700', color: C.textBold },
  listModalSubItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: C.w04,
    backgroundColor: C.w02,
  },
  listModalSubItemOn: {
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderBottomColor: 'rgba(59,130,246,0.15)',
  },
  listModalSubName: { fontSize: 20, fontWeight: '600', color: C.text },
  listModalSubCompany: { fontSize: 16, color: C.dm, marginTop: 1 },

  // Workday Exemptions
  exFormBox: {
    backgroundColor: C.w03, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: C.w06, marginBottom: 16,
  },
  exFormLabel: { fontSize: 15, fontWeight: '700', color: C.gd, letterSpacing: 0.5, marginBottom: 10 },
  exFormRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' },
  exFieldLabel: { fontSize: 15, fontWeight: '600', color: C.dm, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  exInput: {
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10,
    borderRadius: 8, padding: 10, paddingHorizontal: 12, fontSize: 20, color: C.text, minWidth: 120,
  },
  exAddBtn: {
    backgroundColor: C.gd, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginBottom: Platform.OS === 'web' ? 0 : 2,
  },
  exAddBtnTxt: { fontSize: 20, fontWeight: '700', color: C.textBold },
  exYearHeader: {
    fontSize: 20, fontWeight: '700', color: C.gd, letterSpacing: 0.5,
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.w06,
    marginBottom: 4,
  },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  exDateBadge: {
    backgroundColor: C.w04, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 60,
    borderWidth: 1, borderColor: C.w06,
  },
  exDateDay: { fontSize: 15, fontWeight: '700', color: C.gd, textTransform: 'uppercase' },
  exDateFull: { fontSize: 18, fontWeight: '600', color: C.text, marginTop: 1 },
  exDesc: { fontSize: 20, fontWeight: '500', color: C.text },
  exCreator: { fontSize: 16, color: C.dm, marginTop: 2 },
  exDeleteBtn: {
    width: 42, height: 42, borderRadius: 11, backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
  },
  exDeleteTxt: { fontSize: 18, color: C.rd, fontWeight: '700' },
});

export default CurrentProjectViewer;
