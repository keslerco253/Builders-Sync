import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
  Platform, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, TextInput,
  useWindowDimensions, Image, Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AuthContext, ThemeContext, API_BASE } from './context';
import CurrentProjectViewer, { calcTaskProgress, fPhone } from './currentProjectViewer';
import ScheduleBuilder, { cascadeAll, calcEndDate, calcFromPredecessor, TEMPLATE_TRADES } from './scheduleBuilder';
import DatePicker from './datePicker';
import { cascadeDates, buildDepMap, getAllDependents } from './scheduleCalendar';

const WIDE = 768;
const ini = n => n?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
const rG = (r, C) => r === 'builder' ? C.gd : r === 'contractor' ? C.bl : C.gn;

const Bar = ({ pct, color, h = 3, C: Cx }) => (
  <View style={{ flex: 1, height: h, backgroundColor: Cx.w06, borderRadius: h / 2, overflow: 'hidden' }}>
    <View style={{ width: `${Math.min(pct || 0, 100)}%`, height: '100%', backgroundColor: color || Cx.gd, borderRadius: h / 2 }} />
  </View>
);

const HeaderTab = ({ active, onPress, C, children }) => {
  const [hov, setHov] = React.useState(false);
  const webProps = Platform.OS === 'web' ? {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
  } : {};
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: active ? 'rgba(255,255,255,0.12)' : hov ? 'rgba(255,255,255,0.07)' : 'transparent' }}
      activeOpacity={0.7}
      {...webProps}
    >
      {children}
    </TouchableOpacity>
  );
};

// ============================================================
// DASHBOARD — main screen after login
// ============================================================
export default function Dashboard() {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation();
  const { user, signout } = React.useContext(AuthContext);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;

  const [projects, setProjects] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [selectedSubdivision, setSelectedSubdivision] = useState(null);
  const [subdivTab, setSubdivTab] = useState('subs'); // 'subs' | 'docs'
  const [sdSubs, setSdSubs] = useState([]);
  const [sdSubsLoading, setSdSubsLoading] = useState(false);
  const [sdDocs, setSdDocs] = useState([]);
  const [sdDocsLoading, setSdDocsLoading] = useState(false);
  const [sdDocTemplates, setSdDocTemplates] = useState([]);
  const [sdDocModal, setSdDocModal] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState(null); // null = all, or subdivision id
  const [showSidebarFilter, setShowSidebarFilter] = useState(false);
  const [projectActionMenu, setProjectActionMenu] = useState(null); // project object or null
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null); // project object or null
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingProject, setDeletingProject] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(null); // project object or null
  const [excName, setExcName] = useState('');
  const [excDate, setExcDate] = useState('');
  const [excDuration, setExcDuration] = useState('1');
  const [excTaskId, setExcTaskId] = useState(null);
  const [excDescription, setExcDescription] = useState('');
  const [excTasks, setExcTasks] = useState([]);
  const [excSaving, setExcSaving] = useState(false);
  const [showNewSubdivModal, setShowNewSubdivModal] = useState(false);
  const [newSubdivName, setNewSubdivName] = useState('');
  const [newSubdivSaving, setNewSubdivSaving] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState('schedule');
  const [activeSub, setActiveSub] = useState('calendar');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showSelectionManager, setShowSelectionManager] = useState(false);
  const [showDocumentManager, setShowDocumentManager] = useState(false);
  const [clientView, setClientView] = useState(false);
  const [subView, setSubView] = useState(false);

  useEffect(() => {
    if (clientView) {
      setActiveTab('schedule');
      setActiveSub('calendar');
    }
  }, [clientView]);

  const handleProjectUpdate = useCallback((updatedFields) => {
    if (!selectedProject) return;
    const updated = { ...selectedProject, ...updatedFields };
    setSelectedProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, [selectedProject]);

  const handleProjectDeleted = useCallback((deletedId) => {
    setSelectedProject(null);
    setProjects(prev => prev.filter(p => p.id !== deletedId));
  }, []);

  const deleteProjectFromMenu = async () => {
    if (!showDeleteConfirm) return;
    setDeletingProject(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${showDeleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete project');
      handleProjectDeleted(showDeleteConfirm.id);
      setShowDeleteConfirm(null);
      setDeleteConfirmName('');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setDeletingProject(false);
  };

  const openExceptionModal = async (project) => {
    setProjectActionMenu(null);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    setExcName(''); setExcDate(todayStr); setExcDuration('1'); setExcTaskId(null); setExcDescription(''); setExcSaving(false);
    try {
      const res = await fetch(`${API_BASE}/projects/${project.id}/schedule`);
      const data = await res.json();
      if (Array.isArray(data)) setExcTasks(data.filter(t => !t.is_exception));
    } catch (e) { setExcTasks([]); }
    setShowExceptionModal(project);
  };

  const submitException = async () => {
    if (!showExceptionModal || !excName.trim() || !excDate || !excTaskId || !excDescription.trim()) return;
    setExcSaving(true);
    try {
      const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
      const res = await fetch(`${API_BASE}/projects/${showExceptionModal.id}/exceptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: excName.trim(), date: excDate, duration: parseInt(excDuration) || 1, task_id: excTaskId, description: excDescription.trim(), edited_by: editedBy }),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); setExcSaving(false); return; }
      setShowExceptionModal(null);
      setScheduleVersion(v => v + 1);
      // Refresh if this is the selected project
      if (selectedProject?.id === showExceptionModal.id) {
        const schRes = await fetch(`${API_BASE}/projects/${showExceptionModal.id}/schedule`);
        const schData = await schRes.json();
        // handled by scheduleVersion bump in CPV
      }
    } catch (e) { console.warn('Exception submit error:', e); }
    setExcSaving(false);
  };

  const toggleProjectHold = async (project, action) => {
    setProjectActionMenu(null);
    const confirmMsg = action === 'hold'
      ? `Put "${project.name}" on hold?\n\nThe currently in-progress task will be extended and all future tasks will be pushed back for each day the hold is active.`
      : `Release hold on "${project.name}"?\n\nTask dates will be adjusted based on the number of workdays the project was on hold.`;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(confirmMsg)
      : await new Promise(res => Alert.alert(action === 'hold' ? 'On Hold' : 'Release Hold', confirmMsg,
          [{ text: 'Cancel', onPress: () => res(false) }, { text: action === 'hold' ? 'Put On Hold' : 'Release', onPress: () => res(true) }]));
    if (!confirmed) return;

    try {
      const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
      const res = await fetch(`${API_BASE}/projects/${project.id}/hold`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, edited_by: editedBy }),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); return; }
      const result = await res.json();
      const updatedProject = result.project || result;
      // Update project in list
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...updatedProject } : p));
      if (selectedProject?.id === project.id) {
        setSelectedProject(prev => ({ ...prev, ...updatedProject }));
      }
      if (action === 'release') {
        setScheduleVersion(v => v + 1);
      }
    } catch (e) { console.warn('Hold toggle error:', e); }
  };

  const [showExemptions, setShowExemptions] = useState(false);
  const [dashView, setDashView] = useState('projects'); // 'projects' | 'subs'
  useEffect(() => {
    if (dashView !== 'subs') setSubView(false);
  }, [dashView]);
  const [subs, setSubs] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [subProjects, setSubProjects] = useState([]);
  const [subTasks, setSubTasks] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subTab, setSubTab] = useState('calendar');
  const [subCalView, setSubCalView] = useState('gantt'); // 'gantt' | 'taskfirst'
  const [globalCalMonth, setGlobalCalMonth] = useState(new Date());
  const [subEditPopup, setSubEditPopup] = useState(null);
  const [subEditDuration, setSubEditDuration] = useState('');
  const [subEditReason, setSubEditReason] = useState('');
  const [subEditSaving, setSubEditSaving] = useState(false);
  const [taskActionPopup, setTaskActionPopup] = useState(null); // { task, project }
  const [taskActionDate, setTaskActionDate] = useState('');
  const [taskActionSaving, setTaskActionSaving] = useState(false);
  const [subDraggedId, setSubDraggedId] = useState(null);
  const [subEditing, setSubEditing] = useState(false);
  const [subEditFields, setSubEditFields] = useState({});
  const [subEditTrades, setSubEditTrades] = useState([]);
  const [subSaving, setSubSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empJob, setEmpJob] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empSaving, setEmpSaving] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [showDeleteSub, setShowDeleteSub] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [subPreviewMap, setSubPreviewMap] = useState(null);
  const subCalRef = React.useRef(null);
  const subCellWidth = React.useRef(0);
  const subGridOrigin = React.useRef({ x: 0, y: 0 });
  const subWeeksRef = React.useRef([]);
  const subDragRef = React.useRef(null);
  const subTasksRef = React.useRef(subTasks);
  subTasksRef.current = subTasks;
  const selectedSubRef = React.useRef(selectedSub);
  selectedSubRef.current = selectedSub;
  const handleScheduleChange = useCallback(() => {
    if (selectedSub) {
      fetch(`${API_BASE}/users/${selectedSub.id}/tasks?viewer_role=${user?.role || ''}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setSubTasks(data); })
        .catch(() => {});
    }
  }, [selectedSub]);
  const [contractorProject, setContractorProject] = useState(null); // for contractor viewing a project
  const [showBuilderCal, setShowBuilderCal] = useState(false);
  const [builderTasks, setBuilderTasks] = useState([]);
  const [builderCalView, setBuilderCalView] = useState('gantt');
  const [builderEditPopup, setBuilderEditPopup] = useState(null);
  const [builderEditDuration, setBuilderEditDuration] = useState('');
  const [builderEditReason, setBuilderEditReason] = useState('');
  const [builderEditSaving, setBuilderEditSaving] = useState(false);
  const [builderDraggedId, setBuilderDraggedId] = useState(null);
  const [builderPreviewMap, setBuilderPreviewMap] = useState(null);
  const builderCalRef = React.useRef(null);
  const builderCellWidth = React.useRef(0);
  const builderGridOrigin = React.useRef({ x: 0, y: 0 });
  const builderWeeksRef = React.useRef([]);
  const builderDragRef = React.useRef(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [showOpen, setShowOpen] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const syncRef = useRef(null);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [scheduleVersion, setScheduleVersion] = useState(0);

  const isBuilder = user?.role === 'builder';
  const isContractor = user?.role === 'contractor';

  // For contractors: auto-load own profile as sub data
  const fetchOwnSubProfile = async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        fetch(`${API_BASE}/users/${user.id}/projects`),
        fetch(`${API_BASE}/users/${user.id}/tasks`),
      ]);
      const projData = await projRes.json();
      const taskData = await taskRes.json();
      if (Array.isArray(projData)) { setSubProjects(projData); setProjects(projData); }
      if (Array.isArray(taskData)) setSubTasks(taskData);
      // Set selectedSub to own user data
      setSelectedSub({
        id: user.id, name: user.name, username: user.username,
        company_name: user.company_name, phone: user.phone,
        trades: user.trades, street_address: user.street_address,
        city: user.city, state: user.state, zip_code: user.zip_code,
      });
      setLoading(false);
    } catch (e) { console.warn('Fetch own profile error:', e.message); setLoading(false); }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects?user_id=${user.id}&role=${user.role}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
        if (!selectedProject && data.length > 0 && isWide) {
          setSelectedProject(data[0]);
        }
      }
    } catch (e) {
      console.warn('Fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSubdivisions = async () => {
    try {
      const res = await fetch(`${API_BASE}/subdivisions`);
      const data = await res.json();
      if (Array.isArray(data)) setSubdivisions(data);
    } catch (e) { console.warn('Fetch subdivisions error:', e.message); }
  };

  const createSubdivision = async (name) => {
    setNewSubdivSaving(true);
    try {
      const res = await fetch(`${API_BASE}/subdivisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const newSub = await res.json();
        setSubdivisions(prev => [...prev, newSub]);
        setNewSubdivName('');
        setShowNewSubdivModal(false);
        Alert.alert('Success', `Subdivision "${name.trim()}" created`);
      } else {
        const err = await res.json();
        Alert.alert('Error', err.error || 'Failed to create subdivision');
      }
    } catch (e) { Alert.alert('Error', e.message); }
    setNewSubdivSaving(false);
  };

  const deleteSubdivision = async (id) => {
    try {
      await fetch(`${API_BASE}/subdivisions/${id}`, { method: 'DELETE' });
      setSubdivisions(prev => prev.filter(s => s.id !== id));
      setProjects(prev => prev.map(p => p.subdivision_id === id ? { ...p, subdivision_id: null } : p));
      if (selectedSubdivision?.id === id) setSelectedSubdivision(null);
    } catch (e) { console.warn('Delete subdivision error:', e); }
  };

  useFocusEffect(useCallback(() => {
    if (isContractor) {
      fetchOwnSubProfile();
    } else {
      fetchProjects();
      if (isBuilder) fetchSubdivisions();
    }
    // Fetch company logo (builder's own logo, or find a builder's logo for other roles)
    if (user?.id) {
      const endpoint = isBuilder
        ? `${API_BASE}/users/${user.id}/logo`
        : `${API_BASE}/builder-logo`;
      fetch(endpoint)
        .then(r => r.json())
        .then(data => { if (data.logo) setCompanyLogo(data.logo); else setCompanyLogo(null); })
        .catch(() => {});
    }
  }, []));

  const onRefresh = () => { setRefreshing(true); fetchProjects(); if (isBuilder) fetchSubdivisions(); };

  const selectProject = (p) => {
    setSelectedProject(p);
    setSelectedSubdivision(null);
    setClientView(false);
  };

  const selectSubdivision = (sd) => {
    setSelectedSubdivision(sd);
    setSelectedProject(null);
    setSubdivTab('subs');
    // Fetch contractors for this subdivision
    setSdSubsLoading(true);
    setSdSubs([]);
    const sdProjects = projects.filter(p => p.subdivision_id === sd.id);
    (async () => {
      try {
        const allContractorIds = new Set();
        const projUserMap = {}; // uid -> Set of project ids
        for (const proj of sdProjects) {
          const res = await fetch(`${API_BASE}/projects/${proj.id}/users`);
          const data = await res.json();
          if (Array.isArray(data)) {
            data.forEach(u => {
              allContractorIds.add(u.user_id);
              if (!projUserMap[u.user_id]) projUserMap[u.user_id] = new Set();
              projUserMap[u.user_id].add(proj.id);
            });
          }
        }
        const userRes = await fetch(`${API_BASE}/users`);
        const allUsers = await userRes.json();
        const result = [];
        if (Array.isArray(allUsers)) {
          allUsers.forEach(u => {
            if (allContractorIds.has(u.id) && (u.role === 'contractor' || u.role === 'builder')) {
              result.push({ ...u, projCount: projUserMap[u.id]?.size || 0 });
            }
          });
        }
        setSdSubs(result);
      } catch (e) { console.warn('Fetch subdiv subs error:', e); }
      setSdSubsLoading(false);
    })();
  };

  const fetchSubdivisionDocs = async (sid) => {
    setSdDocsLoading(true);
    try {
      const [docsRes, tmplRes] = await Promise.all([
        fetch(`${API_BASE}/subdivisions/${sid}/documents?type=document`),
        fetch(`${API_BASE}/document-templates?scope=subdivisions`),
      ]);
      if (docsRes.ok) setSdDocs(await docsRes.json());
      if (tmplRes.ok) setSdDocTemplates(await tmplRes.json());
    } catch (e) { console.warn(e); }
    setSdDocsLoading(false);
  };

  useEffect(() => {
    if (selectedSubdivision && subdivTab === 'docs') {
      fetchSubdivisionDocs(selectedSubdivision.id);
    }
  }, [selectedSubdivision, subdivTab]);

  const fetchSubs = async () => {
    setSubsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const contractors = data.filter(u => u.role === 'contractor' && u.active !== false);
        setSubs(contractors);
        if (!selectedSub && contractors.length > 0 && isWide) {
          selectSub(contractors[0]);
        }
      }
    } catch (e) { console.warn('Fetch subs error:', e.message); }
    finally { setSubsLoading(false); }
  };

  const selectSub = async (sub) => {
    setSelectedSub(sub);
    setSubTab('calendar');
    setSubEditing(false);
    setShowDeleteSub(false);
    try {
      const [projRes, taskRes, empRes] = await Promise.all([
        fetch(`${API_BASE}/users/${sub.id}/projects`),
        fetch(`${API_BASE}/users/${sub.id}/tasks?viewer_role=${user?.role || ''}`),
        fetch(`${API_BASE}/users/${sub.id}/employees`),
      ]);
      const projData = await projRes.json();
      const taskData = await taskRes.json();
      const empData = await empRes.json();
      if (Array.isArray(projData)) setSubProjects(projData);
      if (Array.isArray(taskData)) setSubTasks(taskData);
      if (Array.isArray(empData)) setEmployees(empData);
    } catch (e) { console.warn('Fetch sub detail error:', e.message); }
  };

  React.useEffect(() => {
    if (dashView === 'subs' && subs.length === 0) fetchSubs();
  }, [dashView]);

  // Fetch builder's own tasks when calendar opens
  React.useEffect(() => {
    if (!showBuilderCal || !user?.id) return;
    fetch(`${API_BASE}/users/${user.id}/tasks`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setBuilderTasks(data); })
      .catch(() => {});
  }, [showBuilderCal, user?.id]);

  // On mobile, show list or detail
  const showingDetail = !isWide && (selectedProject || selectedSubdivision) && dashView === 'projects' && !isContractor;
  const showingContractorProject = isContractor && contractorProject;

  // Filter projects by search
  const filteredProjects = React.useMemo(() => {
    let result = projects;
    // Subdivision sidebar filter
    if (sidebarFilter) {
      result = result.filter(p => p.subdivision_id === sidebarFilter);
    }
    // Open/Closed toggle filter
    if (showOpen && !showClosed) {
      result = result.filter(p => (p.phase || '').toLowerCase() !== 'closed');
    } else if (!showOpen && showClosed) {
      result = result.filter(p => (p.phase || '').toLowerCase() === 'closed');
    } else if (!showOpen && !showClosed) {
      result = [];
    }
    // Search filter
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      result = result.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.number || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        (p.street_address || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q) ||
        (p.state || '').toLowerCase().includes(q) ||
        (p.zip_code || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q) ||
        (p.phase || '').toLowerCase().includes(q) ||
        (p.customer_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [projects, projectSearch, showOpen, showClosed, sidebarFilter]);

  // Filter subs by search
  const filteredSubs = React.useMemo(() => {
    if (!projectSearch.trim()) return subs;
    const q = projectSearch.toLowerCase();
    return subs.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.company_name || '').toLowerCase().includes(q) ||
      (s.trades || '').toLowerCase().includes(q) ||
      (s.username || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.state || '').toLowerCase().includes(q)
    );
  }, [subs, projectSearch]);

  // ============================================================
  // SEARCH BAR (in sidebar, below tabs)
  // ============================================================
  const renderSearchBar = () => (
    <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: C.sw06,
        borderRadius: 10, paddingHorizontal: 12, height: 40,
      }}>
        <Text style={{ fontSize: 16, color: C.chromeDm, marginRight: 6 }}>🔍</Text>
        <TextInput
          value={projectSearch}
          onChangeText={setProjectSearch}
          placeholder={dashView === 'subs' ? "Search subcontractors..." : "Search projects..."}
          placeholderTextColor={C.chromeDm}
          style={{
            flex: 1, fontSize: 17, color: C.chromeTxt, padding: 0,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
          }}
        />
        {projectSearch.length > 0 && (
          <TouchableOpacity onPress={() => setProjectSearch('')} activeOpacity={0.7}>
            <Text style={{ fontSize: 18, color: C.chromeDm, paddingLeft: 4 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ============================================================
  // SIDEBAR
  // ============================================================
  const renderSidebar = () => (
    <View style={[st.sidebar, isWide ? st.sidebarWide : st.sidebarFull]}>
      {/* Company Logo */}
      {companyLogo && (
        <View style={{ alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
          <Image source={{ uri: companyLogo }} style={{ width: 368, height: 147, resizeMode: 'contain' }} />
        </View>
      )}
      {/* Section header */}
      <View style={st.sidebarHead}>
        <TouchableOpacity
          onPress={() => isBuilder && subdivisions.length > 0 ? setShowSidebarFilter(p => !p) : null}
          activeOpacity={isBuilder && subdivisions.length > 0 ? 0.7 : 1}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={st.sidebarLabel}>
            {!isBuilder ? 'MY JOBS' : sidebarFilter ? (subdivisions.find(s => s.id === sidebarFilter)?.name?.toUpperCase() || 'ALL JOBS') : 'ALL JOBS'}
          </Text>
          {isBuilder && subdivisions.length > 0 && (
            <Text style={{ fontSize: 12, color: C.chromeTxt }}>▼</Text>
          )}
          <View style={st.countBadge}>
            <Text style={st.countTxt}>{filteredProjects.length}</Text>
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity onPress={() => setShowOpen(p => !p)}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: showOpen ? 'rgba(16,185,129,0.4)' : C.sw10, backgroundColor: showOpen ? 'rgba(16,185,129,0.15)' : 'transparent' }}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: showOpen ? '700' : '500', color: showOpen ? '#10b981' : C.chromeTxt }}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowClosed(p => !p)}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: showClosed ? 'rgba(239,68,68,0.4)' : C.sw10, backgroundColor: showClosed ? 'rgba(239,68,68,0.15)' : 'transparent' }}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: showClosed ? '700' : '500', color: showClosed ? '#ef4444' : C.chromeTxt }}>Closed</Text>
          </TouchableOpacity>
          {isBuilder && (
            <TouchableOpacity onPress={() => setShowAddMenu(p => !p)} style={st.addBtn} activeOpacity={0.8}>
              <Text style={st.addBtnTxt}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Project list */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.gd} size="large" />
        </View>
      ) : (
        <ScrollView
          style={Platform.OS === 'web' ? { flex: 1, overflow: 'auto' } : { flex: 1 }}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gd} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredProjects.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 48, marginBottom: 10 }}>{projectSearch.trim() ? '🔍' : '📋'}</Text>
              <Text style={{ color: C.chromeTxt, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>
                {projectSearch.trim() ? 'No matching projects' : 'No projects yet'}
              </Text>
              <Text style={{ color: C.chromeDm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>
                {projectSearch.trim() ? 'Try a different search' : isBuilder ? 'Tap + to create one' : 'Projects assigned to you will appear here'}
              </Text>
            </View>
          ) : (() => {
            const renderProjectItem = (project) => {
              const active = selectedProject?.id === project.id;
              return (
                <TouchableOpacity
                  key={project.id}
                  activeOpacity={0.7}
                  onPress={() => selectProject(project)}
                  style={[st.jobItem, active && st.jobItemActive, project.on_hold && { borderLeftWidth: 3, borderLeftColor: '#f59e0b' }]}
                >
                  <View style={[st.jobIndicator, active && st.jobIndicatorActive]} />
                  <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[st.jobName, active && st.jobNameActive, { flex: 1 }]} numberOfLines={1}>
                        {project.name}
                      </Text>
                      {project.on_hold && (
                        <View style={{ backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>HOLD</Text>
                        </View>
                      )}
                    </View>
                    <Text style={st.jobMeta} numberOfLines={1}>
                      {[project.status, project.phase].filter(Boolean).join(' · ')}
                    </Text>
                    {project.progress !== undefined && project.progress !== null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <Bar C={C} pct={project.progress} color={active ? C.gd : C.w15} h={3} />
                        <Text style={{ fontSize: 15, color: C.dm }}>{project.progress}%</Text>
                      </View>
                    )}
                  </View>
                  {(isBuilder || isContractor) && (
                    <View style={{ justifyContent: 'center', alignItems: 'center', paddingRight: 4 }}>
                      {isBuilder && (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); setProjectActionMenu(project); }}
                          style={{ paddingVertical: 6, paddingHorizontal: 10 }}
                          activeOpacity={0.6}
                          hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                        >
                          <Text style={{ fontSize: 20, color: active ? C.gd : C.dm }}>ⓘ</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          if (selectedProject?.id === project.id) {
                            setClientView(prev => !prev);
                          } else {
                            setSelectedProject(project);
                            setSelectedSubdivision(null);
                            setClientView(true);
                          }
                        }}
                        style={{ paddingVertical: 6, paddingHorizontal: 10 }}
                        activeOpacity={0.6}
                        hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: 18, color: (active && clientView) ? C.gn : active ? C.gd : C.dm }}>🏠</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            };
            if (sidebarFilter) {
              return filteredProjects.map(renderProjectItem);
            }

            // Otherwise show grouped by subdivision
            const ungrouped = filteredProjects.filter(p => !p.subdivision_id);
            const grouped = subdivisions.map(sd => ({
              ...sd,
              projects: filteredProjects.filter(p => p.subdivision_id === sd.id),
            })).filter(sd => sd.projects.length > 0 || isBuilder);

            return (
              <>
                {ungrouped.map(renderProjectItem)}
                {grouped.map(sd => {
                  const sdActive = selectedSubdivision?.id === sd.id;
                  return (
                    <View key={`sd-${sd.id}`}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => selectSubdivision(sd)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: sdActive ? (C.gd + '18') : (C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04), borderBottomWidth: 1, borderBottomColor: C.sw06, borderLeftWidth: sdActive ? 3 : 0, borderLeftColor: C.gd }}
                        {...(Platform.OS === 'web' && isBuilder ? {
                          onContextMenu: (e) => {
                            e.preventDefault();
                            if (window.confirm(`Delete subdivision "${sd.name}"?\n\nProjects will be ungrouped.`)) {
                              deleteSubdivision(sd.id);
                            }
                          },
                        } : {})}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '700', color: sdActive ? C.gd : C.chromeTxt, letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>
                          📁 {sd.name.toUpperCase()}
                        </Text>
                        <View style={{ backgroundColor: sdActive ? C.gd + '30' : C.w08, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: sdActive ? C.gd : C.dm }}>{sd.projects.length}</Text>
                        </View>
                      </TouchableOpacity>
                      {sd.projects.map(renderProjectItem)}
                    </View>
                  );
                })}
              </>
            );
          })()}
        </ScrollView>
      )}
    </View>
  );

  // ============================================================
  // EMPTY DETAIL STATE (wide mode, no project selected)
  // ============================================================
  const renderEmptyDetail = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: C.bg }}>
      <Text style={{ fontSize: 72, marginBottom: 16 }}>🏗</Text>
      <Text style={{ fontSize: 30, fontWeight: '700', color: C.textBold, marginBottom: 8 }}>Select a Project</Text>
      <Text style={{ fontSize: 21, color: C.dm, textAlign: 'center' }}>
        Choose a project from the sidebar to view details, schedule, documents, and more.
      </Text>
    </View>
  );

  // ============================================================
  // SUBDIVISION DETAIL VIEW
  // ============================================================
  const renderSubdivisionDetail = () => {
    if (!selectedSubdivision) return null;
    const sdProjects = projects.filter(p => p.subdivision_id === selectedSubdivision.id);
    const tabs = [['subs', 'Subcontractors'], ['docs', 'Docs']];

    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.w08, backgroundColor: C.chrome }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {!isWide && (
              <TouchableOpacity onPress={() => setSelectedSubdivision(null)} style={{ padding: 6 }}>
                <Text style={{ fontSize: 24, color: C.gd }}>←</Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 28, fontWeight: '700', color: C.textBold, flex: 1 }} numberOfLines={1}>📁 {selectedSubdivision.name}</Text>
            <View style={{ backgroundColor: C.gd + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.gd }}>{sdProjects.length} project{sdProjects.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
            {tabs.map(([id, label]) => {
              const active = subdivTab === id;
              return (
                <TouchableOpacity key={id} onPress={() => setSubdivTab(id)}
                  style={{ paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8, backgroundColor: active ? C.gd : C.w06 }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 17, fontWeight: active ? '700' : '500', color: active ? '#fff' : C.text }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Tab content */}
        {subdivTab === 'subs' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {sdSubsLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={C.gd} size="large" />
              </View>
            ) : sdSubs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>👷</Text>
                <Text style={{ fontSize: 21, fontWeight: '600', color: C.textBold }}>No Subcontractors</Text>
                <Text style={{ fontSize: 17, color: C.dm, marginTop: 4, textAlign: 'center' }}>
                  Assign contractors to projects in this subdivision and they'll appear here.
                </Text>
              </View>
            ) : (
              sdSubs.map(sub => {
                const tradesArr = sub.trades ? sub.trades.split(',').map(t => t.trim()).filter(Boolean) : [];
                return (
                  <View key={sub.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w08 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.gd + '20', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: C.gd }}>
                        {(sub.first_name || '?')[0]}{(sub.last_name || '?')[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 19, fontWeight: '600', color: C.textBold }}>
                        {sub.company_name || `${sub.first_name} ${sub.last_name}`}
                      </Text>
                      {sub.company_name ? (
                        <Text style={{ fontSize: 15, color: C.dm }}>{sub.first_name} {sub.last_name}</Text>
                      ) : null}
                      {tradesArr.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {tradesArr.map(t => (
                            <View key={t} style={{ backgroundColor: C.gd + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gd }}>{t}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>{sub.projCount} project{sub.projCount !== 1 ? 's' : ''}</Text>
                      {sub.phone ? <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>{sub.phone}</Text> : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {subdivTab === 'docs' && (() => {
          const openFile = (url) => {
            const full = url.startsWith('http') ? url : `${API_BASE}${url}`;
            if (Platform.OS === 'web') window.open(full, '_blank');
            else Linking.openURL(full);
          };
          const deleteDoc = async (docId) => {
            try {
              const res = await fetch(`${API_BASE}/documents/${docId}`, { method: 'DELETE' });
              if (res.ok) setSdDocs(prev => prev.filter(d => d.id !== docId));
            } catch (e) { Alert.alert('Error', e.message); }
          };
          const formatSize = (bytes) => {
            if (!bytes) return '';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          };
          const docsByTemplate = {};
          const unlinkedDocs = [];
          sdDocs.forEach(d => {
            if (d.template_id) {
              if (!docsByTemplate[d.template_id]) docsByTemplate[d.template_id] = [];
              docsByTemplate[d.template_id].push(d);
            } else {
              unlinkedDocs.push(d);
            }
          });

          return (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {sdDocsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator color={C.gd} size="large" />
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>Documents</Text>
                    {isBuilder && (
                      <TouchableOpacity onPress={() => setSdDocModal('upload')} style={st.addBtn} activeOpacity={0.8}>
                        <Text style={st.addBtnTxt}>+</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {sdDocTemplates.map(tmpl => {
                    const uploads = docsByTemplate[tmpl.id] || [];
                    const hasUpload = uploads.length > 0;
                    return (
                      <View key={tmpl.id} style={{ marginBottom: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w08, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                          <Text style={{ fontSize: 24 }}>{tmpl.doc_type === 'folder' ? '📁' : '📄'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{tmpl.name}</Text>
                            <Text style={{ fontSize: 14, color: hasUpload ? C.gn : C.yl, marginTop: 2 }}>
                              {hasUpload ? `✓ ${uploads.length} file${uploads.length > 1 ? 's' : ''} uploaded` : '⏳ Not yet uploaded'}
                            </Text>
                          </View>
                          {isBuilder && (
                            <TouchableOpacity
                              onPress={() => setSdDocModal({ type: 'upload', templateId: tmpl.id, templateName: tmpl.name })}
                              style={st.addBtn} activeOpacity={0.8}>
                              <Text style={st.addBtnTxt}>+</Text>
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
                              <Text style={{ fontSize: 13, color: C.dm }}>
                                {d.created_at}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.file_size ? ` · ${formatSize(d.file_size)}` : ''}
                              </Text>
                            </View>
                            {d.file_url ? (
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <TouchableOpacity onPress={() => openFile(d.file_url)}
                                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.bl + '20' }}
                                  activeOpacity={0.7}>
                                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>View</Text>
                                </TouchableOpacity>
                                {isBuilder && (
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
                      </View>
                    );
                  })}

                  {unlinkedDocs.length > 0 && (
                    <>
                      {sdDocTemplates.length > 0 && (
                        <Text style={{ fontSize: 18, fontWeight: '600', color: C.dm, marginTop: 16, marginBottom: 8 }}>Other Documents</Text>
                      )}
                      {unlinkedDocs.map(d => (
                        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w08, padding: 14 }}>
                          <Text style={{ fontSize: 24 }}>📄</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{d.name}</Text>
                            <Text style={{ fontSize: 15, color: C.dm, marginTop: 2 }}>
                              {d.category} · {d.created_at}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.file_size ? ` · ${formatSize(d.file_size)}` : ''}
                            </Text>
                          </View>
                          {d.file_url ? (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity onPress={() => openFile(d.file_url)}
                                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.bl + '20' }}
                                activeOpacity={0.7}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>View</Text>
                              </TouchableOpacity>
                              {isBuilder && (
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
                    </>
                  )}

                  {sdDocTemplates.length === 0 && sdDocs.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                      <Text style={{ fontSize: 48, marginBottom: 12 }}>📁</Text>
                      <Text style={{ fontSize: 21, fontWeight: '600', color: C.textBold }}>No documents</Text>
                      <Text style={{ fontSize: 17, color: C.dm, marginTop: 4, textAlign: 'center' }}>
                        {isBuilder ? 'Tap + to upload a document, or add subdivision templates in Document Manager.' : 'No documents have been uploaded yet.'}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          );
        })()}

        {sdDocModal && (
          <SubdivisionUploadModal
            subdivision={selectedSubdivision}
            user={user}
            templateId={sdDocModal?.templateId || null}
            templateName={sdDocModal?.templateName || null}
            onClose={() => setSdDocModal(null)}
            onCreated={(doc) => {
              setSdDocs(prev => [doc, ...prev]);
              setSdDocModal(null);
            }}
          />
        )}
      </View>
    );
  };

  // ============================================================
  // SUB SIDEBAR
  // ============================================================
  const renderSubSidebar = () => (
    <View style={[st.sidebar, isWide ? st.sidebarWide : st.sidebarFull]}>
      <View style={st.sidebarHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={st.sidebarLabel}>SUBCONTRACTORS</Text>
          <View style={st.countBadge}>
            <Text style={st.countTxt}>{filteredSubs.length}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setModal('newsub')} style={st.addBtn} activeOpacity={0.8}>
          <Text style={st.addBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>

      {subsLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.gd} size="large" />
        </View>
      ) : filteredSubs.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 48, marginBottom: 10 }}>{projectSearch.trim() ? '🔍' : '👷'}</Text>
          <Text style={{ color: C.chromeTxt, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>
            {projectSearch.trim() ? 'No matching subcontractors' : 'No subcontractors'}
          </Text>
          <Text style={{ color: C.chromeDm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>
            {projectSearch.trim() ? 'Try a different search' : 'Add contractors from User Management'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={Platform.OS === 'web' ? { flex: 1, overflow: 'auto' } : { flex: 1 }}
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredSubs.map(sub => {
            const active = selectedSub?.id === sub.id;
            const tradesArr = sub.trades ? sub.trades.split(',').map(t => t.trim()).filter(Boolean) : [];
            return (
              <TouchableOpacity
                key={sub.id}
                activeOpacity={0.7}
                onPress={() => { setSubView(false); selectSub(sub); }}
                style={[st.jobItem, active && st.jobItemActive]}
              >
                <View style={[st.jobIndicator, active && st.jobIndicatorActive]} />
                <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 8 }}>
                  <Text style={[st.jobName, active && st.jobNameActive]} numberOfLines={1}>
                    {sub.company_name || sub.name}
                  </Text>
                  {sub.company_name ? (
                    <Text style={st.jobMeta} numberOfLines={1}>{sub.name}</Text>
                  ) : null}
                  {tradesArr.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {tradesArr.slice(0, 3).map(t => (
                        <View key={t} style={{ backgroundColor: 'rgba(59,130,246,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>{t}</Text>
                        </View>
                      ))}
                      {tradesArr.length > 3 && (
                        <Text style={{ fontSize: 14, color: C.dm }}>+{tradesArr.length - 3}</Text>
                      )}
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    selectSub(sub);
                    setSubView(prev => (selectedSub?.id === sub.id) ? !prev : true);
                  }}
                  style={{ justifyContent: 'center', paddingHorizontal: 10 }}
                  activeOpacity={0.6}
                  hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 18, color: (active && subView) ? C.gd : C.dm }}>🛠️</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  // ============================================================
  // SUB CALENDAR — drag/edit helpers (builder only)
  // ============================================================
  const subWorkdayCount = (startStr, endStr) => {
    const a = new Date(startStr + 'T00:00:00'), b = new Date(endStr + 'T00:00:00');
    if (isNaN(a)||isNaN(b)) return 1;
    let count = 0, d = new Date(a);
    while (d <= b) { if (d.getDay()!==0&&d.getDay()!==6) count++; d.setDate(d.getDate()+1); }
    return count || 1;
  };
  const subCalcEnd = (startStr, wkdays) => {
    let d = new Date(startStr + 'T00:00:00');
    if (isNaN(d.getTime())) return startStr;
    let rem = wkdays - 1;
    while (rem > 0) { d.setDate(d.getDate()+1); if (d.getDay()!==0&&d.getDay()!==6) rem--; }
    return d.toISOString().split('T')[0];
  };
  const subFmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const subAddDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
  const subDaysBetween = (a, b) => Math.round((b - a) / 86400000);

  const subMeasureGrid = () => {
    if (Platform.OS !== 'web') return;
    const el = subCalRef.current;
    if (!el || !el.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    subGridOrigin.current = { x: rect.left, y: rect.top };
    subCellWidth.current = rect.width / 7;
  };

  const subGetDayFromPointer = (px, py) => {
    const { x, y } = subGridOrigin.current;
    const cw = subCellWidth.current;
    if (!cw) return null;
    const hH = 36;
    const rx = px - x, ry = py - y - hH;
    if (rx < 0 || ry < 0) return null;
    const col = Math.min(Math.max(Math.floor(rx / cw), 0), 6);
    const ws = subWeeksRef.current;
    const el = subCalRef.current;
    let rowH = 150;
    if (el && el.getBoundingClientRect) {
      const tH = el.getBoundingClientRect().height - hH;
      if (tH > 0 && ws.length > 0) rowH = tH / ws.length;
    }
    const row = Math.floor(ry / rowH);
    if (row >= 0 && row < ws.length) return ws[row][col];
    return null;
  };

  const subHandlePointerMove = React.useRef((e) => {
    const dr = subDragRef.current;
    if (!dr) return;
    const day = subGetDayFromPointer(e.clientX, e.clientY);
    if (!day) return;
    if (!dr.anchorDay) { dr.anchorDay = day; dr.lastOffset = 0; return; }
    const offset = subDaysBetween(dr.anchorDay, day);
    if (offset === dr.lastOffset) return;
    if (dr.isLive && offset > 0 && !dr.isException) return;
    dr.lastOffset = offset;
    const dur = subDaysBetween(dr.origStart, dr.origEnd);
    const ns = subAddDays(dr.origStart, offset);
    const ne = subAddDays(ns, dur);
    setSubPreviewMap({ [dr.taskId]: { start_date: subFmtDate(ns), end_date: subFmtDate(ne) } });
  }).current;

  const subHandlePointerUp = React.useRef(async () => {
    const dr = subDragRef.current;
    subDragRef.current = null;
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', subHandlePointerMove);
      document.removeEventListener('pointerup', subHandlePointerUp);
    }
    setSubDraggedId(null);
    if (dr && dr.lastOffset && dr.lastOffset !== 0) {
      const dur = subDaysBetween(dr.origStart, dr.origEnd);
      const ns = subAddDays(dr.origStart, dr.lastOffset);
      const ne = subAddDays(ns, dur);
      const newStart = subFmtDate(ns), newEnd = subFmtDate(ne);

      // Optimistic update for the dragged task
      setSubTasks(prev => prev.map(t => t.id === dr.taskId ? { ...t, start_date: newStart, end_date: newEnd } : t));
      setSubPreviewMap(null);

      try {
        // Fetch full project schedule to cascade dependents
        const schedRes = await fetch(`${API_BASE}/projects/${dr.jobId}/schedule`);
        const fullSchedule = await schedRes.json();
        if (Array.isArray(fullSchedule) && fullSchedule.length > 0) {
          // Run cascade on the full project schedule
          const { byId: pm, movedLag } = cascadeDates(fullSchedule, dr.taskId, newStart, newEnd);
          const dm = buildDepMap(fullSchedule);
          const deps = getAllDependents(dr.taskId, dm);
          deps.add(dr.taskId);

          // Collect all changed tasks
          const updates = [];
          deps.forEach(id => {
            const orig = fullSchedule.find(t => t.id === id);
            const upd = pm[id];
            if (orig && upd && (orig.start_date !== upd.start_date || orig.end_date !== upd.end_date)) {
              const entry = { id, start_date: upd.start_date, end_date: upd.end_date };
              if (id === dr.taskId && movedLag !== null) entry.lag_days = movedLag;
              updates.push(entry);
            }
          });

          if (updates.length > 0) {
            await fetch(`${API_BASE}/schedule/batch-update`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            });

            // Optimistic update subTasks with all cascaded changes
            const updateMap = {};
            updates.forEach(u => { updateMap[u.id] = u; });
            setSubTasks(prev => prev.map(t => {
              const u = updateMap[t.id];
              return u ? { ...t, start_date: u.start_date, end_date: u.end_date } : t;
            }));
          }
        } else {
          // Fallback: just move the single task
          await fetch(`${API_BASE}/schedule/batch-update`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ id: dr.taskId, start_date: newStart, end_date: newEnd }]),
          });
        }

        // Re-fetch to get server-confirmed data
        const sub = selectedSubRef.current;
        if (sub) {
          const res = await fetch(`${API_BASE}/users/${sub.id}/tasks?viewer_role=${user?.role || ''}`);
          const data = await res.json();
          if (Array.isArray(data)) setSubTasks(data);
        }
        setScheduleVersion(v => v + 1);
      } catch (e) { console.warn('Sub drag save failed:', e); }
    } else {
      setSubPreviewMap(null);
    }
  }).current;

  const subHandleDragStart = (task, e) => {
    if (!isBuilder || Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (task.on_hold) return; // Block dragging for on-hold projects
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    subMeasureGrid();
    const ts = new Date(task.start_date + 'T00:00:00'), te = new Date(task.end_date + 'T00:00:00');
    if (isNaN(ts)||isNaN(te)) return;
    subDragRef.current = { taskId: task.id, jobId: task.job_id, origStart: ts, origEnd: te, anchorDay: null, lastOffset: null, isLive: task.go_live !== false, isException: !!task.is_exception };
    setSubDraggedId(task.id);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', subHandlePointerMove);
    document.addEventListener('pointerup', subHandlePointerUp);
  };

  const subHandleContextMenu = (task, e) => {
    if (!isBuilder || Platform.OS !== 'web') return;
    e.preventDefault(); e.stopPropagation();
    const dur = subWorkdayCount(task.start_date, task.end_date);
    setSubEditPopup({ task, x: e.clientX, y: e.clientY });
    setSubEditDuration(String(dur));
    setSubEditReason('');
    setSubEditSaving(false);
  };

  const closeSubEditPopup = () => { setSubEditPopup(null); setSubEditDuration(''); setSubEditReason(''); setSubEditSaving(false); };

  // Task action popup helpers
  const closeTaskActionPopup = () => { setTaskActionPopup(null); setTaskActionDate(''); setTaskActionSaving(false); };
  const taskActionNav = (proj, tab, sub) => {
    closeTaskActionPopup();
    if (isContractor) { setContractorProject(proj); setSubTab('projects'); }
    else { setDashView('projects'); setSelectedProject(proj); }
    if (tab) setActiveTab(tab);
    if (sub) setActiveSub(sub);
  };
  const handleMoveTaskDate = async () => {
    if (!taskActionPopup || !taskActionDate) return;
    const { task, project } = taskActionPopup;
    if (project.go_live) return;
    const dur = subWorkdayCount(task.start_date, task.end_date);
    const newEnd = subCalcEnd(taskActionDate, dur);
    setTaskActionSaving(true);
    try {
      const res = await fetch(`${API_BASE}/schedule/${task.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: taskActionDate, end_date: newEnd,
          reason: 'Task date moved from subcontractor view',
          edited_by: user?.firstName ? `${user.firstName} ${user.lastName}` : 'Unknown',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Error', err.error || 'Failed to move task date');
        return;
      }
      const cascaded = await res.json();
      if (Array.isArray(cascaded)) {
        setSubTasks(prev => prev.map(t => {
          const updated = cascaded.find(c => c.id === t.id);
          return updated ? { ...t, ...updated } : t;
        }));
      }
      closeTaskActionPopup();
    } catch (e) {
      Alert.alert('Error', 'Network error');
    } finally {
      setTaskActionSaving(false);
    }
  };

  const saveSubEdit = async () => {
    if (!subEditPopup || !subEditReason.trim() || subEditSaving) return;
    const task = subEditPopup.task;
    const newDur = parseInt(subEditDuration) || 1;
    const newEnd = subCalcEnd(task.start_date, newDur);
    if (newEnd === task.end_date) { closeSubEditPopup(); return; }
    setSubEditSaving(true);
    try {
      const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
      await fetch(`${API_BASE}/schedule/${task.id}/edit`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_date: newEnd, reason: subEditReason.trim(), edited_by: editedBy }),
      });
      if (selectedSub) {
        const res = await fetch(`${API_BASE}/users/${selectedSub.id}/tasks?viewer_role=${user?.role || ''}`);
        const data = await res.json();
        if (Array.isArray(data)) setSubTasks(data);
      }
      closeSubEditPopup();
      setScheduleVersion(v => v + 1);
    } catch (e) { console.warn('Sub edit save failed:', e); setSubEditSaving(false); }
  };

  // Clean up sub drag listeners on unmount
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const mRef = subHandlePointerMove, uRef = subHandlePointerUp;
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', mRef);
      document.removeEventListener('pointerup', uRef);
    };
  }, []);

  // ============================================================
  // BUILDER CALENDAR — drag/edit handlers
  // ============================================================
  const builderMeasureGrid = () => {
    if (Platform.OS !== 'web') return;
    const el = builderCalRef.current;
    if (!el || !el.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    builderGridOrigin.current = { x: rect.left, y: rect.top };
    builderCellWidth.current = rect.width / 7;
  };

  const builderGetDayFromPointer = (px, py) => {
    const { x, y } = builderGridOrigin.current;
    const cw = builderCellWidth.current;
    if (!cw) return null;
    const hH = 36;
    const rx = px - x, ry = py - y - hH;
    if (rx < 0 || ry < 0) return null;
    const col = Math.min(Math.max(Math.floor(rx / cw), 0), 6);
    const ws = builderWeeksRef.current;
    const el = builderCalRef.current;
    let rowH = 150;
    if (el && el.getBoundingClientRect) {
      const tH = el.getBoundingClientRect().height - hH;
      if (tH > 0 && ws.length > 0) rowH = tH / ws.length;
    }
    const row = Math.floor(ry / rowH);
    if (row >= 0 && row < ws.length) return ws[row][col];
    return null;
  };

  const builderHandlePointerMove = React.useRef((e) => {
    const dr = builderDragRef.current;
    if (!dr) return;
    const day = builderGetDayFromPointer(e.clientX, e.clientY);
    if (!day) return;
    if (!dr.anchorDay) { dr.anchorDay = day; dr.lastOffset = 0; return; }
    const offset = subDaysBetween(dr.anchorDay, day);
    if (offset === dr.lastOffset) return;
    if (dr.isLive && offset > 0 && !dr.isException) return;
    dr.lastOffset = offset;
    const dur = subDaysBetween(dr.origStart, dr.origEnd);
    const ns = subAddDays(dr.origStart, offset);
    const ne = subAddDays(ns, dur);
    setBuilderPreviewMap({ [dr.taskId]: { start_date: subFmtDate(ns), end_date: subFmtDate(ne) } });
  }).current;

  const builderHandlePointerUp = React.useRef(async () => {
    const dr = builderDragRef.current;
    builderDragRef.current = null;
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', builderHandlePointerMove);
      document.removeEventListener('pointerup', builderHandlePointerUp);
    }
    setBuilderDraggedId(null);
    if (dr && dr.lastOffset && dr.lastOffset !== 0) {
      const dur = subDaysBetween(dr.origStart, dr.origEnd);
      const ns = subAddDays(dr.origStart, dr.lastOffset);
      const ne = subAddDays(ns, dur);
      const newStart = subFmtDate(ns), newEnd = subFmtDate(ne);

      // Optimistic update
      setBuilderTasks(prev => prev.map(t => t.id === dr.taskId ? { ...t, start_date: newStart, end_date: newEnd } : t));
      setBuilderPreviewMap(null);

      try {
        // Fetch full project schedule to cascade
        const schedRes = await fetch(`${API_BASE}/projects/${dr.jobId}/schedule`);
        const fullSchedule = await schedRes.json();
        if (Array.isArray(fullSchedule) && fullSchedule.length > 0) {
          const { byId: pm, movedLag } = cascadeDates(fullSchedule, dr.taskId, newStart, newEnd);
          const dm = buildDepMap(fullSchedule);
          const deps = getAllDependents(dr.taskId, dm);
          deps.add(dr.taskId);

          const updates = [];
          deps.forEach(id => {
            const orig = fullSchedule.find(t => t.id === id);
            const upd = pm[id];
            if (orig && upd && (orig.start_date !== upd.start_date || orig.end_date !== upd.end_date)) {
              const entry = { id, start_date: upd.start_date, end_date: upd.end_date };
              if (id === dr.taskId && movedLag !== null) entry.lag_days = movedLag;
              updates.push(entry);
            }
          });

          if (updates.length > 0) {
            await fetch(`${API_BASE}/schedule/batch-update`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            });
            const updateMap = {};
            updates.forEach(u => { updateMap[u.id] = u; });
            setBuilderTasks(prev => prev.map(t => {
              const u = updateMap[t.id];
              return u ? { ...t, start_date: u.start_date, end_date: u.end_date } : t;
            }));
          }
        } else {
          await fetch(`${API_BASE}/schedule/batch-update`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ id: dr.taskId, start_date: newStart, end_date: newEnd }]),
          });
        }

        // Re-fetch builder tasks
        if (user?.id) {
          const res = await fetch(`${API_BASE}/users/${user.id}/tasks`);
          const data = await res.json();
          if (Array.isArray(data)) setBuilderTasks(data);
        }
        setScheduleVersion(v => v + 1);
      } catch (e) { console.warn('Builder drag save failed:', e); }
    } else {
      setBuilderPreviewMap(null);
    }
  }).current;

  const builderHandleDragStart = (task, e) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (task.on_hold) return; // Block dragging for on-hold projects
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    builderMeasureGrid();
    const ts = new Date(task.start_date + 'T00:00:00'), te = new Date(task.end_date + 'T00:00:00');
    if (isNaN(ts)||isNaN(te)) return;
    builderDragRef.current = { taskId: task.id, jobId: task.job_id, origStart: ts, origEnd: te, anchorDay: null, lastOffset: null, isLive: task.go_live !== false, isException: !!task.is_exception };
    setBuilderDraggedId(task.id);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', builderHandlePointerMove);
    document.addEventListener('pointerup', builderHandlePointerUp);
  };

  const builderHandleContextMenu = (task, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault(); e.stopPropagation();
    const dur = subWorkdayCount(task.start_date, task.end_date);
    setBuilderEditPopup({ task, x: e.clientX, y: e.clientY });
    setBuilderEditDuration(String(dur));
    setBuilderEditReason('');
    setBuilderEditSaving(false);
  };

  const closeBuilderEditPopup = () => { setBuilderEditPopup(null); setBuilderEditDuration(''); setBuilderEditReason(''); setBuilderEditSaving(false); };

  const saveBuilderEdit = async () => {
    if (!builderEditPopup || !builderEditReason.trim() || builderEditSaving) return;
    const task = builderEditPopup.task;
    const newDur = parseInt(builderEditDuration) || 1;
    const newEnd = subCalcEnd(task.start_date, newDur);
    if (newEnd === task.end_date) { closeBuilderEditPopup(); return; }
    setBuilderEditSaving(true);
    try {
      const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
      await fetch(`${API_BASE}/schedule/${task.id}/edit`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_date: newEnd, reason: builderEditReason.trim(), edited_by: editedBy }),
      });
      if (user?.id) {
        const res = await fetch(`${API_BASE}/users/${user.id}/tasks`);
        const data = await res.json();
        if (Array.isArray(data)) setBuilderTasks(data);
      }
      closeBuilderEditPopup();
      setScheduleVersion(v => v + 1);
    } catch (e) { console.warn('Builder edit save failed:', e); setBuilderEditSaving(false); }
  };

  // Clean up builder drag listeners on unmount
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const mRef = builderHandlePointerMove, uRef = builderHandlePointerUp;
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', mRef);
      document.removeEventListener('pointerup', uRef);
    };
  }, []);

  // ============================================================
  // SUB DETAIL VIEW
  // ============================================================
  const renderSubDetail = () => {
    if (!selectedSub) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: C.bg }}>
          <Text style={{ fontSize: 72, marginBottom: 16 }}>👷</Text>
          <Text style={{ fontSize: 30, fontWeight: '700', color: C.textBold, marginBottom: 8 }}>Select a Subcontractor</Text>
          <Text style={{ fontSize: 21, color: C.dm, textAlign: 'center' }}>
            Choose a subcontractor from the list to view their details and assigned tasks.
          </Text>
        </View>
      );
    }

    const tradesArr = selectedSub.trades ? selectedSub.trades.split(',').map(t => t.trim()).filter(Boolean) : [];
    const totalTasks = subTasks.length;
    const completeTasks = subTasks.filter(t => calcTaskProgress(t).pct >= 100).length;

    // ---- Calendar helpers (matching project calendar format) ----
    const calYear = globalCalMonth.getFullYear();
    const calMon = globalCalMonth.getMonth();
    const monNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today = new Date();

    const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    // Build full week-based grid with Date objects (like project calendar)
    const startOfMonth = new Date(calYear, calMon, 1);
    const endOfMonth = new Date(calYear, calMon + 1, 0);
    const gridStart = new Date(startOfMonth);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back to Sunday
    const gridEnd = new Date(endOfMonth);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay())); // forward to Saturday
    const weeks = [];
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const week = [];
      for (let i = 0; i < 7; i++) { week.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
      weeks.push(week);
    }
    subWeeksRef.current = weeks;

    // Color palette for projects
    const projectColors = {};
    const palette = [C.bl,'#f59e0b',C.gn,C.rd,'#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
    let colorIdx = 0;
    subTasks.forEach(t => {
      const pn = t.project_name || 'Unknown';
      if (!projectColors[pn]) { projectColors[pn] = palette[colorIdx % palette.length]; colorIdx++; }
    });

    // Get tasks visible in a given week row (with drag preview)
    const getWeekTasks = (week) => {
      const wkStart = `${week[0].getFullYear()}-${String(week[0].getMonth()+1).padStart(2,'0')}-${String(week[0].getDate()).padStart(2,'0')}`;
      const wkEnd = `${week[6].getFullYear()}-${String(week[6].getMonth()+1).padStart(2,'0')}-${String(week[6].getDate()).padStart(2,'0')}`;
      const items = subPreviewMap ? subTasks.map(t => {
        const ov = subPreviewMap[t.id];
        return ov ? { ...t, start_date: ov.start_date, end_date: ov.end_date } : t;
      }) : subTasks;
      return items
        .filter(t => t.start_date && t.end_date && t.start_date <= wkEnd && t.end_date >= wkStart)
        .map(t => {
          const tStart = t.start_date < wkStart ? wkStart : t.start_date;
          const tEnd = t.end_date > wkEnd ? wkEnd : t.end_date;
          let startCol = 0, span = 1;
          for (let i = 0; i < 7; i++) {
            const ds = `${week[i].getFullYear()}-${String(week[i].getMonth()+1).padStart(2,'0')}-${String(week[i].getDate()).padStart(2,'0')}`;
            if (ds === tStart) startCol = i;
            if (ds === tEnd) { span = i - startCol + 1; break; }
          }
          return { ...t, startCol, span };
        })
        .sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    };

    // Task-first: get tasks starting on a given day
    const getTasksForDay = (day) => {
      const ds = subFmtDate(day);
      const items = subPreviewMap ? subTasks.map(t => {
        const ov = subPreviewMap[t.id];
        return ov ? { ...t, start_date: ov.start_date, end_date: ov.end_date } : t;
      }) : subTasks;
      return items.filter(t => t.start_date === ds);
    };

    const subShortDate = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d)) return '';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const prevMonth = () => setGlobalCalMonth(new Date(calYear, calMon - 1, 1));
    const nextMonth = () => setGlobalCalMonth(new Date(calYear, calMon + 1, 1));
    const goToday = () => setGlobalCalMonth(new Date());

    return (
      <View style={{ flex: 1, minHeight: 0, backgroundColor: C.bg }}>
        {/* Delete confirmation modal */}
        {showDeleteSub && selectedSub && (
          <Modal visible transparent animationType="fade">
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <View style={{ backgroundColor: C.modalBg, borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: C.rd, marginBottom: 12 }}>Delete Subcontractor?</Text>
                <Text style={{ fontSize: 18, color: C.mt, lineHeight: 26, marginBottom: 16 }}>
                  This will permanently delete {selectedSub.company_name || selectedSub.name} and remove them from all assigned tasks. This cannot be undone.
                </Text>
                <Text style={{ fontSize: 16, color: C.dm, marginBottom: 8 }}>Type the company name to confirm:</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.textBold, marginBottom: 8 }}>{selectedSub.company_name || selectedSub.name}</Text>
                <TextInput
                  value={deleteConfirmText}
                  onChangeText={setDeleteConfirmText}
                  placeholder="Type name here..."
                  placeholderTextColor={C.ph}
                  style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, fontSize: 18, color: C.text, marginBottom: 16 }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => { setShowDeleteSub(false); setDeleteConfirmText(''); }}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: C.w06 }}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.mt }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        const res = await fetch(`${API_BASE}/users/${selectedSub.id}`, { method: 'DELETE' });
                        if (res.ok) {
                          setSubs(prev => prev.filter(s => s.id !== selectedSub.id));
                          setSelectedSub(null);
                          setShowDeleteSub(false);
                          setDeleteConfirmText('');
                          setSubEditing(false);
                          Alert.alert('Deleted', 'Subcontractor has been removed');
                        }
                      } catch (e) { Alert.alert('Error', e.message); }
                    }}
                    disabled={deleteConfirmText.trim() !== (selectedSub.company_name || selectedSub.name)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: C.rd, opacity: deleteConfirmText.trim() === (selectedSub.company_name || selectedSub.name) ? 1 : 0.3 }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        {/* Subcontractor View banner */}
        {subView && (
          <View style={{
            backgroundColor: C.gd + '18',
            borderBottomWidth: 1,
            borderBottomColor: C.gd + '40',
            paddingVertical: 10,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18 }}>🛠️</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.gd }}>Subcontractor View</Text>
              <Text style={{ fontSize: 14, color: C.dm }}>— Viewing as {selectedSub.company_name || selectedSub.name}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSubView(false)}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: C.gd + '25' }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gd }}>Exit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tab bar */}
        <View style={st.subTabBar}>
          {[['calendar', 'Calendar'], ['info', 'Info']].map(([id, label]) => {
            const active = subTab === id;
            return (
            <TouchableOpacity
              key={id}
              onPress={() => setSubTab(id)}
              style={[st.subTabBtn, active && st.subTabBtnOn]}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' ? {
                onMouseEnter: (e) => { if (!active) e.currentTarget.style.backgroundColor = C.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; },
                onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; },
              } : {})}
            >
              <Text style={[st.subTabTxt, active && st.subTabTxtOn]}>{label}</Text>
            </TouchableOpacity>
            );
          })}
        </View>

        {subTab === 'info' ? (
          /* ---- INFO TAB ---- */
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Sub header card */}
            <View style={st.subDetailCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                  <View style={st.subAvatar}>
                    <Text style={st.subAvatarTxt}>{ini(selectedSub.company_name || selectedSub.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {subEditing ? (
                      <>
                        <TextInput value={subEditFields.companyName} onChangeText={v => setSubEditFields(p => ({ ...p, companyName: v }))}
                          placeholder="Company Name" placeholderTextColor={C.ph}
                          style={{ fontSize: 24, fontWeight: '700', color: C.textBold, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 8, marginBottom: 6 }} />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput value={subEditFields.firstName} onChangeText={v => setSubEditFields(p => ({ ...p, firstName: v }))}
                            placeholder="First" placeholderTextColor={C.ph}
                            style={{ flex: 1, fontSize: 18, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 8 }} />
                          <TextInput value={subEditFields.lastName} onChangeText={v => setSubEditFields(p => ({ ...p, lastName: v }))}
                            placeholder="Last" placeholderTextColor={C.ph}
                            style={{ flex: 1, fontSize: 18, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 8 }} />
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 30, fontWeight: '700', color: C.textBold }}>{selectedSub.company_name || selectedSub.name}</Text>
                        {selectedSub.company_name ? (
                          <Text style={{ fontSize: 21, color: C.gd, marginTop: 2 }}>{selectedSub.name}</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
                {!subView && (
                  <TouchableOpacity onPress={() => {
                    if (subEditing) {
                      setSubEditing(false);
                    } else {
                      const names = (selectedSub.name || '').split(' ');
                      setSubEditFields({
                        companyName: selectedSub.company_name || '',
                        firstName: names[0] || '',
                        lastName: names.slice(1).join(' ') || '',
                        email: selectedSub.username || '',
                        phone: selectedSub.phone || '',
                        street_address: selectedSub.street_address || '',
                        city: selectedSub.city || '',
                        state: selectedSub.state || '',
                        zip_code: selectedSub.zip_code || '',
                      });
                      setSubEditTrades(tradesArr);
                      setSubEditing(true);
                    }
                  }} style={{ padding: 8, marginLeft: 8 }}>
                    <Text style={{ fontSize: 20, color: subEditing ? C.rd : C.dm }}>{subEditing ? '✕' : '✏️'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Contact info */}
              {subEditing ? (
                <View style={{ gap: 10, marginBottom: 14 }}>
                  <View>
                    <Text style={st.subSectionLbl}>EMAIL</Text>
                    <TextInput value={subEditFields.email} onChangeText={v => setSubEditFields(p => ({ ...p, email: v }))}
                      placeholder="email@example.com" placeholderTextColor={C.ph} keyboardType="email-address" autoCapitalize="none"
                      style={{ fontSize: 20, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }} />
                  </View>
                  <View>
                    <Text style={st.subSectionLbl}>PHONE</Text>
                    <TextInput value={fPhone(subEditFields.phone)} onChangeText={v => setSubEditFields(p => ({ ...p, phone: v.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="(555) 555-5555" placeholderTextColor={C.ph} keyboardType="phone-pad"
                      style={{ fontSize: 20, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }} />
                  </View>
                  <View>
                    <Text style={st.subSectionLbl}>ADDRESS</Text>
                    <TextInput value={subEditFields.street_address} onChangeText={v => setSubEditFields(p => ({ ...p, street_address: v }))}
                      placeholder="Street Address" placeholderTextColor={C.ph}
                      style={{ fontSize: 20, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, marginBottom: 8 }} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput value={subEditFields.city} onChangeText={v => setSubEditFields(p => ({ ...p, city: v }))}
                        placeholder="City" placeholderTextColor={C.ph}
                        style={{ flex: 2, fontSize: 20, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }} />
                      <TextInput value={subEditFields.state} onChangeText={v => setSubEditFields(p => ({ ...p, state: v.toUpperCase().slice(0, 2) }))}
                        placeholder="ST" placeholderTextColor={C.ph}
                        style={{ width: 60, fontSize: 20, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10, textAlign: 'center' }} />
                      <TextInput value={subEditFields.zip_code} onChangeText={v => setSubEditFields(p => ({ ...p, zip_code: v }))}
                        placeholder="Zip" placeholderTextColor={C.ph} keyboardType="numeric"
                        style={{ width: 90, fontSize: 20, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 10 }} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 8, marginBottom: 14 }}>
                  {selectedSub.username && (
                    <View style={st.subInfoRow}>
                      <Text style={st.subInfoLabel}>📧 Email</Text>
                      <Text style={st.subInfoVal}>{selectedSub.username}</Text>
                    </View>
                  )}
                  {selectedSub.phone && (
                    <View style={st.subInfoRow}>
                      <Text style={st.subInfoLabel}>📱 Phone</Text>
                      <Text style={st.subInfoVal}>{fPhone(selectedSub.phone)}</Text>
                    </View>
                  )}
                  {(selectedSub.street_address || selectedSub.city || selectedSub.state) && (
                    <View style={st.subInfoRow}>
                      <Text style={st.subInfoLabel}>📍 Address</Text>
                      <Text style={st.subInfoVal}>
                        {[selectedSub.street_address, [selectedSub.city, selectedSub.state].filter(Boolean).join(', '), selectedSub.zip_code].filter(Boolean).join('\n')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Trades */}
              <View style={{ marginBottom: 4 }}>
                <Text style={[st.subSectionLbl, { marginBottom: 6 }]}>TRADES</Text>
                {subEditing ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {DEFAULT_TRADES.concat(tradesArr.filter(t => !DEFAULT_TRADES.includes(t))).map(trade => {
                      const on = subEditTrades.includes(trade);
                      return (
                        <TouchableOpacity key={trade} onPress={() => setSubEditTrades(prev => on ? prev.filter(t => t !== trade) : [...prev, trade])}
                          style={[st.nsTradeChip, on && st.nsTradeChipOn]} activeOpacity={0.7}>
                          <Text style={[st.nsTradeTxt, on && st.nsTradeTxtOn]}>{trade}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : tradesArr.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {tradesArr.map(t => (
                      <View key={t} style={st.subTradeBadge}>
                        <Text style={st.subTradeTxt}>{t}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 18, color: C.dm, fontStyle: 'italic' }}>No trades assigned</Text>
                )}
              </View>

              {/* Save / Delete buttons in edit mode */}
              {subEditing && (
                <View style={{ marginTop: 18, gap: 10 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      setSubSaving(true);
                      try {
                        const res = await fetch(`${API_BASE}/users/${selectedSub.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            companyName: subEditFields.companyName.trim(),
                            firstName: subEditFields.firstName.trim(),
                            lastName: subEditFields.lastName.trim(),
                            email: subEditFields.email.trim(),
                            phone: subEditFields.phone,
                            trades: subEditTrades.join(', '),
                            street_address: subEditFields.street_address.trim(),
                            city: subEditFields.city.trim(),
                            state: subEditFields.state.trim(),
                            zip_code: subEditFields.zip_code.trim(),
                          }),
                        });
                        if (res.ok) {
                          const updated = await res.json();
                          setSelectedSub(updated);
                          setSubs(prev => prev.map(s => s.id === updated.id ? updated : s));
                          setSubEditing(false);
                        }
                      } catch (e) { Alert.alert('Error', e.message); }
                      finally { setSubSaving(false); }
                    }}
                    disabled={subSaving}
                    style={{ backgroundColor: C.bl, paddingVertical: 14, borderRadius: 10, alignItems: 'center', opacity: subSaving ? 0.6 : 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>{subSaving ? 'Saving...' : 'Save Changes'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => { setShowDeleteSub(true); setDeleteConfirmText(''); }}
                    style={{ paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: C.rd, backgroundColor: 'rgba(239,68,68,0.06)' }}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.rd }}>🗑 Delete Subcontractor</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={st.subStatCard}>
                <Text style={st.subStatNum}>{subProjects.length}</Text>
                <Text style={st.subStatLbl}>Projects</Text>
              </View>
              <View style={st.subStatCard}>
                <Text style={st.subStatNum}>{totalTasks}</Text>
                <Text style={st.subStatLbl}>Tasks</Text>
              </View>
              <View style={st.subStatCard}>
                <Text style={[st.subStatNum, { color: C.gn }]}>{completeTasks}</Text>
                <Text style={st.subStatLbl}>Complete</Text>
              </View>
              <View style={st.subStatCard}>
                <Text style={[st.subStatNum, { color: totalTasks - completeTasks > 0 ? C.yl : C.gn }]}>{totalTasks - completeTasks}</Text>
                <Text style={st.subStatLbl}>Active</Text>
              </View>
            </View>

            {/* Assigned Projects */}
            <View style={st.subDetailCard}>
              <Text style={st.subCardTitle}>📁 Assigned Projects</Text>
              {subProjects.length === 0 ? (
                <Text style={{ color: C.dm, fontSize: 20, paddingVertical: 12 }}>No projects assigned</Text>
              ) : (
                subProjects.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={st.subProjectRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      const proj = projects.find(pr => pr.id === p.id) || p;
                      if (isContractor) {
                        setContractorProject(proj);
                      } else {
                        setDashView('projects');
                        setSelectedProject(proj);
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 21, fontWeight: '600', color: C.text }}>{p.name}</Text>
                      <Text style={{ fontSize: 16, color: C.dm, marginTop: 2 }}>
                        {[p.number, p.status].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 21, color: C.mt }}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* Assigned Tasks */}
            <View style={[st.subDetailCard, { marginTop: 14 }]}>
              <Text style={st.subCardTitle}>📋 Assigned Tasks</Text>
              {subTasks.length === 0 ? (
                <Text style={{ color: C.dm, fontSize: 20, paddingVertical: 12 }}>No tasks assigned</Text>
              ) : (
                subTasks.map(t => {
                  const { pct: taskPct } = calcTaskProgress(t);
                  const isComplete = taskPct >= 100;
                  return (
                    <View key={t.id} style={st.subTaskRow}>
                      <View style={[st.subTaskDot, isComplete && { backgroundColor: C.gn }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{t.task}</Text>
                        <Text style={{ fontSize: 16, color: C.dm, marginTop: 1 }}>
                          {t.project_name || 'Unknown Project'} · {t.start_date} → {t.end_date}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: isComplete ? C.gn : C.gd }}>
                        {taskPct}%
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Employees */}
            <View style={[st.subDetailCard, { marginTop: 14, marginBottom: 20 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={st.subCardTitle}>👷 Employees</Text>
                <TouchableOpacity onPress={() => { setShowAddEmployee(true); setEmpName(''); setEmpJob(''); setEmpPhone(''); setEditingEmpId(null); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.bl, borderRadius: 8 }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {employees.length === 0 ? (
                <Text style={{ color: C.dm, fontSize: 20, paddingVertical: 12 }}>No employees added</Text>
              ) : (
                employees.map(emp => (
                  <View key={emp.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.w06, gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bl + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: C.bl }}>{(emp.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 19, fontWeight: '600', color: C.text }}>{emp.name}</Text>
                      {!!emp.job_description && <Text style={{ fontSize: 15, color: C.dm, marginTop: 1 }}>{emp.job_description}</Text>}
                      {!!emp.phone && <Text style={{ fontSize: 15, color: C.dm, marginTop: 1 }}>📱 {fPhone(emp.phone)}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => { setShowAddEmployee(true); setEditingEmpId(emp.id); setEmpName(emp.name); setEmpJob(emp.job_description || ''); setEmpPhone(emp.phone || ''); }}
                      style={{ padding: 6 }} activeOpacity={0.6}>
                      <Text style={{ fontSize: 16, color: C.dm }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={async () => {
                      const ok = Platform.OS === 'web' ? window.confirm(`Remove ${emp.name}?`) : await new Promise(r => Alert.alert('Remove', `Remove ${emp.name}?`, [{ text: 'Cancel', onPress: () => r(false) }, { text: 'Remove', style: 'destructive', onPress: () => r(true) }]));
                      if (!ok) return;
                      try { await fetch(`${API_BASE}/employees/${emp.id}`, { method: 'DELETE' }); setEmployees(prev => prev.filter(e => e.id !== emp.id)); } catch (e) {}
                    }} style={{ padding: 6 }} activeOpacity={0.6}>
                      <Text style={{ fontSize: 16, color: C.rd }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        ) : (
          /* ---- CALENDAR TAB ---- */
          <View style={{ flex: 1, minHeight: 0 }}>
            {/* Gantt / Task First toggle */}
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.bd }}>
              {['gantt', 'taskfirst'].map(v => (
                <TouchableOpacity key={v} onPress={() => setSubCalView(v)}
                  style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                    borderColor: subCalView === v ? C.gd : (C.mode === 'light' ? 'rgba(0,0,0,0.12)' : C.w08),
                    backgroundColor: subCalView === v ? C.bH12 : (C.mode === 'light' ? '#ffffff' : C.w02),
                  }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 16, fontWeight: subCalView === v ? '600' : '500', color: subCalView === v ? C.gd : C.mt }}>{v === 'gantt' ? 'Gantt' : 'Task First'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Company name */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>{selectedSub?.company_name || selectedSub?.name || ''}</Text>
            </View>

            {/* Month nav */}
            <View style={st.subCalNav}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={goToday} style={st.subCalTodayBtn} activeOpacity={0.7}>
                  <Text style={st.subCalTodayTxt}>Today</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity onPress={prevMonth} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>‹</Text></TouchableOpacity>
                <Text style={st.subCalNavTitle}>{monNames[calMon]} {calYear}</Text>
                <TouchableOpacity onPress={nextMonth} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>›</Text></TouchableOpacity>
              </View>
              <View style={{ width: 60 }} />
            </View>
            {Object.keys(projectColors).length > 0 && (
              <View style={st.subCalLegend}>
                {Object.entries(projectColors).map(([name, color]) => (
                  <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 15, height: 15, borderRadius: 5, borderWidth: 2.5, borderColor: color, backgroundColor: 'transparent' }} />
                    <Text style={{ fontSize: 15, color: C.dm }} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Day headers */}
            <View style={st.subCalDayHeaders}>
              {DAYS.map(d => (
                <View key={d} style={st.subCalDayHeaderCell}>
                  <Text style={st.subCalDayHeaderTxt}>{d}</Text>
                </View>
              ))}
            </View>

            {/* ===== GANTT MODE ===== */}
            {subCalView === 'gantt' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              <View
                ref={subCalRef}
                style={Platform.OS === 'web' ? { userSelect: 'none' } : {}}
                onLayout={(e) => { subCellWidth.current = e.nativeEvent.layout.width / 7; }}
              >
              {weeks.map((week, wi) => {
                const weekTasks = getWeekTasks(week);
                const lanes = [];
                weekTasks.forEach(task => {
                  let placed = false;
                  for (let l = 0; l < lanes.length; l++) {
                    const last = lanes[l][lanes[l].length - 1];
                    if (task.startCol > last.startCol + last.span - 1) { lanes[l].push(task); placed = true; break; }
                  }
                  if (!placed) lanes.push([task]);
                });
                const laneH = 32;
                const rowMinH = Math.max(125, 40 + lanes.length * laneH);

                return (
                  <View key={wi} style={[st.subCalWeekRow, { minHeight: rowMinH }]}>
                    {week.map((day, di) => {
                      const isToday2 = isSameDay(day, today);
                      const isCurMonth = day.getMonth() === calMon;
                      return (
                        <View key={di} style={[st.subCalCell, di < 6 && st.subCalCellBorder, (di === 0 || di === 6) && st.subCalCellWknd]}>
                          <View style={[st.subCalDayCircle, isToday2 && st.subCalDayCircleToday]}>
                            <Text style={[st.subCalDayNum, !isCurMonth && st.subCalDayOther, isToday2 && st.subCalDayNumToday]}>
                              {day.getDate()}
                            </Text>
                          </View>
                        </View>
                      );
                    })}

                    {lanes.map((lane, li) => (
                      lane.map(task => {
                        const pColor = projectColors[task.project_name || 'Unknown'] || C.bl;
                        const leftPct = `${(task.startCol / 7) * 100}%`;
                        const widthPct = `${(task.span / 7) * 100}%`;
                        const laneTop = 48 + li * laneH;
                        const isDragged = subDraggedId === task.id;
                        const isLive = task.go_live !== false;
                        const isExc = task.is_exception;
                        const isRed = isExc || task.on_hold;

                        return (
                          <TouchableOpacity
                            key={`${task.id}-${wi}`}
                            activeOpacity={0.7}
                            onPress={() => {
                              const proj = projects.find(pr => pr.id === task.job_id);
                              if (proj) { setTaskActionPopup({ task, project: proj }); setTaskActionDate(''); }
                            }}
                            style={[st.subCalTaskBar, {
                              left: leftPct, width: widthPct, top: laneTop,
                              borderColor: isRed ? C.rd : pColor, opacity: isDragged ? 0.7 : 1,
                            },
                            isRed && { backgroundColor: C.rd, borderColor: C.rd },
                            !isRed && !isLive && { backgroundColor: C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)' },
                            isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed' },
                            Platform.OS === 'web' ? { cursor: 'pointer' } : {},
                            ]}
                            {...(Platform.OS === 'web' && isBuilder && !subView ? {
                              onPointerDown: (e) => subHandleDragStart(task, e),
                            } : {})}
                          >
                            {calcTaskProgress(task).pct >= 100 && <Text style={{ fontSize: 15, color: isRed ? '#fff' : C.gn, marginRight: 3 }}>✓</Text>}
                            <Text style={[st.subCalTaskTxt, isRed && { color: '#fff' }]} numberOfLines={1}>{task.project_name || 'Unknown'}</Text>
                          </TouchableOpacity>
                        );
                      })
                    ))}
                  </View>
                );
              })}
              </View>
            </ScrollView>
            )}

            {/* ===== TASK FIRST MODE ===== */}
            {subCalView === 'taskfirst' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              <View
                ref={subCalRef}
                style={Platform.OS === 'web' ? { userSelect: 'none' } : {}}
                onLayout={(e) => { subCellWidth.current = e.nativeEvent.layout.width / 7; }}
              >
              {weeks.map((week, wi) => {
                const dayCounts = week.map(day => getTasksForDay(day).length);
                const maxTasks = Math.max(0, ...dayCounts);
                const rowMinH = Math.max(125, 48 + maxTasks * 80);

                return (
                  <View key={wi} style={[st.subCalWeekRow, { minHeight: rowMinH }]}>
                    {week.map((day, di) => {
                      const isToday2 = isSameDay(day, today);
                      const isCurMonth = day.getMonth() === calMon;
                      const dayTasks = getTasksForDay(day);

                      return (
                        <View key={di} style={[st.subCalCell, di < 6 && st.subCalCellBorder, (di === 0 || di === 6) && st.subCalCellWknd, { overflow: 'hidden' }]}>
                          <View style={[st.subCalDayCircle, isToday2 && st.subCalDayCircleToday]}>
                            <Text style={[st.subCalDayNum, !isCurMonth && st.subCalDayOther, isToday2 && st.subCalDayNumToday]}>
                              {day.getDate()}
                            </Text>
                          </View>

                          {dayTasks.map(task => {
                            const pColor = projectColors[task.project_name || 'Unknown'] || C.bl;
                            const isDragged = subDraggedId === task.id;
                            const isComplete = calcTaskProgress(task).pct >= 100;
                            const isLive = task.go_live !== false;
                            const isExc = task.is_exception;
                            const isRed = isExc || task.on_hold;

                            return (
                              <TouchableOpacity
                                key={task.id}
                                activeOpacity={0.7}
                                onPress={() => {
                                  const proj = projects.find(pr => pr.id === task.job_id);
                                  if (proj) { setTaskActionPopup({ task, project: proj }); setTaskActionDate(''); }
                                }}
                                style={[{
                                  flexDirection: 'column', gap: 2, marginTop: 4, marginRight: 4,
                                  paddingVertical: 7, paddingHorizontal: 8,
                                  backgroundColor: isRed ? C.rd : (!isLive ? (C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)') : (C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04)),
                                  borderRadius: 6, borderLeftWidth: 5, borderLeftColor: isRed ? C.rd : pColor,
                                  opacity: isDragged ? 0.7 : 1,
                                },
                                Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } : {},
                                isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed', borderLeftWidth: 2 },
                                ]}
                                {...(Platform.OS === 'web' && isBuilder && !subView ? {
                                  onPointerDown: (e) => subHandleDragStart(task, e),
                                } : {})}
                              >
                                <Text style={{ fontSize: 18, fontWeight: '600', color: isRed ? '#fff' : C.text, lineHeight: 24, textDecorationLine: isComplete ? 'line-through' : 'none' }}>
                                  {isComplete ? '✓ ' : ''}{task.project_name || 'Unknown'}
                                </Text>
                                <Text style={{ fontSize: 15, color: isRed ? 'rgba(255,255,255,0.8)' : C.dm, fontWeight: '500' }}>→ {subShortDate(task.end_date)}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
              </View>
            </ScrollView>
            )}

            {/* Hint */}
            {Platform.OS === 'web' && (
              <View style={{ paddingVertical: 6, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.bd }}>
                <Text style={{ fontSize: 15, color: C.dm }}>{isBuilder && !subView ? 'Click task to open project · Drag to reschedule' : 'Click task to open project'}</Text>
              </View>
            )}

            {/* Right-click edit popup for builder */}
            {subEditPopup && Platform.OS === 'web' && (
              <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={closeSubEditPopup} />
                <View style={{ width: 340, zIndex: 1001, backgroundColor: C.modalBg, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden',
                  ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w08, backgroundColor: C.w03 }}>
                    <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>Edit Duration</Text>
                    <TouchableOpacity onPress={closeSubEditPopup} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06 }}>
                      <Text style={{ fontSize: 27, color: C.mt, marginTop: -1 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Task info */}
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: C.w02 }}>
                    <Text style={{ fontSize: 21, fontWeight: '600', color: C.text, marginBottom: 4 }}>{subEditPopup.task.task}</Text>
                    <Text style={{ fontSize: 16, color: C.dm }}>{subEditPopup.task.project_name || 'Unknown'}</Text>
                    <Text style={{ fontSize: 16, color: C.dm, marginTop: 2 }}>{subEditPopup.task.start_date} → {subEditPopup.task.end_date}</Text>
                  </View>
                  {/* Duration */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>DURATION (WORKDAYS)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => setSubEditDuration(String(Math.max(1, (parseInt(subEditDuration)||1) - 1)))}
                        style={{ width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10 }}>
                        <Text style={{ fontSize: 27, color: C.text, fontWeight: '600' }}>−</Text>
                      </TouchableOpacity>
                      <View style={{ flex: 1, height: 54, borderRadius: 12, backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10, justifyContent: 'center', paddingHorizontal: 8 }}>
                        <TextInput value={subEditDuration} onChangeText={setSubEditDuration} keyboardType="numeric"
                          style={{ color: C.textBold, fontSize: 27, fontWeight: '700', textAlign: 'center', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                      </View>
                      <TouchableOpacity onPress={() => setSubEditDuration(String((parseInt(subEditDuration)||1) + 1))}
                        style={{ width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10 }}>
                        <Text style={{ fontSize: 27, color: C.text, fontWeight: '600' }}>+</Text>
                      </TouchableOpacity>
                    </View>
                    {subEditPopup && <Text style={{ fontSize: 16, color: C.gd, marginTop: 6 }}>New end: {subCalcEnd(subEditPopup.task.start_date, parseInt(subEditDuration) || 1)}</Text>}
                  </View>
                  {/* Reason */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>REASON FOR CHANGE *</Text>
                    <View style={{ borderRadius: 8, padding: 10, backgroundColor: C.w04, borderWidth: 1, borderColor: C.w10, minHeight: 70 }}>
                      <TextInput value={subEditReason} onChangeText={setSubEditReason} placeholder="Why is this changing?"
                        placeholderTextColor={C.ph} multiline
                        style={{ color: C.text, fontSize: 20, lineHeight: 27, textAlignVertical: 'top', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                    </View>
                  </View>
                  {/* Actions */}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
                    <TouchableOpacity onPress={closeSubEditPopup} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: C.w10, backgroundColor: C.w04 }}>
                      <Text style={{ fontSize: 20, color: C.mt, fontWeight: '500' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveSubEdit} disabled={!subEditReason.trim() || subEditSaving}
                      style={[{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 8, backgroundColor: C.gd }, (!subEditReason.trim() || subEditSaving) && { opacity: 0.4 }]}>
                      <Text style={{ fontSize: 20, color: C.textBold, fontWeight: '700' }}>{subEditSaving ? 'Saving...' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Task action popup */}
            {taskActionPopup && (
              <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={closeTaskActionPopup} />
                <View style={{ width: 380, zIndex: 1001, backgroundColor: C.modalBg, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden',
                  ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w08, backgroundColor: C.w03 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }} numberOfLines={1}>{taskActionPopup.task.task}</Text>
                      <Text style={{ fontSize: 15, color: C.dm, marginTop: 2 }} numberOfLines={1}>{taskActionPopup.project.name}</Text>
                    </View>
                    <TouchableOpacity onPress={closeTaskActionPopup} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06 }}>
                      <Text style={{ fontSize: 27, color: C.mt, marginTop: -1 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Navigation options */}
                  <View style={{ borderBottomWidth: taskActionPopup.project.go_live ? 0 : 1, borderBottomColor: C.w06 }}>
                    <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'schedule', 'calendar')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                      <Text style={{ fontSize: 22 }}>📅</Text>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Job Schedule</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'schedule', 'list')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                      <Text style={{ fontSize: 22 }}>📋</Text>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Job Schedule Report</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, opacity: 0.5 }} activeOpacity={1}>
                      <Text style={{ fontSize: 22 }}>📐</Text>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Job Specifications</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 14, color: C.dm }}>Coming Soon</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'docs', 'documents')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: taskActionPopup.project.subdivision_id ? 1 : 0, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                      <Text style={{ fontSize: 22 }}>📄</Text>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Documents</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                    </TouchableOpacity>
                    {taskActionPopup.project.subdivision_id && (
                      <TouchableOpacity onPress={() => {
                        const sd = subdivisions.find(s => s.id === taskActionPopup.project.subdivision_id);
                        if (sd) { closeTaskActionPopup(); setDashView('projects'); setSelectedProject(null); selectSubdivision(sd); setSubdivTab('docs'); }
                      }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }} activeOpacity={0.7}>
                        <Text style={{ fontSize: 22 }}>🏘️</Text>
                        <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Subdivision Documents</Text>
                        <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Move Task Date — only if NOT live */}
                  {!taskActionPopup.project.go_live && (
                    <View style={{ padding: 16 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>MOVE TASK DATE</Text>
                      <Text style={{ fontSize: 14, color: C.dm, marginBottom: 8 }}>Current: {taskActionPopup.task.start_date} → {taskActionPopup.task.end_date}</Text>
                      <DatePicker value={taskActionDate} onChange={setTaskActionDate} label="NEW START DATE" placeholder="Select new start date" />
                      {taskActionDate ? (
                        <Text style={{ fontSize: 14, color: C.gd, marginTop: 6 }}>
                          New range: {taskActionDate} → {subCalcEnd(taskActionDate, subWorkdayCount(taskActionPopup.task.start_date, taskActionPopup.task.end_date))}
                        </Text>
                      ) : null}
                      <TouchableOpacity onPress={handleMoveTaskDate} disabled={!taskActionDate || taskActionSaving}
                        style={{ marginTop: 12, backgroundColor: taskActionDate ? C.gd : C.w10, paddingVertical: 12, borderRadius: 8, alignItems: 'center', opacity: taskActionDate ? 1 : 0.5 }} activeOpacity={0.8}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: taskActionDate ? '#000' : C.dm }}>
                          {taskActionSaving ? 'Moving...' : 'Move Task Date'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, minHeight: 0 }}>
      {/* New Project Modal */}
      {/* Sidebar Filter Dropdown (All Jobs / Subdivision) */}
      {showSidebarFilter && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowSidebarFilter(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 280, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.35)' } : { elevation: 20 }) }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Filter Projects</Text>
                </View>
                <ScrollView style={{ maxHeight: 350 }} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity onPress={() => { setSidebarFilter(null); setShowSidebarFilter(false); }}
                    style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: !sidebarFilter ? C.gd + '18' : 'transparent' }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: !sidebarFilter ? '700' : '500', color: !sidebarFilter ? C.gd : C.text }}>All Projects</Text>
                    <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>{projects.length} total</Text>
                  </TouchableOpacity>
                  {subdivisions.map(sd => {
                    const count = projects.filter(p => p.subdivision_id === sd.id).length;
                    const active = sidebarFilter === sd.id;
                    return (
                      <TouchableOpacity key={sd.id} onPress={() => { setSidebarFilter(sd.id); setShowSidebarFilter(false); setSelectedSubdivision(null); setSelectedProject(null); }}
                        style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: active ? C.gd + '18' : 'transparent' }} activeOpacity={0.7}>
                        <Text style={{ fontSize: 18, fontWeight: active ? '700' : '500', color: active ? C.gd : C.text }}>📁 {sd.name}</Text>
                        <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>{count} project{count !== 1 ? 's' : ''}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Add Menu (New Project / New Subdivision) */}

      {/* Project Action Menu (ⓘ button) */}
      {projectActionMenu && !showDeleteConfirm && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setProjectActionMenu(null)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 260, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.35)' } : { elevation: 20 }) }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }} numberOfLines={1}>{projectActionMenu.name}</Text>
                </View>
                {projectActionMenu.on_hold ? (
                  <TouchableOpacity onPress={() => toggleProjectHold(projectActionMenu, 'release')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: 'rgba(245,158,11,0.08)' }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 20 }}>▶️</Text>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: '#f59e0b' }}>Release Hold</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => projectActionMenu.go_live ? toggleProjectHold(projectActionMenu, 'hold') : null}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, opacity: projectActionMenu.go_live ? 1 : 0.4 }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 20 }}>⏸</Text>
                    <Text style={{ fontSize: 18, fontWeight: '500', color: C.text }}>On Hold</Text>
                    {!projectActionMenu.go_live && <Text style={{ fontSize: 13, color: C.dm, marginLeft: 'auto' }}>Requires Go Live</Text>}
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => projectActionMenu.go_live ? openExceptionModal(projectActionMenu) : null}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, opacity: projectActionMenu.go_live ? 1 : 0.4 }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 20 }}>⚠️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '500', color: C.text }}>Exception</Text>
                  {!projectActionMenu.go_live && <Text style={{ fontSize: 13, color: C.dm, marginLeft: 'auto' }}>Requires Go Live</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowDeleteConfirm(projectActionMenu); setProjectActionMenu(null); setDeleteConfirmName(''); setDeletingProject(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 20 }}>🗑</Text>
                  <Text style={{ fontSize: 18, fontWeight: '500', color: C.rd }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Delete Project Confirmation Modal */}
      {showDeleteConfirm && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => { if (!deletingProject) { setShowDeleteConfirm(null); setDeleteConfirmName(''); } }}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 340, backgroundColor: C.cardBg || C.card, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.4)' } : { elevation: 20 }) }}>
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 42, marginBottom: 10 }}>⚠️</Text>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: C.rd, marginBottom: 6, textAlign: 'center' }}>Delete Project</Text>
                  <Text style={{ fontSize: 16, color: C.dm, textAlign: 'center', lineHeight: 24, marginBottom: 16 }}>
                    This will permanently delete all schedule tasks, change orders, selections, and documents. This cannot be undone.
                  </Text>
                  <View style={{ width: '100%', borderRadius: 10, backgroundColor: C.rd + '08', borderWidth: 1, borderColor: C.rd + '25', padding: 14, marginBottom: 16 }}>
                    <Text style={{ fontSize: 17, fontWeight: '600', color: C.text }}>{showDeleteConfirm.name}</Text>
                    <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>
                      {showDeleteConfirm.number}{showDeleteConfirm.address ? ` · ${showDeleteConfirm.address}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, color: C.text, marginBottom: 8, alignSelf: 'flex-start' }}>
                    Type <Text style={{ fontWeight: '700' }}>{showDeleteConfirm.name}</Text> to confirm:
                  </Text>
                  <TextInput
                    value={deleteConfirmName}
                    onChangeText={setDeleteConfirmName}
                    placeholder={showDeleteConfirm.name}
                    placeholderTextColor={C.dm + '60'}
                    style={{
                      width: '100%', fontSize: 17, color: C.text, borderWidth: 1, borderColor: C.w12,
                      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    }}
                    autoFocus
                  />
                </View>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.w06 }}>
                  <TouchableOpacity
                    onPress={() => { setShowDeleteConfirm(null); setDeleteConfirmName(''); }}
                    disabled={deletingProject}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.w06 }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '600', color: C.dm }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={deleteProjectFromMenu}
                    disabled={deleteConfirmName !== showDeleteConfirm.name || deletingProject}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', opacity: deleteConfirmName === showDeleteConfirm.name && !deletingProject ? 1 : 0.3 }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.rd }}>
                      {deletingProject ? 'Deleting...' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Exception Modal */}
      {showExceptionModal && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => { if (!excSaving) setShowExceptionModal(null); }}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 380, maxHeight: 600, backgroundColor: C.cardBg || C.card, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.4)' } : { elevation: 20 }) }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>⚠️</Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.rd }}>Add Exception</Text>
                </View>
                <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
                  <Text style={{ fontSize: 14, color: C.dm, marginBottom: 2 }}>Project: <Text style={{ fontWeight: '600', color: C.text }}>{showExceptionModal.name}</Text></Text>

                  {/* Exception Name */}
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Exception Name *</Text>
                    <TextInput value={excName} onChangeText={setExcName} placeholder="e.g. Weather Delay"
                      placeholderTextColor={C.dm + '80'}
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>

                  {/* Date */}
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Date *</Text>
                    <TextInput value={excDate} onChangeText={setExcDate} placeholder="YYYY-MM-DD"
                      placeholderTextColor={C.dm + '80'}
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                      {...(Platform.OS === 'web' ? { type: 'date' } : {})} />
                  </View>

                  {/* Duration */}
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Duration (workdays) *</Text>
                    <TextInput value={excDuration} onChangeText={setExcDuration} placeholder="1" keyboardType="numeric"
                      placeholderTextColor={C.dm + '80'}
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>

                  {/* Task Selector */}
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Attach to Task *</Text>
                    <View style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 8, backgroundColor: C.w04, maxHeight: 150, overflow: 'hidden' }}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {excTasks.length === 0 ? (
                          <Text style={{ padding: 12, fontSize: 14, color: C.dm }}>No tasks found</Text>
                        ) : excTasks.map(t => {
                          const selected = excTaskId === t.id;
                          return (
                            <TouchableOpacity key={t.id} onPress={() => setExcTaskId(t.id)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: selected ? C.rd + '15' : 'transparent' }} activeOpacity={0.7}>
                              <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? C.rd : C.w15, backgroundColor: selected ? C.rd : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: selected ? '600' : '400', color: selected ? C.rd : C.text }} numberOfLines={1}>{t.task}</Text>
                                <Text style={{ fontSize: 12, color: C.dm }}>{t.start_date} → {t.end_date}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>

                  {/* Description */}
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Description *</Text>
                    <TextInput value={excDescription} onChangeText={setExcDescription} placeholder="Brief description of the exception..."
                      placeholderTextColor={C.dm + '80'} multiline numberOfLines={3}
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, minHeight: 70, textAlignVertical: 'top', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>
                </ScrollView>

                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.w06 }}>
                  <TouchableOpacity onPress={() => setShowExceptionModal(null)} disabled={excSaving}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.w06 }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: C.dm }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={submitException}
                    disabled={!excName.trim() || !excDate || !excTaskId || !excDescription.trim() || excSaving}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', opacity: (excName.trim() && excDate && excTaskId && excDescription.trim() && !excSaving) ? 1 : 0.3 }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.rd }}>{excSaving ? 'Creating...' : 'Add Exception'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Add/Edit Employee Modal */}
      {showAddEmployee && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => { if (!empSaving) setShowAddEmployee(false); }}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 340, backgroundColor: C.cardBg || C.card, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.4)' } : { elevation: 20 }) }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>{editingEmpId ? 'Edit Employee' : 'Add Employee'}</Text>
                </View>
                <View style={{ padding: 16, gap: 14 }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Name *</Text>
                    <TextInput value={empName} onChangeText={setEmpName} placeholder="Full name"
                      placeholderTextColor={C.dm + '80'}
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Job Description</Text>
                    <TextInput value={empJob} onChangeText={setEmpJob} placeholder="e.g. Foreman, Laborer, Electrician"
                      placeholderTextColor={C.dm + '80'}
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 }}>Phone</Text>
                    <TextInput value={fPhone(empPhone)} onChangeText={v => setEmpPhone(v.replace(/\D/g, '').slice(0, 10))}
                      placeholder="(555) 555-5555" placeholderTextColor={C.dm + '80'} keyboardType="phone-pad"
                      style={{ fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.w06 }}>
                  <TouchableOpacity onPress={() => setShowAddEmployee(false)} disabled={empSaving}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.w06 }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: C.dm }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async () => {
                    if (!empName.trim() || empSaving) return;
                    setEmpSaving(true);
                    try {
                      if (editingEmpId) {
                        const res = await fetch(`${API_BASE}/employees/${editingEmpId}`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: empName.trim(), job_description: empJob.trim(), phone: empPhone }),
                        });
                        if (res.ok) { const updated = await res.json(); setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e)); }
                      } else {
                        const res = await fetch(`${API_BASE}/users/${selectedSub.id}/employees`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: empName.trim(), job_description: empJob.trim(), phone: empPhone }),
                        });
                        if (res.ok) { const newEmp = await res.json(); setEmployees(prev => [...prev, newEmp]); }
                      }
                      setShowAddEmployee(false);
                    } catch (e) { console.warn('Employee save error:', e); }
                    setEmpSaving(false);
                  }}
                    disabled={!empName.trim() || empSaving}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', opacity: (empName.trim() && !empSaving) ? 1 : 0.3 }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.bl }}>{empSaving ? 'Saving...' : (editingEmpId ? 'Save' : 'Add')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {showAddMenu && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowAddMenu(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 260, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.35)' } : { elevation: 20 }) }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Create New...</Text>
                </View>
                <TouchableOpacity onPress={() => { setShowAddMenu(false); setModal('newproject'); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 19, fontWeight: '600', color: C.text }}>🏠  New Project</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddMenu(false); setShowNewSubdivModal(true); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 16 }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 19, fontWeight: '600', color: C.text }}>📁  New Subdivision</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {modal === 'newproject' && (
        <NewProjectModal
          onClose={() => setModal(null)}
          subdivisions={subdivisions}
          onCreated={(newProj) => {
            setProjects(prev => [newProj, ...prev]);
            setSelectedProject(newProj);
            setModal(null);
            Alert.alert('Success', `"${newProj.name}" created`);
          }}
        />
      )}

      {/* New Subdivision Modal */}
      {showNewSubdivModal && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => { setShowNewSubdivModal(false); setNewSubdivName(''); }}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 400, backgroundColor: C.modalBg, borderRadius: 16, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.w08 }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: C.textBold }}>📁 New Subdivision</Text>
                  <TouchableOpacity onPress={() => { setShowNewSubdivModal(false); setNewSubdivName(''); }}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.w06, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24, color: C.mt }}>×</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 20 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm, marginBottom: 6, letterSpacing: 0.5 }}>SUBDIVISION NAME *</Text>
                  <TextInput
                    value={newSubdivName}
                    onChangeText={setNewSubdivName}
                    placeholder="e.g., Oakwood Estates"
                    placeholderTextColor={C.ph}
                    autoFocus
                    style={{ fontSize: 21, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 10, padding: 12, marginBottom: 20 }}
                    onSubmitEditing={() => { if (newSubdivName.trim()) createSubdivision(newSubdivName); }}
                  />
                  <TouchableOpacity
                    onPress={() => createSubdivision(newSubdivName)}
                    disabled={!newSubdivName.trim() || newSubdivSaving}
                    style={{ backgroundColor: newSubdivName.trim() && !newSubdivSaving ? C.gd : C.w10, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 20, fontWeight: '700', color: newSubdivName.trim() && !newSubdivSaving ? '#fff' : C.dm }}>
                      {newSubdivSaving ? 'Creating...' : 'Create Subdivision'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Settings dropdown backdrop */}
      {showSettings && (
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        />
      )}

      {/* Template Builder Modal */}
      {/* Template Manager Modal */}
      {showTemplateManager && (
        <TemplateManagerModal
          onClose={() => setShowTemplateManager(false)}
        />
      )}

      {/* Workday Exemptions Modal */}
      {showExemptions && (
        <WorkdayExemptionsModal onClose={() => setShowExemptions(false)} />
      )}

      {/* Selection Manager Modal */}
      {showSelectionManager && (
        <SelectionManagerModal onClose={() => setShowSelectionManager(false)} />
      )}

      {/* Document Manager Modal */}
      {showDocumentManager && (
        <DocumentManagerModal onClose={() => setShowDocumentManager(false)} />
      )}

      {/* Builder Calendar Modal */}
      {showBuilderCal && (
        <Modal visible animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ flex: 1, margin: isWide ? 40 : 0, marginTop: isWide ? 40 : 60, backgroundColor: C.bg, borderRadius: isWide ? 16 : 0, overflow: 'hidden' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 27, fontWeight: '700', color: C.textBold }}>📅 My Calendar</Text>
                <TouchableOpacity onPress={() => setShowBuilderCal(false)} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.w06, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 24, color: C.mt }}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Gantt / Task First toggle */}
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                {['gantt', 'taskfirst'].map(v => (
                  <TouchableOpacity key={v} onPress={() => setBuilderCalView(v)}
                    style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                      borderColor: builderCalView === v ? C.gd : (C.mode === 'light' ? 'rgba(0,0,0,0.12)' : C.w08),
                      backgroundColor: builderCalView === v ? C.bH12 : (C.mode === 'light' ? '#ffffff' : C.w02),
                    }}
                    activeOpacity={0.7}>
                    <Text style={{ fontSize: 16, fontWeight: builderCalView === v ? '600' : '500', color: builderCalView === v ? C.gd : C.mt }}>{v === 'gantt' ? 'Gantt' : 'Task First'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(() => {
                const bcYear = globalCalMonth.getFullYear();
                const bcMon = globalCalMonth.getMonth();
                const monNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const today = new Date();
                const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

                const startOfMonth = new Date(bcYear, bcMon, 1);
                const endOfMonth = new Date(bcYear, bcMon + 1, 0);
                const gridStart = new Date(startOfMonth);
                gridStart.setDate(gridStart.getDate() - gridStart.getDay());
                const gridEnd = new Date(endOfMonth);
                gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
                const weeks = [];
                let cursor = new Date(gridStart);
                while (cursor <= gridEnd) {
                  const week = [];
                  for (let i = 0; i < 7; i++) { week.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
                  weeks.push(week);
                }
                builderWeeksRef.current = weeks;

                const projectColors = {};
                const palette = [C.bl,'#f59e0b',C.gn,C.rd,'#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
                let colorIdx = 0;
                builderTasks.forEach(t => {
                  const pn = t.project_name || 'Unknown';
                  if (!projectColors[pn]) { projectColors[pn] = palette[colorIdx % palette.length]; colorIdx++; }
                });

                const bItems = builderPreviewMap ? builderTasks.map(t => {
                  const ov = builderPreviewMap[t.id];
                  return ov ? { ...t, start_date: ov.start_date, end_date: ov.end_date } : t;
                }) : builderTasks;

                const getWeekTasks = (week) => {
                  const wkStart = `${week[0].getFullYear()}-${String(week[0].getMonth()+1).padStart(2,'0')}-${String(week[0].getDate()).padStart(2,'0')}`;
                  const wkEnd = `${week[6].getFullYear()}-${String(week[6].getMonth()+1).padStart(2,'0')}-${String(week[6].getDate()).padStart(2,'0')}`;
                  return bItems
                    .filter(t => t.start_date && t.end_date && t.start_date <= wkEnd && t.end_date >= wkStart)
                    .map(t => {
                      const tStart = t.start_date < wkStart ? wkStart : t.start_date;
                      const tEnd = t.end_date > wkEnd ? wkEnd : t.end_date;
                      let startCol = 0, span = 1;
                      for (let i = 0; i < 7; i++) {
                        const ds = `${week[i].getFullYear()}-${String(week[i].getMonth()+1).padStart(2,'0')}-${String(week[i].getDate()).padStart(2,'0')}`;
                        if (ds === tStart) startCol = i;
                        if (ds === tEnd) { span = i - startCol + 1; break; }
                      }
                      return { ...t, startCol, span };
                    })
                    .sort((a, b) => a.startCol - b.startCol || b.span - a.span);
                };

                const getTasksForDay = (day) => {
                  const ds = subFmtDate(day);
                  return bItems.filter(t => t.start_date === ds);
                };

                const bShortDate = (dateStr) => {
                  const d = new Date(dateStr + 'T00:00:00');
                  if (isNaN(d)) return '';
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                };

                const bcPrev = () => setGlobalCalMonth(new Date(bcYear, bcMon - 1, 1));
                const bcNext = () => setGlobalCalMonth(new Date(bcYear, bcMon + 1, 1));
                const bcToday = () => setGlobalCalMonth(new Date());

                return (
                  <View style={{ flex: 1, minHeight: 0 }}>
                    {/* Month nav */}
                    <View style={st.subCalNav}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={bcToday} style={st.subCalTodayBtn} activeOpacity={0.7}>
                          <Text style={st.subCalTodayTxt}>Today</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <TouchableOpacity onPress={bcPrev} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>‹</Text></TouchableOpacity>
                        <Text style={st.subCalNavTitle}>{monNames[bcMon]} {bcYear}</Text>
                        <TouchableOpacity onPress={bcNext} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>›</Text></TouchableOpacity>
                      </View>
                      <View style={{ width: 60 }} />
                    </View>

                    {/* Legend */}
                    {Object.keys(projectColors).length > 0 && (
                      <View style={st.subCalLegend}>
                        {Object.entries(projectColors).map(([name, color]) => (
                          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <View style={{ width: 15, height: 15, borderRadius: 5, borderWidth: 2.5, borderColor: color, backgroundColor: 'transparent' }} />
                            <Text style={{ fontSize: 15, color: C.dm }} numberOfLines={1}>{name}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Day headers */}
                    <View style={st.subCalDayHeaders}>
                      {DAYS.map(d => (
                        <View key={d} style={st.subCalDayHeaderCell}>
                          <Text style={st.subCalDayHeaderTxt}>{d}</Text>
                        </View>
                      ))}
                    </View>

                    {/* ===== GANTT MODE ===== */}
                    {builderCalView === 'gantt' && (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                      <View
                        ref={builderCalRef}
                        style={Platform.OS === 'web' ? { userSelect: 'none' } : {}}
                        onLayout={(e) => { builderCellWidth.current = e.nativeEvent.layout.width / 7; }}
                      >
                      {builderTasks.length === 0 ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                          <Text style={{ fontSize: 42, marginBottom: 8 }}>📅</Text>
                          <Text style={{ fontSize: 21, color: C.dm }}>No tasks assigned to you</Text>
                        </View>
                      ) : weeks.map((week, wi) => {
                        const weekTasks = getWeekTasks(week);
                        const lanes = [];
                        weekTasks.forEach(task => {
                          let placed = false;
                          for (let l = 0; l < lanes.length; l++) {
                            const last = lanes[l][lanes[l].length - 1];
                            if (task.startCol > last.startCol + last.span - 1) { lanes[l].push(task); placed = true; break; }
                          }
                          if (!placed) lanes.push([task]);
                        });
                        const laneH = 32;
                        const rowMinH = Math.max(125, 40 + lanes.length * laneH);

                        return (
                          <View key={wi} style={[st.subCalWeekRow, { minHeight: rowMinH }]}>
                            {week.map((day, di) => {
                              const isToday2 = isSameDay(day, today);
                              const isCurMonth = day.getMonth() === bcMon;
                              return (
                                <View key={di} style={[st.subCalCell, di < 6 && st.subCalCellBorder, (di === 0 || di === 6) && st.subCalCellWknd]}>
                                  <View style={[st.subCalDayCircle, isToday2 && st.subCalDayCircleToday]}>
                                    <Text style={[st.subCalDayNum, !isCurMonth && st.subCalDayOther, isToday2 && st.subCalDayNumToday]}>
                                      {day.getDate()}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                            {lanes.map((lane, li) => (
                              lane.map(task => {
                                const pColor = projectColors[task.project_name || 'Unknown'] || C.bl;
                                const leftPct = `${(task.startCol / 7) * 100}%`;
                                const widthPct = `${(task.span / 7) * 100}%`;
                                const laneTop = 48 + li * laneH;
                                const isDragged = builderDraggedId === task.id;
                                const isLive = task.go_live !== false;
                                const isExc = task.is_exception;
                                const isRed = isExc || task.on_hold;
                                return (
                                  <TouchableOpacity
                                    key={`${task.id}-${wi}`}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      const proj = projects.find(pr => pr.id === task.job_id);
                                      if (proj) {
                                        setShowBuilderCal(false);
                                        setDashView('projects');
                                        setSelectedProject(proj);
                                      }
                                    }}
                                    style={[st.subCalTaskBar, {
                                      left: leftPct, width: widthPct, top: laneTop,
                                      borderColor: isRed ? C.rd : pColor, opacity: isDragged ? 0.7 : 1,
                                    },
                                    isRed && { backgroundColor: C.rd, borderColor: C.rd },
                                    !isRed && !isLive && { backgroundColor: C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)' },
                                    isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed' },
                                    Platform.OS === 'web' ? { cursor: 'pointer' } : {},
                                    ]}
                                    {...(Platform.OS === 'web' ? {
                                      onPointerDown: (e) => builderHandleDragStart(task, e),
                                    } : {})}
                                  >
                                    {calcTaskProgress(task).pct >= 100 && <Text style={{ fontSize: 15, color: isRed ? '#fff' : C.gn, marginRight: 3 }}>✓</Text>}
                                    <Text style={[st.subCalTaskTxt, isRed && { color: '#fff' }]} numberOfLines={1}>{task.project_name || 'Unknown'}</Text>
                                  </TouchableOpacity>
                                );
                              })
                            ))}
                          </View>
                        );
                      })}
                      </View>
                    </ScrollView>
                    )}

                    {/* ===== TASK FIRST MODE ===== */}
                    {builderCalView === 'taskfirst' && (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                      <View
                        ref={builderCalRef}
                        style={Platform.OS === 'web' ? { userSelect: 'none' } : {}}
                        onLayout={(e) => { builderCellWidth.current = e.nativeEvent.layout.width / 7; }}
                      >
                      {weeks.map((week, wi) => {
                        const dayCounts = week.map(day => getTasksForDay(day).length);
                        const maxTasks = Math.max(0, ...dayCounts);
                        const rowMinH = Math.max(125, 48 + maxTasks * 80);

                        return (
                          <View key={wi} style={[st.subCalWeekRow, { minHeight: rowMinH }]}>
                            {week.map((day, di) => {
                              const isToday2 = isSameDay(day, today);
                              const isCurMonth = day.getMonth() === bcMon;
                              const dayTasks = getTasksForDay(day);

                              return (
                                <View key={di} style={[st.subCalCell, di < 6 && st.subCalCellBorder, (di === 0 || di === 6) && st.subCalCellWknd, { overflow: 'hidden' }]}>
                                  <View style={[st.subCalDayCircle, isToday2 && st.subCalDayCircleToday]}>
                                    <Text style={[st.subCalDayNum, !isCurMonth && st.subCalDayOther, isToday2 && st.subCalDayNumToday]}>
                                      {day.getDate()}
                                    </Text>
                                  </View>

                                  {dayTasks.map(task => {
                                    const pColor = projectColors[task.project_name || 'Unknown'] || C.bl;
                                    const isDragged = builderDraggedId === task.id;
                                    const isComplete = calcTaskProgress(task).pct >= 100;
                                    const isLive = task.go_live !== false;
                                    const isExc = task.is_exception;
                                    const isRed = isExc || task.on_hold;

                                    return (
                                      <TouchableOpacity
                                        key={task.id}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                          const proj = projects.find(pr => pr.id === task.job_id);
                                          if (proj) {
                                            setShowBuilderCal(false);
                                            setDashView('projects');
                                            setSelectedProject(proj);
                                          }
                                        }}
                                        style={[{
                                          flexDirection: 'column', gap: 2, marginTop: 4, marginRight: 4,
                                          paddingVertical: 7, paddingHorizontal: 8,
                                          backgroundColor: isRed ? C.rd : (!isLive ? (C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)') : (C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04)),
                                          borderRadius: 6, borderLeftWidth: 5, borderLeftColor: isRed ? C.rd : pColor,
                                          opacity: isDragged ? 0.7 : 1,
                                        },
                                        Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } : {},
                                        isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed', borderLeftWidth: 2 },
                                        ]}
                                        {...(Platform.OS === 'web' ? {
                                          onPointerDown: (e) => builderHandleDragStart(task, e),
                                        } : {})}
                                      >
                                        <Text style={{ fontSize: 18, fontWeight: '600', color: isRed ? '#fff' : C.text, lineHeight: 24, textDecorationLine: isComplete ? 'line-through' : 'none' }}>
                                          {isComplete ? '✓ ' : ''}{task.project_name || 'Unknown'}
                                        </Text>
                                        <Text style={{ fontSize: 15, color: isRed ? 'rgba(255,255,255,0.8)' : C.dm, fontWeight: '500' }}>→ {bShortDate(task.end_date)}</Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                      </View>
                    </ScrollView>
                    )}

                    {/* Hint */}
                    {Platform.OS === 'web' && (
                      <View style={{ paddingVertical: 6, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.bd }}>
                        <Text style={{ fontSize: 15, color: C.dm }}>Click task to open project · Drag to reschedule</Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          </View>

          {/* Right-click edit popup */}
          {builderEditPopup && Platform.OS === 'web' && (
            <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, alignItems: 'center', justifyContent: 'center' }}>
              <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={closeBuilderEditPopup} />
              <View style={{ width: 340, zIndex: 1001, backgroundColor: C.modalBg, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden',
                ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w08, backgroundColor: C.w03 }}>
                  <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>Edit Duration</Text>
                  <TouchableOpacity onPress={closeBuilderEditPopup} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06 }}>
                    <Text style={{ fontSize: 27, color: C.mt, marginTop: -1 }}>×</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: C.w02 }}>
                  <Text style={{ fontSize: 21, fontWeight: '600', color: C.text, marginBottom: 4 }}>{builderEditPopup.task.task}</Text>
                  <Text style={{ fontSize: 16, color: C.dm }}>{builderEditPopup.task.project_name || 'Unknown'}</Text>
                  <Text style={{ fontSize: 16, color: C.dm, marginTop: 2 }}>{builderEditPopup.task.start_date} → {builderEditPopup.task.end_date}</Text>
                </View>
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>DURATION (WORKDAYS)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity onPress={() => setBuilderEditDuration(String(Math.max(1, (parseInt(builderEditDuration)||1) - 1)))}
                      style={{ width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10 }}>
                      <Text style={{ fontSize: 27, color: C.text, fontWeight: '600' }}>−</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, height: 54, borderRadius: 12, backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10, justifyContent: 'center', paddingHorizontal: 8 }}>
                      <TextInput value={builderEditDuration} onChangeText={setBuilderEditDuration} keyboardType="numeric"
                        style={{ color: C.textBold, fontSize: 27, fontWeight: '700', textAlign: 'center', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                    </View>
                    <TouchableOpacity onPress={() => setBuilderEditDuration(String((parseInt(builderEditDuration)||1) + 1))}
                      style={{ width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06, borderWidth: 1, borderColor: C.w10 }}>
                      <Text style={{ fontSize: 27, color: C.text, fontWeight: '600' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  {builderEditPopup && <Text style={{ fontSize: 16, color: C.gd, marginTop: 6 }}>New end: {subCalcEnd(builderEditPopup.task.start_date, parseInt(builderEditDuration) || 1)}</Text>}
                </View>
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>REASON FOR CHANGE *</Text>
                  <View style={{ borderRadius: 8, padding: 10, backgroundColor: C.w04, borderWidth: 1, borderColor: C.w10, minHeight: 70 }}>
                    <TextInput value={builderEditReason} onChangeText={setBuilderEditReason} placeholder="Why is this changing?"
                      placeholderTextColor={C.ph} multiline
                      style={{ color: C.text, fontSize: 20, lineHeight: 27, textAlignVertical: 'top', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
                  <TouchableOpacity onPress={closeBuilderEditPopup} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: C.w10, backgroundColor: C.w04 }}>
                    <Text style={{ fontSize: 20, color: C.mt, fontWeight: '500' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveBuilderEdit} disabled={!builderEditReason.trim() || builderEditSaving}
                    style={[{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 8, backgroundColor: C.gd }, (!builderEditReason.trim() || builderEditSaving) && { opacity: 0.4 }]}>
                    <Text style={{ fontSize: 20, color: C.textBold, fontWeight: '700' }}>{builderEditSaving ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Modal>
      )}

      {/* New Subcontractor Modal */}
      {modal === 'newsub' && (
        <NewSubModal
          onClose={() => setModal(null)}
          onCreated={(newSub) => {
            setSubs(prev => [...prev, newSub].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            setSelectedSub(newSub);
            selectSub(newSub);
            setModal(null);
            Alert.alert('Success', `${newSub.company_name || newSub.name} added`);
          }}
        />
      )}

      {/* ========== HEADER ========== */}
      <View style={st.header}>
        <View style={[st.headerLeft, isWide && { width: 325, flexShrink: 0 }]}>
          {/* Mobile back button when viewing detail */}
          {showingDetail && (
            <TouchableOpacity onPress={() => { setSelectedProject(null); setSelectedSubdivision(null); }} style={st.backBtn} activeOpacity={0.7}>
              <Text style={st.backBtnTxt}>‹</Text>
            </TouchableOpacity>
          )}
          {showingContractorProject && (
            <TouchableOpacity onPress={() => setContractorProject(null)} style={st.backBtn} activeOpacity={0.7}>
              <Text style={st.backBtnTxt}>‹</Text>
            </TouchableOpacity>
          )}
          <View style={st.logoBox}>
            <Text style={{ fontSize: 24, color: C.chromeTxt, fontWeight: '700' }}>⬡</Text>
          </View>
          <Text style={st.brandName}>{isWide || (!showingDetail && !showingContractorProject) ? 'BuilderSync' : ''}</Text>
        </View>

        {/* Main project tabs — inline in header when a project is selected */}
        {(selectedProject || contractorProject) && dashView === 'projects' && (
          <View style={{ flexDirection: 'row', flexShrink: 1, flexGrow: 1, alignSelf: 'flex-end', marginBottom: -12 }}>
            {(clientView
              ? [
                  { id: 'schedule', label: 'Schedule', defSub: 'calendar' },
                  { id: 'info', label: 'Info', defSub: 'price' },
                  { id: 'changeorders', label: 'Change Orders', defSub: null },
                  { id: 'selections', label: 'Selections', defSub: null },
                  { id: 'docs', label: 'Photos', defSub: 'photos' },
                ]
              : isBuilder
              ? [
                  { id: 'schedule', label: 'Schedule', defSub: 'calendar' },
                  { id: 'info', label: 'Info', defSub: 'jobinfo' },
                  { id: 'changeorders', label: 'Change Orders', defSub: null },
                  { id: 'selections', label: 'Selections', defSub: null },
                  { id: 'docs', label: 'Docs', defSub: 'documents' },
                ]
              : user?.role === 'customer'
              ? [
                  { id: 'schedule', label: 'Schedule', defSub: 'calendar' },
                  { id: 'info', label: 'Info', defSub: 'price' },
                  { id: 'changeorders', label: 'Change Orders', defSub: null },
                  { id: 'selections', label: 'Selections', defSub: null },
                  { id: 'docs', label: 'Photos', defSub: 'photos' },
                ]
              : user?.role === 'contractor'
              ? [
                  { id: 'schedule', label: 'Schedule', defSub: 'calendar' },
                  { id: 'info', label: 'Info', defSub: 'jobinfo' },
                ]
              : [
                  { id: 'schedule', label: 'Schedule', defSub: 'calendar' },
                  { id: 'info', label: 'Info', defSub: 'jobinfo' },
                  { id: 'docs', label: 'Docs', defSub: 'documents' },
                ]
            ).map(t => {
              const active = activeTab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => { setActiveTab(t.id); setActiveSub(t.defSub); }}
                  style={{ flex: 1, paddingTop: 4, paddingBottom: 10, alignItems: 'center', borderBottomWidth: active ? 2 : 0, borderBottomColor: C.gd }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 21, fontWeight: active ? '600' : '500', color: active ? C.chromeTxt : C.chromeDm }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Spacer pushes search + icons right */}
        <View style={{ flex: 1 }} />

        <View style={st.headerRight}>
          {isBuilder && (
            <View style={{ position: 'relative' }}>
              <TouchableOpacity onPress={() => setShowSettings(p => !p)} style={st.headerBtn}>
                <Text style={{ fontSize: 24, color: C.chromeDm }}>⚙</Text>
              </TouchableOpacity>
              {showSettings && (
                <View style={st.settingsDropdown}>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowTemplateManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Text style={st.settingsItemIcon}>📑</Text>
                    <Text style={st.settingsItemTxt}>Manage Schedule Templates</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowExemptions(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Text style={st.settingsItemIcon}>🗓️</Text>
                    <Text style={st.settingsItemTxt}>Workday Exemptions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowSelectionManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Text style={st.settingsItemIcon}>🎨</Text>
                    <Text style={st.settingsItemTxt}>Manage Selections</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowDocumentManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Text style={st.settingsItemIcon}>📄</Text>
                    <Text style={st.settingsItemTxt}>Manage Documents</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {isBuilder && (
            <TouchableOpacity onPress={() => navigation.navigate('UserManagement')} style={st.headerBtn}>
              <Text style={{ fontSize: 27 }}>👥</Text>
            </TouchableOpacity>
          )}
          {isBuilder && (
            <TouchableOpacity onPress={() => setShowBuilderCal(true)} style={st.headerBtn}>
              <Text style={{ fontSize: 24 }}>📅</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Account')} style={st.headerBtn}>
            <View style={[st.avatar, { backgroundColor: rG(user?.role, C) }]}>
              <Text style={st.avatarTxt}>{ini(user?.name)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const doSignout = async () => {
                try { await syncRef.current?.(); } catch (e) { /* silent */ }
                signout();
              };
              if (Platform.OS === 'web') {
                if (window.confirm('Are you sure you want to sign out?')) doSignout();
              } else {
                Alert.alert('Sign Out', 'Are you sure?', [
                  { text: 'Cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: doSignout },
                ]);
              }
            }}
            style={st.headerBtn}
          >
            <Text style={{ fontSize: 21, color: C.chromeDm }}>⏻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========== BODY ========== */}
      {isContractor ? (
        /* --- CONTRACTOR VIEW --- */
        showingContractorProject ? (
          <View style={{ flex: 1, minHeight: 0 }}>
            {isWide && (
              <TouchableOpacity
                onPress={() => setContractorProject(null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}
              >
                <Text style={{ fontSize: 27, color: C.gd }}>‹</Text>
                <Text style={{ fontSize: 20, color: C.gd, fontWeight: '600' }}>Back to My Dashboard</Text>
              </TouchableOpacity>
            )}
            <CurrentProjectViewer
              key={contractorProject.id}
              embedded
              project={contractorProject}
              clientView={clientView}
              onClientViewToggle={() => setClientView(false)}
              onProjectUpdate={handleProjectUpdate}
              onProjectDeleted={handleProjectDeleted}
              scheduleVersion={scheduleVersion}
              onScheduleChange={handleScheduleChange}
              syncRef={syncRef}
              subdivisions={subdivisions}
              calYear={globalCalMonth.getFullYear()}
              calMonth={globalCalMonth.getMonth()}
              onMonthChange={(y, m) => setGlobalCalMonth(new Date(y, m, 1))}
            />
          </View>
        ) : (
          loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color={C.gd} size="large" />
            </View>
          ) : (
            renderSubDetail()
          )
        )
      ) : isWide ? (
        /* --- WIDE: sidebar + detail side by side --- */
        <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
          <View style={[st.sidebar, st.sidebarWide]}>
            {/* Company Logo */}
            {companyLogo && (
              <View style={{ alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                <Image source={{ uri: companyLogo }} style={{ width: 368, height: 147, resizeMode: 'contain' }} />
              </View>
            )}
            {/* Projects / Subs tab bar */}
            {isBuilder && (
              <View style={st.dashTabBar}>
                {[['projects', 'Projects'], ['subs', 'Subcontractors']].map(([id, label]) => {
                  const active = dashView === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => { setDashView(id); setProjectSearch(''); }}
                      style={[st.dashTab, active && st.dashTabOn]}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' ? {
                        onMouseEnter: (e) => { if (!active) e.currentTarget.style.backgroundColor = C.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; },
                        onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; },
                      } : {})}
                    >
                      <Text style={[st.dashTabTxt, active && st.dashTabTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {/* Search bar */}
            {renderSearchBar()}
            {/* Sidebar content */}
            {dashView === 'projects' ? (
              <React.Fragment>
                <View style={st.sidebarHead}>
                  <TouchableOpacity
                    onPress={() => isBuilder && subdivisions.length > 0 ? setShowSidebarFilter(p => !p) : null}
                    activeOpacity={isBuilder && subdivisions.length > 0 ? 0.7 : 1}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Text style={st.sidebarLabel}>
                      {!isBuilder ? 'MY JOBS' : sidebarFilter ? (subdivisions.find(s => s.id === sidebarFilter)?.name?.toUpperCase() || 'ALL JOBS') : 'ALL JOBS'}
                    </Text>
                    {isBuilder && subdivisions.length > 0 && (
                      <Text style={{ fontSize: 12, color: C.chromeTxt }}>▼</Text>
                    )}
                    <View style={st.countBadge}>
                      <Text style={st.countTxt}>{filteredProjects.length}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity onPress={() => setShowOpen(p => !p)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: showOpen ? 'rgba(16,185,129,0.4)' : C.sw10, backgroundColor: showOpen ? 'rgba(16,185,129,0.15)' : 'transparent' }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: 13, fontWeight: showOpen ? '700' : '500', color: showOpen ? '#10b981' : C.chromeTxt }}>Open</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowClosed(p => !p)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: showClosed ? 'rgba(239,68,68,0.4)' : C.sw10, backgroundColor: showClosed ? 'rgba(239,68,68,0.15)' : 'transparent' }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: 13, fontWeight: showClosed ? '700' : '500', color: showClosed ? '#ef4444' : C.chromeTxt }}>Closed</Text>
                    </TouchableOpacity>
                    {isBuilder && (
                      <TouchableOpacity onPress={() => setShowAddMenu(p => !p)} style={st.addBtn} activeOpacity={0.8}>
                        <Text style={st.addBtnTxt}>+</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {loading ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={C.gd} size="large" />
                  </View>
                ) : (
                  <ScrollView
                    style={Platform.OS === 'web' ? { flex: 1, overflow: 'auto' } : { flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 30 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gd} />}
                    showsVerticalScrollIndicator={false}
                  >
                    {filteredProjects.length === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 16 }}>
                        <Text style={{ fontSize: 48, marginBottom: 10 }}>{projectSearch.trim() ? '🔍' : '📋'}</Text>
                        <Text style={{ color: C.chromeTxt, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>
                          {projectSearch.trim() ? 'No matching projects' : 'No projects yet'}
                        </Text>
                        <Text style={{ color: C.chromeDm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>
                          {projectSearch.trim() ? 'Try a different search' : isBuilder ? 'Tap + to create one' : 'Projects assigned to you will appear here'}
                        </Text>
                      </View>
                    ) : (() => {
                      const renderProjectItem = (project) => {
                        const active = selectedProject?.id === project.id;
                        return (
                          <TouchableOpacity
                            key={project.id}
                            activeOpacity={0.7}
                            onPress={() => selectProject(project)}
                            style={[st.jobItem, active && st.jobItemActive, project.on_hold && { borderLeftWidth: 3, borderLeftColor: '#f59e0b' }]}
                          >
                            <View style={[st.jobIndicator, active && st.jobIndicatorActive]} />
                            <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 4 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[st.jobName, active && st.jobNameActive, { flex: 1 }]} numberOfLines={1}>
                                  {project.name}
                                </Text>
                                {project.on_hold && (
                                  <View style={{ backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>HOLD</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={st.jobMeta} numberOfLines={1}>
                                {[project.status, project.phase].filter(Boolean).join(' · ')}
                              </Text>
                              {project.progress !== undefined && project.progress !== null && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                  <Bar C={C} pct={project.progress} color={active ? C.gd : C.w15} h={3} />
                                  <Text style={{ fontSize: 15, color: C.dm }}>{project.progress}%</Text>
                                </View>
                              )}
                            </View>
                            {(isBuilder || isContractor) && (
                              <View style={{ justifyContent: 'center', alignItems: 'center', paddingRight: 4 }}>
                                {isBuilder && (
                                  <TouchableOpacity
                                    onPress={(e) => { e.stopPropagation(); setProjectActionMenu(project); }}
                                    style={{ paddingVertical: 6, paddingHorizontal: 10 }}
                                    activeOpacity={0.6}
                                    hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                                  >
                                    <Text style={{ fontSize: 20, color: active ? C.gd : C.dm }}>ⓘ</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    if (selectedProject?.id === project.id) {
                                      setClientView(prev => !prev);
                                    } else {
                                      setSelectedProject(project);
                                      setSelectedSubdivision(null);
                                      setClientView(true);
                                    }
                                  }}
                                  style={{ paddingVertical: 6, paddingHorizontal: 10 }}
                                  activeOpacity={0.6}
                                  hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                                >
                                  <Text style={{ fontSize: 18, color: (active && clientView) ? C.gn : active ? C.gd : C.dm }}>🏠</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      };

                      if (sidebarFilter) {
                        return filteredProjects.map(renderProjectItem);
                      }

                      const ungrouped = filteredProjects.filter(p => !p.subdivision_id);
                      const grouped = subdivisions.map(sd => ({
                        ...sd,
                        projects: filteredProjects.filter(p => p.subdivision_id === sd.id),
                      })).filter(sd => sd.projects.length > 0 || isBuilder);

                      return (
                        <>
                          {ungrouped.map(renderProjectItem)}
                          {grouped.map(sd => {
                            const sdActive = selectedSubdivision?.id === sd.id;
                            return (
                              <View key={`sd-${sd.id}`}>
                                <TouchableOpacity
                                  activeOpacity={0.7}
                                  onPress={() => selectSubdivision(sd)}
                                  onLongPress={() => {
                                    if (!isBuilder) return;
                                    Alert.alert('Delete Subdivision', `Delete "${sd.name}"?\n\nProjects will be ungrouped.`, [
                                      { text: 'Cancel' },
                                      { text: 'Delete', style: 'destructive', onPress: () => deleteSubdivision(sd.id) },
                                    ]);
                                  }}
                                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: sdActive ? (C.gd + '18') : (C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04), borderBottomWidth: 1, borderBottomColor: C.sw06, borderLeftWidth: sdActive ? 3 : 0, borderLeftColor: C.gd }}
                                >
                                  <Text style={{ fontSize: 15, fontWeight: '700', color: sdActive ? C.gd : C.chromeTxt, letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>
                                    📁 {sd.name.toUpperCase()}
                                  </Text>
                                  <View style={{ backgroundColor: sdActive ? C.gd + '30' : C.w08, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: sdActive ? C.gd : C.dm }}>{sd.projects.length}</Text>
                                  </View>
                                </TouchableOpacity>
                                {sd.projects.map(renderProjectItem)}
                              </View>
                            );
                          })}
                        </>
                      );
                    })()}
                  </ScrollView>
                )}
              </React.Fragment>
            ) : (
              <React.Fragment>
                <View style={st.sidebarHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={st.sidebarLabel}>SUBCONTRACTORS</Text>
                    <View style={st.countBadge}>
                      <Text style={st.countTxt}>{filteredSubs.length}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setModal('newsub')} style={st.addBtn} activeOpacity={0.8}>
                    <Text style={st.addBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
                {subsLoading ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={C.gd} size="large" />
                  </View>
                ) : filteredSubs.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 16 }}>
                    <Text style={{ fontSize: 48, marginBottom: 10 }}>{projectSearch.trim() ? '🔍' : '👷'}</Text>
                    <Text style={{ color: C.chromeTxt, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>
                      {projectSearch.trim() ? 'No matching subcontractors' : 'No subcontractors'}
                    </Text>
                    <Text style={{ color: C.chromeDm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>
                      {projectSearch.trim() ? 'Try a different search' : 'Add contractors from User Management'}
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    style={Platform.OS === 'web' ? { flex: 1, overflow: 'auto' } : { flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 30 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {filteredSubs.map(sub => {
                      const active = selectedSub?.id === sub.id;
                      const tradesArr = sub.trades ? sub.trades.split(',').map(t => t.trim()).filter(Boolean) : [];
                      return (
                        <TouchableOpacity
                          key={sub.id}
                          activeOpacity={0.7}
                          onPress={() => { setSubView(false); selectSub(sub); }}
                          style={[st.jobItem, active && st.jobItemActive]}
                        >
                          <View style={[st.jobIndicator, active && st.jobIndicatorActive]} />
                          <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 8 }}>
                            <Text style={[st.jobName, active && st.jobNameActive]} numberOfLines={1}>
                              {sub.company_name || sub.name}
                            </Text>
                            {sub.company_name ? (
                              <Text style={st.jobMeta} numberOfLines={1}>{sub.name}</Text>
                            ) : null}
                            {tradesArr.length > 0 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                                {tradesArr.slice(0, 3).map(t => (
                                  <View key={t} style={{ backgroundColor: 'rgba(59,130,246,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>{t}</Text>
                                  </View>
                                ))}
                                {tradesArr.length > 3 && (
                                  <Text style={{ fontSize: 14, color: C.dm }}>+{tradesArr.length - 3}</Text>
                                )}
                              </View>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              selectSub(sub);
                              setSubView(prev => (selectedSub?.id === sub.id) ? !prev : true);
                            }}
                            style={{ justifyContent: 'center', paddingHorizontal: 10 }}
                            activeOpacity={0.6}
                            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                          >
                            <Text style={{ fontSize: 18, color: (active && subView) ? C.gd : C.dm }}>🛠️</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </React.Fragment>
            )}
          </View>
          {/* Detail pane */}
          <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: C.bd, minHeight: 0 }}>
            {dashView === 'projects' ? (
              selectedProject ? (
                <CurrentProjectViewer
                  embedded
                  project={selectedProject}
                  clientView={clientView}
                  onClientViewToggle={() => setClientView(false)}
                  activeTab={activeTab}
                  activeSub={activeSub}
                  onTabChange={setActiveTab}
                  onSubChange={setActiveSub}
                  onProjectUpdate={handleProjectUpdate}
                  onProjectDeleted={handleProjectDeleted}
                  scheduleVersion={scheduleVersion}
                  onScheduleChange={handleScheduleChange}
                  syncRef={syncRef}
                  subdivisions={subdivisions}
              calYear={globalCalMonth.getFullYear()}
                  calMonth={globalCalMonth.getMonth()}
                  onMonthChange={(y, m) => setGlobalCalMonth(new Date(y, m, 1))}
                />
              ) : selectedSubdivision ? (
                renderSubdivisionDetail()
              ) : (
                renderEmptyDetail()
              )
            ) : (
              renderSubDetail()
            )}
          </View>
        </View>
      ) : (
        /* --- MOBILE --- */
        dashView === 'projects' ? (
          showingDetail ? (
            selectedSubdivision ? (
              renderSubdivisionDetail()
            ) : (
            <CurrentProjectViewer
              embedded
              project={selectedProject}
              clientView={clientView}
              onClientViewToggle={() => setClientView(false)}
              activeTab={activeTab}
              activeSub={activeSub}
              onTabChange={setActiveTab}
              onSubChange={setActiveSub}
              onProjectUpdate={handleProjectUpdate}
              onProjectDeleted={handleProjectDeleted}
              scheduleVersion={scheduleVersion}
              onScheduleChange={handleScheduleChange}
              syncRef={syncRef}
              subdivisions={subdivisions}
              calYear={globalCalMonth.getFullYear()}
              calMonth={globalCalMonth.getMonth()}
              onMonthChange={(y, m) => setGlobalCalMonth(new Date(y, m, 1))}
            />
            )
          ) : (
            <View style={{ flex: 1 }}>
              {isBuilder && (
                <View style={st.dashTabBar}>
                  {[['projects', 'Projects'], ['subs', 'Subcontractors']].map(([id, label]) => {
                    const active = dashView === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => { setDashView(id); setProjectSearch(''); }}
                        style={[st.dashTab, active && st.dashTabOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[st.dashTabTxt, active && st.dashTabTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {renderSearchBar()}
              {renderSidebar()}
            </View>
          )
        ) : (
          selectedSub ? (
            <View style={{ flex: 1, minHeight: 0 }}>
              <TouchableOpacity onPress={() => setSelectedSub(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 27, color: C.gd }}>‹</Text>
                <Text style={{ fontSize: 20, color: C.gd, fontWeight: '600' }}>All Subcontractors</Text>
              </TouchableOpacity>
              {renderSubDetail()}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {isBuilder && (
                <View style={st.dashTabBar}>
                  {[['projects', 'Projects'], ['subs', 'Subcontractors']].map(([id, label]) => {
                    const active = dashView === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => { setDashView(id); setProjectSearch(''); }}
                        style={[st.dashTab, active && st.dashTabOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[st.dashTabTxt, active && st.dashTabTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {renderSearchBar()}
              {renderSubSidebar()}
            </View>
          )
        )
      )}
    </View>
  );
}

// ============================================================
// NEW PROJECT MODAL (moved from projectsList)
// ============================================================
const STATUSES = ['Pre-Construction', 'In Progress', 'Punch List', 'Complete'];
const PHASES = ['Planning', 'Permitting', 'Foundation', 'Framing', 'Roofing', 'MEP Rough-In', 'Insulation', 'Drywall', 'Trim', 'Cabinets', 'Paint', 'Flooring', 'Final Punch'];

const Inp2 = ({ label, value, onChange, placeholder, type, style: ss }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const isPhone = type === 'phone';
  return (
  <View style={[{ marginBottom: 14 }, ss]}>
    {label && <Text style={st.formLbl}>{label}</Text>}
    <TextInput
      value={isPhone ? fPhone(value) : value}
      onChangeText={v => onChange(isPhone ? v.replace(/\D/g, '').slice(0, 10) : v)}
      placeholder={placeholder}
      placeholderTextColor={C.ph}
      keyboardType={type === 'number' ? 'numeric' : type === 'email' ? 'email-address' : isPhone ? 'phone-pad' : 'default'}
      style={st.formInp}
    />
  </View>
  );
};

const ChipSelect = ({ options, value, onChange }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  return (
  <View style={st.chipRow}>
    {options.map(opt => (
      <TouchableOpacity key={opt} onPress={() => onChange(opt)}
        style={[st.chip, value === opt && st.chipOn]}>
        <Text style={[st.chipTxt, value === opt && st.chipTxtOn]}>{opt}</Text>
      </TouchableOpacity>
    ))}
  </View>
  );
};

const TEMPLATE_ICONS = ['📋', '🏠', '🍳', '🚿', '🔨', '🏢', '🏗', '🛠', '🪵', '🧱', '🪟', '🚪', '⚡', '💧', '🌡', '🏡', '🏘'];

const TemplateManagerModal = ({ onClose }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTmpl, setEditTmpl] = useState(null); // null=list, 'new'=create, {id,...}=edit
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('📋');
  const [editDesc, setEditDesc] = useState('');
  const [editTasks, setEditTasks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showIcons, setShowIcons] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/schedule-templates`);
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch (e) { console.warn(e.message); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { fetchTemplates(); }, []);

  const openNew = () => {
    setEditTmpl('new');
    setEditName('');
    setEditIcon('📋');
    setEditDesc('');
    setEditTasks([]);
    setShowIcons(false);
  };

  // Convert stored template tasks back to ScheduleBuilder format
  const loadTemplate = (tmpl) => {
    setEditTmpl(tmpl);
    setEditName(tmpl.name);
    setEditIcon(tmpl.icon || '📋');
    setEditDesc(tmpl.description || '');

    const rawTasks = tmpl.tasks || [];
    // Generate _ids first
    const ids = rawTasks.map((_, i) => Date.now() + i + 1);
    const builderTasks = rawTasks.map((t, i) => ({
      _id: ids[i],
      task: t.task || '',
      contractor: t.contractor || '',
      trade: t.trade || '',
      start_date: '',
      workdays: String(t.workdays || '1'),
      end_date: '',
      predecessor: (t.predIdx !== null && t.predIdx !== undefined && t.predIdx >= 0) ? ids[t.predIdx] : null,
      relType: t.relType || 'FS',
      lag: String(t.lag || '0'),
    }));
    setEditTasks(builderTasks);
  };

  const handleSave = async () => {
    if (!editName.trim()) return Alert.alert('Error', 'Template name is required');
    setSaving(true);
    try {
      const templateTasks = editTasks.map((t, i) => {
        const predIdx = t.predecessor
          ? editTasks.findIndex(x => x._id === t.predecessor)
          : null;
        return {
          task: t.task || '',
          trade: t.trade || '',
          workdays: t.workdays || '1',
          predIdx: predIdx >= 0 ? predIdx : null,
          relType: t.relType || 'FS',
          lag: t.lag || '0',
        };
      });

      const isNew = editTmpl === 'new';
      const url = isNew ? `${API_BASE}/schedule-templates` : `${API_BASE}/schedule-templates/${editTmpl.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          icon: editIcon,
          description: editDesc.trim(),
          tasks: templateTasks,
        }),
      });
      if (!res.ok) throw new Error(`Failed to ${isNew ? 'create' : 'update'} template`);
      Alert.alert('Success', `Template ${isNew ? 'created' : 'updated'}`);
      setEditTmpl(null);
      fetchTemplates();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (tmpl) => {
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE}/schedule-templates/${tmpl.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        if (editTmpl?.id === tmpl.id) setEditTmpl(null);
        fetchTemplates();
      } catch (e) { Alert.alert('Error', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${tmpl.name}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert('Delete Template', `Delete "${tmpl.name}"? This cannot be undone.`, [
        { text: 'Cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const isForm = editTmpl !== null;
  const formTitle = editTmpl === 'new' ? 'New Schedule Template' : 'Edit Template';

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.modalBg}>
          <View style={[st.modalContent, { maxHeight: '95%' }]}>
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>{isForm ? formTitle : 'Schedule Templates'}</Text>
              <TouchableOpacity onPress={isForm ? () => setEditTmpl(null) : onClose}>
                <Text style={{ color: C.mt, fontSize: 42 }}>{isForm ? '←' : '×'}</Text>
              </TouchableOpacity>
            </View>

            {!isForm ? (
              /* ---- TEMPLATE LIST ---- */
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }}>
                <TouchableOpacity onPress={openNew}
                  style={{ backgroundColor: C.gd, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 }}
                  activeOpacity={0.8}>
                  <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>+ New Schedule Template</Text>
                </TouchableOpacity>

                {loading ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator color={C.gd} size="large" />
                  </View>
                ) : templates.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ fontSize: 54, marginBottom: 12 }}>📑</Text>
                    <Text style={{ fontSize: 22, fontWeight: '600', color: C.textBold, marginBottom: 4 }}>No Templates</Text>
                    <Text style={{ fontSize: 18, color: C.dm, textAlign: 'center' }}>Tap the button above to create your first template.</Text>
                  </View>
                ) : (
                  templates.map(tmpl => (
                    <View key={tmpl.id} style={st.tmplRow}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                        activeOpacity={0.7}
                        onPress={() => loadTemplate(tmpl)}
                      >
                        <Text style={{ fontSize: 39 }}>{tmpl.icon || '📋'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 22, fontWeight: '600', color: C.textBold }}>{tmpl.name}</Text>
                          {tmpl.description ? (
                            <Text style={{ fontSize: 16, color: C.dm, marginTop: 2 }} numberOfLines={1}>{tmpl.description}</Text>
                          ) : null}
                          <Text style={{ fontSize: 16, color: C.mt, marginTop: 3 }}>
                            {(tmpl.tasks || []).length} task{(tmpl.tasks || []).length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 21, color: C.gd }}>Edit ›</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(tmpl)}
                        style={st.tmplDeleteBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 21, color: C.rd }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            ) : (
              /* ---- CREATE / EDIT FORM ---- */
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1, minHeight: 0 }}>
                {/* Template info */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                  <View>
                    <Text style={st.formLbl}>ICON</Text>
                    <TouchableOpacity onPress={() => setShowIcons(p => !p)} style={st.iconPicker}>
                      <Text style={{ fontSize: 36 }}>{editIcon}</Text>
                    </TouchableOpacity>
                    {showIcons && (
                      <View style={st.iconGrid}>
                        {TEMPLATE_ICONS.map(ic => (
                          <TouchableOpacity key={ic} onPress={() => { setEditIcon(ic); setShowIcons(false); }}
                            style={[st.iconOption, ic === editIcon && st.iconOptionOn]}>
                            <Text style={{ fontSize: 27 }}>{ic}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Inp2 label="TEMPLATE NAME *" value={editName} onChange={setEditName} placeholder="e.g., Custom Home Build" />
                    <Inp2 label="DESCRIPTION" value={editDesc} onChange={setEditDesc} placeholder="Full residential construction" />
                  </View>
                </View>

                <Text style={{ fontSize: 16, color: C.dm, marginBottom: 10 }}>
                  Build your task list with predecessors below. Dates are for preview only — the actual dates will be set when applying the template to a project.
                </Text>

                {/* Schedule Builder (reused) */}
                <ScheduleBuilder tasks={editTasks} onTasksChange={setEditTasks} templateMode />

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={!editName.trim() || saving}
                  style={[st.submitBtn, (!editName.trim() || saving) && st.submitBtnOff, { marginTop: 16 }]}
                  activeOpacity={0.8}
                >
                  <Text style={st.submitBtnTxt}>
                    {saving ? 'Saving...' : `${editTmpl === 'new' ? 'Create' : 'Save'} Template${editTasks.length > 0 ? ` (${editTasks.length} tasks)` : ''}`}
                  </Text>
                </TouchableOpacity>
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const NewProjectModal = ({ onClose, onCreated, subdivisions = [] }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [f, sF] = useState({
    name: '', street_address: '', city: '', addr_state: '', zip_code: '', email: '',
    customer_first_name: '', customer_last_name: '', customer_phone: '',
    original_price: '', subdivision_id: null,
  });
  const [loading, setLoading] = useState(false);
  const [scheduleTasks, setScheduleTasks] = useState([]);
  const [showAddrState, setShowAddrState] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewTasks, setReviewTasks] = useState([]);
  const [tradeDropdownIdx, setTradeDropdownIdx] = useState(null);
  const [reviewTmplInfo, setReviewTmplInfo] = useState(null);
  const [appliedTemplate, setAppliedTemplate] = useState(null);
  const [showSubdivPicker, setShowSubdivPicker] = useState(false);
  const set = (key, val) => sF(prev => ({ ...prev, [key]: val }));

  const create = async () => {
    if (!f.name.trim()) return Alert.alert('Error', 'Project name is required');
    setLoading(true);
    try {
      const body = {
        name: f.name.trim(),
        street_address: f.street_address.trim(), city: f.city.trim(),
        state: f.addr_state, zip_code: f.zip_code.trim(),
        email: f.email.trim(),
        customer_first_name: f.customer_first_name.trim(),
        customer_last_name: f.customer_last_name.trim(),
        customer_phone: f.customer_phone.trim(),
        original_price: parseFloat(f.original_price) || 0,
        progress: 0,
        subdivision_id: f.subdivision_id || null,
      };
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); setLoading(false); return; }
      const newProject = await res.json();

      // Batch-create schedule items with baseline dates and predecessor info
      console.log('[SCHEDULE DEBUG] Raw scheduleTasks:', scheduleTasks.map((t, i) => ({
        i, task: t.task, _id: t._id, predecessor: t.predecessor, relType: t.relType, lag: t.lag,
      })));
      const validTasks = scheduleTasks.filter(t => t.task.trim() && t.start_date && t.end_date);
      if (validTasks.length > 0) {
        const scheduleBody = validTasks.map((t, i) => {
          // Map client-side predecessor _id to index in validTasks array
          let predIndex = null;
          if (t.predecessor) {
            predIndex = validTasks.findIndex(v => v._id === t.predecessor);
            if (predIndex < 0) predIndex = null;
          }
          return {
            task: t.task.trim(),
            contractor: t.contractor?.trim() || '',
            trade: t.trade || '',
            start_date: t.start_date,
            end_date: t.end_date,
            baseline_start: t.start_date,
            baseline_end: t.end_date,
            progress: 0,
            pred_index: predIndex,
            rel_type: t.relType || 'FS',
            lag_days: parseInt(t.lag) || 0,
          };
        });
        // Debug: log what we're sending
        console.log('[SCHEDULE CREATE] Tasks with predecessors:', scheduleBody.map((t, i) => ({
          i, task: t.task, pred_index: t.pred_index, rel_type: t.rel_type, lag_days: t.lag_days,
        })));
        const schedRes = await fetch(`${API_BASE}/projects/${newProject.id}/schedule`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleBody),
        });
        const schedResult = await schedRes.json();
        console.log('[SCHEDULE CREATE] Response:', schedResult.map?.(t => ({
          id: t.id, task: t.task, predecessor_id: t.predecessor_id, rel_type: t.rel_type, lag_days: t.lag_days,
        })));
      }

      onCreated(newProject);
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.modalBg}>
          <View style={st.modalContent}>
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>New Project</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: C.mt, fontSize: 42 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Inp2 label="PROJECT NAME *" value={f.name} onChange={v => set('name', v)} placeholder="e.g., Parker Residence" />
              <Text style={{ fontSize: 16, color: C.dm, marginTop: -10, marginBottom: 14 }}>
                Project number will be assigned automatically (YY-NN)
              </Text>

              {/* Subdivision picker */}
              {subdivisions.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={st.formLbl}>SUBDIVISION</Text>
                  <TouchableOpacity onPress={() => setShowSubdivPicker(p => !p)}
                    style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 21, color: f.subdivision_id ? C.text : C.ph }}>
                      {f.subdivision_id ? (subdivisions.find(s => s.id === f.subdivision_id)?.name || 'Unknown') : 'None'}
                    </Text>
                    <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                  </TouchableOpacity>
                  {showSubdivPicker && (
                    <View style={{ backgroundColor: C.cardBg || C.card, borderWidth: 1, borderColor: C.w10, borderRadius: 8, marginTop: 4, overflow: 'hidden', maxHeight: 200 }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <TouchableOpacity onPress={() => { set('subdivision_id', null); setShowSubdivPicker(false); }}
                          style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: !f.subdivision_id ? C.gd + '22' : 'transparent' }}>
                          <Text style={{ fontSize: 19, color: !f.subdivision_id ? C.gd : C.text }}>None</Text>
                        </TouchableOpacity>
                        {subdivisions.map(sd => (
                          <TouchableOpacity key={sd.id} onPress={() => { set('subdivision_id', sd.id); setShowSubdivPicker(false); }}
                            style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: f.subdivision_id === sd.id ? C.gd + '22' : 'transparent' }}>
                            <Text style={{ fontSize: 19, color: f.subdivision_id === sd.id ? C.gd : C.text }}>📁 {sd.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <View style={st.divider} />
              <Text style={[st.formLbl, { color: C.gd, marginBottom: 10 }]}>HOMEOWNER</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Inp2 label="FIRST NAME" value={f.customer_first_name} onChange={v => set('customer_first_name', v)} placeholder="Jane" style={{ flex: 1 }} />
                <Inp2 label="LAST NAME" value={f.customer_last_name} onChange={v => set('customer_last_name', v)} placeholder="Parker" style={{ flex: 1 }} />
              </View>
              <Inp2 label="HOMEOWNER PHONE" value={f.customer_phone} onChange={v => set('customer_phone', v)} placeholder="(208) 555-1234" type="phone" />
              <Inp2 label="HOMEOWNER EMAIL" value={f.email} onChange={v => set('email', v)} placeholder="client@email.com" type="email" />
              <Text style={{ fontSize: 16, color: C.dm, marginTop: -10, marginBottom: 14 }}>
                An account will be created automatically · Default password: Liberty
              </Text>

              <Inp2 label="STREET ADDRESS" value={f.street_address} onChange={v => set('street_address', v)} placeholder="1245 Oakwood Dr" />
              <View style={{ flexDirection: 'row', gap: 12, zIndex: 10 }}>
                <Inp2 label="CITY" value={f.city} onChange={v => set('city', v)} placeholder="Eagle" style={{ flex: 2 }} />
                <View style={{ flex: 1, marginBottom: 16 }}>
                  <Text style={st.formLbl}>STATE</Text>
                  <TouchableOpacity onPress={() => setShowAddrState(p => !p)}
                    style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 21, color: f.addr_state ? C.text : C.ph }}>{f.addr_state || 'ST'}</Text>
                    <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Inp2 label="ZIP" value={f.zip_code} onChange={v => set('zip_code', v)} type="number" placeholder="83616" style={{ flex: 1 }} />
              </View>
              <View style={st.divider} />
              <Inp2 label="CONTRACT PRICE ($)" value={f.original_price} onChange={v => set('original_price', v)} type="number" placeholder="485000" />

              <View style={st.divider} />
              <ScheduleBuilder
                tasks={scheduleTasks}
                onTasksChange={setScheduleTasks}
                collapsed={!!appliedTemplate}
                templateInfo={appliedTemplate}
                onReviewTemplate={(builtTasks, tmplInfo) => {
                  setReviewTasks(builtTasks);
                  setReviewTmplInfo(tmplInfo);
                  setShowReview(true);
                }}
                onChangeTemplate={() => {
                  setAppliedTemplate(null);
                  setScheduleTasks([]);
                }}
              />

              <TouchableOpacity onPress={create} disabled={!f.name.trim() || loading}
                style={[st.submitBtn, (!f.name.trim() || loading) && st.submitBtnOff]} activeOpacity={0.8}>
                <Text style={st.submitBtnTxt}>{loading ? 'Creating...' : 'Create Project'}</Text>
              </TouchableOpacity>
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>

          {/* State picker overlay - outside modalContent to avoid overflow clipping */}
          {showAddrState && (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center',
              zIndex: 999,
            }}>
              <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                activeOpacity={1} onPress={() => setShowAddrState(false)} />
              <View style={{ width: 240, maxHeight: 400, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w10, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } : { elevation: 20 }) }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>Select State</Text>
                </View>
                <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {US_STATES.map(s2 => (
                    <TouchableOpacity key={s2} onPress={() => { set('addr_state', s2); setShowAddrState(false); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: f.addr_state === s2 ? C.gd + '22' : 'transparent' }}>
                      <Text style={{ fontSize: 21, color: f.addr_state === s2 ? C.gd : C.text }}>{s2}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Task Review Modal - proper Modal for reliable rendering */}
          <Modal visible={showReview} transparent animationType="fade">
            <View style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
            }}>
              <View style={{
                backgroundColor: C.modalBg, borderRadius: 16, width: '95%', maxWidth: 900,
                height: '85%', overflow: 'hidden',
                ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.5)' } : { elevation: 25 }),
              }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 28 }}>{reviewTmplInfo?.icon || '📋'}</Text>
                    <View>
                      <Text style={{ fontSize: 24, fontWeight: '700', color: C.textBold }}>Review Tasks</Text>
                      <Text style={{ fontSize: 16, color: C.dm }}>{reviewTmplInfo?.name} · {reviewTasks.length} tasks</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setShowReview(false)}>
                    <Text style={{ fontSize: 32, color: C.dm }}>×</Text>
                  </TouchableOpacity>
                </View>

                {/* Column headers */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.bd, backgroundColor: C.w02, alignItems: 'center' }}>
                  <Text style={{ width: 32, fontSize: 13, fontWeight: '700', color: C.dm }}>#</Text>
                  <Text style={{ flex: 3, fontSize: 13, fontWeight: '700', color: C.dm }}>TASK NAME</Text>
                  <Text style={{ flex: 2, fontSize: 13, fontWeight: '700', color: C.dm, marginLeft: 6 }}>TRADE</Text>
                  <Text style={{ width: 50, fontSize: 13, fontWeight: '700', color: C.dm, textAlign: 'center', marginLeft: 6 }}>DAYS</Text>
                  <Text style={{ flex: 2, fontSize: 13, fontWeight: '700', color: C.dm, marginLeft: 6 }}>PREDECESSOR</Text>
                  <Text style={{ width: 70, fontSize: 13, fontWeight: '700', color: C.dm, textAlign: 'center', marginLeft: 6 }}>TYPE</Text>
                  <Text style={{ width: 50, fontSize: 13, fontWeight: '700', color: C.dm, textAlign: 'center', marginLeft: 6 }}>LAG</Text>
                  <View style={{ width: 32, marginLeft: 6 }} />
                </View>

                {/* Task list */}
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {reviewTasks.map((task, idx) => {
                    const predTask = task.predecessor ? reviewTasks.find(t => t._id === task.predecessor) : null;
                    const predLabel = predTask ? `${reviewTasks.indexOf(predTask) + 1}. ${predTask.task || 'Untitled'}` : '';
                    const availPreds = reviewTasks.filter((_, i) => i < idx);

                    return (
                      <View key={task._id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.w04 }}>
                        {/* # */}
                        <Text style={{ width: 32, fontSize: 17, fontWeight: '600', color: C.dm }}>{idx + 1}</Text>
                        {/* Task name */}
                        <TextInput
                          value={task.task}
                          onChangeText={v => setReviewTasks(prev => prev.map((t, i) => i === idx ? { ...t, task: v } : t))}
                          placeholder="Task name"
                          placeholderTextColor={C.ph}
                          style={{ flex: 3, fontSize: 17, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8 }}
                        />
                        {/* Trade dropdown */}
                        <TouchableOpacity
                          onPress={() => setTradeDropdownIdx(tradeDropdownIdx === idx ? null : idx)}
                          style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, marginLeft: 6 }}
                          activeOpacity={0.7}>
                          <Text style={{ fontSize: 17, color: task.trade ? C.bl : C.ph, flex: 1 }} numberOfLines={1}>
                            {task.trade || 'Trade'}
                          </Text>
                          <Text style={{ fontSize: 13, color: C.dm }}>▾</Text>
                        </TouchableOpacity>
                        {/* Workdays */}
                        <TextInput
                          value={String(task.workdays || '1')}
                          onChangeText={v => {
                            const newWd = v.replace(/\D/g, '') || '1';
                            setReviewTasks(prev => {
                              let updated = prev.map((t, i) => {
                                if (i !== idx) return t;
                                const next = { ...t, workdays: newWd };
                                next.end_date = calcEndDate(next.start_date, parseInt(newWd) || 1);
                                return next;
                              });
                              return cascadeAll(updated);
                            });
                          }}
                          keyboardType="numeric"
                          style={{ width: 50, fontSize: 17, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 4, textAlign: 'center', marginLeft: 6 }}
                        />
                        {/* Predecessor picker */}
                        <TouchableOpacity
                          onPress={() => {
                            if (availPreds.length === 0) return;
                            // Cycle: none → first available → second → ... → none
                            const currentPredIdx = task.predecessor ? availPreds.findIndex(t => t._id === task.predecessor) : -1;
                            const nextIdx = currentPredIdx + 1;
                            const newPred = nextIdx < availPreds.length ? availPreds[nextIdx]._id : null;
                            setReviewTasks(prev => {
                              let updated = prev.map((t, i) => {
                                if (i !== idx) return t;
                                const next = { ...t, predecessor: newPred };
                                if (newPred === null) {
                                  next.relType = 'FS'; next.lag = '0';
                                } else {
                                  const newStart = calcFromPredecessor(prev, next);
                                  if (newStart) { next.start_date = newStart; next.end_date = calcEndDate(newStart, parseInt(next.workdays) || 1); }
                                }
                                return next;
                              });
                              return cascadeAll(updated);
                            });
                          }}
                          style={{ flex: 2, marginLeft: 6, backgroundColor: task.predecessor ? 'rgba(139,92,246,0.06)' : C.inputBg, borderWidth: 1, borderColor: task.predecessor ? 'rgba(139,92,246,0.25)' : C.w08, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6 }}
                        >
                          <Text style={{ fontSize: 15, color: task.predecessor ? '#a78bfa' : C.ph }} numberOfLines={1}>
                            {predLabel || (idx === 0 ? '—' : 'None')}
                          </Text>
                        </TouchableOpacity>
                        {/* FS / SS toggle */}
                        <View style={{ flexDirection: 'row', marginLeft: 6, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: C.w08, width: 70 }}>
                          {['FS', 'SS'].map(r => (
                            <TouchableOpacity
                              key={r}
                              onPress={() => {
                                if (!task.predecessor) return;
                                setReviewTasks(prev => {
                                  let updated = prev.map((t, i) => {
                                    if (i !== idx) return t;
                                    const next = { ...t, relType: r };
                                    const newStart = calcFromPredecessor(prev, next);
                                    if (newStart) { next.start_date = newStart; next.end_date = calcEndDate(newStart, parseInt(next.workdays) || 1); }
                                    return next;
                                  });
                                  return cascadeAll(updated);
                                });
                              }}
                              style={{ flex: 1, paddingVertical: 4, alignItems: 'center', backgroundColor: (task.relType || 'FS') === r ? (task.predecessor ? 'rgba(139,92,246,0.15)' : C.w04) : C.w02 }}
                            >
                              <Text style={{ fontSize: 14, fontWeight: '700', color: (task.relType || 'FS') === r && task.predecessor ? '#a78bfa' : C.dm }}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {/* Lag */}
                        <TextInput
                          value={String(task.lag || '0')}
                          onChangeText={v => {
                            const newLag = v.replace(/[^0-9-]/g, '');
                            setReviewTasks(prev => {
                              let updated = prev.map((t, i) => {
                                if (i !== idx) return t;
                                const next = { ...t, lag: newLag };
                                if (next.predecessor) {
                                  const newStart = calcFromPredecessor(prev, next);
                                  if (newStart) { next.start_date = newStart; next.end_date = calcEndDate(newStart, parseInt(next.workdays) || 1); }
                                }
                                return next;
                              });
                              return cascadeAll(updated);
                            });
                          }}
                          keyboardType="numeric"
                          editable={!!task.predecessor}
                          style={{ width: 50, fontSize: 17, color: task.predecessor ? C.text : C.ph, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 4, textAlign: 'center', marginLeft: 6 }}
                        />
                        {/* Delete */}
                        <TouchableOpacity
                          onPress={() => {
                            const removedId = reviewTasks[idx]._id;
                            setReviewTasks(prev => {
                              let updated = prev.filter((_, i) => i !== idx).map(t =>
                                t.predecessor === removedId ? { ...t, predecessor: null, relType: 'FS', lag: '0' } : t
                              );
                              return cascadeAll(updated);
                            });
                          }}
                          style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.08)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}
                        >
                          <Text style={{ fontSize: 20, color: C.rd }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Trade dropdown modal */}
                {tradeDropdownIdx !== null && (
                  <Modal visible transparent animationType="fade">
                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setTradeDropdownIdx(null)}>
                      <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                        <View style={{ width: 320, backgroundColor: C.modalBg, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', maxHeight: 420,
                          ...(Platform.OS === 'web' ? { boxShadow: '0 8px 30px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w08 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Select Trade</Text>
                          </View>
                          <ScrollView style={{ maxHeight: 320 }}>
                            {TEMPLATE_TRADES.map(trade => {
                              const isActive = reviewTasks[tradeDropdownIdx]?.trade === trade;
                              return (
                                <TouchableOpacity key={trade} onPress={() => {
                                  setReviewTasks(prev => prev.map((t, i) => i === tradeDropdownIdx ? { ...t, trade } : t));
                                  setTradeDropdownIdx(null);
                                }}
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w04,
                                    ...(isActive ? { backgroundColor: 'rgba(59,130,246,0.12)' } : {}) }} activeOpacity={0.7}>
                                  <Text style={{ fontSize: 17, color: isActive ? C.bl : C.text, fontWeight: isActive ? '600' : '400' }}>{trade}</Text>
                                  {isActive && <Text style={{ fontSize: 19, color: C.bl }}>✓</Text>}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                          {reviewTasks[tradeDropdownIdx]?.trade && (
                            <TouchableOpacity onPress={() => {
                              setReviewTasks(prev => prev.map((t, i) => i === tradeDropdownIdx ? { ...t, trade: '' } : t));
                              setTradeDropdownIdx(null);
                            }}
                              style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.w08 }}>
                              <Text style={{ fontSize: 16, color: C.rd, fontWeight: '600' }}>Remove Trade</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                )}

                {/* Footer */}
                <View style={{ flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: C.bd }}>
                  <TouchableOpacity onPress={() => setShowReview(false)}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.w06 }}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.mt }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    setScheduleTasks(reviewTasks);
                    setAppliedTemplate(reviewTmplInfo);
                    setShowReview(false);
                  }}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.gd }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>Confirm {reviewTasks.length} Tasks</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ============================================================
// NEW SUBCONTRACTOR MODAL
// ============================================================
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const DEFAULT_TRADES = [
  'Excavation', 'Concrete', 'Plumbing', 'Electrical', 'HVAC', 'Trim',
  'Doors', 'Sheetrock', 'Insulation', 'Gravel',
];

const NewSubModal = ({ onClose, onCreated }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zip, setZip] = useState('');
  const [selectedTrades, setSelectedTrades] = useState([]);
  const [customTrade, setCustomTrade] = useState('');
  const [allTrades, setAllTrades] = useState(DEFAULT_TRADES);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleTrade = (trade) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const addCustomTrade = () => {
    const t = customTrade.trim();
    if (t && !allTrades.includes(t)) {
      setAllTrades(prev => [...prev, t]);
      setSelectedTrades(prev => [...prev, t]);
      setCustomTrade('');
    } else if (t && allTrades.includes(t)) {
      if (!selectedTrades.includes(t)) setSelectedTrades(prev => [...prev, t]);
      setCustomTrade('');
    }
  };

  const canSave = companyName.trim() && firstName.trim() && lastName.trim() && email.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email.trim().toLowerCase(),
          password: 'Liberty1',
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          companyName: companyName.trim(),
          role: 'contractor',
          phone: phone.trim(),
          trades: selectedTrades.join(', '),
          street_address: street.trim(),
          city: city.trim(),
          state: stateVal,
          zip_code: zip.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data);
      } else {
        setError(data.error || 'Failed to create subcontractor');
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={[st.exBox, { maxWidth: 560, maxHeight: '92%' }]}>
          {/* Header */}
          <View style={st.exHeader}>
            <View>
              <Text style={st.exTitle}>👷 Add Subcontractor</Text>
              <Text style={st.exSubtitle}>Account created with default password: Liberty1</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Text style={st.exCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            {error ? (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                <Text style={{ color: C.rd, fontSize: 20, fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            {/* Company Name */}
            <View style={{ marginBottom: 14 }}>
              <Text style={st.nsLabel}>COMPANY NAME *</Text>
              <TextInput value={companyName} onChangeText={setCompanyName}
                placeholder="e.g., Smith Electric LLC" placeholderTextColor={C.w20}
                style={st.nsInput} />
            </View>

            {/* Primary Contact Name */}
            <Text style={st.nsLabel}>PRIMARY CONTACT NAME *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <TextInput value={firstName} onChangeText={setFirstName}
                  placeholder="First" placeholderTextColor={C.w20}
                  style={st.nsInput} />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput value={lastName} onChangeText={setLastName}
                  placeholder="Last" placeholderTextColor={C.w20}
                  style={st.nsInput} />
              </View>
            </View>

            {/* Phone & Email */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.nsLabel}>PHONE NUMBER</Text>
                <TextInput value={fPhone(phone)} onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="(555) 555-5555" placeholderTextColor={C.w20}
                  keyboardType="phone-pad" style={st.nsInput} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.nsLabel}>EMAIL ADDRESS *</Text>
                <TextInput value={email} onChangeText={setEmail}
                  placeholder="email@example.com" placeholderTextColor={C.w20}
                  keyboardType="email-address" autoCapitalize="none" style={st.nsInput} />
              </View>
            </View>

            {/* Street Address */}
            <View style={{ marginBottom: 14 }}>
              <Text style={st.nsLabel}>STREET ADDRESS</Text>
              <TextInput value={street} onChangeText={setStreet}
                placeholder="123 Main St" placeholderTextColor={C.w20}
                style={st.nsInput} />
            </View>

            {/* City, State, Zip */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 2 }}>
                <Text style={st.nsLabel}>CITY</Text>
                <TextInput value={city} onChangeText={setCity}
                  placeholder="City" placeholderTextColor={C.w20}
                  style={st.nsInput} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.nsLabel}>STATE</Text>
                <TouchableOpacity onPress={() => setShowStateDropdown(p => !p)} style={[st.nsInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 21, color: stateVal ? C.text : C.w20 }}>
                    {stateVal || 'Select'}
                  </Text>
                  <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.nsLabel}>ZIP CODE</Text>
                <TextInput value={zip} onChangeText={setZip}
                  placeholder="12345" placeholderTextColor={C.w20}
                  keyboardType="numeric" style={st.nsInput} />
              </View>
            </View>

            {/* Trades */}
            <View style={{ marginBottom: 14 }}>
              <Text style={st.nsLabel}>TRADES</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {allTrades.map(trade => {
                  const on = selectedTrades.includes(trade);
                  return (
                    <TouchableOpacity key={trade} onPress={() => toggleTrade(trade)}
                      style={[st.nsTradeChip, on && st.nsTradeChipOn]} activeOpacity={0.7}>
                      <Text style={[st.nsTradeTxt, on && st.nsTradeTxtOn]}>{trade}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Add custom trade */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TextInput value={customTrade} onChangeText={setCustomTrade}
                  placeholder="Add custom trade..." placeholderTextColor={C.w20}
                  style={[st.nsInput, { flex: 1 }]}
                  onSubmitEditing={addCustomTrade} />
                <TouchableOpacity onPress={addCustomTrade}
                  disabled={!customTrade.trim()}
                  style={[st.nsAddTradeBtn, !customTrade.trim() && { opacity: 0.4 }]}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>+ Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={st.nsFooter}>
            <TouchableOpacity onPress={onClose} style={st.nsCancelBtn}>
              <Text style={{ fontSize: 21, fontWeight: '600', color: C.mt }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={!canSave || saving}
              style={[st.nsSaveBtn, (!canSave || saving) && { opacity: 0.4 }]}>
              <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>
                {saving ? 'Creating...' : 'Create Subcontractor'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* State picker overlay - outside exBox to avoid overflow:hidden clipping */}
        {showStateDropdown && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center',
            zIndex: 999,
          }}>
            <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              activeOpacity={1} onPress={() => setShowStateDropdown(false)} />
            <View style={{ width: 240, maxHeight: 400, backgroundColor: C.cardBg || '#1e3040', borderRadius: 12, borderWidth: 1, borderColor: C.w10, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } : { elevation: 20 }) }}>
              <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>Select State</Text>
              </View>
              <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {US_STATES.map(s2 => (
                  <TouchableOpacity key={s2} onPress={() => { setStateVal(s2); setShowStateDropdown(false); }}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04, backgroundColor: stateVal === s2 ? C.gd + '22' : 'transparent' }}>
                    <Text style={{ fontSize: 21, color: stateVal === s2 ? C.gd : C.text }}>{s2}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};


// ============================================================
// SELECTION MANAGER MODAL (global catalog)
// ============================================================

// ============================================================
// DOCUMENT MANAGER MODAL
// ============================================================
const DocumentManagerModal = ({ onClose }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('file');
  const [appliesTo, setAppliesTo] = useState('both');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/document-templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  React.useEffect(() => { fetchTemplates(); }, []);

  const addTemplate = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Document name is required');
    try {
      const res = await fetch(`${API_BASE}/document-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), doc_type: docType, applies_to: appliesTo }),
      });
      if (res.ok) {
        const t = await res.json();
        setTemplates(prev => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
        setName('');
        setDocType('file');
        setAppliesTo('both');
      }
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const deleteTemplate = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/document-templates/${id}`, { method: 'DELETE' });
      if (res.ok) setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) { Alert.alert('Error', e.message); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={[st.exBox, { maxWidth: 560, maxHeight: '94%' }]}>
          <View style={st.exHeader}>
            <Text style={st.exTitle}>📄 Manage Documents</Text>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Text style={st.exCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.dm, marginBottom: 10 }}>ADD REQUIRED DOCUMENT</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Document name (e.g., Building Permit)"
              placeholderTextColor={C.ph}
              style={{ fontSize: 18, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, marginBottom: 10 }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['file', 'folder'].map(t => (
                <TouchableOpacity key={t} onPress={() => setDocType(t)}
                  style={[{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
                    docType === t
                      ? { borderColor: C.gd, backgroundColor: C.bH12 }
                      : { borderColor: C.w08 }
                  ]} activeOpacity={0.7}>
                  <Text style={{ fontSize: 20, marginBottom: 2 }}>{t === 'file' ? '📄' : '📁'}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: docType === t ? C.gd : C.mt }}>
                    {t === 'file' ? 'File' : 'Folder'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.dm, marginBottom: 6 }}>APPLIES TO</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[['projects', 'Projects'], ['subdivisions', 'Subdivisions'], ['both', 'Both']].map(([val, label]) => (
                <TouchableOpacity key={val} onPress={() => setAppliesTo(val)}
                  style={[{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
                    appliesTo === val
                      ? { borderColor: C.gd, backgroundColor: C.bH12 }
                      : { borderColor: C.w08 }
                  ]} activeOpacity={0.7}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: appliesTo === val ? C.gd : C.mt }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={addTemplate}
              style={{ backgroundColor: C.gd, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#000' }}>+ Add Document</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {loading ? (
              <ActivityIndicator color={C.gd} style={{ marginTop: 30 }} />
            ) : templates.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 42, marginBottom: 8 }}>📋</Text>
                <Text style={{ fontSize: 20, fontWeight: '600', color: C.textBold }}>No document templates</Text>
                <Text style={{ fontSize: 16, color: C.dm, marginTop: 4, textAlign: 'center' }}>
                  Add required documents above. Choose where they apply — projects, subdivisions, or both.
                </Text>
              </View>
            ) : (
              templates.map(t => (
                <View key={t.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: C.w06, borderRadius: 10, padding: 14, marginBottom: 8,
                }}>
                  <Text style={{ fontSize: 22 }}>{t.doc_type === 'folder' ? '📁' : '📄'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>{t.name}</Text>
                    <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>
                      {t.doc_type === 'folder' ? 'Folder' : 'File'} · {t.applies_to === 'projects' ? 'Projects only' : t.applies_to === 'subdivisions' ? 'Subdivisions only' : 'Projects & Subdivisions'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteTemplate(t.id)}
                    style={{ padding: 6 }} activeOpacity={0.6}>
                    <Text style={{ fontSize: 18, color: C.rd }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================
// SUBDIVISION UPLOAD MODAL
// ============================================================

const SubdivisionUploadModal = ({ subdivision, user, templateId, templateName, onClose, onCreated }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [name, setName] = useState(templateName || '');
  const [category, setCategory] = useState('General');
  const [loading, setLoading] = useState(false);
  const [fileData, setFileData] = useState(null);
  const docCategories = ['General', 'Permits', 'Contracts', 'Reports', 'Specs', 'Plans'];

  const pickFile = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
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
      const uploadRes = await fetch(`${API_BASE}/upload-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: fileData.b64, ext: fileData.ext, name: fileData.originalName }),
      });
      if (!uploadRes.ok) throw new Error('File upload failed');
      const uploadData = await uploadRes.json();

      const res = await fetch(`${API_BASE}/subdivisions/${subdivision.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, media_type: 'document',
          file_size: uploadData.file_size || fileData.size || 0,
          file_url: uploadData.path,
          uploaded_by: user?.name || '',
          template_id: templateId || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save document record');
      const doc = await res.json();
      onCreated(doc);
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={[st.exBox, { maxWidth: 500, maxHeight: '90%' }]}>
          <View style={st.exHeader}>
            <Text style={st.exTitle}>{templateName ? `Upload: ${templateName}` : 'Upload Document'}</Text>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Text style={st.exCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <TouchableOpacity onPress={pickFile} activeOpacity={0.7}
              style={{
                borderWidth: 2, borderStyle: 'dashed', borderColor: fileData ? C.gn : C.w10,
                borderRadius: 12, padding: 30, alignItems: 'center', marginBottom: 16,
                backgroundColor: fileData ? C.gn + '10' : C.w06,
              }}>
              {fileData ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 36, marginBottom: 6, color: C.gn }}>✓</Text>
                  <Text style={{ color: C.gn, fontSize: 18, fontWeight: '600' }}>{fileData.originalName}</Text>
                  <Text style={{ color: C.dm, fontSize: 15, marginTop: 2 }}>
                    {fileData.size < 1024 * 1024 ? `${(fileData.size / 1024).toFixed(1)} KB` : `${(fileData.size / (1024 * 1024)).toFixed(1)} MB`}
                  </Text>
                  <Text style={{ color: C.bl, fontSize: 15, marginTop: 6 }}>Tap to change file</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 42, marginBottom: 6 }}>⬆</Text>
                  <Text style={{ color: C.gd, fontSize: 20, fontWeight: '600' }}>Tap to select file</Text>
                  <Text style={{ color: C.dm, fontSize: 15, marginTop: 4 }}>Choose a file from your device</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={{ fontSize: 14, fontWeight: '600', color: C.dm, marginBottom: 6 }}>DISPLAY NAME</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Document name"
              placeholderTextColor={C.ph}
              style={{ fontSize: 18, color: C.text, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, marginBottom: 14 }}
            />

            {!templateId && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.dm, marginBottom: 6 }}>CATEGORY</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {docCategories.map(c => (
                    <TouchableOpacity key={c} onPress={() => setCategory(c)}
                      style={[{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
                        category === c ? { borderColor: C.gd, backgroundColor: C.bH12 } : { borderColor: C.w08 }
                      ]} activeOpacity={0.7}>
                      <Text style={{ fontSize: 18, color: category === c ? C.gd : C.mt }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity onPress={upload} disabled={loading || !name || !fileData}
              style={{ backgroundColor: (loading || !name || !fileData) ? C.w10 : C.gd, paddingVertical: 14, borderRadius: 8, alignItems: 'center' }}
              activeOpacity={0.8}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: (loading || !name || !fileData) ? C.dm : '#000' }}>
                {loading ? 'Uploading...' : 'Upload'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================
// SELECTION MANAGER MODAL
// ============================================================
const SELECTION_CATEGORIES = ['Countertops', 'Flooring', 'Cabinets', 'Tile', 'Lighting', 'Plumbing Fixtures', 'Appliances', 'Paint', 'Hardware', 'Exterior', 'Landscaping', 'Other'];

const SelectionManagerModal = ({ onClose }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | create
  // Create form state
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [itemName, setItemName] = useState('');
  const [options, setOptions] = useState([{ name: '', image_b64: '', image_path: '', price: '', comes_standard: false }]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/selection-items`);
      if (res.ok) setItems(await res.json());
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  React.useEffect(() => { fetchItems(); }, []);

  const pickImage = (idx) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result;
        setOptions(prev => prev.map((o, i) => i === idx ? { ...o, image_b64: b64, image_path: '' } : o));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const uploadImage = async (b64) => {
    try {
      const res = await fetch(`${API_BASE}/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, ext: 'jpg' }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.path;
      }
    } catch (e) { console.warn(e); }
    return '';
  };

  const addOption = () => setOptions(prev => [...prev, { name: '', image_b64: '', image_path: '', price: '', comes_standard: false }]);
  const removeOption = (idx) => setOptions(prev => prev.filter((_, i) => i !== idx));
  const updateOption = (idx, field, val) => {
    setOptions(prev => prev.map((o, i) => {
      if (i !== idx) return o;
      const updated = { ...o, [field]: val };
      if (field === 'comes_standard' && val) updated.price = '0';
      return updated;
    }));
  };

  const resetForm = () => {
    setCategory(''); setCustomCat(''); setItemName('');
    setOptions([{ name: '', image_b64: '', image_path: '', price: '', comes_standard: false }]);
    setEditingId(null);
  };

  const saveItem = async () => {
    const finalCat = category === 'Other' ? customCat : category;
    if (!finalCat || !itemName) return Alert.alert('Error', 'Category and item name required');
    if (!options[0]?.name) return Alert.alert('Error', 'At least one option required');
    setSaving(true);
    try {
      // Upload any new images
      const cleanOptions = [];
      for (const o of options) {
        if (!o.name) continue;
        let imgPath = o.image_path || '';
        if (o.image_b64 && !o.image_path) {
          imgPath = await uploadImage(o.image_b64);
        }
        cleanOptions.push({
          name: o.name, image_path: imgPath,
          price: o.comes_standard ? 0 : parseFloat(o.price) || 0,
          comes_standard: !!o.comes_standard,
        });
      }
      const body = { category: finalCat, item: itemName, options: cleanOptions };
      const url = editingId ? `${API_BASE}/selection-items/${editingId}` : `${API_BASE}/selection-items`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        await fetchItems();
        resetForm();
        setView('list');
      }
    } catch (e) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const deleteItem = async (id) => {
    Alert.alert('Delete Selection', 'This will remove it from all projects. Continue?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await fetch(`${API_BASE}/selection-items/${id}`, { method: 'DELETE' });
        fetchItems();
      }},
    ]);
  };

  const editItem = (item) => {
    setEditingId(item.id);
    setCategory(SELECTION_CATEGORIES.includes(item.category) ? item.category : 'Other');
    setCustomCat(SELECTION_CATEGORIES.includes(item.category) ? '' : item.category);
    setItemName(item.item);
    setOptions((item.options || []).map(o => ({
      name: o.name || '', image_b64: '', image_path: o.image_path || '',
      price: String(o.price || ''), comes_standard: !!o.comes_standard,
    })));
    setView('create');
  };

  // Group items by category
  const grouped = {};
  items.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={[st.exBox, { maxWidth: 640, maxHeight: '94%' }]}>
          <View style={st.exHeader}>
            <Text style={st.exTitle}>🎨 {view === 'list' ? 'Manage Selections' : (editingId ? 'Edit Selection' : 'New Selection')}</Text>
            <TouchableOpacity onPress={() => { if (view === 'create') { resetForm(); setView('list'); } else onClose(); }} style={st.exCloseBtn}>
              <Text style={st.exCloseTxt}>{view === 'create' ? '‹' : '✕'}</Text>
            </TouchableOpacity>
          </View>

          {view === 'list' ? (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 14, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                <TouchableOpacity onPress={() => { resetForm(); setView('create'); }}
                  style={{ backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }} activeOpacity={0.8}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>+ New Selection</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
                {loading ? (
                  <ActivityIndicator color={C.gd} style={{ marginTop: 40 }} />
                ) : items.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                    <Text style={{ fontSize: 42, marginBottom: 8 }}>🎨</Text>
                    <Text style={{ color: C.mt, fontSize: 21, fontWeight: '600' }}>No selections yet</Text>
                    <Text style={{ color: C.dm, fontSize: 18, marginTop: 4 }}>Create selections for customers to choose from</Text>
                  </View>
                ) : (
                  Object.entries(grouped).map(([cat, catItems]) => (
                    <View key={cat} style={{ marginBottom: 18 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: C.gd, letterSpacing: 1, marginBottom: 8 }}>{cat.toUpperCase()}</Text>
                      {catItems.map(item => (
                        <View key={item.id} style={{
                          backgroundColor: C.w03, borderWidth: 1, borderColor: C.w08, borderRadius: 10,
                          padding: 14, marginBottom: 8,
                        }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>{item.item}</Text>
                              <Text style={{ fontSize: 18, color: C.dm, marginTop: 2 }}>{(item.options || []).length} option{(item.options || []).length !== 1 ? 's' : ''}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                              <TouchableOpacity onPress={() => editItem(item)}>
                                <Text style={{ fontSize: 20, color: C.bl, fontWeight: '600' }}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => deleteItem(item.id)}>
                                <Text style={{ fontSize: 20, color: C.rd, fontWeight: '600' }}>Delete</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          {/* Preview option images */}
                          <ScrollView horizontal style={{ marginTop: 10 }} showsHorizontalScrollIndicator={false}>
                            {(item.options || []).map((opt, i) => (
                              <View key={i} style={{ marginRight: 8, alignItems: 'center', width: 80 }}>
                                {opt.image_path ? (
                                  <Image source={{ uri: `${API_BASE}${opt.image_path}` }} style={{ width: 105, height: 75, borderRadius: 9 }} resizeMode="cover" />
                                ) : (
                                  <View style={{ width: 105, height: 75, borderRadius: 9, backgroundColor: C.w06, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 24, opacity: 0.3 }}>📷</Text>
                                  </View>
                                )}
                                <Text style={{ fontSize: 15, color: C.mt, marginTop: 3, textAlign: 'center' }} numberOfLines={1}>{opt.name}</Text>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          ) : (
            /* CREATE / EDIT VIEW */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
              {/* Category */}
              <Text style={st.formLbl}>CATEGORY</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {SELECTION_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} onPress={() => setCategory(cat)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                      borderWidth: 1, borderColor: category === cat ? C.gd : C.w10,
                      backgroundColor: category === cat ? C.bH12 : C.w03,
                    }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: category === cat ? '700' : '500', color: category === cat ? C.gd : C.mt }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {category === 'Other' && (
                <Inp2 label="CUSTOM CATEGORY" value={customCat} onChange={setCustomCat} placeholder="e.g., Windows" />
              )}

              <Inp2 label="ITEM NAME" value={itemName} onChange={setItemName} placeholder="e.g., Master Bath Countertop" />

              {/* Options */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={st.formLbl}>OPTIONS</Text>
                <TouchableOpacity onPress={addOption} activeOpacity={0.7}>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: C.gd }}>+ Add Option</Text>
                </TouchableOpacity>
              </View>

              {options.map((opt, idx) => (
                <View key={idx} style={{
                  backgroundColor: C.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  borderWidth: 1, borderColor: C.w08, borderRadius: 10,
                  padding: 14, marginBottom: 12,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.mt }}>Option {idx + 1}</Text>
                    {options.length > 1 && (
                      <TouchableOpacity onPress={() => removeOption(idx)}>
                        <Text style={{ fontSize: 20, color: C.rd }}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Inp2 label="NAME" value={opt.name} onChange={v => updateOption(idx, 'name', v)} placeholder="e.g., Quartz - Arctic White" />

                  {/* Image upload */}
                  <Text style={st.formLbl}>IMAGE</Text>
                  {opt.image_b64 || opt.image_path ? (
                    <TouchableOpacity onPress={() => pickImage(idx)} activeOpacity={0.7}
                      style={{
                        height: 100, borderRadius: 10, borderWidth: 1, borderColor: C.w10,
                        backgroundColor: C.w03, alignItems: 'center', justifyContent: 'center', marginBottom: 14, overflow: 'hidden',
                      }}>
                      <Image source={{ uri: opt.image_b64 || `${API_BASE}${opt.image_path}` }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => pickImage(idx)} activeOpacity={0.7}
                      style={{
                        width: 40, height: 40, borderRadius: 20, backgroundColor: C.w10,
                        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                      }}>
                      <Text style={{ fontSize: 24, color: C.text, fontWeight: '300' }}>+</Text>
                    </TouchableOpacity>
                  )}

                  {/* Comes Standard checkbox */}
                  <TouchableOpacity onPress={() => updateOption(idx, 'comes_standard', !opt.comes_standard)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }} activeOpacity={0.7}>
                    <View style={{
                      width: 33, height: 33, borderRadius: 9, borderWidth: 2,
                      borderColor: opt.comes_standard ? C.gd : C.w15,
                      backgroundColor: opt.comes_standard ? C.gd : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {opt.comes_standard && <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>✓</Text>}
                    </View>
                    <Text style={{ fontSize: 21, color: C.text }}>Comes Standard</Text>
                  </TouchableOpacity>

                  {!opt.comes_standard && (
                    <Inp2 label="UPGRADE PRICE ($)" value={opt.price} onChange={v => updateOption(idx, 'price', v)} type="number" placeholder="0" />
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={saveItem} disabled={saving || !category || !itemName || !options[0]?.name}
                style={[st.submitBtn, (saving || !category || !itemName || !options[0]?.name) && { backgroundColor: C.dm }]} activeOpacity={0.8}>
                <Text style={{ color: C.textBold, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
                  {saving ? 'Saving...' : (editingId ? 'Update Selection' : 'Create Selection')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};




// ============================================================
// WORKDAY EXEMPTIONS MODAL
// ============================================================
const WorkdayExemptionsModal = ({ onClose }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [exemptions, setExemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newRecurring, setNewRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchExemptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/workday-exemptions`);
      const data = await res.json();
      setExemptions(data);
    } catch (e) { console.warn('Failed to load exemptions:', e); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { fetchExemptions(); }, []);

  const addExemption = async () => {
    if (!newDate.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/workday-exemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate.trim(), description: newDesc.trim(), recurring: newRecurring }),
      });
      const data = await res.json();
      if (res.ok) {
        setExemptions(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
        setNewDate('');
        setNewDesc('');
        setNewRecurring(false);
      } else {
        Alert.alert('Error', data.error || 'Failed to add');
      }
    } catch (e) { Alert.alert('Error', 'Failed to add exemption'); }
    finally { setSaving(false); }
  };

  const deleteExemption = async (id) => {
    try {
      await fetch(`${API_BASE}/workday-exemptions/${id}`, { method: 'DELETE' });
      setExemptions(prev => prev.filter(e => e.id !== id));
    } catch (e) { console.warn('Delete failed:', e); }
  };

  // Group by year
  const grouped = {};
  exemptions.forEach(e => {
    const yr = e.date?.substring(0, 4) || 'Unknown';
    if (!grouped[yr]) grouped[yr] = [];
    grouped[yr].push(e);
  });

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={st.exBox}>
          {/* Header */}
          <View style={st.exHeader}>
            <View>
              <Text style={st.exTitle}>🗓️ Workday Exemptions</Text>
              <Text style={st.exSubtitle}>Days excluded from schedule calculations</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Text style={st.exCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Add form */}
          <View style={st.exForm}>
            <View style={st.exFormRow}>
              <View style={{ flex: 1 }}>
                <DatePicker
                  label="DATE"
                  value={newDate}
                  onChange={setNewDate}
                  placeholder="Select date"
                  style={{ marginBottom: 0 }}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Text style={st.exLabel}>DESCRIPTION</Text>
                <TextInput
                  value={newDesc}
                  onChangeText={setNewDesc}
                  placeholder="e.g., Christmas Day, Labor Day"
                  placeholderTextColor={C.w20}
                  style={st.exInput}
                />
              </View>
              <TouchableOpacity
                onPress={() => setNewRecurring(p => !p)}
                style={st.exRecurToggle}
                activeOpacity={0.7}
              >
                <View style={[st.exCheckbox, newRecurring && st.exCheckboxOn]}>
                  {newRecurring && <Text style={st.exCheckmark}>✓</Text>}
                </View>
                <Text style={st.exRecurLabel}>Annual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addExemption}
                disabled={!newDate.trim() || saving}
                style={[st.exAddBtn, (!newDate.trim() || saving) && { opacity: 0.4 }]}
              >
                <Text style={st.exAddBtnTxt}>{saving ? '...' : '+ Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* List */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingTop: 4 }}>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={C.gd} />
              </View>
            ) : exemptions.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 48, marginBottom: 8 }}>📅</Text>
                <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>No exemptions yet</Text>
                <Text style={{ fontSize: 18, color: C.dm, marginTop: 4 }}>Add holidays or non-work days above</Text>
              </View>
            ) : (
              Object.entries(grouped).map(([year, items]) => (
                <View key={year} style={{ marginBottom: 16 }}>
                  <Text style={st.exYearLabel}>{year}</Text>
                  {items.map(ex => {
                    const d = new Date(ex.date + 'T00:00:00');
                    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                    const dateFmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <View key={ex.id} style={st.exItem}>
                        <View style={st.exDateChip}>
                          <Text style={st.exDayTxt}>{dayName}</Text>
                          <Text style={st.exDateTxt}>{dateFmt}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={st.exDescTxt}>{ex.description || 'No description'}</Text>
                            {ex.recurring && (
                              <View style={st.exRecurBadge}>
                                <Text style={st.exRecurBadgeTxt}>🔄 Annual</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => deleteExemption(ex.id)} style={st.exDelBtn}>
                          <Text style={st.exDelTxt}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};


// ============================================================
// STYLES
// ============================================================
const getStyles = (C) => StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : Platform.OS === 'web' ? 12 : 40,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: C.headerBg, borderBottomWidth: 1, borderBottomColor: C.sw06,
    zIndex: 100,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 100 },
  logoBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 27, fontWeight: '700', color: C.chromeTxt },
  headerBtn: { padding: 4 },
  avatar: { width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 16, fontWeight: '700', color: C.chromeTxt },
  backBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.sw06, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  backBtnTxt: { fontSize: 36, color: C.gd, fontWeight: '300', marginTop: -2 },

  // Sidebar
  sidebar: { backgroundColor: C.sidebarBg, minHeight: 0 },
  sidebarWide: { width: 325, flexShrink: 0 },
  sidebarFull: { flex: 1 },
  sidebarHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.sw06,
  },
  sidebarLabel: { fontSize: 16, fontWeight: '600', color: C.chromeDm, letterSpacing: 1 },
  countBadge: { backgroundColor: C.sw06, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countTxt: { fontSize: 15, color: C.chromeDm, fontWeight: '600' },
  addBtn: { width: 42, height: 42, borderRadius: 11, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' },
  addBtnTxt: { fontSize: 27, color: C.chromeTxt, fontWeight: '600', marginTop: -1 },

  // Job items
  jobItem: {
    flexDirection: 'row', alignItems: 'stretch',
    borderBottomWidth: 1, borderBottomColor: C.sw03,
  },
  jobItemActive: { backgroundColor: C.bH },
  jobIndicator: { width: 5, backgroundColor: 'transparent' },
  jobIndicatorActive: { backgroundColor: C.gd },
  jobName: { fontSize: 21, fontWeight: '400', color: C.chromeDm },
  jobNameActive: { fontWeight: '600', color: C.chromeTxt },
  jobMeta: { fontSize: 16, color: C.chromeDm, marginTop: 3 },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: C.modalBg, borderRadius: 20, padding: 24, maxHeight: '92%', width: '90%', maxWidth: 560 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 27, fontWeight: '700', color: C.textBold },
  formLbl: { fontSize: 16, fontWeight: '600', color: C.dm, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  formInp: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 22, color: C.text },
  divider: { height: 1, backgroundColor: C.w06, marginVertical: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.w10, backgroundColor: C.w02 },
  chipOn: { borderColor: C.gd, backgroundColor: C.bH },
  chipTxt: { fontSize: 18, color: C.mt },
  chipTxtOn: { color: C.gd, fontWeight: '600' },
  submitBtn: { backgroundColor: C.gd, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  submitBtnOff: { backgroundColor: C.dm },
  submitBtnTxt: { color: C.textBold, fontSize: 22, fontWeight: '700' },

  // Settings dropdown
  settingsDropdown: {
    position: 'absolute', top: 38, right: 0, zIndex: 100,
    backgroundColor: C.modalBg, borderRadius: 10, padding: 6,
    borderWidth: 1, borderColor: C.w10,
    minWidth: 220,
    boxShadow: '0px 6px 20px rgba(0,0,0,0.4)',
  },
  settingsItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
  },
  settingsItemIcon: { fontSize: 22 },
  settingsItemTxt: { fontSize: 20, color: C.text, fontWeight: '500' },

  // Icon picker
  iconPicker: {
    width: 78, height: 78, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10,
  },
  iconGrid: {
    position: 'absolute', top: 108, left: 0, zIndex: 50,
    flexDirection: 'row', flexWrap: 'wrap', width: 300, padding: 9, gap: 6,
    backgroundColor: C.modalBg, borderRadius: 15,
    borderWidth: 1, borderColor: C.w10,
    boxShadow: '0px 6px 15px rgba(0,0,0,0.4)',
  },
  iconOption: {
    width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  iconOptionOn: {
    backgroundColor: C.bH, borderWidth: 1, borderColor: C.gd,
  },

  // Workday Exemptions Modal
  exOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  exBox: {
    width: '100%', maxWidth: 520, maxHeight: '85%',
    backgroundColor: C.modalBg, borderRadius: 16,
    borderWidth: 1, borderColor: C.w10,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.5)' } : { elevation: 20 }),
  },
  exHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: C.w06,
  },
  exTitle: { fontSize: 26, fontWeight: '700', color: C.textBold },
  exSubtitle: { fontSize: 18, color: C.dm, marginTop: 3 },
  exCloseBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: C.w06,
    alignItems: 'center', justifyContent: 'center',
  },
  exCloseTxt: { fontSize: 21, color: C.mt, fontWeight: '600' },
  exForm: {
    padding: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.w06,
    backgroundColor: C.w02,
  },
  exFormRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' },
  exLabel: { fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  exInput: {
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10,
    borderRadius: 8, padding: 10, paddingHorizontal: 12, fontSize: 20, color: C.text, minWidth: 110,
  },
  exAddBtn: {
    backgroundColor: C.gd, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  exAddBtnTxt: { fontSize: 20, fontWeight: '700', color: C.textBold },
  exYearLabel: {
    fontSize: 20, fontWeight: '700', color: C.gd, letterSpacing: 0.5,
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.w06,
    marginBottom: 4,
  },
  exItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  exDateChip: {
    backgroundColor: C.w04, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 60,
    borderWidth: 1, borderColor: C.w06,
  },
  exDayTxt: { fontSize: 15, fontWeight: '700', color: C.gd, textTransform: 'uppercase' },
  exDateTxt: { fontSize: 18, fontWeight: '600', color: C.text, marginTop: 1 },
  exDescTxt: { fontSize: 20, fontWeight: '500', color: C.text },
  exDelBtn: {
    width: 42, height: 42, borderRadius: 11, backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
  },
  exDelTxt: { fontSize: 18, color: C.rd, fontWeight: '700' },

  // Recurring toggle
  exRecurToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingBottom: Platform.OS === 'web' ? 0 : 2,
  },
  exCheckbox: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1.5, borderColor: C.w15,
    backgroundColor: C.w03,
    alignItems: 'center', justifyContent: 'center',
  },
  exCheckboxOn: {
    backgroundColor: C.gd, borderColor: C.gd,
  },
  exCheckmark: { fontSize: 18, color: C.textBold, fontWeight: '800', marginTop: -1 },
  exRecurLabel: { fontSize: 18, fontWeight: '600', color: C.mt },
  exRecurBadge: {
    backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  exRecurBadgeTxt: { fontSize: 15, fontWeight: '600', color: C.bl },

  // New Sub modal
  nsLabel: {
    fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 6,
  },
  nsInput: {
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10,
    borderRadius: 8, padding: 11, paddingHorizontal: 14, fontSize: 21, color: C.text,
  },
  nsStateDropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
    backgroundColor: '#1e3040', borderRadius: 8, marginTop: 4,
    borderWidth: 1, borderColor: C.w10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } : { elevation: 20 }),
  },
  nsStateOption: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  nsStateOptionOn: { backgroundColor: C.bH12 },
  nsStateOptTxt: { fontSize: 20, color: C.text },
  nsTradeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: C.w10,
    backgroundColor: C.w03,
  },
  nsTradeChipOn: {
    borderColor: C.bl, backgroundColor: 'rgba(59,130,246,0.12)',
  },
  nsTradeTxt: { fontSize: 18, fontWeight: '500', color: C.mt },
  nsTradeTxtOn: { color: C.bl, fontWeight: '700' },
  nsAddTradeBtn: {
    backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 14, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
  },
  nsFooter: {
    flexDirection: 'row', gap: 10, padding: 18,
    borderTopWidth: 1, borderTopColor: C.w06,
  },
  nsCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08,
  },
  nsSaveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.gd,
  },

  // Dashboard view tabs (underline style)
  dashTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: C.sw06,
    paddingHorizontal: 0,
  },
  dashTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  dashTabOn: {
    borderBottomWidth: 2, borderBottomColor: C.gd,
  },
  dashTabTxt: { fontSize: 21, fontWeight: '500', color: C.chromeDm },
  dashTabTxtOn: { color: C.chromeTxt, fontWeight: '600' },

  // Sub detail styles
  subDetailCard: {
    backgroundColor: C.w04, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: C.w06, marginBottom: 14,
  },
  subAvatar: {
    width: 78, height: 78, borderRadius: 21,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  subAvatarTxt: { fontSize: 27, fontWeight: '700', color: C.bl },
  subInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  subInfoLabel: { fontSize: 20, color: C.dm, width: 90 },
  subInfoVal: { fontSize: 21, color: C.text, fontWeight: '500', flex: 1 },
  subSectionLbl: {
    fontSize: 15, fontWeight: '700', color: C.dm, letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 8,
  },
  subTradeBadge: {
    backgroundColor: 'rgba(59,130,246,0.1)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  subTradeTxt: { fontSize: 18, fontWeight: '600', color: C.bl },
  subStatCard: {
    flex: 1, backgroundColor: C.w03, borderRadius: 10,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: C.w06,
  },
  subStatNum: { fontSize: 33, fontWeight: '800', color: C.textBold, marginBottom: 2 },
  subStatLbl: { fontSize: 15, fontWeight: '600', color: C.dm, textTransform: 'uppercase' },
  subCardTitle: { fontSize: 22, fontWeight: '700', color: C.textBold, marginBottom: 12 },
  subProjectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  subTaskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  subTaskDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: C.gd,
  },

  // Sub tab bar
  subTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: C.bd,
  },
  subTabBtn: {
    paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center',
  },
  subTabBtnOn: {
    borderBottomWidth: 2, borderBottomColor: C.gd,
  },
  subTabTxt: { fontSize: 16, fontWeight: '500', color: C.mt },
  subTabTxtOn: { color: C.textBold, fontWeight: '600' },

  // Sub calendar (matching project calendar format)
  subCalNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.bd,
  },
  subCalNavBtn: {
    width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.w04, borderWidth: 1, borderColor: C.w08,
  },
  subCalNavArrow: { fontSize: 30, color: C.mt, fontWeight: '300', marginTop: -2 },
  subCalNavTitle: { fontSize: 24, fontWeight: '700', color: C.textBold, minWidth: 160, textAlign: 'center' },
  subCalTodayBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: C.w12, backgroundColor: C.w04,
  },
  subCalTodayTxt: { fontSize: 18, fontWeight: '600', color: C.text },
  subCalLegend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  subCalDayHeaders: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.bd,
    backgroundColor: C.w02,
  },
  subCalDayHeaderCell: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  subCalDayHeaderTxt: { fontSize: 16, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 },
  subCalWeekRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.bd, position: 'relative',
  },
  subCalCell: {
    flex: 1, paddingTop: 4, paddingLeft: 6, minHeight: 125,
  },
  subCalCellBorder: { borderRightWidth: 1, borderRightColor: C.w03 },
  subCalCellWknd: { backgroundColor: C.w02 },
  subCalDayCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  subCalDayCircleToday: { backgroundColor: C.bl },
  subCalDayNum: { fontSize: 18, fontWeight: '500', color: C.text },
  subCalDayOther: { color: C.w20 },
  subCalDayNumToday: { color: C.textBold, fontWeight: '700' },
  subCalTaskBar: {
    position: 'absolute', height: 22, borderRadius: 4,
    paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', marginHorizontal: 2,
    backgroundColor: C.mode === 'light' ? 'rgba(0,0,0,0.03)' : C.w04,
    borderWidth: 2.5,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  subCalTaskTxt: { fontSize: 16, fontWeight: '600', color: C.text, flex: 1 },

  // Template manager
  tmplRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.w06,
  },
  tmplDeleteBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
});
