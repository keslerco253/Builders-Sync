import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
  Platform, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, TextInput,
  useWindowDimensions, Image, Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { AuthContext, ThemeContext, API_BASE, apiFetch } from './context';
import CurrentProjectViewer, { calcTaskProgress, fPhone } from './currentProjectViewer';
import ScheduleBuilder, { cascadeAll, calcEndDate, calcFromPredecessor } from './scheduleBuilder';
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
  const [sdSubs, setSdSubs] = useState([]);           // all contractors
  const [sdSubsLoading, setSdSubsLoading] = useState(false);
  const [sdTradeAssignments, setSdTradeAssignments] = useState({});  // { trade: contractor_id }
  const [sdOpenTrade, setSdOpenTrade] = useState(null);  // which trade dropdown is open
  const [sdDocs, setSdDocs] = useState([]);
  const [sdDocsLoading, setSdDocsLoading] = useState(false);
  const [sdDocTemplates, setSdDocTemplates] = useState([]);
  const [sdDocModal, setSdDocModal] = useState(null);
  const [sdDocEditMode, setSdDocEditMode] = useState(false);
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
  const [editSubdivId, setEditSubdivId] = useState(null);
  const [editSubdivName, setEditSubdivName] = useState('');
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
  const [showTradeManager, setShowTradeManager] = useState(false);
  const [showGoLiveManager, setShowGoLiveManager] = useState(false);
  const [goLiveStepsDef, setGoLiveStepsDef] = useState([]);
  const [newGoLiveStep, setNewGoLiveStep] = useState('');
  const [goLiveStepsLoading, setGoLiveStepsLoading] = useState(false);
  const [showPmManager, setShowPmManager] = useState(false);
  const [pmBuilders, setPmBuilders] = useState([]);
  const [pmLoading, setPmLoading] = useState(false);
  const [companyBuilders, setCompanyBuilders] = useState([]); // for PM/superintendent dropdowns
  const [builderTrades, setBuilderTrades] = useState(DEFAULT_TRADES);
  const [newTradeName, setNewTradeName] = useState('');
  const [showFloorPlanManager, setShowFloorPlanManager] = useState(false);
  const [showBidTemplateManager, setShowBidTemplateManager] = useState(false);
  const [floorPlans, setFloorPlans] = useState([]);
  const [newFloorPlanName, setNewFloorPlanName] = useState('');
  const [clientView, setClientView] = useState(false);
  const [subView, setSubView] = useState(false);

  // Client Tasks
  const [showClientTaskModal, setShowClientTaskModal] = useState(null); // project object or null
  const [ctTitle, setCtTitle] = useState('');
  const [ctDescription, setCtDescription] = useState('');
  const [ctDueDate, setCtDueDate] = useState('');
  const [ctImageB64, setCtImageB64] = useState('');
  const [ctSaving, setCtSaving] = useState(false);
  const [customerTasks, setCustomerTasks] = useState([]);
  const [selectedClientTask, setSelectedClientTask] = useState(null); // for customer detail popup
  const [ctScheduleTasks, setCtScheduleTasks] = useState([]); // schedule tasks for linking
  const [ctLinkedTaskId, setCtLinkedTaskId] = useState(null); // linked schedule task id
  const [ctLinkedDateType, setCtLinkedDateType] = useState('end'); // 'start' or 'end'
  const [ctShowTaskPicker, setCtShowTaskPicker] = useState(false); // task picker dropdown

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
      const res = await apiFetch(`/projects/${showDeleteConfirm.id}`, { method: 'DELETE' });
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
      const res = await apiFetch(`/projects/${project.id}/schedule`);
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
      const res = await apiFetch(`/projects/${showExceptionModal.id}/exceptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: excName.trim(), date: excDate, duration: parseInt(excDuration) || 1, task_id: excTaskId, description: excDescription.trim(), edited_by: editedBy }),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); setExcSaving(false); return; }
      setShowExceptionModal(null);
      setScheduleVersion(v => v + 1);
      // Refresh if this is the selected project
      if (selectedProject?.id === showExceptionModal.id) {
        const schRes = await apiFetch(`/projects/${showExceptionModal.id}/schedule`);
        const schData = await schRes.json();
        // handled by scheduleVersion bump in CPV
      }
    } catch (e) { console.warn('Exception submit error:', e); }
    setExcSaving(false);
  };

  const [holdReasonModal, setHoldReasonModal] = useState(null); // project object or null
  const [holdReasonText, setHoldReasonText] = useState('');
  const [holdSubmitting, setHoldSubmitting] = useState(false);

  const submitProjectHold = async (project, reason) => {
    setHoldSubmitting(true);
    try {
      const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
      const res = await apiFetch(`/projects/${project.id}/hold`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hold', edited_by: editedBy, hold_reason: reason }),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); setHoldSubmitting(false); return; }
      const result = await res.json();
      const updatedProject = result.project || result;
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...updatedProject } : p));
      if (selectedProject?.id === project.id) {
        setSelectedProject(prev => ({ ...prev, ...updatedProject }));
      }
      setHoldReasonModal(null);
      setHoldReasonText('');
    } catch (e) { console.warn('Hold error:', e); }
    setHoldSubmitting(false);
  };

  const toggleProjectHold = async (project, action) => {
    setProjectActionMenu(null);
    if (action === 'hold') {
      setHoldReasonModal(project);
      setHoldReasonText('');
      return;
    }
    // Release flow — simple confirmation
    const confirmMsg = `Release hold on "${project.name}"?\n\nTask dates will be adjusted based on the number of workdays the project was on hold.`;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(confirmMsg)
      : await new Promise(res => Alert.alert('Release Hold', confirmMsg,
          [{ text: 'Cancel', onPress: () => res(false) }, { text: 'Release', onPress: () => res(true) }]));
    if (!confirmed) return;

    try {
      const editedBy = user ? `${user.first_name} ${user.last_name}`.trim() : '';
      const res = await apiFetch(`/projects/${project.id}/hold`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release', edited_by: editedBy }),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); return; }
      const result = await res.json();
      const updatedProject = result.project || result;
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...updatedProject } : p));
      if (selectedProject?.id === project.id) {
        setSelectedProject(prev => ({ ...prev, ...updatedProject }));
      }
      setScheduleVersion(v => v + 1);
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
  const [subTaskFilter, setSubTaskFilter] = useState(null); // task name string or null
  const [subTaskFilterOpen, setSubTaskFilterOpen] = useState(false);
  const [subChangeOrders, setSubChangeOrders] = useState([]);
  const [subCOLoading, setSubCOLoading] = useState(false);
  const [subCOSignModal, setSubCOSignModal] = useState(null); // change order to sign
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
  const [showSubCalLegend, setShowSubCalLegend] = useState(true);
  const subCalRef = React.useRef(null);
  const subCellWidth = React.useRef(0);
  const subGridOrigin = React.useRef({ x: 0, y: 0 });
  const subWeeksRef = React.useRef([]);
  const subDragRef = React.useRef(null);
  const subTasksRef = React.useRef(subTasks);
  subTasksRef.current = subTasks;
  const selectedSubRef = React.useRef(selectedSub);
  selectedSubRef.current = selectedSub;
  const subLastTapRef = React.useRef({});
  const handleScheduleChange = useCallback(() => {
    if (selectedSub) {
      apiFetch(`/users/${selectedSub.id}/tasks?viewer_role=${user?.role || ''}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setSubTasks(data); })
        .catch(() => {});
    }
  }, [selectedSub]);
  const [contractorProject, setContractorProject] = useState(null); // for contractor viewing a project
  const [subCOModal, setSubCOModal] = useState(null); // { task, project } for sub change order popup
  const [subCOForm, setSubCOForm] = useState({ title: '', desc: '', amount: '', isCredit: false, dueDate: '', signerName: '' });
  const [subCOStep, setSubCOStep] = useState('form'); // 'form' | 'sign'
  const [subCOSubmitting, setSubCOSubmitting] = useState(false);
  const [subCOAttachments, setSubCOAttachments] = useState([]);
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
  const [showBids, setShowBids] = useState(true);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const syncRef = useRef(null);
  const lastProjectTapRef = useRef({});
  const [companyLogo, setCompanyLogo] = useState(null);
  const [scheduleVersion, setScheduleVersion] = useState(0);

  const isBuilder = user?.role === 'builder' || user?.role === 'company_admin';
  const isContractor = user?.role === 'contractor';

  // For contractors: auto-load own profile as sub data
  const fetchOwnSubProfile = async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        apiFetch(`/users/${user.id}/projects`),
        apiFetch(`/users/${user.id}/tasks`),
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
      const res = await apiFetch(`/projects?user_id=${user.id}&role=${user.role}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const sorted = data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setProjects(sorted);
        if (!selectedProject && sorted.length > 0 && (isWide || (!isBuilder && !isContractor))) {
          setSelectedProject(sorted[0]);
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
      const res = await apiFetch(`/subdivisions${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      const data = await res.json();
      if (Array.isArray(data)) setSubdivisions(data);
    } catch (e) { console.warn('Fetch subdivisions error:', e.message); }
  };

  const fetchCompanyTrades = async () => {
    try {
      const res = await apiFetch(`/users/${user.id}/company-trades`);
      const data = await res.json();
      if (data.trades && data.trades.trim()) {
        setBuilderTrades(data.trades.split(',').map(t => t.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)));
      }
    } catch (e) { /* ignore */ }
  };

  const fetchFloorPlans = async () => {
    try {
      const res = await apiFetch(`/floor-plans${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      const data = await res.json();
      if (Array.isArray(data)) setFloorPlans(data);
    } catch (e) { console.warn('Fetch floor plans error:', e.message); }
  };

  const fetchCustomerTasks = async () => {
    try {
      const res = await apiFetch(`/users/${user.id}/client-tasks`);
      const data = await res.json();
      if (Array.isArray(data)) setCustomerTasks(data);
    } catch (e) { console.warn('Fetch client tasks:', e); }
  };

  const pickClientTaskImage = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setCtImageB64(reader.result);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const submitClientTask = async () => {
    if (!showClientTaskModal || !ctTitle.trim()) return;
    setCtSaving(true);
    try {
      let imageUrl = '';
      if (ctImageB64) {
        const upRes = await apiFetch(`/upload-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: ctImageB64, ext: 'jpg' }),
        });
        if (upRes.ok) { const upData = await upRes.json(); imageUrl = upData.path || ''; }
      }
      const body = {
        title: ctTitle.trim(), description: ctDescription.trim(),
        due_date: ctDueDate, image_url: imageUrl, created_by: user.id,
      };
      if (ctLinkedTaskId) {
        body.linked_schedule_id = ctLinkedTaskId;
        body.linked_date_type = ctLinkedDateType || 'end';
      }
      const res = await apiFetch(`/projects/${showClientTaskModal.id}/client-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowClientTaskModal(null);
        setCtTitle(''); setCtDescription(''); setCtDueDate(''); setCtImageB64('');
        setCtLinkedTaskId(null); setCtLinkedDateType('end'); setCtScheduleTasks([]);
        fetchCustomerTasks();
      }
    } catch (e) { console.warn('Create client task error:', e); }
    setCtSaving(false);
  };

  const fetchGoLiveStepsDef = async () => {
    if (!user?.company_id) return;
    setGoLiveStepsLoading(true);
    try {
      const res = await apiFetch(`/go-live-steps?company_id=${user.company_id}`);
      if (res.ok) { const data = await res.json(); setGoLiveStepsDef(Array.isArray(data) ? data : []); }
    } catch (e) { console.warn('Fetch go-live steps:', e); }
    setGoLiveStepsLoading(false);
  };

  const addGoLiveStepDef = async () => {
    if (!newGoLiveStep.trim() || !user?.company_id) return;
    try {
      const res = await apiFetch(`/go-live-steps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newGoLiveStep.trim(), company_id: user.company_id }),
      });
      if (res.ok) {
        const step = await res.json();
        setGoLiveStepsDef(prev => [...prev, step]);
        setNewGoLiveStep('');
      }
    } catch (e) { console.warn('Add go-live step:', e); }
  };

  const deleteGoLiveStepDef = async (stepId) => {
    try {
      await apiFetch(`/go-live-steps/${stepId}`, { method: 'DELETE' });
      setGoLiveStepsDef(prev => prev.filter(s => s.id !== stepId));
    } catch (e) { console.warn('Delete go-live step:', e); }
  };

  const fetchPmBuilders = async () => {
    if (!user?.company_id) return;
    setPmLoading(true);
    try {
      const res = await apiFetch(`/company/${user.company_id}/builders`);
      if (res.ok) { const data = await res.json(); setPmBuilders(Array.isArray(data) ? data : []); }
    } catch (e) { console.warn('Fetch builders:', e); }
    setPmLoading(false);
  };

  const togglePmStatus = async (uid, currentStatus) => {
    try {
      const res = await apiFetch(`/users/${uid}/project-manager`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_project_manager: !currentStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPmBuilders(prev => prev.map(b => b.id === uid ? { ...b, is_project_manager: updated.is_project_manager } : b));
      }
    } catch (e) { console.warn('Toggle PM:', e); }
  };

  const fetchCompanyBuilders = async () => {
    if (!user?.company_id) return;
    try {
      const res = await apiFetch(`/company/${user.company_id}/builders`);
      if (res.ok) { const data = await res.json(); setCompanyBuilders(Array.isArray(data) ? data : []); }
    } catch (e) { console.warn('Fetch company builders:', e); }
  };

  const createSubdivision = async (name) => {
    setNewSubdivSaving(true);
    try {
      const res = await apiFetch(`/subdivisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), user_id: user.id }),
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
      await apiFetch(`/subdivisions/${id}`, { method: 'DELETE' });
      setSubdivisions(prev => prev.filter(s => s.id !== id));
      setProjects(prev => prev.map(p => p.subdivision_id === id ? { ...p, subdivision_id: null } : p));
      if (selectedSubdivision?.id === id) setSelectedSubdivision(null);
    } catch (e) { console.warn('Delete subdivision error:', e); }
  };

  const renameSubdivision = async (id, newName) => {
    if (!newName.trim()) return;
    try {
      const res = await apiFetch(`/subdivisions/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSubdivisions(prev => prev.map(s => s.id === id ? { ...s, name: updated.name || newName.trim() } : s));
        if (selectedSubdivision?.id === id) setSelectedSubdivision(prev => ({ ...prev, name: updated.name || newName.trim() }));
      }
    } catch (e) { console.warn('Rename subdivision error:', e); }
    setEditSubdivId(null);
    setEditSubdivName('');
  };

  useFocusEffect(useCallback(() => {
    if (isContractor) {
      fetchOwnSubProfile();
      fetchSubdivisions();
      if (user?.id) {
        apiFetch(`/users/${user.id}/change-orders`)
          .then(r => r.json())
          .then(data => { if (Array.isArray(data)) setSubChangeOrders(data); })
          .catch(() => {});
      }
    } else {
      fetchProjects();
      if (isBuilder) {
        fetchSubdivisions();
        fetchCompanyTrades();
        fetchFloorPlans();
        fetchCompanyBuilders();
      }
      fetchCustomerTasks();
    }
    // Fetch company logo — try own logo first, then fallback to any builder's logo
    if (user?.id) {
      if (isBuilder) {
        apiFetch(`/users/${user.id}/logo`)
          .then(r => r.json())
          .then(data => {
            if (data.logo) { setCompanyLogo(data.logo); }
            else {
              // Fallback: check if another builder in the company has a logo
              apiFetch(`/builder-logo`)
                .then(r => r.json())
                .then(d => { if (d.logo) setCompanyLogo(d.logo); else setCompanyLogo(null); })
                .catch(() => {});
            }
          })
          .catch(() => {});
      } else {
        apiFetch(`/builder-logo`)
          .then(r => r.json())
          .then(data => { if (data.logo) setCompanyLogo(data.logo); else setCompanyLogo(null); })
          .catch(() => {});
      }
    }
  }, []));

  const onRefresh = () => { setRefreshing(true); fetchProjects(); fetchCustomerTasks(); if (isBuilder) { fetchSubdivisions(); fetchCompanyTrades(); } };

  const selectProject = (p) => {
    setSelectedProject(p);
    setSelectedSubdivision(null);
    setClientView(false);
  };

  const renderProjectItem = useCallback((project) => {
    const active = selectedProject?.id === project.id;
    return (
      <TouchableOpacity
        key={project.id}
        activeOpacity={0.7}
        onPress={() => {
          const now = Date.now();
          const last = lastProjectTapRef.current[project.id] || 0;
          lastProjectTapRef.current[project.id] = now;
          if (now - last < 400 && active) {
            lastProjectTapRef.current[project.id] = 0;
            setActiveTab('info');
            setActiveSub('jobinfo');
          } else {
            selectProject(project);
          }
        }}
        style={[st.jobItem, active && st.jobItemActive, project.on_hold && { borderLeftWidth: 3, borderLeftColor: '#f59e0b' }]}
      >
        <View style={[st.jobIndicator, active && st.jobIndicatorActive]} />
        <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[st.jobName, active && st.jobNameActive, { flex: 1 }]} numberOfLines={1}>
              {project.name}
            </Text>
            {project.is_bid && (
              <View style={{ backgroundColor: '#3b82f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>BID</Text>
              </View>
            )}
            {project.on_hold && !project.is_bid && (
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
        {active && (isBuilder || isContractor) && (
          <View style={{ justifyContent: 'center', alignItems: 'center', paddingRight: 4 }}>
            {isBuilder && (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setProjectActionMenu(project); }}
                style={{ paddingVertical: 6, paddingHorizontal: 10 }}
                activeOpacity={0.6}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 20, color: C.gd }}>ⓘ</Text>
              </TouchableOpacity>
            )}
            {!project.is_bid && (
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
                <Feather name="eye" size={18} color={clientView ? C.gn : C.gd} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedProject?.id, st, C, isBuilder, isContractor, clientView]);

  const selectSubdivision = (sd) => {
    setSelectedSubdivision(sd);
    setSelectedProject(null);
    setSubdivTab('subs');
    setSdOpenTrade(null);
    setSdTradeAssignments({});
    // Fetch all contractors + existing trade assignments
    setSdSubsLoading(true);
    setSdSubs([]);
    (async () => {
      try {
        const [userRes, assignRes] = await Promise.all([
          apiFetch(`/users${user.company_id ? `?company_id=${user.company_id}` : ''}`),
          apiFetch(`/subdivisions/${sd.id}/contractors`),
        ]);
        const allUsers = await userRes.json();
        if (Array.isArray(allUsers)) {
          setSdSubs(allUsers.filter(u => u.role === 'contractor' || u.role === 'builder' || u.role === 'company_admin'));
        }
        const assignments = await assignRes.json();
        if (Array.isArray(assignments)) {
          const map = {};
          assignments.forEach(a => { map[a.trade] = a.contractor_id; });
          setSdTradeAssignments(map);
        }
      } catch (e) { console.warn('Fetch subdiv subs error:', e); }
      setSdSubsLoading(false);
    })();
  };

  const fetchSubdivisionDocs = async (sid) => {
    setSdDocsLoading(true);
    try {
      const [docsRes, tmplRes] = await Promise.all([
        apiFetch(`/subdivisions/${sid}/documents?type=document`),
        apiFetch(`/document-templates?scope=subdivisions${user.company_id ? `&company_id=${user.company_id}` : ''}`),
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
      const res = await apiFetch(`/users${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const contractors = data.filter(u => u.role === 'contractor' && u.active !== false)
          .sort((a, b) => (a.company_name || a.name || '').localeCompare(b.company_name || b.name || ''));
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
    setSubTaskFilter(null);
    setSubTaskFilterOpen(false);
    try {
      const [projRes, taskRes, empRes] = await Promise.all([
        apiFetch(`/users/${sub.id}/projects`),
        apiFetch(`/users/${sub.id}/tasks?viewer_role=${user?.role || ''}`),
        apiFetch(`/users/${sub.id}/employees`),
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
    apiFetch(`/users/${user.id}/tasks`)
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
    // Phase/Bid filter
    result = result.filter(p => {
      const isBid = !!p.is_bid;
      if (isBid) return showBids;
      const phase = (p.phase || '').toLowerCase();
      if (phase === 'closed') return showClosed;
      return showOpen;
    });
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
  }, [projects, projectSearch, showOpen, showClosed, showBids, sidebarFilter]);

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
        <Feather name="search" size={16} color={C.chromeDm} style={{ marginRight: 6 }} />
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
            <Feather name="x" size={18} color={C.chromeDm} style={{ paddingLeft: 4 }} />
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
          <TouchableOpacity onPress={() => setShowFilterMenu(p => !p)}
            style={{ padding: 6, borderRadius: 6, borderWidth: 1, borderColor: C.sw10, backgroundColor: 'transparent' }}
            activeOpacity={0.7}>
            <Feather name="filter" size={16} color={C.chromeTxt} />
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
              <Feather name={projectSearch.trim() ? 'search' : 'clipboard'} size={48} color={C.dm} style={{ marginBottom: 10 }} />
              <Text style={{ color: C.chromeTxt, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>
                {projectSearch.trim() ? 'No matching projects' : 'No projects yet'}
              </Text>
              <Text style={{ color: C.chromeDm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>
                {projectSearch.trim() ? 'Try a different search' : isBuilder ? 'Tap + to create one' : 'Projects assigned to you will appear here'}
              </Text>
            </View>
          ) : (() => {
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
                        {...(Platform.OS === 'web' && isBuilder ? {} : {})}
                      >
                        {editSubdivId === sd.id ? (
                          <TextInput
                            value={editSubdivName}
                            onChangeText={setEditSubdivName}
                            autoFocus
                            onBlur={() => renameSubdivision(sd.id, editSubdivName)}
                            onSubmitEditing={() => renameSubdivision(sd.id, editSubdivName)}
                            style={{ fontSize: 15, fontWeight: '700', color: sdActive ? C.gd : C.chromeTxt, letterSpacing: 0.5, flex: 1, padding: 0, margin: 0, borderBottomWidth: 1, borderBottomColor: C.gd }}
                          />
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                            <Feather name="folder" size={15} color={sdActive ? C.gd : C.chromeTxt} />
                            <Text style={{ fontSize: 15, fontWeight: '700', color: sdActive ? C.gd : C.chromeTxt, letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>
                              {sd.name.toUpperCase()}
                            </Text>
                          </View>
                        )}
                        {isBuilder && editSubdivId !== sd.id && (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); setEditSubdivId(sd.id); setEditSubdivName(sd.name); }}
                            style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                            activeOpacity={0.6}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          >
                            <Feather name="edit-2" size={14} color={sdActive ? C.gd : C.dm} />
                          </TouchableOpacity>
                        )}
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
      <Feather name="tool" size={72} color={C.dm} style={{ marginBottom: 16 }} />
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
    const tabs = isContractor ? [['docs', 'Docs']] : [['subs', 'Subcontractors'], ['docs', 'Docs']];

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Feather name="folder" size={24} color={C.textBold} />
              <Text style={{ fontSize: 28, fontWeight: '700', color: C.textBold, flex: 1 }} numberOfLines={1}>{selectedSubdivision.name}</Text>
            </View>
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
        {subdivTab === 'subs' && (() => {
          const assignedTrades = builderTrades.filter(t => sdTradeAssignments[t]);
          const unassignedTrades = builderTrades.filter(t => !sdTradeAssignments[t]);

          const handleAssign = async (trade, contractorId) => {
            try {
              const res = await apiFetch(`/subdivisions/${selectedSubdivision.id}/contractors`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trade, contractor_id: contractorId }),
              });
              if (res.ok) {
                setSdTradeAssignments(prev => ({ ...prev, [trade]: contractorId }));
                setSdOpenTrade(null);
              }
            } catch (e) { console.warn('Assign contractor error:', e); }
          };

          const handleRemove = async (trade) => {
            try {
              const res = await apiFetch(`/subdivisions/${selectedSubdivision.id}/contractors/${encodeURIComponent(trade)}`, { method: 'DELETE' });
              if (res.ok) {
                setSdTradeAssignments(prev => { const next = { ...prev }; delete next[trade]; return next; });
              }
            } catch (e) { console.warn('Remove contractor error:', e); }
          };

          const renderTradeRow = (trade, assigned) => {
            const assignedSub = assigned ? sdSubs.find(u => u.id === sdTradeAssignments[trade]) : null;
            const matchingSubs = sdSubs.filter(u => {
              const userTrades = u.trades ? u.trades.split(',').map(t => t.trim().toLowerCase()) : [];
              return userTrades.includes(trade.toLowerCase());
            });
            const isOpen = sdOpenTrade === trade;

            return (
              <View key={trade} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => !assigned && setSdOpenTrade(isOpen ? null : trade)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    padding: 12, backgroundColor: C.card, borderRadius: 10,
                    borderWidth: 1, borderColor: assigned ? C.gd + '40' : (isOpen ? C.gd : C.w08),
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.textBold }}>{trade}</Text>
                    {assignedSub && (
                      <Text style={{ fontSize: 14, color: C.gd, marginTop: 2 }}>
                        {assignedSub.company_name || `${assignedSub.first_name} ${assignedSub.last_name}`}
                      </Text>
                    )}
                  </View>
                  {assigned ? (
                    <TouchableOpacity onPress={() => handleRemove(trade)} style={{ padding: 6 }}>
                      <Feather name="x" size={18} color={C.dm} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: 14, color: C.dm }}>{isOpen ? '▲' : '▼'}</Text>
                  )}
                </TouchableOpacity>
                {!assigned && isOpen && (
                  <View style={{ marginTop: 4, marginLeft: 8, borderLeftWidth: 2, borderLeftColor: C.gd + '30', paddingLeft: 10 }}>
                    {matchingSubs.length === 0 ? (
                      <Text style={{ fontSize: 14, color: C.dm, paddingVertical: 10 }}>No users matched for this trade</Text>
                    ) : (
                      matchingSubs.map(sub => (
                        <TouchableOpacity key={sub.id} activeOpacity={0.7} onPress={() => handleAssign(trade, sub.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 4, backgroundColor: C.bg, borderRadius: 8 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.gd + '20', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.gd }}>
                              {(sub.first_name || '?')[0]}{(sub.last_name || '?')[0]}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: C.textBold }}>
                              {sub.company_name || `${sub.first_name} ${sub.last_name}`}
                            </Text>
                            {sub.company_name ? (
                              <Text style={{ fontSize: 13, color: C.dm }}>{sub.first_name} {sub.last_name}</Text>
                            ) : null}
                          </View>
                          {sub.phone ? <Text style={{ fontSize: 13, color: C.dm }}>{sub.phone}</Text> : null}
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          };

          return (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {sdSubsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator color={C.gd} size="large" />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  {/* Left column — assigned trades */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold, marginBottom: 12 }}>Assigned</Text>
                    {assignedTrades.length === 0 ? (
                      <Text style={{ fontSize: 15, color: C.dm, fontStyle: 'italic' }}>No trades assigned yet</Text>
                    ) : (
                      assignedTrades.map(t => renderTradeRow(t, true))
                    )}
                  </View>
                  {/* Right column — unassigned trades */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold, marginBottom: 12 }}>Needs Selection</Text>
                    {unassignedTrades.length === 0 ? (
                      <Text style={{ fontSize: 15, color: C.gd, fontStyle: 'italic' }}>All trades assigned!</Text>
                    ) : (
                      unassignedTrades.map(t => renderTradeRow(t, false))
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          );
        })()}

        {subdivTab === 'docs' && (() => {
          const openFile = (url) => {
            const full = url.startsWith('http') ? url : `${API_BASE}${url}`;
            if (Platform.OS === 'web') window.open(full, '_blank');
            else Linking.openURL(full);
          };
          const downloadFile = (url, name) => {
            const full = url.startsWith('http') ? url : `${API_BASE}${url}`;
            if (Platform.OS === 'web') {
              const a = document.createElement('a');
              a.href = full;
              a.download = name || 'download';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } else {
              Linking.openURL(full);
            }
          };
          const deleteDoc = async (docId) => {
            try {
              const res = await apiFetch(`/documents/${docId}`, { method: 'DELETE' });
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isBuilder && (
                        <TouchableOpacity onPress={() => setSdDocEditMode(p => !p)}
                          style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: sdDocEditMode ? C.rd + '18' : C.w06,
                            borderWidth: 1, borderColor: sdDocEditMode ? C.rd + '40' : 'transparent',
                          }}
                          activeOpacity={0.7}>
                          <Feather name={sdDocEditMode ? "x" : "edit-2"} size={18} color={sdDocEditMode ? C.rd : C.dm} />
                        </TouchableOpacity>
                      )}
                      {isBuilder && (
                        <TouchableOpacity onPress={() => setSdDocModal('upload')} style={st.addBtn} activeOpacity={0.8}>
                          <Text style={st.addBtnTxt}>+</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {sdDocTemplates.map(tmpl => {
                    const uploads = docsByTemplate[tmpl.id] || [];
                    const hasUpload = uploads.length > 0;
                    return (
                      <View key={tmpl.id} style={{ marginBottom: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w08, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                          <Feather name={tmpl.doc_type === 'folder' ? 'folder' : 'file-text'} size={24} color={C.dm} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{tmpl.name}</Text>
                            <Text style={{ fontSize: 14, color: hasUpload ? C.gn : C.yl, marginTop: 2 }}>
                              {hasUpload ? `${uploads.length} file${uploads.length > 1 ? 's' : ''} uploaded` : 'Not yet uploaded'}
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
                          <TouchableOpacity key={d.id} onPress={() => d.file_url && openFile(d.file_url)} activeOpacity={0.7}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 10,
                              paddingHorizontal: 14, paddingVertical: 10,
                              borderTopWidth: 1, borderTopColor: C.w06,
                              backgroundColor: C.w06 + '40',
                            }}>
                            {sdDocEditMode ? (
                              <TouchableOpacity onPress={(e) => { e.stopPropagation(); deleteDoc(d.id); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
                                <Feather name="x" size={20} color={C.rd} />
                              </TouchableOpacity>
                            ) : (
                              <Feather name="paperclip" size={18} color={C.dm} />
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 17, fontWeight: '500', color: C.text }} numberOfLines={1}>{d.name}</Text>
                              <Text style={{ fontSize: 13, color: C.dm }}>
                                {d.created_at}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.file_size ? ` · ${formatSize(d.file_size)}` : ''}
                              </Text>
                            </View>
                            {d.file_url && !sdDocEditMode ? (
                              <TouchableOpacity onPress={(e) => { e.stopPropagation(); downloadFile(d.file_url, d.name); }}
                                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.bl + '20' }}
                                activeOpacity={0.7}>
                                <Text style={{ fontSize: 16 }}>⬇</Text>
                              </TouchableOpacity>
                            ) : null}
                          </TouchableOpacity>
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
                        <TouchableOpacity key={d.id} onPress={() => d.file_url && openFile(d.file_url)} activeOpacity={0.7}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w08, padding: 14 }}>
                          {sdDocEditMode ? (
                            <TouchableOpacity onPress={(e) => { e.stopPropagation(); deleteDoc(d.id); }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
                              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.rd + '15', alignItems: 'center', justifyContent: 'center' }}>
                                <Feather name="x" size={22} color={C.rd} />
                              </View>
                            </TouchableOpacity>
                          ) : (
                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.w06, alignItems: 'center', justifyContent: 'center' }}>
                              <Feather name="file-text" size={24} color={C.dm} />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>{d.name}</Text>
                            <Text style={{ fontSize: 15, color: C.dm, marginTop: 2 }}>
                              {d.category} · {d.created_at}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.file_size ? ` · ${formatSize(d.file_size)}` : ''}
                            </Text>
                          </View>
                          {d.file_url && !sdDocEditMode ? (
                            <TouchableOpacity onPress={(e) => { e.stopPropagation(); downloadFile(d.file_url, d.name); }}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.bl + '20' }}
                              activeOpacity={0.7}>
                              <Text style={{ fontSize: 16 }}>⬇</Text>
                            </TouchableOpacity>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {sdDocTemplates.length === 0 && sdDocs.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                      <Feather name="folder" size={48} color={C.dm} style={{ marginBottom: 12 }} />
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
          <Feather name={projectSearch.trim() ? 'search' : 'user'} size={48} color={C.dm} style={{ marginBottom: 10 }} />
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
                onPress={() => {
                  const now = Date.now();
                  const last = subLastTapRef.current[sub.id] || 0;
                  subLastTapRef.current[sub.id] = now;
                  if (now - last < 400) {
                    subLastTapRef.current[sub.id] = 0;
                    setSubView(false);
                    setSelectedSub(sub);
                    setSubTab('info');
                    setSubEditing(false);
                    setShowDeleteSub(false);
                    setSubTaskFilter(null);
                    setSubTaskFilterOpen(false);
                    // Fetch sub data
                    Promise.all([
                      apiFetch(`/users/${sub.id}/projects`),
                      apiFetch(`/users/${sub.id}/tasks?viewer_role=${user?.role || ''}`),
                      apiFetch(`/users/${sub.id}/employees`),
                    ]).then(async ([projRes, taskRes, empRes]) => {
                      const projData = await projRes.json();
                      const taskData = await taskRes.json();
                      const empData = await empRes.json();
                      if (Array.isArray(projData)) setSubProjects(projData);
                      if (Array.isArray(taskData)) setSubTasks(taskData);
                      if (Array.isArray(empData)) setEmployees(empData);
                    }).catch(() => {});
                    return;
                  }
                  setSubView(false); selectSub(sub);
                }}
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
                {active && (
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
                    <Feather name="tool" size={18} color={subView ? C.gd : C.dm} />
                  </TouchableOpacity>
                )}
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
        const schedRes = await apiFetch(`/projects/${dr.jobId}/schedule`);
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
            await apiFetch(`/schedule/batch-update`, {
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
          await apiFetch(`/schedule/batch-update`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ id: dr.taskId, start_date: newStart, end_date: newEnd }]),
          });
        }

        // Re-fetch to get server-confirmed data
        const sub = selectedSubRef.current;
        if (sub) {
          const res = await apiFetch(`/users/${sub.id}/tasks?viewer_role=${user?.role || ''}`);
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
      const res = await apiFetch(`/schedule/${task.id}/edit`, {
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
      await apiFetch(`/schedule/${task.id}/edit`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_date: newEnd, reason: subEditReason.trim(), edited_by: editedBy }),
      });
      if (selectedSub) {
        const res = await apiFetch(`/users/${selectedSub.id}/tasks?viewer_role=${user?.role || ''}`);
        const data = await res.json();
        if (Array.isArray(data)) setSubTasks(data);
      }
      closeSubEditPopup();
      setScheduleVersion(v => v + 1);
    } catch (e) { console.warn('Sub edit save failed:', e); setSubEditSaving(false); }
  };

  // Sub change order modal helpers
  const getInitials = (name) => {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0] ? parts[0][0].toUpperCase() : '';
  };

  const closeSubCOModal = () => {
    setSubCOModal(null);
    setSubCOForm({ title: '', desc: '', amount: '', isCredit: false, dueDate: '', signerName: '' });
    setSubCOStep('form');
    setSubCOSubmitting(false);
    setSubCOAttachments([]);
  };

  const pickSubCOAttachment = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop() || 'bin';
      const reader = new FileReader();
      reader.onload = () => {
        setSubCOAttachments(prev => [...prev, {
          b64: reader.result, ext, originalName: file.name, size: file.size,
          docName: file.name.replace(/\.[^/.]+$/, ''), docDesc: '',
        }]);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const submitSubCO = async () => {
    if (!subCOModal) return;
    const { task, project } = subCOModal;
    const { title, desc, amount, isCredit, dueDate, signerName } = subCOForm;
    const amt = isCredit ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    setSubCOSubmitting(true);
    try {
      const body = {
        title, description: desc, due_date: dueDate || null,
        initiated_by: 'sub',
        user_id: user?.id,
        initials: getInitials(signerName.trim()),
        signer_name: signerName.trim(),
        line_items: [{ item_name: title, cost: amt, markup_percent: 0, sub_id: user?.id || null, sub_name: user?.company_name || user?.name || '' }],
        task_id: task.id,
        task_name: task.task || null,
      };
      const res = await apiFetch(`/projects/${project.id}/change-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed to create change order.'); return; }
      const co = await res.json();
      // Upload attachments
      for (const att of subCOAttachments) {
        try {
          const upRes = await apiFetch(`/upload-file`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: att.b64, ext: att.ext, name: att.originalName }),
          });
          if (upRes.ok) {
            const upData = await upRes.json();
            await apiFetch(`/change-orders/${co.id}/documents`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: att.docName, description: att.docDesc,
                file_url: upData.path, file_size: upData.file_size || att.size || 0,
                uploaded_by: user?.name || '',
              }),
            });
          }
        } catch {}
      }
      closeSubCOModal();
      Alert.alert('Success', 'Change order submitted! The builder and customer will be notified to sign.');
    } catch (e) { Alert.alert('Error', e.message); } finally { setSubCOSubmitting(false); }
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
        const schedRes = await apiFetch(`/projects/${dr.jobId}/schedule`);
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
            await apiFetch(`/schedule/batch-update`, {
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
          await apiFetch(`/schedule/batch-update`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ id: dr.taskId, start_date: newStart, end_date: newEnd }]),
          });
        }

        // Re-fetch builder tasks
        if (user?.id) {
          const res = await apiFetch(`/users/${user.id}/tasks`);
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
      await apiFetch(`/schedule/${task.id}/edit`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_date: newEnd, reason: builderEditReason.trim(), edited_by: editedBy }),
      });
      if (user?.id) {
        const res = await apiFetch(`/users/${user.id}/tasks`);
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
          <Feather name="user" size={72} color={C.dm} style={{ marginBottom: 16 }} />
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
        .filter(t => !subTaskFilter || t.task === subTaskFilter)
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
      return items.filter(t => t.start_date === ds).filter(t => !subTaskFilter || t.task === subTaskFilter);
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
                        const res = await apiFetch(`/users/${selectedSub.id}`, { method: 'DELETE' });
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
        {/* Sub Change Order Sign Modal */}
        {subCOSignModal && (
          <Modal visible transparent animationType="fade">
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <View style={{ backgroundColor: C.modalBg, borderRadius: 16, padding: 28, width: '92%', maxWidth: 460,
                borderWidth: 1, borderColor: C.w10,
                ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.4)' } : {}),
              }}>
                <Text style={{ fontSize: 26, fontWeight: '700', color: C.textBold, textAlign: 'center', marginBottom: 6 }}>
                  Sign Change Order
                </Text>
                <Text style={{ fontSize: 20, fontWeight: '600', color: C.gd, textAlign: 'center', marginBottom: 16 }}>
                  {subCOSignModal.title}
                </Text>

                {subCOSignModal.project_name && (
                  <Text style={{ fontSize: 16, color: C.dm, textAlign: 'center', marginBottom: 12 }}>Project: {subCOSignModal.project_name}</Text>
                )}

                {subCOSignModal.description ? (
                  <Text style={{ fontSize: 17, color: C.mt, lineHeight: 26, marginBottom: 14, textAlign: 'center' }}>{subCOSignModal.description}</Text>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: subCOSignModal.amount >= 0 ? '#f59e0b' : '#10b981' }}>
                    {subCOSignModal.amount >= 0 ? '+' : ''}{(() => { const v = Number(subCOSignModal.amount || 0); const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? '-$' + abs : '$' + abs; })()}
                  </Text>
                </View>

                {subCOSignModal.task_name && (
                  <View style={{ backgroundColor: C.w04, borderRadius: 8, padding: 12, marginBottom: 14 }}>
                    <Text style={{ fontSize: 15, color: C.dm }}>Linked Task</Text>
                    <Text style={{ fontSize: 17, fontWeight: '600', color: C.text }}>{subCOSignModal.task_name}</Text>
                    {subCOSignModal.task_extension_days > 0 && (
                      <Text style={{ fontSize: 15, color: '#f59e0b', marginTop: 4 }}>+{subCOSignModal.task_extension_days} day extension will be applied</Text>
                    )}
                  </View>
                )}

                {/* Warning box */}
                <View style={{
                  backgroundColor: 'rgba(239,68,68,0.06)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
                  borderRadius: 10, padding: 16, marginBottom: 20,
                }}>
                  <Text style={{ fontSize: 18, lineHeight: 28, color: C.mt, textAlign: 'center', fontWeight: '500' }}>
                    By signing below, you are agreeing to the terms of this change order. This is a legally binding electronic signature.
                  </Text>
                </View>

                {/* Signature line */}
                <View style={{ borderBottomWidth: 2, borderBottomColor: C.w15, marginBottom: 6, paddingBottom: 2 }}>
                  <Text style={{ fontSize: 20, color: C.text, fontWeight: '600' }}>
                    {selectedSub?.company_name || selectedSub?.name || 'Signature'}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: C.dm, marginBottom: 24 }}>Electronic Signature</Text>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => setSubCOSignModal(null)}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}
                    activeOpacity={0.7}>
                    <Text style={{ fontSize: 20, fontWeight: '600', color: C.mt }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        const res = await apiFetch(`/change-orders/${subCOSignModal.id}/sign`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ role: 'sub', user_id: user?.id }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          Alert.alert('Cannot Sign', data.error || 'Request failed');
                        } else {
                          setSubChangeOrders(prev => prev.map(c => c.id === subCOSignModal.id ? { ...c, ...data } : c));
                          Alert.alert('Signed', 'Change order signed successfully');
                        }
                        setSubCOSignModal(null);
                      } catch (e) {
                        Alert.alert('Error', e.message || 'Failed to sign');
                        setSubCOSignModal(null);
                      }
                    }}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: C.gd, alignItems: 'center' }}
                    activeOpacity={0.8}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Sign & Submit</Text>
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
              <Feather name="tool" size={18} color={C.gd} />
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
          {[['calendar', 'Calendar'], ['info', 'Info'], ['changeorders', 'Change Orders']].map(([id, label]) => {
            const active = subTab === id;
            return (
            <TouchableOpacity
              key={id}
              onPress={() => {
                setSubTab(id);
                if (id === 'changeorders' && selectedSub) {
                  setSubCOLoading(true);
                  apiFetch(`/users/${selectedSub.id}/change-orders`)
                    .then(r => r.json())
                    .then(data => { if (Array.isArray(data)) setSubChangeOrders(data); })
                    .catch(() => {})
                    .finally(() => setSubCOLoading(false));
                }
              }}
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

        {subTab === 'changeorders' ? (
          /* ---- CHANGE ORDERS TAB ---- */
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold, marginBottom: 16 }}>Change Orders</Text>
            {subCOLoading ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, color: C.dm }}>Loading...</Text>
              </View>
            ) : subChangeOrders.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Feather name="file-text" size={40} color={C.dm} style={{ marginBottom: 8 }} />
                <Text style={{ fontSize: 17, color: C.dm }}>No change orders involving this subcontractor</Text>
              </View>
            ) : subChangeOrders.map(co => {
              const isExpired = co.due_date && new Date(co.due_date + 'T23:59:59') < new Date();
              const needsSig = co.sub_id && !co.sub_sig && co.status !== 'approved' && co.status !== 'expired';
              return (
                <TouchableOpacity key={co.id}
                  onPress={() => { if (needsSig) setSubCOSignModal(co); }}
                  style={{ backgroundColor: C.w04, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1,
                    borderColor: needsSig ? C.yl + '60' : C.w08,
                  }}
                  activeOpacity={needsSig ? 0.7 : 1}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Text style={{ fontSize: 19, fontWeight: '600', color: C.text, flex: 1 }} numberOfLines={2}>{co.title}</Text>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginLeft: 8,
                      backgroundColor: co.status === 'approved' ? 'rgba(16,185,129,0.12)'
                        : co.status === 'expired' ? 'rgba(239,68,68,0.12)'
                        : co.status === 'pending_sub' ? 'rgba(59,130,246,0.12)'
                        : 'rgba(245,158,11,0.12)',
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700',
                        color: co.status === 'approved' ? '#10b981'
                          : co.status === 'expired' ? '#ef4444'
                          : co.status === 'pending_sub' ? '#3b82f6' : '#f59e0b',
                      }}>{co.status === 'approved' ? 'Approved' : co.status === 'expired' ? 'Expired' : co.status === 'pending_sub' ? 'Awaiting Your Signature' : 'Pending'}</Text>
                    </View>
                  </View>
                  {co.project_name && (
                    <Text style={{ fontSize: 15, color: C.dm, marginBottom: 4 }}>{co.project_name}</Text>
                  )}
                  {co.description ? (
                    <Text style={{ fontSize: 16, color: C.mt, marginBottom: 8 }} numberOfLines={2}>{co.description}</Text>
                  ) : null}
                  {co.task_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, color: C.dm }}>Task:</Text>
                      <Text style={{ fontSize: 15, fontWeight: '500', color: C.text }}>{co.task_name}</Text>
                      {co.task_extension_days > 0 && (
                        <Text style={{ fontSize: 14, color: C.yl }}>+{co.task_extension_days}d</Text>
                      )}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, color: C.dm }}>Created {(() => { try { return new Date(co.created_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return co.created_at; } })()}</Text>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: co.amount >= 0 ? '#f59e0b' : '#10b981' }}>
                      {co.amount >= 0 ? '+' : ''}{(() => { const v = Number(co.amount || 0); const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? '-$' + abs : '$' + abs; })()}
                    </Text>
                  </View>
                  {/* Signature status */}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                    {[['Builder', co.builder_sig], ['Customer', co.customer_sig], ['You', co.sub_sig]].map(([label, signed]) => (
                      <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                          borderColor: signed ? '#10b981' : C.w15,
                          backgroundColor: signed ? '#10b981' : 'transparent',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {signed && <Feather name="check" size={12} color="#fff" />}
                        </View>
                        <Text style={{ fontSize: 15, color: C.mt }}>{label}</Text>
                      </View>
                    ))}
                  </View>
                  {needsSig && (
                    <View style={{ backgroundColor: C.yl + '15', borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: C.yl + '30' }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#f59e0b', textAlign: 'center' }}>Your signature is required — tap to review & sign</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : subTab === 'info' ? (
          /* ---- INFO TAB ---- */
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Two-column layout: Info card + Assigned Projects */}
            <View style={isWide ? { flexDirection: 'row', gap: 16, alignItems: 'flex-start' } : {}}>
            {/* Sub header card */}
            <View style={[st.subDetailCard, isWide && { flex: 1 }]}>
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
                    <Feather name={subEditing ? "x" : "edit-2"} size={20} color={subEditing ? C.rd : C.dm} />
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
                      <Text style={st.subInfoLabel}>Email</Text>
                      <Text style={st.subInfoVal}>{selectedSub.username}</Text>
                    </View>
                  )}
                  {selectedSub.phone && (
                    <View style={st.subInfoRow}>
                      <Text style={st.subInfoLabel}>Phone</Text>
                      <Text style={st.subInfoVal}>{fPhone(selectedSub.phone)}</Text>
                    </View>
                  )}
                  {(selectedSub.street_address || selectedSub.city || selectedSub.state) && (
                    <View style={st.subInfoRow}>
                      <Text style={st.subInfoLabel}>Address</Text>
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
                    {builderTrades.concat(tradesArr.filter(t => !builderTrades.includes(t))).map(trade => {
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
                        const res = await apiFetch(`/users/${selectedSub.id}`, {
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Feather name="trash-2" size={18} color={C.rd} /><Text style={{ fontSize: 20, fontWeight: '600', color: C.rd }}>Delete Subcontractor</Text></View>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Assigned Projects */}
            <View style={[st.subDetailCard, isWide && { flex: 1 }]}>
              <Text style={st.subCardTitle}>Assigned Projects</Text>
              {subProjects.length === 0 ? (
                <Text style={{ color: C.dm, fontSize: 20, paddingVertical: 12 }}>No projects assigned</Text>
              ) : (
                <ScrollView style={{ maxHeight: 600 }} nestedScrollEnabled>
                {[...subProjects].sort((a, b) => {
                  const da = a.date ? new Date(a.date) : new Date(0);
                  const db = b.date ? new Date(b.date) : new Date(0);
                  return db - da;
                }).map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={st.subProjectRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      const proj = projects.find(pr => pr.id === p.id) || p;
                      if (isContractor) {
                        setContractorProject(proj);
                        setActiveTab('info');
                        setActiveSub('specifications');
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
                ))}
                </ScrollView>
              )}
            </View>
            </View>{/* end two-column */}

            {/* Stats row */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
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

            {/* Assigned Tasks — builder only */}
            {isBuilder && (
            <View style={[st.subDetailCard, { marginTop: 14 }]}>
              <Text style={st.subCardTitle}>Assigned Tasks</Text>
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
            )}

            {/* Employees — builder only */}
            {isBuilder && (
            <View style={[st.subDetailCard, { marginTop: 14, marginBottom: 20 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={st.subCardTitle}>Employees</Text>
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
                      {!!emp.phone && <Text style={{ fontSize: 15, color: C.dm, marginTop: 1 }}>{fPhone(emp.phone)}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => { setShowAddEmployee(true); setEditingEmpId(emp.id); setEmpName(emp.name); setEmpJob(emp.job_description || ''); setEmpPhone(emp.phone || ''); }}
                      style={{ padding: 6 }} activeOpacity={0.6}>
                      <Feather name="edit-2" size={16} color={C.dm} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={async () => {
                      const ok = Platform.OS === 'web' ? window.confirm(`Remove ${emp.name}?`) : await new Promise(r => Alert.alert('Remove', `Remove ${emp.name}?`, [{ text: 'Cancel', onPress: () => r(false) }, { text: 'Remove', style: 'destructive', onPress: () => r(true) }]));
                      if (!ok) return;
                      try { await apiFetch(`/employees/${emp.id}`, { method: 'DELETE' }); setEmployees(prev => prev.filter(e => e.id !== emp.id)); } catch (e) {}
                    }} style={{ padding: 6 }} activeOpacity={0.6}>
                      <Feather name="x" size={16} color={C.rd} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
            )}
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

            {/* Company name + filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 2, paddingHorizontal: 12 }}>
              <View style={{ width: 36 }} />
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold, flex: 1, textAlign: 'center' }}>{selectedSub?.company_name || selectedSub?.name || ''}</Text>
              <TouchableOpacity
                onPress={() => setSubTaskFilterOpen(p => !p)}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: subTaskFilter ? C.bH12 : C.w06,
                  borderWidth: 1, borderColor: subTaskFilter ? C.gd + '40' : 'transparent',
                }}
                activeOpacity={0.7}
              >
                <Feather name="search" size={18} color={subTaskFilter ? C.gd : C.dm} />
              </TouchableOpacity>
            </View>

            {/* Task name filter dropdown */}
            {subTaskFilterOpen && (() => {
              const uniqueTasks = [...new Set(subTasks.map(t => t.task).filter(Boolean))].sort();
              return (
                <View style={{ marginHorizontal: 12, marginBottom: 8, backgroundColor: C.w04, borderRadius: 10, borderWidth: 1, borderColor: C.w08, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 0.8 }}>FILTER BY TASK</Text>
                    {subTaskFilter && (
                      <TouchableOpacity onPress={() => { setSubTaskFilter(null); setSubTaskFilterOpen(false); }} activeOpacity={0.7}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl }}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={{ maxHeight: 240 }}>
                    {uniqueTasks.length === 0 ? (
                      <View style={{ padding: 16, alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, color: C.dm }}>No tasks found</Text>
                      </View>
                    ) : uniqueTasks.map(name => {
                      const isActive = subTaskFilter === name;
                      const count = subTasks.filter(t => t.task === name).length;
                      return (
                        <TouchableOpacity key={name}
                          onPress={() => { setSubTaskFilter(isActive ? null : name); setSubTaskFilterOpen(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.w04,
                            backgroundColor: isActive ? C.bH12 : 'transparent',
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 16, fontWeight: isActive ? '700' : '500', color: isActive ? C.gd : C.text, flex: 1 }} numberOfLines={1}>{name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 13, color: C.dm }}>{count}</Text>
                            {isActive && <Feather name="check" size={14} color={C.gd} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

            {/* Active filter badge */}
            {subTaskFilter && !subTaskFilterOpen && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}>
                <TouchableOpacity
                  onPress={() => setSubTaskFilter(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: C.bH12, borderWidth: 1, borderColor: C.gd + '40' }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gd }} numberOfLines={1}>{subTaskFilter}</Text>
                  <Text style={{ fontSize: 16, color: C.gd, fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Month nav */}
            <View style={st.subCalNav}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={goToday} style={st.subCalTodayBtn} activeOpacity={0.7}>
                  <Text style={st.subCalTodayTxt}>Today</Text>
                </TouchableOpacity>
                {Object.keys(projectColors).length > 0 && (
                  <TouchableOpacity onPress={() => setShowSubCalLegend(v => !v)} style={[st.subCalTodayBtn, showSubCalLegend && { backgroundColor: C.bl + '18', borderColor: C.bl + '40' }]} activeOpacity={0.7}>
                    <Text style={[st.subCalTodayTxt, showSubCalLegend && { color: C.bl }]}>Key</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity onPress={prevMonth} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>‹</Text></TouchableOpacity>
                <Text style={st.subCalNavTitle}>{monNames[calMon]} {calYear}</Text>
                <TouchableOpacity onPress={nextMonth} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>›</Text></TouchableOpacity>
              </View>
              <View style={{ flex: 1 }} />
            </View>
            {showSubCalLegend && Object.keys(projectColors).length > 0 && (
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
                const laneH = 50;
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
                        const isOnHold = task.on_hold;
                        const isHighlight = isExc || isOnHold;
                        const highlightColor = isOnHold ? C.rd : (isExc ? C.og : null);

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
                              borderColor: isHighlight ? highlightColor : pColor, opacity: isDragged ? 0.7 : 1,
                            },
                            isHighlight && { backgroundColor: highlightColor, borderColor: highlightColor },
                            !isHighlight && !isLive && { backgroundColor: C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)' },
                            isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed' },
                            Platform.OS === 'web' ? { cursor: 'pointer' } : {},
                            ]}
                            {...(Platform.OS === 'web' && isBuilder && !subView ? {
                              onPointerDown: (e) => subHandleDragStart(task, e),
                            } : {})}
                          >
                            <View style={{ flex: 1, justifyContent: 'center' }}>
                              <Text style={[st.subCalTaskTxt, isHighlight && { color: '#fff' }]} numberOfLines={1}>{task.task || 'Untitled'}</Text>
                              <Text style={[st.subCalTaskTxtSub, isHighlight && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>{task.project_name || 'Unknown'}</Text>
                            </View>
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
                const rowMinH = Math.max(125, 48 + maxTasks * 95);

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
                            const isOnHold = task.on_hold;
                            const isHighlight = isExc || isOnHold;
                            const highlightColor = isOnHold ? C.rd : (isExc ? C.og : null);

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
                                  backgroundColor: isHighlight ? highlightColor : (!isLive ? (C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)') : (C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04)),
                                  borderRadius: 6, borderLeftWidth: 5, borderLeftColor: isHighlight ? highlightColor : pColor,
                                  opacity: isDragged ? 0.7 : 1,
                                },
                                Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } : {},
                                isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed', borderLeftWidth: 2 },
                                ]}
                                {...(Platform.OS === 'web' && isBuilder && !subView ? {
                                  onPointerDown: (e) => subHandleDragStart(task, e),
                                } : {})}
                              >
                                <Text style={{ fontSize: 14, fontWeight: '700', color: isHighlight ? '#fff' : C.text, textDecorationLine: isComplete ? 'line-through' : 'none' }} numberOfLines={1}>
                                  {task.task || 'Untitled'}
                                </Text>
                                <Text style={{ fontSize: 16, fontWeight: '600', color: isHighlight ? 'rgba(255,255,255,0.9)' : C.text, lineHeight: 22 }} numberOfLines={1}>
                                  {task.project_name || 'Unknown'}
                                </Text>
                                <Text style={{ fontSize: 13, color: isHighlight ? 'rgba(255,255,255,0.7)' : C.dm, fontWeight: '500' }}>→ {subShortDate(task.end_date)}</Text>
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
                    {!isContractor && (
                      <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'schedule', 'calendar')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                        <Feather name="calendar" size={20} color={C.text} />
                        <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Job Schedule</Text>
                        <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                      </TouchableOpacity>
                    )}
                    {!isContractor && (
                      <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'schedule', 'list')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                        <Feather name="list" size={20} color={C.text} />
                        <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Job Schedule Report</Text>
                        <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'info', 'specifications')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                      <Feather name="clipboard" size={20} color={C.text} />
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Job Specifications</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => taskActionNav(taskActionPopup.project, 'docs', 'documents')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                      <Feather name="file-text" size={20} color={C.text} />
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Documents</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                        const { task, project } = taskActionPopup;
                        closeTaskActionPopup();
                        setSubCOModal({ task, project });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: taskActionPopup.project.subdivision_id ? 1 : 0, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                      <Feather name="edit-3" size={20} color={C.text} />
                      <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>Make a Change Order</Text>
                      <Text style={{ marginLeft: 'auto', fontSize: 18, color: C.dm }}>›</Text>
                    </TouchableOpacity>
                    {taskActionPopup.project.subdivision_id && (
                      <TouchableOpacity onPress={() => {
                        const sd = subdivisions.find(s => s.id === taskActionPopup.project.subdivision_id);
                        if (sd) {
                          closeTaskActionPopup();
                          if (isContractor) { setContractorProject(null); }
                          setDashView('projects');
                          setSelectedProject(null);
                          selectSubdivision(sd);
                          setSubdivTab('docs');
                        }
                      }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }} activeOpacity={0.7}>
                        <Feather name="folder" size={20} color={C.text} />
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

            {/* Sub Change Order Modal */}
            {subCOModal && (
              <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={closeSubCOModal} />
                <View style={{ width: 420, maxHeight: '90%', zIndex: 1101, backgroundColor: C.modalBg, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden',
                  ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w08, backgroundColor: C.w03 }}>
                    <Text style={{ fontSize: 21, fontWeight: '700', color: C.textBold }}>{subCOStep === 'sign' ? 'Sign Change Order' : 'New Change Order'}</Text>
                    <TouchableOpacity onPress={closeSubCOModal} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.w06 }}>
                      <Text style={{ fontSize: 24, color: C.mt, marginTop: -1 }}>×</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ maxHeight: 600 }} keyboardShouldPersistTaps="handled">
                    <View style={{ padding: 16 }}>
                      {subCOStep === 'sign' ? (
                        <>
                          {/* Sign step — review & sign */}
                          <View style={{ backgroundColor: C.w04, borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.w08 }}>
                            <Text style={{ fontSize: 20, fontWeight: '600', color: C.text, marginBottom: 4 }}>{subCOForm.title}</Text>
                            <Text style={{ fontSize: 17, color: C.mt, marginBottom: 8 }}>{subCOForm.desc}</Text>
                            <Text style={{ fontSize: 24, fontWeight: '700', color: subCOForm.isCredit ? C.gn : '#f59e0b' }}>
                              {subCOForm.isCredit ? '-' : '+'}{(() => { const v = Math.abs(parseFloat(subCOForm.amount) || 0); return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }); })()}
                            </Text>
                            <Text style={{ fontSize: 15, color: C.dm, marginTop: 6 }}>Task: {subCOModal.task.task}</Text>
                          </View>
                          <View style={{ backgroundColor: '#f59e0b10', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#f59e0b30' }}>
                            <Text style={{ fontSize: 16, color: '#f59e0b', fontWeight: '500' }}>
                              By signing below, you are electronically signing this change order as the subcontractor. The builder and customer will also need to sign.
                            </Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 6 }}>TYPE YOUR FULL NAME TO SIGN</Text>
                          <TextInput
                            value={subCOForm.signerName}
                            onChangeText={(v) => setSubCOForm(p => ({ ...p, signerName: v }))}
                            placeholder="e.g., John Smith"
                            placeholderTextColor={C.ph || C.dm}
                            autoFocus
                            style={{ backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.bd, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: C.text, marginBottom: 4 }}
                          />
                          {subCOForm.signerName.trim() ? (
                            <Text style={{ fontSize: 16, color: C.dm, marginBottom: 14 }}>Initials: {getInitials(subCOForm.signerName.trim())}</Text>
                          ) : <View style={{ marginBottom: 14 }} />}
                          <TouchableOpacity onPress={submitSubCO} disabled={subCOSubmitting || !subCOForm.signerName.trim()}
                            style={{ backgroundColor: subCOForm.signerName.trim() ? C.gn : C.w10, paddingVertical: 14, borderRadius: 10, alignItems: 'center', opacity: subCOForm.signerName.trim() ? 1 : 0.5 }} activeOpacity={0.8}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: subCOForm.signerName.trim() ? '#fff' : C.dm }}>
                              {subCOSubmitting ? 'Submitting...' : 'Sign & Submit'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          {/* Form step */}
                          {/* Linked Task (read-only) */}
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 6 }}>LINKED TASK</Text>
                          <View style={{ backgroundColor: C.w04, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.gd + '40' }}>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>{subCOModal.task.task}</Text>
                            {subCOModal.task.start_date && subCOModal.task.end_date && (
                              <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>{subCOModal.task.start_date} — {subCOModal.task.end_date}</Text>
                            )}
                          </View>

                          {/* Title */}
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 6 }}>TITLE</Text>
                          <TextInput
                            value={subCOForm.title}
                            onChangeText={(v) => setSubCOForm(p => ({ ...p, title: v }))}
                            placeholder="e.g., Additional framing labor"
                            placeholderTextColor={C.ph || C.dm}
                            style={{ backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.bd, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: C.text, marginBottom: 14 }}
                          />

                          {/* Description */}
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 6 }}>DESCRIPTION</Text>
                          <TextInput
                            value={subCOForm.desc}
                            onChangeText={(v) => setSubCOForm(p => ({ ...p, desc: v }))}
                            placeholder="Describe the change..."
                            placeholderTextColor={C.ph || C.dm}
                            multiline
                            numberOfLines={3}
                            style={{ backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.bd, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: C.text, marginBottom: 14, minHeight: 80, textAlignVertical: 'top' }}
                          />

                          {/* Amount + Type */}
                          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 6 }}>AMOUNT ($)</Text>
                              <TextInput
                                value={subCOForm.amount}
                                onChangeText={(v) => setSubCOForm(p => ({ ...p, amount: v }))}
                                placeholder="0"
                                placeholderTextColor={C.ph || C.dm}
                                keyboardType="numeric"
                                style={{ backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.bd, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: C.text }}
                              />
                            </View>
                            <View>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 6 }}>TYPE</Text>
                              <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.bd }}>
                                <TouchableOpacity onPress={() => setSubCOForm(p => ({ ...p, isCredit: false }))}
                                  style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: !subCOForm.isCredit ? '#f59e0b22' : 'transparent' }}>
                                  <Text style={{ fontSize: 16, fontWeight: '600', color: !subCOForm.isCredit ? '#f59e0b' : C.dm }}>Add</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setSubCOForm(p => ({ ...p, isCredit: true }))}
                                  style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: subCOForm.isCredit ? (C.gn + '22') : 'transparent' }}>
                                  <Text style={{ fontSize: 16, fontWeight: '600', color: subCOForm.isCredit ? C.gn : C.dm }}>Credit</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>

                          {/* Attachments */}
                          <View style={{ marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8 }}>DOCUMENTS (OPTIONAL)</Text>
                              <TouchableOpacity onPress={pickSubCOAttachment}
                                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7, backgroundColor: C.gd }} activeOpacity={0.7}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#000' }}>+ Add File</Text>
                              </TouchableOpacity>
                            </View>
                            {subCOAttachments.map((att, idx) => (
                              <View key={idx} style={{ backgroundColor: C.w04, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.w08 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <Feather name="paperclip" size={18} color={C.dm} />
                                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: C.text }} numberOfLines={1}>{att.originalName}</Text>
                                  <TouchableOpacity onPress={() => setSubCOAttachments(prev => prev.filter((_, i) => i !== idx))} activeOpacity={0.6}>
                                    <Feather name="x" size={16} color={C.rd} />
                                  </TouchableOpacity>
                                </View>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 4 }}>NAME</Text>
                                <TextInput value={att.docName}
                                  onChangeText={(v) => setSubCOAttachments(prev => prev.map((a, i) => i === idx ? { ...a, docName: v } : a))}
                                  placeholder="Document name" placeholderTextColor={C.ph || C.dm}
                                  style={{ backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.bd, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text, marginBottom: 8 }} />
                                <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.8, marginBottom: 4 }}>DESCRIPTION</Text>
                                <TextInput value={att.docDesc}
                                  onChangeText={(v) => setSubCOAttachments(prev => prev.map((a, i) => i === idx ? { ...a, docDesc: v } : a))}
                                  placeholder="Brief description..." placeholderTextColor={C.ph || C.dm} multiline numberOfLines={2}
                                  style={{ backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.bd, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text, minHeight: 50, textAlignVertical: 'top' }} />
                              </View>
                            ))}
                            {subCOAttachments.length === 0 && (
                              <Text style={{ fontSize: 14, color: C.dm, textAlign: 'center', paddingVertical: 6 }}>No documents attached</Text>
                            )}
                          </View>

                          {/* Due Date */}
                          <DatePicker value={subCOForm.dueDate} onChange={(v) => setSubCOForm(p => ({ ...p, dueDate: v }))} label="DUE DATE" placeholder="Select due date" />

                          {/* Submit */}
                          <TouchableOpacity onPress={() => {
                              if (!subCOForm.title || !subCOForm.amount) return Alert.alert('Error', 'Title and amount are required');
                              setSubCOStep('sign');
                            }}
                            disabled={!subCOForm.title || !subCOForm.amount}
                            style={{ backgroundColor: (subCOForm.title && subCOForm.amount) ? C.gd : C.w10, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 6, opacity: (subCOForm.title && subCOForm.amount) ? 1 : 0.5 }} activeOpacity={0.8}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: (subCOForm.title && subCOForm.amount) ? '#000' : C.dm }}>Sign & Submit</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </ScrollView>
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="folder" size={16} color={active ? C.gd : C.text} />
                          <Text style={{ fontSize: 18, fontWeight: active ? '700' : '500', color: active ? C.gd : C.text }}>{sd.name}</Text>
                        </View>
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

      {/* Filter Menu (Open / Closed / Bid) */}
      {showFilterMenu && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowFilterMenu(false)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 240, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.35)' } : { elevation: 20 }) }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Show</Text>
                </View>
                {[
                  { key: 'open', label: 'Open', value: showOpen, toggle: setShowOpen, color: '#10b981' },
                  { key: 'closed', label: 'Closed', value: showClosed, toggle: setShowClosed, color: '#ef4444' },
                  { key: 'bid', label: 'Bids', value: showBids, toggle: setShowBids, color: '#3b82f6' },
                ].map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => opt.toggle(p => !p)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: opt.value ? opt.color : C.w15, backgroundColor: opt.value ? opt.color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {opt.value && <Feather name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={{ fontSize: 17, fontWeight: opt.value ? '600' : '400', color: opt.value ? C.text : C.dm }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Project Action Menu (ⓘ button) */}
      {projectActionMenu && !showDeleteConfirm && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setProjectActionMenu(null)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 260, backgroundColor: C.cardBg || C.card, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.35)' } : { elevation: 20 }) }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }} numberOfLines={1}>{projectActionMenu.name}</Text>
                </View>
                {!projectActionMenu.is_bid && (projectActionMenu.on_hold ? (
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
                ))}
                {!projectActionMenu.is_bid && (
                  <TouchableOpacity onPress={() => projectActionMenu.go_live ? openExceptionModal(projectActionMenu) : null}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06, opacity: projectActionMenu.go_live ? 1 : 0.4 }} activeOpacity={0.7}>
                    <Feather name="alert-triangle" size={20} color={C.yl || '#f59e0b'} />
                    <Text style={{ fontSize: 18, fontWeight: '500', color: C.text }}>Exception</Text>
                    {!projectActionMenu.go_live && <Text style={{ fontSize: 13, color: C.dm, marginLeft: 'auto' }}>Requires Go Live</Text>}
                  </TouchableOpacity>
                )}
                {!projectActionMenu.is_bid && (
                  <TouchableOpacity onPress={() => {
                    const proj = projectActionMenu;
                    setShowClientTaskModal(proj); setProjectActionMenu(null);
                    setCtTitle(''); setCtDescription(''); setCtDueDate(''); setCtImageB64('');
                    setCtLinkedTaskId(null); setCtLinkedDateType('end'); setCtShowTaskPicker(false); setCtScheduleTasks([]);
                    // Fetch schedule tasks for this project
                    apiFetch(`/projects/${proj.id}/schedule`).then(r => r.json()).then(data => {
                      if (Array.isArray(data)) setCtScheduleTasks(data.filter(t => !t.is_exception));
                    }).catch(() => {});
                  }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                    <Feather name="check-square" size={20} color={C.bl} />
                    <Text style={{ fontSize: 18, fontWeight: '500', color: C.text }}>Make Client Task</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setShowDeleteConfirm(projectActionMenu); setProjectActionMenu(null); setDeleteConfirmName(''); setDeletingProject(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 }} activeOpacity={0.7}>
                  <Feather name="trash-2" size={20} color={C.rd} />
                  <Text style={{ fontSize: 18, fontWeight: '500', color: C.rd }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Hold Reason Modal */}
      {holdReasonModal && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1}
            onPress={() => { if (!holdSubmitting) { setHoldReasonModal(null); setHoldReasonText(''); } }}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 380, backgroundColor: C.cardBg || C.card, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.4)' } : { elevation: 20 }) }}>
                <View style={{ padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>⏸</Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#f59e0b' }}>Put On Hold</Text>
                  <Text style={{ fontSize: 15, color: C.dm, marginTop: 4, textAlign: 'center' }}>{holdReasonModal.name}</Text>
                </View>
                <View style={{ padding: 18 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 8 }}>REASON FOR HOLD</Text>
                  <TextInput
                    value={holdReasonText}
                    onChangeText={setHoldReasonText}
                    placeholder="Enter reason for putting this project on hold..."
                    placeholderTextColor={C.w20}
                    multiline
                    numberOfLines={3}
                    style={{ fontSize: 16, color: C.text, backgroundColor: C.w04, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.w10, minHeight: 80, textAlignVertical: 'top' }}
                    autoFocus
                  />
                  <Text style={{ fontSize: 12, color: C.dm, marginTop: 6 }}>
                    Tasks will be extended and pushed back for each day the hold is active.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, padding: 18, paddingTop: 0 }}>
                  <TouchableOpacity
                    onPress={() => { setHoldReasonModal(null); setHoldReasonText(''); }}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.w12 }}
                    activeOpacity={0.7} disabled={holdSubmitting}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.dm }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => submitProjectHold(holdReasonModal, holdReasonText.trim())}
                    disabled={!holdReasonText.trim() || holdSubmitting}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f59e0b', opacity: !holdReasonText.trim() || holdSubmitting ? 0.5 : 1 }}
                    activeOpacity={0.8}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                      {holdSubmitting ? 'Saving...' : 'Put On Hold'}
                    </Text>
                  </TouchableOpacity>
                </View>
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
                  <Feather name="alert-triangle" size={42} color={C.rd} style={{ marginBottom: 10 }} />
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

      {/* Client Task Creation Modal */}
      {showClientTaskModal && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1}
            onPress={() => { if (!ctSaving) { setShowClientTaskModal(null); setCtTitle(''); setCtDescription(''); setCtDueDate(''); setCtImageB64(''); setCtLinkedTaskId(null); setCtLinkedDateType('end'); setCtScheduleTasks([]); setCtShowTaskPicker(false); } }}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 420, backgroundColor: C.cardBg || C.card, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.4)' } : { elevation: 20 }) }}>
                <View style={{ padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <Feather name="check-square" size={28} color={C.bl} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>New Client Task</Text>
                  <Text style={{ fontSize: 15, color: C.dm, marginTop: 4, textAlign: 'center' }}>{showClientTaskModal.name}</Text>
                </View>
                <View style={{ padding: 18 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 8 }}>TITLE</Text>
                  <TextInput
                    value={ctTitle}
                    onChangeText={setCtTitle}
                    placeholder="Task title..."
                    placeholderTextColor={C.w20}
                    style={{ fontSize: 16, color: C.text, backgroundColor: C.w04, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.w10, marginBottom: 14 }}
                    autoFocus
                  />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 8 }}>IMAGE (OPTIONAL)</Text>
                  {ctImageB64 ? (
                    <View style={{ marginBottom: 14 }}>
                      <Image source={{ uri: ctImageB64 }} style={{ width: '100%', height: 180, borderRadius: 8, resizeMode: 'cover' }} />
                      <TouchableOpacity onPress={() => setCtImageB64('')}
                        style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="x" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={pickClientTaskImage} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.w10, borderStyle: 'dashed', marginBottom: 14 }}>
                      <Feather name="image" size={18} color={C.dm} />
                      <Text style={{ fontSize: 15, color: C.dm }}>Add an image</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 8 }}>DESCRIPTION</Text>
                  <TextInput
                    value={ctDescription}
                    onChangeText={setCtDescription}
                    placeholder="Describe what the client needs to do..."
                    placeholderTextColor={C.w20}
                    multiline
                    numberOfLines={3}
                    style={{ fontSize: 16, color: C.text, backgroundColor: C.w04, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.w10, minHeight: 80, textAlignVertical: 'top', marginBottom: 14 }}
                  />
                  <DatePicker value={ctDueDate} onChange={v => { setCtDueDate(v); if (v) { setCtLinkedTaskId(null); } }} label="DUE DATE" placeholder="Select due date" />

                  {/* Link to Schedule Task */}
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 8 }}>LINK TO SCHEDULE TASK</Text>
                    {ctLinkedTaskId ? (() => {
                      const linked = ctScheduleTasks.find(t => t.id === ctLinkedTaskId);
                      return (
                        <View style={{ backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', borderRadius: 8, padding: 12, gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name="link" size={14} color="#a78bfa" />
                                <Text style={{ fontSize: 16, fontWeight: '600', color: '#a78bfa' }} numberOfLines={1}>{linked?.task || 'Unknown task'}</Text>
                              </View>
                              <Text style={{ fontSize: 13, color: C.dm, marginTop: 2 }}>
                                Due date will sync with {ctLinkedDateType === 'start' ? 'start' : 'end'} date
                                {linked ? ` (${ctLinkedDateType === 'start' ? linked.start_date : linked.end_date})` : ''}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => { setCtLinkedTaskId(null); }} style={{ padding: 4 }}>
                              <Feather name="x" size={16} color={C.rd} />
                            </TouchableOpacity>
                          </View>
                          {/* Start / End toggle */}
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {['start', 'end'].map(dt => (
                              <TouchableOpacity key={dt} onPress={() => {
                                setCtLinkedDateType(dt);
                                const s = ctScheduleTasks.find(t => t.id === ctLinkedTaskId);
                                if (s) setCtDueDate(dt === 'start' ? s.start_date : s.end_date);
                              }}
                                style={{ flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center',
                                  backgroundColor: ctLinkedDateType === dt ? 'rgba(139,92,246,0.2)' : C.w04,
                                  borderWidth: 1, borderColor: ctLinkedDateType === dt ? 'rgba(139,92,246,0.4)' : C.w08,
                                }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: ctLinkedDateType === dt ? '#a78bfa' : C.dm }}>
                                  {dt === 'start' ? 'Start Date' : 'End Date'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      );
                    })() : (
                      <View>
                        <TouchableOpacity
                          onPress={() => setCtShowTaskPicker(p => !p)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.w04, borderRadius: 8, borderWidth: 1, borderColor: C.w10 }}
                          activeOpacity={0.7}
                        >
                          <Feather name="link" size={16} color={C.dm} />
                          <Text style={{ fontSize: 15, color: C.dm, flex: 1 }}>Link due date to a schedule task</Text>
                          <Text style={{ fontSize: 13, color: C.dm }}>{ctShowTaskPicker ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {ctShowTaskPicker && (
                          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: C.w06, overflow: 'hidden', maxHeight: 200, marginTop: 6 }}>
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                              {ctScheduleTasks.length === 0 ? (
                                <View style={{ padding: 14, alignItems: 'center' }}>
                                  <Text style={{ fontSize: 14, color: C.dm }}>No schedule tasks found</Text>
                                </View>
                              ) : ctScheduleTasks.map(t => (
                                <TouchableOpacity key={t.id}
                                  onPress={() => {
                                    setCtLinkedTaskId(t.id);
                                    setCtLinkedDateType('end');
                                    setCtDueDate(t.end_date || t.start_date || '');
                                    setCtShowTaskPicker(false);
                                  }}
                                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04 }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={{ fontSize: 15, fontWeight: '500', color: C.text }} numberOfLines={1}>{t.task || 'Untitled'}</Text>
                                  <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>
                                    {t.start_date || '—'} → {t.end_date || '—'}
                                    {(t.trades || []).length > 0 ? ` · ${t.trades.join(', ')}` : t.trade ? ` · ${t.trade}` : ''}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, padding: 18, paddingTop: 0 }}>
                  <TouchableOpacity
                    onPress={() => { setShowClientTaskModal(null); setCtTitle(''); setCtDescription(''); setCtDueDate(''); setCtImageB64(''); setCtLinkedTaskId(null); setCtLinkedDateType('end'); setCtScheduleTasks([]); setCtShowTaskPicker(false); }}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.w12 }}
                    activeOpacity={0.7} disabled={ctSaving}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.dm }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submitClientTask}
                    disabled={!ctTitle.trim() || ctSaving}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: C.bl, opacity: !ctTitle.trim() || ctSaving ? 0.5 : 1 }}
                    activeOpacity={0.8}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{ctSaving ? 'Creating...' : 'Create Task'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Client Task Detail Modal (Customer view) */}
      {selectedClientTask && (
        <Modal visible animationType="fade" transparent>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1}
            onPress={() => setSelectedClientTask(null)}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={{ width: 420, backgroundColor: C.cardBg || C.card, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.4)' } : { elevation: 20 }) }}>
                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {selectedClientTask.completed ? (
                      <Feather name="check-circle" size={22} color={C.gn || '#10b981'} />
                    ) : (
                      <Feather name="circle" size={22} color={C.bl} />
                    )}
                    <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold, flex: 1 }}>{selectedClientTask.title}</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: C.dm }}>{selectedClientTask.project_name}</Text>
                </View>
                <View style={{ padding: 18 }}>
                  {selectedClientTask.image_url ? (
                    <View style={{ marginBottom: 14 }}>
                      <Image
                        source={{ uri: selectedClientTask.image_url.startsWith('http') ? selectedClientTask.image_url : `${API_BASE}${selectedClientTask.image_url}` }}
                        style={{ width: '100%', height: 200, borderRadius: 8, resizeMode: 'cover' }}
                      />
                    </View>
                  ) : null}
                  {selectedClientTask.description ? (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 6 }}>DESCRIPTION</Text>
                      <Text style={{ fontSize: 16, color: C.text, lineHeight: 24 }}>{selectedClientTask.description}</Text>
                    </View>
                  ) : null}
                  {selectedClientTask.due_date ? (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.dm, letterSpacing: 0.5, marginBottom: 6 }}>DUE DATE</Text>
                      <Text style={{ fontSize: 16, color: selectedClientTask.due_date < new Date().toISOString().slice(0, 10) && !selectedClientTask.completed ? '#ef4444' : C.text }}>
                        {new Date(selectedClientTask.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </Text>
                      {selectedClientTask.linked_schedule_id ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                          <Feather name="link" size={12} color="#a78bfa" />
                          <Text style={{ fontSize: 12, color: '#a78bfa' }}>Synced with schedule ({selectedClientTask.linked_date_type || 'end'} date)</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {selectedClientTask.completed && selectedClientTask.completed_at ? (
                    <View style={{ marginBottom: 14, backgroundColor: 'rgba(16,185,129,0.08)', padding: 10, borderRadius: 8 }}>
                      <Text style={{ fontSize: 14, color: C.gn || '#10b981', fontWeight: '600' }}>
                        Completed {new Date(selectedClientTask.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, padding: 18, paddingTop: 0 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedClientTask(null)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.w12 }}
                    activeOpacity={0.7}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.dm }}>Close</Text>
                  </TouchableOpacity>
                  {!selectedClientTask.completed && (
                    <TouchableOpacity
                      onPress={async () => {
                        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
                        try {
                          const res = await apiFetch(`/client-tasks/${selectedClientTask.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ completed: true, completed_at: now }),
                          });
                          if (res.ok) {
                            setSelectedClientTask(null);
                            fetchCustomerTasks();
                          }
                        } catch (e) { console.warn('Complete task error:', e); }
                      }}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: C.gn || '#10b981' }}
                      activeOpacity={0.8}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Mark as Complete</Text>
                    </TouchableOpacity>
                  )}
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
                  <Feather name="alert-triangle" size={20} color={C.rd} />
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
                        const res = await apiFetch(`/employees/${editingEmpId}`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: empName.trim(), job_description: empJob.trim(), phone: empPhone }),
                        });
                        if (res.ok) { const updated = await res.json(); setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e)); }
                      } else {
                        const res = await apiFetch(`/users/${selectedSub.id}/employees`, {
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="home" size={19} color={C.text} />
                    <Text style={{ fontSize: 19, fontWeight: '600', color: C.text }}>New Project</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddMenu(false); setShowNewSubdivModal(true); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }} activeOpacity={0.7}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="folder" size={19} color={C.text} />
                    <Text style={{ fontSize: 19, fontWeight: '600', color: C.text }}>New Subdivision</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddMenu(false); setModal('newbid'); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 16 }} activeOpacity={0.7}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="file-text" size={19} color={C.text} />
                    <Text style={{ fontSize: 19, fontWeight: '600', color: C.text }}>New Bid</Text>
                  </View>
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
          builderTrades={builderTrades}
          companyBuilders={companyBuilders}
          currentUser={user}
          onCreated={(newProj) => {
            setProjects(prev => [newProj, ...prev]);
            setSelectedProject(newProj);
            setModal(null);
            Alert.alert('Success', `"${newProj.name}" created`);
          }}
        />
      )}

      {modal === 'newbid' && (
        <NewBidModal
          onClose={() => setModal(null)}
          currentUser={user}
          onCreated={(newBid) => {
            setProjects(prev => [newBid, ...prev]);
            setSelectedProject(newBid);
            setModal(null);
            Alert.alert('Success', `Bid "${newBid.name}" created`);
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="folder" size={22} color={C.textBold} />
                    <Text style={{ fontSize: 24, fontWeight: '700', color: C.textBold }}>New Subdivision</Text>
                  </View>
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
          builderTrades={builderTrades}
        />
      )}

      {/* Workday Exemptions Modal */}
      {showExemptions && (
        <WorkdayExemptionsModal onClose={() => setShowExemptions(false)} />
      )}

      {/* Selection Manager Modal */}
      {showSelectionManager && (
        <SelectionManagerModal onClose={() => setShowSelectionManager(false)} builderTrades={builderTrades} />
      )}

      {/* Document Manager Modal */}
      {showDocumentManager && (
        <DocumentManagerModal onClose={() => setShowDocumentManager(false)} />
      )}

      {/* Bid Template Manager Modal */}
      {showBidTemplateManager && (
        <BidTemplateManagerModal onClose={() => setShowBidTemplateManager(false)} />
      )}

      {/* Manage Trades Modal */}
      {showTradeManager && (
        <Modal visible animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: isWide ? 460 : '92%', maxHeight: '80%', backgroundColor: C.bg, borderRadius: 16, overflow: 'hidden' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Manage Trades</Text>
                <TouchableOpacity onPress={() => { setShowTradeManager(false); setNewTradeName(''); }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 28, color: C.dm, fontWeight: '300' }}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Add new trade */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <TextInput
                  value={newTradeName}
                  onChangeText={setNewTradeName}
                  placeholder="Add new trade..."
                  placeholderTextColor={C.dm}
                  style={{ flex: 1, fontSize: 16, color: C.text, backgroundColor: C.w04, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.w08 }}
                  onSubmitEditing={() => {
                    const t = newTradeName.trim();
                    if (t && !builderTrades.includes(t)) {
                      const updated = [...builderTrades, t].sort((a, b) => a.localeCompare(b));
                      setBuilderTrades(updated);
                      setNewTradeName('');
                      apiFetch(`/users/${user.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trades: updated.join(', ') }),
                      }).catch(() => {});
                    } else { setNewTradeName(''); }
                  }}
                />
                <TouchableOpacity
                  onPress={() => {
                    const t = newTradeName.trim();
                    if (t && !builderTrades.includes(t)) {
                      const updated = [...builderTrades, t].sort((a, b) => a.localeCompare(b));
                      setBuilderTrades(updated);
                      setNewTradeName('');
                      apiFetch(`/users/${user.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trades: updated.join(', ') }),
                      }).catch(() => {});
                    } else { setNewTradeName(''); }
                  }}
                  style={{ backgroundColor: C.gd, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Trade list */}
              <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingVertical: 4 }}>
                {builderTrades.map((trade, idx) => (
                  <View key={trade} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12,
                    borderBottomWidth: idx < builderTrades.length - 1 ? 1 : 0, borderBottomColor: C.w04,
                  }}>
                    <Text style={{ fontSize: 17, fontWeight: '500', color: C.text }}>{trade}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const doDelete = () => {
                          const updated = builderTrades.filter(t => t !== trade);
                          setBuilderTrades(updated);
                          apiFetch(`/users/${user.id}`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ trades: updated.join(', ') }),
                          }).catch(() => {});
                        };
                        if (Platform.OS === 'web') {
                          if (window.confirm(`Remove "${trade}" from your trade list?`)) doDelete();
                        } else {
                          Alert.alert('Delete Trade', `Remove "${trade}" from your trade list?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: doDelete },
                          ]);
                        }
                      }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {builderTrades.length === 0 && (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: C.dm }}>No trades added yet</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Floor Plan Manager Modal */}
      {showFloorPlanManager && (
        <Modal visible animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: isWide ? 460 : '92%', maxHeight: '80%', backgroundColor: C.bg, borderRadius: 16, overflow: 'hidden' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Manage Floor Plans</Text>
                <TouchableOpacity onPress={() => { setShowFloorPlanManager(false); setNewFloorPlanName(''); }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 28, color: C.dm, fontWeight: '300' }}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Add new floor plan */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <TextInput
                  value={newFloorPlanName}
                  onChangeText={setNewFloorPlanName}
                  placeholder="Add new floor plan..."
                  placeholderTextColor={C.dm}
                  style={{ flex: 1, fontSize: 16, color: C.text, backgroundColor: C.w04, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.w08 }}
                  onSubmitEditing={async () => {
                    const n = newFloorPlanName.trim();
                    if (!n) return;
                    try {
                      const res = await apiFetch('/floor-plans', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: n, user_id: user.id }),
                      });
                      if (res.ok) {
                        const fp = await res.json();
                        setFloorPlans(prev => [...prev, fp].sort((a, b) => a.name.localeCompare(b.name)));
                        setNewFloorPlanName('');
                      }
                    } catch (e) { console.warn('Add floor plan:', e); }
                  }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    const n = newFloorPlanName.trim();
                    if (!n) return;
                    try {
                      const res = await apiFetch('/floor-plans', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: n, user_id: user.id }),
                      });
                      if (res.ok) {
                        const fp = await res.json();
                        setFloorPlans(prev => [...prev, fp].sort((a, b) => a.name.localeCompare(b.name)));
                        setNewFloorPlanName('');
                      }
                    } catch (e) { console.warn('Add floor plan:', e); }
                  }}
                  style={{ backgroundColor: C.gd, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Floor plan list */}
              <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingVertical: 4 }}>
                {floorPlans.map((fp, idx) => (
                  <View key={fp.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12,
                    borderBottomWidth: idx < floorPlans.length - 1 ? 1 : 0, borderBottomColor: C.w04,
                  }}>
                    <Text style={{ fontSize: 17, fontWeight: '500', color: C.text }}>{fp.name}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const doDelete = async () => {
                          try {
                            await apiFetch(`/floor-plans/${fp.id}`, { method: 'DELETE' });
                            setFloorPlans(prev => prev.filter(p => p.id !== fp.id));
                          } catch (e) { console.warn('Delete floor plan:', e); }
                        };
                        if (Platform.OS === 'web') {
                          if (window.confirm(`Remove "${fp.name}" from your floor plans?`)) doDelete();
                        } else {
                          Alert.alert('Delete Floor Plan', `Remove "${fp.name}" from your floor plans?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: doDelete },
                          ]);
                        }
                      }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {floorPlans.length === 0 && (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: C.dm }}>No floor plans added yet</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Go Live Steps Manager Modal (company admin only) */}
      {showGoLiveManager && (
        <Modal visible animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: isWide ? 460 : '92%', maxHeight: '80%', backgroundColor: C.bg, borderRadius: 16, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Manage Go Live Steps</Text>
                <TouchableOpacity onPress={() => { setShowGoLiveManager(false); setNewGoLiveStep(''); }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 28, color: C.dm, fontWeight: '300' }}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 13, color: C.dm }}>
                  These steps must be completed before any project can go live.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <TextInput
                  value={newGoLiveStep}
                  onChangeText={setNewGoLiveStep}
                  placeholder="Add new step..."
                  placeholderTextColor={C.dm}
                  style={{ flex: 1, fontSize: 16, color: C.text, backgroundColor: C.w04, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.w08 }}
                  onSubmitEditing={addGoLiveStepDef}
                />
                <TouchableOpacity
                  onPress={addGoLiveStepDef}
                  style={{ backgroundColor: C.gd, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Add</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingVertical: 4 }}>
                {goLiveStepsLoading ? (
                  <ActivityIndicator color={C.gd} style={{ marginVertical: 30 }} />
                ) : goLiveStepsDef.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: C.dm }}>No go live steps configured</Text>
                    <Text style={{ fontSize: 13, color: C.dm, marginTop: 4 }}>Projects can go live immediately</Text>
                  </View>
                ) : (
                  goLiveStepsDef.map((step, idx) => (
                    <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12,
                      borderBottomWidth: idx < goLiveStepsDef.length - 1 ? 1 : 0, borderBottomColor: C.w04 }}>
                      <Text style={{ fontSize: 17, fontWeight: '500', color: C.text, flex: 1 }}>{idx + 1}. {step.title}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          const doDelete = () => deleteGoLiveStepDef(step.id);
                          if (Platform.OS === 'web') {
                            if (window.confirm(`Remove "${step.title}"?`)) doDelete();
                          } else {
                            Alert.alert('Delete Step', `Remove "${step.title}"?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: doDelete },
                            ]);
                          }
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="trash-2" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Project Managers Manager Modal (company admin only) */}
      {showPmManager && (
        <Modal visible animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: isWide ? 500 : '92%', maxHeight: '80%', backgroundColor: C.bg, borderRadius: 16, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>Manage Project Managers</Text>
                <TouchableOpacity onPress={() => setShowPmManager(false)} activeOpacity={0.7}>
                  <Text style={{ fontSize: 28, color: C.dm, fontWeight: '300' }}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <Text style={{ fontSize: 13, color: C.dm }}>
                  Toggle which builders are project managers. Project managers and superintendents only see projects assigned to them.
                </Text>
              </View>
              <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ paddingVertical: 4 }}>
                {pmLoading ? (
                  <ActivityIndicator color={C.gd} style={{ marginVertical: 30 }} />
                ) : pmBuilders.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: C.dm }}>No builders found in company</Text>
                  </View>
                ) : (
                  pmBuilders.map((b, idx) => (
                    <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14,
                      borderBottomWidth: idx < pmBuilders.length - 1 ? 1 : 0, borderBottomColor: C.w04 }}>
                      <View style={{
                        width: 38, height: 38, borderRadius: 19,
                        backgroundColor: b.is_project_manager ? C.bl + '20' : C.w06,
                        alignItems: 'center', justifyContent: 'center', marginRight: 12,
                      }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: b.is_project_manager ? C.bl : C.dm }}>
                          {(b.first_name || '')[0]}{(b.last_name || '')[0]}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 17, fontWeight: '600', color: C.textBold }}>{b.name}</Text>
                        <Text style={{ fontSize: 13, color: C.dm }}>
                          {b.role === 'company_admin' ? 'Company Admin' : 'Builder'} · {b.username}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => togglePmStatus(b.id, b.is_project_manager)}
                        style={{
                          width: 52, height: 30, borderRadius: 15,
                          backgroundColor: b.is_project_manager ? C.bl : C.w10,
                          justifyContent: 'center',
                          paddingHorizontal: 3,
                        }}
                        activeOpacity={0.7}>
                        <View style={{
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: '#fff',
                          alignSelf: b.is_project_manager ? 'flex-end' : 'flex-start',
                          ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } : { elevation: 2 }),
                        }} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Builder Calendar Modal */}
      {showBuilderCal && (
        <Modal visible animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ flex: 1, margin: isWide ? 40 : 0, marginTop: isWide ? 40 : 60, backgroundColor: C.bg, borderRadius: isWide ? 16 : 0, overflow: 'hidden' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.bd }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="calendar" size={24} color={C.textBold} />
                  <Text style={{ fontSize: 27, fontWeight: '700', color: C.textBold }}>My Calendar</Text>
                </View>
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
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={bcToday} style={st.subCalTodayBtn} activeOpacity={0.7}>
                          <Text style={st.subCalTodayTxt}>Today</Text>
                        </TouchableOpacity>
                        {Object.keys(projectColors).length > 0 && (
                          <TouchableOpacity onPress={() => setShowSubCalLegend(v => !v)} style={[st.subCalTodayBtn, showSubCalLegend && { backgroundColor: C.bl + '18', borderColor: C.bl + '40' }]} activeOpacity={0.7}>
                            <Text style={[st.subCalTodayTxt, showSubCalLegend && { color: C.bl }]}>Key</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <TouchableOpacity onPress={bcPrev} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>‹</Text></TouchableOpacity>
                        <Text style={st.subCalNavTitle}>{monNames[bcMon]} {bcYear}</Text>
                        <TouchableOpacity onPress={bcNext} style={st.subCalNavBtn}><Text style={st.subCalNavArrow}>›</Text></TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }} />
                    </View>

                    {/* Legend */}
                    {showSubCalLegend && Object.keys(projectColors).length > 0 && (
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
                          <Feather name="calendar" size={42} color={C.dm} style={{ marginBottom: 8 }} />
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
                        const laneH = 50;
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
                                const isOnHold = task.on_hold;
                                const isHighlight = isExc || isOnHold;
                                const highlightColor = isOnHold ? C.rd : (isExc ? C.og : null);
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
                                      borderColor: isHighlight ? highlightColor : pColor, opacity: isDragged ? 0.7 : 1,
                                    },
                                    isHighlight && { backgroundColor: highlightColor, borderColor: highlightColor },
                                    !isHighlight && !isLive && { backgroundColor: C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)' },
                                    isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed' },
                                    Platform.OS === 'web' ? { cursor: 'pointer' } : {},
                                    ]}
                                    {...(Platform.OS === 'web' ? {
                                      onPointerDown: (e) => builderHandleDragStart(task, e),
                                    } : {})}
                                  >
                                    <View style={{ flex: 1, justifyContent: 'center' }}>
                                      <Text style={[st.subCalTaskTxt, isHighlight && { color: '#fff' }]} numberOfLines={1}>{task.task || 'Untitled'}</Text>
                                      <Text style={[st.subCalTaskTxtSub, isHighlight && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>{task.project_name || 'Unknown'}</Text>
                                    </View>
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
                        const rowMinH = Math.max(125, 48 + maxTasks * 95);

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
                                    const isOnHold = task.on_hold;
                                    const isHighlight = isExc || isOnHold;
                                    const highlightColor = isOnHold ? C.rd : (isExc ? C.og : null);

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
                                          backgroundColor: isHighlight ? highlightColor : (!isLive ? (C.mode === 'light' ? 'rgba(250,204,21,0.35)' : 'rgba(250,204,21,0.30)') : (C.mode === 'light' ? 'rgba(0,0,0,0.04)' : C.w04)),
                                          borderRadius: 6, borderLeftWidth: 5, borderLeftColor: isHighlight ? highlightColor : pColor,
                                          opacity: isDragged ? 0.7 : 1,
                                        },
                                        Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } : {},
                                        isDragged && { borderWidth: 2, borderColor: C.textBold, borderStyle: 'dashed', borderLeftWidth: 2 },
                                        ]}
                                        {...(Platform.OS === 'web' ? {
                                          onPointerDown: (e) => builderHandleDragStart(task, e),
                                        } : {})}
                                      >
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: isHighlight ? '#fff' : C.text, textDecorationLine: isComplete ? 'line-through' : 'none' }} numberOfLines={1}>
                                          {task.task || 'Untitled'}
                                        </Text>
                                        <Text style={{ fontSize: 16, fontWeight: '600', color: isHighlight ? 'rgba(255,255,255,0.9)' : C.text, lineHeight: 22 }} numberOfLines={1}>
                                          {task.project_name || 'Unknown'}
                                        </Text>
                                        <Text style={{ fontSize: 13, color: isHighlight ? 'rgba(255,255,255,0.7)' : C.dm, fontWeight: '500' }}>→ {bShortDate(task.end_date)}</Text>
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
          tradesList={builderTrades}
          onCreated={(newSub) => {
            setSubs(prev => [...prev, newSub].sort((a, b) => (a.company_name || a.name || '').localeCompare(b.company_name || b.name || '')));
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
            <TouchableOpacity onPress={() => {
              setContractorProject(null);
              if (user?.id) {
                apiFetch(`/users/${user.id}/change-orders`)
                  .then(r => r.json())
                  .then(data => { if (Array.isArray(data)) setSubChangeOrders(data); })
                  .catch(() => {});
              }
            }} style={st.backBtn} activeOpacity={0.7}>
              <Text style={st.backBtnTxt}>‹</Text>
            </TouchableOpacity>
          )}
          <View style={st.logoBox}>
            <Text style={{ fontSize: 24, color: '#fff', fontWeight: '700' }}>⬡</Text>
          </View>
          <Text style={st.brandName}>{isWide || (!showingDetail && !showingContractorProject) ? 'BuilderSync' : ''}</Text>
        </View>

        {/* Spacer pushes search + icons right */}
        <View style={{ flex: 1 }} />

        <View style={st.headerRight}>
          {isBuilder && (
            <View style={{ position: 'relative' }}>
              <TouchableOpacity onPress={() => setShowSettings(p => !p)} style={st.headerBtn}>
                <Feather name="settings" size={24} color={C.chromeDm} />
              </TouchableOpacity>
              {showSettings && (
                <View style={st.settingsDropdown}>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowTemplateManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="layers" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Manage Schedule Templates</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowExemptions(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="calendar" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Workday Exemptions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowSelectionManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="sliders" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Manage Selections</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowDocumentManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="file-text" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Manage Documents</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowTradeManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="tool" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Manage Trades</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); fetchFloorPlans(); setShowFloorPlanManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="home" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Manage Floor Plans</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setShowSettings(false); setShowBidTemplateManager(true); }}
                    style={st.settingsItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="clipboard" size={20} color={C.text} />
                    <Text style={st.settingsItemTxt}>Manage Bid Settings</Text>
                  </TouchableOpacity>
                  {user?.role === 'company_admin' && (
                    <TouchableOpacity
                      onPress={() => { setShowSettings(false); fetchGoLiveStepsDef(); setShowGoLiveManager(true); }}
                      style={st.settingsItem}
                      activeOpacity={0.7}
                    >
                      <Feather name="zap" size={20} color={C.text} />
                      <Text style={st.settingsItemTxt}>Manage Go Live Steps</Text>
                    </TouchableOpacity>
                  )}
                  {user?.role === 'company_admin' && (
                    <TouchableOpacity
                      onPress={() => { setShowSettings(false); fetchPmBuilders(); setShowPmManager(true); }}
                      style={st.settingsItem}
                      activeOpacity={0.7}
                    >
                      <Feather name="briefcase" size={20} color={C.text} />
                      <Text style={st.settingsItemTxt}>Manage Project Managers</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
          {isBuilder && (
            <TouchableOpacity onPress={() => navigation.navigate('UserManagement')} style={st.headerBtn}>
              <Feather name="users" size={24} color={C.chromeDm} />
            </TouchableOpacity>
          )}
          {isBuilder && (
            <TouchableOpacity onPress={() => setShowBuilderCal(true)} style={st.headerBtn}>
              <Feather name="calendar" size={24} color={C.chromeDm} />
            </TouchableOpacity>
          )}
          {isBuilder && (
            <TouchableOpacity onPress={() => navigation.navigate('Reports')} style={st.headerBtn}>
              <Feather name="bar-chart-2" size={24} color={C.chromeDm} />
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
            <Feather name="log-out" size={22} color={C.chromeDm} />
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
                onPress={() => {
                  setContractorProject(null);
                  if (user?.id) {
                    apiFetch(`/users/${user.id}/change-orders`)
                      .then(r => r.json())
                      .then(data => { if (Array.isArray(data)) setSubChangeOrders(data); })
                      .catch(() => {});
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}
              >
                <Text style={{ fontSize: 27, color: C.gd }}>‹</Text>
                <Text style={{ fontSize: 20, color: C.gd, fontWeight: '600' }}>Back to My Dashboard</Text>
              </TouchableOpacity>
            )}
            {contractorProject?.is_bid ? (
              <BidDetailView key={contractorProject.id} project={contractorProject} onProjectUpdate={handleProjectUpdate} />
            ) : (
              <CurrentProjectViewer
                key={contractorProject.id}
                embedded
                project={contractorProject}
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
                builderTrades={builderTrades}
                floorPlans={floorPlans}
                calYear={globalCalMonth.getFullYear()}
                calMonth={globalCalMonth.getMonth()}
                onMonthChange={(y, m) => setGlobalCalMonth(new Date(y, m, 1))}
              />
            )}
          </View>
        ) : selectedSubdivision ? (
          <View style={{ flex: 1, minHeight: 0 }}>
            <TouchableOpacity
              onPress={() => setSelectedSubdivision(null)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: C.bd }}
            >
              <Text style={{ fontSize: 27, color: C.gd }}>‹</Text>
              <Text style={{ fontSize: 20, color: C.gd, fontWeight: '600' }}>Back to My Dashboard</Text>
            </TouchableOpacity>
            {renderSubdivisionDetail()}
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
      ) : !isBuilder && !isContractor ? (
        /* --- CUSTOMER VIEW: tasks sidebar + project detail --- */
        <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column', minHeight: 0 }}>
          {isWide && (
            <View style={[st.sidebar, st.sidebarWide]}>
              {companyLogo && (
                <View style={{ alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                  <Image source={{ uri: companyLogo }} style={{ width: 368, height: 147, resizeMode: 'contain' }} />
                </View>
              )}
              <View style={st.sidebarHead}>
                <Text style={st.sidebarLabel}>CUSTOMER TASKS</Text>
                <Text style={{ fontSize: 13, color: C.chromeDm, marginLeft: 'auto' }}>{customerTasks.filter(t => !t.completed).length} pending</Text>
              </View>
              {customerTasks.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <Feather name="check-square" size={40} color={C.dm} style={{ marginBottom: 10 }} />
                  <Text style={{ color: C.chromeTxt, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>No Tasks</Text>
                  <Text style={{ color: C.chromeDm, fontSize: 15, marginTop: 4, textAlign: 'center' }}>Tasks from your builder will appear here</Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }}>
                  {customerTasks.filter(t => !t.completed).map(task => (
                    <TouchableOpacity key={task.id} activeOpacity={0.7} onPress={() => setSelectedClientTask(task)}
                      style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: C.chromeTxt }} numberOfLines={1}>{task.title}</Text>
                      <Text style={{ fontSize: 13, color: C.chromeDm, marginTop: 2 }} numberOfLines={1}>{task.project_name}</Text>
                      {task.due_date ? (
                        <Text style={{ fontSize: 12, color: task.due_date < new Date().toISOString().slice(0, 10) ? '#ef4444' : C.chromeDm, marginTop: 2 }}>
                          Due: {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                  {customerTasks.some(t => t.completed) && (
                    <>
                      <View style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: C.sw04 || C.w04 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.chromeDm, letterSpacing: 0.5 }}>COMPLETED</Text>
                      </View>
                      {customerTasks.filter(t => t.completed).map(task => (
                        <TouchableOpacity key={task.id} activeOpacity={0.7} onPress={() => setSelectedClientTask(task)}
                          style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.sw06, opacity: 0.6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name="check-circle" size={14} color={C.gn || '#10b981'} />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: C.chromeTxt, textDecorationLine: 'line-through' }} numberOfLines={1}>{task.title}</Text>
                          </View>
                          <Text style={{ fontSize: 13, color: C.chromeDm, marginTop: 2 }} numberOfLines={1}>{task.project_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </ScrollView>
              )}
            </View>
          )}
          <View style={{ flex: 1, borderLeftWidth: isWide ? 1 : 0, borderLeftColor: C.bd, minHeight: 0 }}>
            {loading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={C.gd} size="large" />
              </View>
            ) : selectedProject?.is_bid ? (
              <BidDetailView project={selectedProject} onProjectUpdate={handleProjectUpdate} />
            ) : selectedProject ? (
              <CurrentProjectViewer
                embedded
                project={selectedProject}
                clientView={false}
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
                builderTrades={builderTrades}
                floorPlans={floorPlans}
                calYear={globalCalMonth.getFullYear()}
                calMonth={globalCalMonth.getMonth()}
                onMonthChange={(y, m) => setGlobalCalMonth(new Date(y, m, 1))}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Feather name="clipboard" size={48} color={C.dm} style={{ marginBottom: 10 }} />
                <Text style={{ color: C.text, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>No projects yet</Text>
                <Text style={{ color: C.dm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>Projects assigned to you will appear here</Text>
              </View>
            )}
          </View>
        </View>
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
                    <TouchableOpacity onPress={() => setShowFilterMenu(p => !p)}
                      style={{ padding: 6, borderRadius: 6, borderWidth: 1, borderColor: C.sw10, backgroundColor: 'transparent' }}
                      activeOpacity={0.7}>
                      <Feather name="filter" size={16} color={C.chromeTxt} />
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
                        <Feather name={projectSearch.trim() ? 'search' : 'clipboard'} size={48} color={C.dm} style={{ marginBottom: 10 }} />
                        <Text style={{ color: C.chromeTxt, fontSize: 21, fontWeight: '600', textAlign: 'center' }}>
                          {projectSearch.trim() ? 'No matching projects' : 'No projects yet'}
                        </Text>
                        <Text style={{ color: C.chromeDm, fontSize: 18, marginTop: 4, textAlign: 'center' }}>
                          {projectSearch.trim() ? 'Try a different search' : isBuilder ? 'Tap + to create one' : 'Projects assigned to you will appear here'}
                        </Text>
                      </View>
                    ) : (() => {
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
                                  {editSubdivId === sd.id ? (
                                    <TextInput
                                      value={editSubdivName}
                                      onChangeText={setEditSubdivName}
                                      autoFocus
                                      onBlur={() => renameSubdivision(sd.id, editSubdivName)}
                                      onSubmitEditing={() => renameSubdivision(sd.id, editSubdivName)}
                                      style={{ fontSize: 15, fontWeight: '700', color: sdActive ? C.gd : C.chromeTxt, letterSpacing: 0.5, flex: 1, padding: 0, margin: 0, borderBottomWidth: 1, borderBottomColor: C.gd }}
                                    />
                                  ) : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                                      <Feather name="folder" size={15} color={sdActive ? C.gd : C.chromeTxt} />
                                      <Text style={{ fontSize: 15, fontWeight: '700', color: sdActive ? C.gd : C.chromeTxt, letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>
                                        {sd.name.toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                  {isBuilder && editSubdivId !== sd.id && (
                                    <TouchableOpacity
                                      onPress={(e) => { e.stopPropagation(); setEditSubdivId(sd.id); setEditSubdivName(sd.name); }}
                                      style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                                      activeOpacity={0.6}
                                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                    >
                                      <Feather name="edit-2" size={14} color={sdActive ? C.gd : C.dm} />
                                    </TouchableOpacity>
                                  )}
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
                    <Feather name={projectSearch.trim() ? 'search' : 'user'} size={48} color={C.dm} style={{ marginBottom: 10 }} />
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
                          onPress={() => {
                            const now = Date.now();
                            const last = subLastTapRef.current[sub.id] || 0;
                            subLastTapRef.current[sub.id] = now;
                            if (now - last < 400) {
                              subLastTapRef.current[sub.id] = 0;
                              setSubView(false);
                              setSelectedSub(sub);
                              setSubTab('info');
                              setSubEditing(false);
                              setShowDeleteSub(false);
                              setSubTaskFilter(null);
                              setSubTaskFilterOpen(false);
                              Promise.all([
                                apiFetch(`/users/${sub.id}/projects`),
                                apiFetch(`/users/${sub.id}/tasks?viewer_role=${user?.role || ''}`),
                                apiFetch(`/users/${sub.id}/employees`),
                              ]).then(async ([projRes, taskRes, empRes]) => {
                                const projData = await projRes.json();
                                const taskData = await taskRes.json();
                                const empData = await empRes.json();
                                if (Array.isArray(projData)) setSubProjects(projData);
                                if (Array.isArray(taskData)) setSubTasks(taskData);
                                if (Array.isArray(empData)) setEmployees(empData);
                              }).catch(() => {});
                              return;
                            }
                            setSubView(false); selectSub(sub);
                          }}
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
                            <Feather name="tool" size={18} color={(active && subView) ? C.gd : C.dm} />
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
              selectedProject?.is_bid ? (
                <BidDetailView project={selectedProject} onProjectUpdate={handleProjectUpdate} />
              ) : selectedProject ? (
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
                  builderTrades={builderTrades}
                  floorPlans={floorPlans}
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
            ) : selectedProject?.is_bid ? (
              <BidDetailView project={selectedProject} onProjectUpdate={handleProjectUpdate} />
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
              builderTrades={builderTrades}
              floorPlans={floorPlans}
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

const TEMPLATE_ICONS = ['clipboard', 'home', 'coffee', 'droplet', 'tool', 'briefcase', 'tool', 'settings', 'box', 'square', 'maximize', 'log-in', 'zap', 'droplet', 'thermometer', 'home', 'grid'];

const TemplateManagerModal = ({ onClose, builderTrades = [] }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTmpl, setEditTmpl] = useState(null); // null=list, 'new'=create, {id,...}=edit
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('clipboard');
  const [editDesc, setEditDesc] = useState('');
  const [editTasks, setEditTasks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showIcons, setShowIcons] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/schedule-templates${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch (e) { console.warn(e.message); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { fetchTemplates(); }, []);

  const openNew = () => {
    setEditTmpl('new');
    setEditName('');
    setEditIcon('clipboard');
    setEditDesc('');
    setEditTasks([]);
    setShowIcons(false);
  };

  // Convert stored template tasks back to ScheduleBuilder format
  const loadTemplate = (tmpl) => {
    setEditTmpl(tmpl);
    setEditName(tmpl.name);
    setEditIcon(tmpl.icon || 'clipboard');
    setEditDesc(tmpl.description || '');

    const rawTasks = tmpl.tasks || [];
    // Generate _ids first
    const ids = rawTasks.map((_, i) => Date.now() + i + 1);
    const builderTasks = rawTasks.map((t, i) => ({
      _id: ids[i],
      task: t.task || '',
      contractor: t.contractor || '',
      trade: t.trade || '',
      contractors: t.contractors || (t.contractor ? [t.contractor] : []),
      trades: t.trades || (t.trade ? [t.trade] : []),
      hidden_from_customer: t.hidden_from_customer || false,
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
          trade: (t.trades || [])[0] || t.trade || '',
          trades: t.trades || (t.trade ? [t.trade] : []),
          hidden_from_customer: t.hidden_from_customer || false,
          workdays: t.workdays || '1',
          predIdx: predIdx >= 0 ? predIdx : null,
          relType: t.relType || 'FS',
          lag: t.lag || '0',
        };
      });

      const isNew = editTmpl === 'new';
      const path = isNew ? `/schedule-templates` : `/schedule-templates/${editTmpl.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          icon: editIcon,
          description: editDesc.trim(),
          tasks: templateTasks,
          created_by: user.id,
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
        const res = await apiFetch(`/schedule-templates/${tmpl.id}`, { method: 'DELETE' });
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
                    <Feather name="layers" size={54} color={C.dm} style={{ marginBottom: 12 }} />
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
                        <Feather name={tmpl.icon || 'clipboard'} size={39} color={C.dm} />
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
                        <Feather name="trash-2" size={21} color={C.rd} />
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
                      <Feather name={editIcon} size={36} color={C.dm} />
                    </TouchableOpacity>
                    {showIcons && (
                      <View style={st.iconGrid}>
                        {TEMPLATE_ICONS.map((ic, idx) => (
                          <TouchableOpacity key={`${ic}-${idx}`} onPress={() => { setEditIcon(ic); setShowIcons(false); }}
                            style={[st.iconOption, ic === editIcon && st.iconOptionOn]}>
                            <Feather name={ic} size={27} color={ic === editIcon ? C.gd : C.dm} />
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
                <ScheduleBuilder tasks={editTasks} onTasksChange={setEditTasks} templateMode tradesList={builderTrades} />

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

const NewProjectModal = ({ onClose, onCreated, subdivisions = [], builderTrades = [], companyBuilders = [], currentUser }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [f, sF] = useState({
    name: '', street_address: '', city: '', addr_state: '', zip_code: '', email: '',
    customer_first_name: '', customer_last_name: '', customer_phone: '',
    homeowner2_first_name: '', homeowner2_last_name: '', homeowner2_phone: '', homeowner2_email: '',
    original_price: '', subdivision_id: null,
  });
  const [showHomeowner2, setShowHomeowner2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduleTasks, setScheduleTasks] = useState([]);
  const [showAddrState, setShowAddrState] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewTasks, setReviewTasks] = useState([]);
  const [tradeDropdownIdx, setTradeDropdownIdx] = useState(null);
  const [templateTradeSearch, setTemplateTradeSearch] = useState('');
  const [reviewTmplInfo, setReviewTmplInfo] = useState(null);
  const [appliedTemplate, setAppliedTemplate] = useState(null);
  const [showSubdivPicker, setShowSubdivPicker] = useState(false);
  const [selectionTemplates, setSelectionTemplates] = useState([]);
  const [selectedSelTmplId, setSelectedSelTmplId] = useState(null);
  const [showSelTmplPicker, setShowSelTmplPicker] = useState(false);
  const [selectedPmId, setSelectedPmId] = useState(null);
  const [selectedSuptId, setSelectedSuptId] = useState(currentUser?.id || null);
  const [showPmPicker, setShowPmPicker] = useState(false);
  const [showSuptPicker, setShowSuptPicker] = useState(false);
  const set = (key, val) => sF(prev => ({ ...prev, [key]: val }));

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/selection-templates${user.company_id ? `?company_id=${user.company_id}` : ''}`);
        if (res.ok) setSelectionTemplates(await res.json());
      } catch (e) { console.warn(e); }
    })();
  }, []);

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
        selection_template_id: selectedSelTmplId || null,
        created_by: user.id,
        project_manager_id: selectedPmId || null,
        superintendent_id: selectedSuptId || null,
      };
      // Include second homeowner if enabled and email provided
      if (showHomeowner2 && f.homeowner2_email.trim()) {
        body.homeowner2_first_name = f.homeowner2_first_name.trim();
        body.homeowner2_last_name = f.homeowner2_last_name.trim();
        body.homeowner2_phone = f.homeowner2_phone.trim();
        body.homeowner2_email = f.homeowner2_email.trim();
      }
      const res = await apiFetch(`/projects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); Alert.alert('Error', err.error || 'Failed'); setLoading(false); return; }
      const newProject = await res.json();

      // Apply selection template if one was selected
      if (selectedSelTmplId) {
        try {
          await apiFetch(`/projects/${newProject.id}/apply-selection-template`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: selectedSelTmplId }),
          });
        } catch (e) { console.warn('Apply selection template failed:', e); }
      }

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
            contractor: (t.contractors || [])[0] || t.contractor?.trim() || '',
            contractors: t.contractors || (t.contractor ? [t.contractor] : []),
            trade: (t.trades || [])[0] || t.trade || '',
            trades: t.trades || (t.trade ? [t.trade] : []),
            hidden_from_customer: t.hidden_from_customer || false,
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
        const schedRes = await apiFetch(`/projects/${newProject.id}/schedule`, {
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Feather name="folder" size={17} color={f.subdivision_id === sd.id ? C.gd : C.text} />
                              <Text style={{ fontSize: 19, color: f.subdivision_id === sd.id ? C.gd : C.text }}>{sd.name}</Text>
                            </View>
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

              {/* Second Homeowner Toggle */}
              <TouchableOpacity
                onPress={() => setShowHomeowner2(p => !p)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: showHomeowner2 ? 10 : 14 }}
                activeOpacity={0.7}>
                <View style={{
                  width: 22, height: 22, borderRadius: 4, borderWidth: 2,
                  borderColor: showHomeowner2 ? C.bl : C.w12,
                  backgroundColor: showHomeowner2 ? C.bl : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {showHomeowner2 && <Feather name="check" size={14} color="#fff" />}
                </View>
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>Add Second Homeowner</Text>
              </TouchableOpacity>

              {showHomeowner2 && (
                <View style={{ marginBottom: 14, paddingLeft: 4 }}>
                  <Text style={[st.formLbl, { color: C.gd, marginBottom: 10 }]}>SECOND HOMEOWNER</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Inp2 label="FIRST NAME" value={f.homeowner2_first_name} onChange={v => set('homeowner2_first_name', v)} placeholder="John" style={{ flex: 1 }} />
                    <Inp2 label="LAST NAME" value={f.homeowner2_last_name} onChange={v => set('homeowner2_last_name', v)} placeholder="Parker" style={{ flex: 1 }} />
                  </View>
                  <Inp2 label="PHONE" value={f.homeowner2_phone} onChange={v => set('homeowner2_phone', v)} placeholder="(208) 555-5678" type="phone" />
                  <Inp2 label="EMAIL" value={f.homeowner2_email} onChange={v => set('homeowner2_email', v)} placeholder="john@email.com" type="email" />
                  <Text style={{ fontSize: 16, color: C.dm, marginTop: -10, marginBottom: 4 }}>
                    A separate login will be created · Same project access · Default password: Liberty
                  </Text>
                </View>
              )}

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

              {/* Project Manager & Superintendent dropdowns */}
              {companyBuilders.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Project Manager */}
                    <View style={{ flex: 1 }}>
                      <Text style={st.formLbl}>PROJECT MANAGER</Text>
                      <TouchableOpacity onPress={() => { setShowPmPicker(p => !p); setShowSuptPicker(false); }}
                        style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, color: selectedPmId ? C.text : C.ph }} numberOfLines={1}>
                          {selectedPmId ? (companyBuilders.find(b => b.id === selectedPmId)?.name || 'Unknown') : 'Select PM'}
                        </Text>
                        <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                      </TouchableOpacity>
                      {showPmPicker && (
                        <View style={{ backgroundColor: C.cardBg || C.card, borderWidth: 1, borderColor: C.w10, borderRadius: 8, marginTop: 4, overflow: 'hidden', maxHeight: 200, zIndex: 20 }}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            <TouchableOpacity onPress={() => { setSelectedPmId(null); setShowPmPicker(false); }}
                              style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: !selectedPmId ? C.gd + '22' : 'transparent' }}>
                              <Text style={{ fontSize: 17, color: !selectedPmId ? C.gd : C.dm }}>None</Text>
                            </TouchableOpacity>
                            {companyBuilders.filter(b => b.is_project_manager).map(b => (
                              <TouchableOpacity key={b.id} onPress={() => { setSelectedPmId(b.id); setShowPmPicker(false); }}
                                style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: selectedPmId === b.id ? C.gd + '22' : 'transparent' }}>
                                <Text style={{ fontSize: 17, color: selectedPmId === b.id ? C.gd : C.text }}>{b.name}</Text>
                              </TouchableOpacity>
                            ))}
                            {companyBuilders.filter(b => b.is_project_manager).length === 0 && (
                              <View style={{ padding: 14, alignItems: 'center' }}>
                                <Text style={{ fontSize: 14, color: C.dm }}>No project managers configured</Text>
                                <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>Use Settings to assign PMs</Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                    {/* Superintendent */}
                    <View style={{ flex: 1 }}>
                      <Text style={st.formLbl}>SUPERINTENDENT</Text>
                      <TouchableOpacity onPress={() => { setShowSuptPicker(p => !p); setShowPmPicker(false); }}
                        style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, color: selectedSuptId ? C.text : C.ph }} numberOfLines={1}>
                          {selectedSuptId ? (companyBuilders.find(b => b.id === selectedSuptId)?.name || 'Unknown') : 'Select'}
                        </Text>
                        <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                      </TouchableOpacity>
                      {showSuptPicker && (
                        <View style={{ backgroundColor: C.cardBg || C.card, borderWidth: 1, borderColor: C.w10, borderRadius: 8, marginTop: 4, overflow: 'hidden', maxHeight: 200, zIndex: 20 }}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            <TouchableOpacity onPress={() => { setSelectedSuptId(null); setShowSuptPicker(false); }}
                              style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: !selectedSuptId ? C.gd + '22' : 'transparent' }}>
                              <Text style={{ fontSize: 17, color: !selectedSuptId ? C.gd : C.dm }}>None</Text>
                            </TouchableOpacity>
                            {companyBuilders.map(b => (
                              <TouchableOpacity key={b.id} onPress={() => { setSelectedSuptId(b.id); setShowSuptPicker(false); }}
                                style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: selectedSuptId === b.id ? C.gd + '22' : 'transparent' }}>
                                <Text style={{ fontSize: 17, color: selectedSuptId === b.id ? C.gd : C.text }}>{b.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}

              <Inp2 label="CONTRACT PRICE ($)" value={f.original_price} onChange={v => set('original_price', v)} type="number" placeholder="485000" />

              {/* Selection Template picker */}
              {selectionTemplates.length > 0 && (
                <View style={{ marginTop: 4, marginBottom: 16 }}>
                  <Text style={st.formLbl}>SELECTION TEMPLATE</Text>
                  <TouchableOpacity onPress={() => setShowSelTmplPicker(p => !p)}
                    style={{ backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 21, color: selectedSelTmplId ? C.text : C.ph }}>
                      {selectedSelTmplId ? (selectionTemplates.find(t => t.id === selectedSelTmplId)?.name || 'Unknown') : 'All selections (no template)'}
                    </Text>
                    <Text style={{ fontSize: 15, color: C.dm }}>▼</Text>
                  </TouchableOpacity>
                  {showSelTmplPicker && (
                    <View style={{ backgroundColor: C.cardBg || C.card, borderWidth: 1, borderColor: C.w10, borderRadius: 8, marginTop: 4, overflow: 'hidden', maxHeight: 200 }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <TouchableOpacity onPress={() => { setSelectedSelTmplId(null); setShowSelTmplPicker(false); }}
                          style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: !selectedSelTmplId ? C.gd + '22' : 'transparent' }}>
                          <Text style={{ fontSize: 19, color: !selectedSelTmplId ? C.gd : C.dm, fontStyle: 'italic' }}>All selections (no template)</Text>
                        </TouchableOpacity>
                        {selectionTemplates.map(tmpl => (
                          <TouchableOpacity key={tmpl.id} onPress={() => { setSelectedSelTmplId(tmpl.id); setShowSelTmplPicker(false); }}
                            style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w06, backgroundColor: selectedSelTmplId === tmpl.id ? C.gd + '22' : 'transparent' }}>
                            <Text style={{ fontSize: 19, color: selectedSelTmplId === tmpl.id ? C.gd : C.text }}>{tmpl.name}</Text>
                            <Text style={{ fontSize: 16, color: C.dm }}>{(tmpl.item_ids || []).length} selection{(tmpl.item_ids || []).length !== 1 ? 's' : ''}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <View style={st.divider} />
              <ScheduleBuilder
                tasks={scheduleTasks}
                onTasksChange={setScheduleTasks}
                collapsed={!!appliedTemplate}
                templateInfo={appliedTemplate}
                tradesList={builderTrades}
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
                    <Feather name={reviewTmplInfo?.icon || 'clipboard'} size={28} color={C.dm} />
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
                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => { setTradeDropdownIdx(null); setTemplateTradeSearch(''); }}>
                      <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                        <View style={{ width: 320, backgroundColor: C.modalBg, borderRadius: 12, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', maxHeight: 420,
                          ...(Platform.OS === 'web' ? { boxShadow: '0 8px 30px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
                          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.w08 }}>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Select Trade</Text>
                          </View>
                          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                            <TextInput
                              value={templateTradeSearch}
                              onChangeText={setTemplateTradeSearch}
                              placeholder="Search trades..."
                              placeholderTextColor={C.w20}
                              style={{ fontSize: 15, color: C.text, backgroundColor: C.w04, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.w08 }}
                              autoFocus
                            />
                          </View>
                          <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                            {builderTrades.filter(t => !templateTradeSearch.trim() || t.toLowerCase().includes(templateTradeSearch.toLowerCase())).map(trade => {
                              const isActive = reviewTasks[tradeDropdownIdx]?.trade === trade;
                              return (
                                <TouchableOpacity key={trade} onPress={() => {
                                  setReviewTasks(prev => prev.map((t, i) => i === tradeDropdownIdx ? { ...t, trade } : t));
                                  setTradeDropdownIdx(null);
                                  setTemplateTradeSearch('');
                                }}
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.w04,
                                    ...(isActive ? { backgroundColor: 'rgba(59,130,246,0.12)' } : {}) }} activeOpacity={0.7}>
                                  <Text style={{ fontSize: 17, color: isActive ? C.bl : C.text, fontWeight: isActive ? '600' : '400' }}>{trade}</Text>
                                  {isActive && <Feather name="check" size={19} color={C.bl} />}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                          {reviewTasks[tradeDropdownIdx]?.trade && (
                            <TouchableOpacity onPress={() => {
                              setReviewTasks(prev => prev.map((t, i) => i === tradeDropdownIdx ? { ...t, trade: '' } : t));
                              setTradeDropdownIdx(null);
                              setTemplateTradeSearch('');
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
  'Concrete', 'Doors', 'Electrical', 'Excavation', 'Gravel',
  'HVAC', 'Insulation', 'Plumbing', 'Sheetrock', 'Trim',
];

const NewSubModal = ({ onClose, onCreated, tradesList }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
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
  const [allTrades, setAllTrades] = useState(tradesList || DEFAULT_TRADES);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showTradeDropdown, setShowTradeDropdown] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleTrade = (trade) => {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const canSave = companyName.trim() && firstName.trim() && lastName.trim() && email.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/users`, {
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
          company_id: user.company_id,
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="user" size={20} color={C.textBold} />
                <Text style={st.exTitle}>Add Subcontractor</Text>
              </View>
              <Text style={st.exSubtitle}>Account created with default password: Liberty1</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Feather name="x" size={21} color={C.mt} />
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
              <TouchableOpacity
                onPress={() => { setShowTradeDropdown(true); setTradeSearch(''); }}
                style={[st.nsInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 16, color: selectedTrades.length > 0 ? C.text : C.w20, flex: 1 }} numberOfLines={1}>
                  {selectedTrades.length > 0 ? selectedTrades.join(', ') : 'Select trades...'}
                </Text>
                <Text style={{ fontSize: 14, color: C.dm }}>▼</Text>
              </TouchableOpacity>
              {selectedTrades.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {selectedTrades.map(trade => (
                    <TouchableOpacity key={trade} onPress={() => toggleTrade(trade)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(59,130,246,0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: 14, color: C.bl, fontWeight: '600' }}>{trade}</Text>
                      <Feather name="x" size={13} color={C.bl} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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

        {/* Trade picker overlay */}
        {showTradeDropdown && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center',
            zIndex: 999,
          }}>
            <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              activeOpacity={1} onPress={() => setShowTradeDropdown(false)} />
            <View style={{ width: 320, maxHeight: 440, backgroundColor: C.cardBg || '#1e3040', borderRadius: 12, borderWidth: 1, borderColor: C.w10, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.5)' } : { elevation: 20 }) }}>
              <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Select Trades</Text>
              </View>
              <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                <TextInput
                  value={tradeSearch}
                  onChangeText={setTradeSearch}
                  placeholder="Search trades..."
                  placeholderTextColor={C.w20}
                  style={{ fontSize: 15, color: C.text, backgroundColor: C.w04, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.w08 }}
                  autoFocus
                />
              </View>
              <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {allTrades.filter(t => !tradeSearch.trim() || t.toLowerCase().includes(tradeSearch.toLowerCase())).map(trade => {
                  const on = selectedTrades.includes(trade);
                  return (
                    <TouchableOpacity key={trade} onPress={() => toggleTrade(trade)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04,
                        backgroundColor: on ? 'rgba(59,130,246,0.12)' : 'transparent' }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: 17, color: on ? C.bl : C.text, fontWeight: on ? '600' : '400' }}>{trade}</Text>
                      {on && <Feather name="check" size={19} color={C.bl} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity onPress={() => setShowTradeDropdown(false)}
                style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.sw06 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.gd }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
  const { user } = React.useContext(AuthContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('file');
  const [appliesTo, setAppliesTo] = useState('both');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/document-templates${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  React.useEffect(() => { fetchTemplates(); }, []);

  const addTemplate = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Document name is required');
    try {
      const res = await apiFetch(`/document-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), doc_type: docType, applies_to: appliesTo, user_id: user.id }),
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
      const res = await apiFetch(`/document-templates/${id}`, { method: 'DELETE' });
      if (res.ok) setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) { Alert.alert('Error', e.message); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={[st.exBox, { maxWidth: 560, maxHeight: '94%' }]}>
          <View style={st.exHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="file-text" size={20} color={C.textBold} />
              <Text style={st.exTitle}>Manage Documents</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Feather name="x" size={21} color={C.mt} />
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
                  <Feather name={t === 'file' ? 'file-text' : 'folder'} size={20} color={docType === t ? C.gd : C.mt} style={{ marginBottom: 2 }} />
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
                <Feather name="clipboard" size={42} color={C.dm} style={{ marginBottom: 8 }} />
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
                  <Feather name={t.doc_type === 'folder' ? 'folder' : 'file-text'} size={22} color={C.dm} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>{t.name}</Text>
                    <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }}>
                      {t.doc_type === 'folder' ? 'Folder' : 'File'} · {t.applies_to === 'projects' ? 'Projects only' : t.applies_to === 'subdivisions' ? 'Subdivisions only' : 'Projects & Subdivisions'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteTemplate(t.id)}
                    style={{ padding: 6 }} activeOpacity={0.6}>
                    <Feather name="trash-2" size={18} color={C.rd} />
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
      const uploadRes = await apiFetch(`/upload-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: fileData.b64, ext: fileData.ext, name: fileData.originalName }),
      });
      if (!uploadRes.ok) throw new Error('File upload failed');
      const uploadData = await uploadRes.json();

      const res = await apiFetch(`/subdivisions/${subdivision.id}/documents`, {
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
              <Feather name="x" size={21} color={C.mt} />
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
                  <Feather name="check" size={36} color={C.gn} style={{ marginBottom: 6 }} />
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
const SelectionManagerModal = ({ onClose, builderTrades = [] }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [topTab, setTopTab] = useState('items'); // items | templates
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | create
  // Create form state
  const [trade, setTrade] = useState('');
  const [itemName, setItemName] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [options, setOptions] = useState([{ name: '', description: '', image_b64: '', image_path: '', price: '', comes_standard: false, price_tbd: false }]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Template state
  const [templates, setTemplates] = useState([]);
  const [tmplLoading, setTmplLoading] = useState(true);
  const [tmplView, setTmplView] = useState('list'); // list | create
  const [tmplName, setTmplName] = useState('');
  const [tmplSelectedIds, setTmplSelectedIds] = useState([]);
  const [tmplSaving, setTmplSaving] = useState(false);
  const [tmplEditingId, setTmplEditingId] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/selection-items${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      if (res.ok) setItems(await res.json());
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  const fetchTemplates = async () => {
    setTmplLoading(true);
    try {
      const res = await apiFetch(`/selection-templates${user.company_id ? `?company_id=${user.company_id}` : ''}`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.warn(e); }
    setTmplLoading(false);
  };

  React.useEffect(() => { fetchItems(); fetchTemplates(); }, []);

  const resetTmplForm = () => { setTmplName(''); setTmplSelectedIds([]); setTmplEditingId(null); };

  const saveTmpl = async () => {
    if (!tmplName.trim()) return Alert.alert('Error', 'Template name required');
    if (tmplSelectedIds.length === 0) return Alert.alert('Error', 'Select at least one item');
    setTmplSaving(true);
    try {
      const body = { name: tmplName.trim(), item_ids: tmplSelectedIds, user_id: user.id };
      const path = tmplEditingId ? `/selection-templates/${tmplEditingId}` : `/selection-templates`;
      const method = tmplEditingId ? 'PUT' : 'POST';
      const res = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchTemplates(); resetTmplForm(); setTmplView('list'); }
    } catch (e) { Alert.alert('Error', e.message); }
    setTmplSaving(false);
  };

  const deleteTmpl = async (id) => {
    Alert.alert('Delete Template', 'Projects using this template will show all selections. Continue?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await apiFetch(`/selection-templates/${id}`, { method: 'DELETE' });
        fetchTemplates();
      }},
    ]);
  };

  const editTmpl = (tmpl) => {
    setTmplEditingId(tmpl.id);
    setTmplName(tmpl.name);
    setTmplSelectedIds(tmpl.item_ids || []);
    setTmplView('create');
  };

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
      const res = await apiFetch(`/upload-image`, {
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

  const addOption = () => setOptions(prev => [...prev, { name: '', description: '', image_b64: '', image_path: '', price: '', comes_standard: false, price_tbd: false }]);
  const removeOption = (idx) => setOptions(prev => prev.filter((_, i) => i !== idx));
  const updateOption = (idx, field, val) => {
    setOptions(prev => prev.map((o, i) => {
      if (i !== idx) return o;
      const updated = { ...o, [field]: val };
      if (field === 'comes_standard' && val) { updated.price = '0'; updated.price_tbd = false; }
      if (field === 'price_tbd' && val) { updated.price = '0'; updated.comes_standard = false; }
      return updated;
    }));
  };

  const resetForm = () => {
    setTrade(''); setItemName(''); setAllowMultiple(false);
    setOptions([{ name: '', description: '', image_b64: '', image_path: '', price: '', comes_standard: false, price_tbd: false }]);
    setEditingId(null);
  };

  const saveItem = async () => {
    if (!trade || !itemName) return Alert.alert('Error', 'Trade and item name required');
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
          name: o.name, description: o.description || '',
          image_path: imgPath,
          price: (o.comes_standard || o.price_tbd) ? 0 : parseFloat(o.price) || 0,
          comes_standard: !!o.comes_standard,
          price_tbd: !!o.price_tbd,
        });
      }
      const body = { category: trade, item: itemName, options: cleanOptions, user_id: user.id, allow_multiple: allowMultiple };
      const path = editingId ? `/selection-items/${editingId}` : `/selection-items`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
        await apiFetch(`/selection-items/${id}`, { method: 'DELETE' });
        fetchItems();
      }},
    ]);
  };

  const editItem = (item) => {
    setEditingId(item.id);
    setTrade(item.category || '');
    setItemName(item.item);
    setAllowMultiple(!!item.allow_multiple);
    setOptions((item.options || []).map(o => ({
      name: o.name || '', description: o.description || '', image_b64: '', image_path: o.image_path || '',
      price: String(o.price || ''), comes_standard: !!o.comes_standard, price_tbd: !!o.price_tbd,
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

  // Group items by category for template create view
  const tmplGrouped = {};
  items.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!tmplGrouped[cat]) tmplGrouped[cat] = [];
    tmplGrouped[cat].push(item);
  });

  const isItemsTab = topTab === 'items';
  const headerTitle = isItemsTab
    ? (view === 'list' ? 'Manage Selections' : (editingId ? 'Edit Selection' : 'New Selection'))
    : (tmplView === 'list' ? 'Selection Templates' : (tmplEditingId ? 'Edit Template' : 'New Template'));
  const showBack = isItemsTab ? view === 'create' : tmplView === 'create';

  return (
    <Modal visible animationType="slide" transparent>
      <View style={st.exOverlay}>
        <View style={[st.exBox, { maxWidth: 640, maxHeight: '94%' }]}>
          <View style={st.exHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="sliders" size={20} color={C.textBold} />
              <Text style={st.exTitle}>{headerTitle}</Text>
            </View>
            <TouchableOpacity onPress={() => {
              if (showBack) { if (isItemsTab) { resetForm(); setView('list'); } else { resetTmplForm(); setTmplView('list'); } }
              else onClose();
            }} style={st.exCloseBtn}>
              <Feather name={showBack ? 'chevron-left' : 'x'} size={21} color={C.mt} />
            </TouchableOpacity>
          </View>

          {/* Tab bar */}
          {!showBack && (
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
              {[{ id: 'items', label: 'Items' }, { id: 'templates', label: 'Templates' }].map(t => (
                <TouchableOpacity key={t.id} onPress={() => setTopTab(t.id)}
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: topTab === t.id ? C.gd : 'transparent' }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 19, fontWeight: topTab === t.id ? '700' : '500', color: topTab === t.id ? C.gd : C.dm }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ITEMS TAB */}
          {isItemsTab && view === 'list' ? (
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
                    <Feather name="sliders" size={42} color={C.dm} style={{ marginBottom: 8 }} />
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
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>{item.item}</Text>
                                {item.allow_multiple && (
                                  <View style={{ backgroundColor: C.bH12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gd }}>MULTI</Text>
                                  </View>
                                )}
                              </View>
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
                                    <Feather name="camera" size={24} color={C.dm} style={{ opacity: 0.3 }} />
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
          ) : isItemsTab ? (
            /* CREATE / EDIT VIEW */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
              {/* Trade */}
              <Text style={st.formLbl}>TRADE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {builderTrades.length > 0 ? builderTrades.map(t => (
                  <TouchableOpacity key={t} onPress={() => setTrade(t)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                      borderWidth: 1, borderColor: trade === t ? C.gd : C.w10,
                      backgroundColor: trade === t ? C.bH12 : C.w03,
                    }} activeOpacity={0.7}>
                    <Text style={{ fontSize: 18, fontWeight: trade === t ? '700' : '500', color: trade === t ? C.gd : C.mt }}>{t}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={{ fontSize: 16, color: C.dm }}>No trades configured yet. Add trades to your company profile.</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <Inp2 label="ITEM NAME" value={itemName} onChange={setItemName} placeholder="e.g., Master Bath Countertop" />
                </View>
                <TouchableOpacity onPress={() => setAllowMultiple(!allowMultiple)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 }} activeOpacity={0.7}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 7, borderWidth: 2,
                    borderColor: allowMultiple ? C.gd : C.w15,
                    backgroundColor: allowMultiple ? C.gd : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {allowMultiple && <Feather name="check" size={16} color="#fff" />}
                  </View>
                  <Text style={{ fontSize: 18, color: C.text }}>Select Multiple?</Text>
                </TouchableOpacity>
              </View>

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
                  <Inp2 label="DESCRIPTION" value={opt.description} onChange={v => updateOption(idx, 'description', v)} placeholder="e.g., Durable quartz surface with a clean white finish" />

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
                      {opt.comes_standard && <Feather name="check" size={20} color="#fff" />}
                    </View>
                    <Text style={{ fontSize: 21, color: C.text }}>Comes Standard</Text>
                  </TouchableOpacity>

                  {/* Price TBD checkbox */}
                  {!opt.comes_standard && (
                    <TouchableOpacity onPress={() => updateOption(idx, 'price_tbd', !opt.price_tbd)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }} activeOpacity={0.7}>
                      <View style={{
                        width: 33, height: 33, borderRadius: 9, borderWidth: 2,
                        borderColor: opt.price_tbd ? '#f59e0b' : C.w15,
                        backgroundColor: opt.price_tbd ? '#f59e0b' : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {opt.price_tbd && <Feather name="check" size={20} color="#fff" />}
                      </View>
                      <Text style={{ fontSize: 21, color: C.text }}>Price TBD</Text>
                    </TouchableOpacity>
                  )}

                  {!opt.comes_standard && !opt.price_tbd && (
                    <Inp2 label="UPGRADE PRICE ($)" value={opt.price} onChange={v => updateOption(idx, 'price', v)} type="number" placeholder="0" />
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={saveItem} disabled={saving || !trade || !itemName || !options[0]?.name}
                style={[st.submitBtn, (saving || !trade || !itemName || !options[0]?.name) && { backgroundColor: C.dm }]} activeOpacity={0.8}>
                <Text style={{ color: C.textBold, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
                  {saving ? 'Saving...' : (editingId ? 'Update Selection' : 'Create Selection')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          ) : tmplView === 'list' ? (
            /* TEMPLATES LIST VIEW */
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 14, borderBottomWidth: 1, borderBottomColor: C.sw06 }}>
                <TouchableOpacity onPress={() => { resetTmplForm(); setTmplView('create'); }}
                  style={{ backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }} activeOpacity={0.8}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>+ New Template</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
                {tmplLoading ? (
                  <ActivityIndicator color={C.gd} style={{ marginTop: 40 }} />
                ) : templates.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                    <Feather name="layers" size={42} color={C.dm} style={{ marginBottom: 8 }} />
                    <Text style={{ color: C.mt, fontSize: 21, fontWeight: '600' }}>No templates yet</Text>
                    <Text style={{ color: C.dm, fontSize: 18, marginTop: 4 }}>Create templates to control which selections apply to each project</Text>
                  </View>
                ) : (
                  templates.map(tmpl => {
                    const count = (tmpl.item_ids || []).length;
                    return (
                      <View key={tmpl.id} style={{
                        backgroundColor: C.w03, borderWidth: 1, borderColor: C.w08, borderRadius: 10,
                        padding: 14, marginBottom: 8,
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>{tmpl.name}</Text>
                            <Text style={{ fontSize: 18, color: C.dm, marginTop: 2 }}>{count} selection{count !== 1 ? 's' : ''}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => editTmpl(tmpl)}>
                              <Text style={{ fontSize: 20, color: C.bl, fontWeight: '600' }}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteTmpl(tmpl.id)}>
                              <Text style={{ fontSize: 20, color: C.rd, fontWeight: '600' }}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : (
            /* TEMPLATES CREATE / EDIT VIEW */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
              <Inp2 label="TEMPLATE NAME" value={tmplName} onChange={setTmplName} placeholder="e.g., Standard Home Selections" />
              <Text style={{ fontSize: 18, color: C.dm, marginTop: -8, marginBottom: 16 }}>
                {tmplSelectedIds.length} selection{tmplSelectedIds.length !== 1 ? 's' : ''} included
              </Text>

              <Text style={st.formLbl}>SELECT ITEMS TO INCLUDE</Text>
              {items.length === 0 ? (
                <Text style={{ fontSize: 18, color: C.dm, marginBottom: 20 }}>No selection items yet. Create items first in the Items tab.</Text>
              ) : (
                Object.entries(tmplGrouped).map(([cat, catItems]) => (
                  <View key={cat} style={{ marginBottom: 14 }}>
                    <TouchableOpacity
                      onPress={() => {
                        const catIds = catItems.map(i => i.id);
                        const allSelected = catIds.every(id => tmplSelectedIds.includes(id));
                        if (allSelected) {
                          setTmplSelectedIds(prev => prev.filter(id => !catIds.includes(id)));
                        } else {
                          setTmplSelectedIds(prev => [...new Set([...prev, ...catIds])]);
                        }
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
                      activeOpacity={0.7}>
                      <View style={{
                        width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                        borderColor: catItems.every(i => tmplSelectedIds.includes(i.id)) ? C.gd : C.w15,
                        backgroundColor: catItems.every(i => tmplSelectedIds.includes(i.id)) ? C.gd : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {catItems.every(i => tmplSelectedIds.includes(i.id)) && <Feather name="check" size={14} color="#fff" />}
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: C.gd, letterSpacing: 1 }}>{cat.toUpperCase()}</Text>
                    </TouchableOpacity>
                    {catItems.map(item => {
                      const selected = tmplSelectedIds.includes(item.id);
                      return (
                        <TouchableOpacity key={item.id} onPress={() => {
                          setTmplSelectedIds(prev => selected ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                        }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 10 }}
                          activeOpacity={0.7}>
                          <View style={{
                            width: 28, height: 28, borderRadius: 7, borderWidth: 2,
                            borderColor: selected ? C.gd : C.w15,
                            backgroundColor: selected ? C.gd : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selected && <Feather name="check" size={16} color="#fff" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 20, color: selected ? C.text : C.mt }}>{item.item}</Text>
                            <Text style={{ fontSize: 16, color: C.dm }}>{(item.options || []).length} option{(item.options || []).length !== 1 ? 's' : ''}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}

              <TouchableOpacity onPress={saveTmpl} disabled={tmplSaving || !tmplName.trim() || tmplSelectedIds.length === 0}
                style={[st.submitBtn, (tmplSaving || !tmplName.trim() || tmplSelectedIds.length === 0) && { backgroundColor: C.dm }]} activeOpacity={0.8}>
                <Text style={{ color: C.textBold, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
                  {tmplSaving ? 'Saving...' : (tmplEditingId ? 'Update Template' : 'Create Template')}
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
  const { user } = React.useContext(AuthContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [exemptions, setExemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newRecurring, setNewRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchExemptions = async () => {
    try {
      const res = await apiFetch(`/workday-exemptions${user.company_id ? `?company_id=${user.company_id}` : ''}`);
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
      const res = await apiFetch(`/workday-exemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate.trim(), description: newDesc.trim(), recurring: newRecurring, user_id: user.id }),
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
      await apiFetch(`/workday-exemptions/${id}`, { method: 'DELETE' });
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="calendar" size={20} color={C.textBold} />
                <Text style={st.exTitle}>Workday Exemptions</Text>
              </View>
              <Text style={st.exSubtitle}>Days excluded from schedule calculations</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.exCloseBtn}>
              <Feather name="x" size={21} color={C.mt} />
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
                  {newRecurring && <Feather name="check" size={18} color={C.textBold} />}
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
                <Feather name="calendar" size={48} color={C.dm} style={{ marginBottom: 8 }} />
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
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Feather name="refresh-cw" size={12} color={C.gd} />
                                  <Text style={st.exRecurBadgeTxt}>Annual</Text>
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => deleteExemption(ex.id)} style={st.exDelBtn}>
                          <Feather name="x" size={18} color={C.rd} />
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
// BID TEMPLATE MANAGER MODAL
// ============================================================
const BidTemplateManagerModal = ({ onClose }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [topTab, setTopTab] = useState('templates'); // templates | disclaimers

  // --- Template state ---
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTmpl, setEditTmpl] = useState(null); // null=list, 'new'=create, {id,...}=editing
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategories, setEditCategories] = useState([]); // [{title, line_items:[{name,quantity,price_per_item,included,is_allowance}]}]
  const [editLotOverhead, setEditLotOverhead] = useState('0');
  const [editCommission, setEditCommission] = useState('0');
  const [saving, setSaving] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState('');

  // --- Disclaimer state ---
  const [disclaimers, setDisclaimers] = useState([]);
  const [discLoading, setDiscLoading] = useState(true);
  const [editDisc, setEditDisc] = useState(null); // null=list, 'new'=create, {id,...}=editing
  const [discTitle, setDiscTitle] = useState('');
  const [discDescription, setDiscDescription] = useState('');
  const [discSaving, setDiscSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await apiFetch('/bid-templates');
      if (res.ok) setTemplates(await res.json());
    } catch (e) { /* */ }
    setLoading(false);
  }, []);

  const fetchDisclaimers = useCallback(async () => {
    try {
      const res = await apiFetch('/bid-disclaimers');
      if (res.ok) setDisclaimers(await res.json());
    } catch (e) { /* */ }
    setDiscLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); fetchDisclaimers(); }, [fetchTemplates, fetchDisclaimers]);

  // --- Template helpers ---
  const loadTemplate = (tmpl) => {
    setEditTmpl(tmpl);
    setEditName(tmpl.name);
    setEditDesc(tmpl.description || '');
    setEditCategories(tmpl.categories || []);
    setEditLotOverhead(String(tmpl.lot_overhead || 0));
    setEditCommission(String(tmpl.commission || 0));
  };

  const startNew = () => {
    setEditTmpl('new');
    setEditName('');
    setEditDesc('');
    setEditCategories([]);
    setEditLotOverhead('0');
    setEditCommission('0');
  };

  const addCategory = () => {
    if (!newCatTitle.trim()) return;
    setEditCategories(prev => [...prev, { title: newCatTitle.trim(), line_items: [] }]);
    setNewCatTitle('');
  };

  const removeCategory = (idx) => {
    setEditCategories(prev => prev.filter((_, i) => i !== idx));
  };

  const addLineItem = (catIdx) => {
    setEditCategories(prev => prev.map((cat, i) =>
      i === catIdx ? { ...cat, line_items: [...cat.line_items, { name: '', quantity: 1, price_per_item: 0, included: false, is_allowance: false }] } : cat
    ));
  };

  const updateLineItem = (catIdx, liIdx, field, value) => {
    setEditCategories(prev => prev.map((cat, ci) =>
      ci === catIdx ? {
        ...cat,
        line_items: cat.line_items.map((li, li2) =>
          li2 === liIdx ? { ...li, [field]: value } : li
        ),
      } : cat
    ));
  };

  const removeLineItem = (catIdx, liIdx) => {
    setEditCategories(prev => prev.map((cat, ci) =>
      ci === catIdx ? { ...cat, line_items: cat.line_items.filter((_, i) => i !== liIdx) } : cat
    ));
  };

  const handleSave = async () => {
    if (!editName.trim()) return Alert.alert('Error', 'Template name is required');
    setSaving(true);
    try {
      const isNew = editTmpl === 'new';
      const path = isNew ? '/bid-templates' : `/bid-templates/${editTmpl.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          categories: editCategories,
          lot_overhead: parseFloat(editLotOverhead) || 0,
          commission: parseFloat(editCommission) || 0,
          created_by: user.id,
        }),
      });
      if (!res.ok) throw new Error(`Failed to ${isNew ? 'create' : 'update'} template`);
      Alert.alert('Success', `Template ${isNew ? 'created' : 'updated'}`);
      setEditTmpl(null);
      fetchTemplates();
    } catch (e) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const handleDelete = (tmpl) => {
    const doDelete = async () => {
      try {
        const res = await apiFetch(`/bid-templates/${tmpl.id}`, { method: 'DELETE' });
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

  // --- Disclaimer helpers ---
  const startNewDisc = () => {
    setEditDisc('new');
    setDiscTitle('');
    setDiscDescription('');
  };

  const loadDisc = (d) => {
    setEditDisc(d);
    setDiscTitle(d.title);
    setDiscDescription(d.description || '');
  };

  const handleSaveDisc = async () => {
    if (!discTitle.trim()) return Alert.alert('Error', 'Title is required');
    setDiscSaving(true);
    try {
      const isNew = editDisc === 'new';
      const path = isNew ? '/bid-disclaimers' : `/bid-disclaimers/${editDisc.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: discTitle.trim(), description: discDescription.trim() }),
      });
      if (!res.ok) throw new Error(`Failed to ${isNew ? 'create' : 'update'} disclaimer`);
      Alert.alert('Success', `Disclaimer ${isNew ? 'created' : 'updated'}`);
      setEditDisc(null);
      fetchDisclaimers();
    } catch (e) { Alert.alert('Error', e.message); }
    setDiscSaving(false);
  };

  const handleDeleteDisc = (d) => {
    const doDelete = async () => {
      try {
        const res = await apiFetch(`/bid-disclaimers/${d.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        if (editDisc?.id === d.id) setEditDisc(null);
        fetchDisclaimers();
      } catch (e) { Alert.alert('Error', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${d.title}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert('Delete Disclaimer', `Delete "${d.title}"? This cannot be undone.`, [
        { text: 'Cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const { width: winWidth } = useWindowDimensions();
  const isWide = winWidth > 600;
  const showBack = (topTab === 'templates' && editTmpl) || (topTab === 'disclaimers' && editDisc);

  return (
    <Modal visible animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: isWide ? 700 : '95%', maxHeight: '90%', backgroundColor: C.bg, borderRadius: 16, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {showBack && (
                <TouchableOpacity onPress={() => { if (topTab === 'templates') setEditTmpl(null); else setEditDisc(null); }} style={{ marginRight: 4 }}>
                  <Text style={{ fontSize: 28, color: C.gd, fontWeight: '300' }}>‹</Text>
                </TouchableOpacity>
              )}
              <Feather name="clipboard" size={22} color={C.gd} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>
                {topTab === 'templates'
                  ? (editTmpl ? (editTmpl === 'new' ? 'New Bid Template' : 'Edit Bid Template') : 'Bid Settings')
                  : (editDisc ? (editDisc === 'new' ? 'New Disclaimer' : 'Edit Disclaimer') : 'Bid Settings')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 28, color: C.dm }}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Bar */}
          {!showBack && (
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.w06 }}>
              {[{ id: 'templates', label: 'Bid Templates' }, { id: 'disclaimers', label: 'Disclaimers' }].map(t => (
                <TouchableOpacity key={t.id} onPress={() => setTopTab(t.id)}
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: topTab === t.id ? C.gd : 'transparent' }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 16, fontWeight: topTab === t.id ? '700' : '500', color: topTab === t.id ? C.gd : C.dm }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {topTab === 'templates' ? (
            /* ========== TEMPLATES TAB ========== */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {!editTmpl ? (
                /* ---- LIST VIEW ---- */
                <>
                  <TouchableOpacity onPress={startNew}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gd, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginBottom: 16, alignSelf: 'flex-start' }}>
                    <Feather name="plus" size={18} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>New Template</Text>
                  </TouchableOpacity>
                  {loading ? (
                    <ActivityIndicator color={C.gd} size="large" style={{ marginTop: 40 }} />
                  ) : templates.length === 0 ? (
                    <Text style={{ fontSize: 16, color: C.dm, textAlign: 'center', marginTop: 40 }}>No bid templates yet. Create one to get started.</Text>
                  ) : (
                    templates.map(tmpl => (
                      <View key={tmpl.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.w06, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} activeOpacity={0.7} onPress={() => loadTemplate(tmpl)}>
                          <Feather name="clipboard" size={32} color={C.dm} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: C.textBold }}>{tmpl.name}</Text>
                            {tmpl.description ? <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }} numberOfLines={1}>{tmpl.description}</Text> : null}
                            <Text style={{ fontSize: 14, color: C.mt, marginTop: 3 }}>{(tmpl.categories || []).length} categor{(tmpl.categories || []).length !== 1 ? 'ies' : 'y'}</Text>
                          </View>
                          <Text style={{ fontSize: 18, color: C.gd }}>Edit ›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(tmpl)} style={{ padding: 8, marginLeft: 8 }} activeOpacity={0.7}>
                          <Feather name="trash-2" size={20} color={C.rd || '#ef4444'} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </>
              ) : (
                /* ---- EDIT VIEW ---- */
                <>
                  {/* Name & Description */}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Template Name</Text>
                  <TextInput value={editName} onChangeText={setEditName} placeholder="e.g. Standard Residential"
                    placeholderTextColor={C.dm + '80'}
                    style={{ backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, marginBottom: 14, borderWidth: 1, borderColor: C.w08 }} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Description (optional)</Text>
                  <TextInput value={editDesc} onChangeText={setEditDesc} placeholder="Brief description..."
                    placeholderTextColor={C.dm + '80'}
                    style={{ backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, marginBottom: 14, borderWidth: 1, borderColor: C.w08 }} />

                  {/* Lot Overhead & Commission */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Lot Overhead ($)</Text>
                      <TextInput value={editLotOverhead} onChangeText={setEditLotOverhead} keyboardType="decimal-pad"
                        style={{ backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w08 }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Commission ($)</Text>
                      <TextInput value={editCommission} onChangeText={setEditCommission} keyboardType="decimal-pad"
                        style={{ backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w08 }} />
                    </View>
                  </View>

                  {/* Categories */}
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.textBold, marginBottom: 10 }}>Categories</Text>
                  {editCategories.map((cat, catIdx) => (
                    <View key={catIdx} style={{ backgroundColor: C.w06, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.w08 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.w08 }}>
                        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.textBold }}>{cat.title}</Text>
                        <TouchableOpacity onPress={() => removeCategory(catIdx)} style={{ padding: 4 }}>
                          <Feather name="trash-2" size={16} color={C.rd || '#ef4444'} />
                        </TouchableOpacity>
                      </View>
                      {/* Line items */}
                      {cat.line_items.map((li, liIdx) => (
                        <View key={liIdx} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.w06, gap: 8 }}>
                          <TextInput value={li.name} onChangeText={v => updateLineItem(catIdx, liIdx, 'name', v)} placeholder="Item name"
                            placeholderTextColor={C.dm + '80'} style={{ flex: 2, fontSize: 14, color: C.text, backgroundColor: C.bg, borderRadius: 6, padding: 8, borderWidth: 1, borderColor: C.w08 }} />
                          <TextInput value={String(li.quantity)} onChangeText={v => updateLineItem(catIdx, liIdx, 'quantity', parseFloat(v) || 0)} placeholder="Qty"
                            keyboardType="decimal-pad" placeholderTextColor={C.dm + '80'} style={{ width: 60, fontSize: 14, color: C.text, backgroundColor: C.bg, borderRadius: 6, padding: 8, textAlign: 'right', borderWidth: 1, borderColor: C.w08 }} />
                          <TextInput value={String(li.price_per_item)} onChangeText={v => updateLineItem(catIdx, liIdx, 'price_per_item', parseFloat(v) || 0)} placeholder="Price"
                            keyboardType="decimal-pad" placeholderTextColor={C.dm + '80'} style={{ width: 80, fontSize: 14, color: C.text, backgroundColor: C.bg, borderRadius: 6, padding: 8, textAlign: 'right', borderWidth: 1, borderColor: C.w08 }} />
                          <TouchableOpacity onPress={() => removeLineItem(catIdx, liIdx)} style={{ padding: 4 }}>
                            <Feather name="x" size={16} color={C.rd || '#ef4444'} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={() => addLineItem(catIdx)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 }}>
                        <Feather name="plus" size={14} color={C.gd} />
                        <Text style={{ fontSize: 13, color: C.gd, fontWeight: '600' }}>Add Line Item</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Add Category */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                    <TextInput value={newCatTitle} onChangeText={setNewCatTitle} placeholder="New category title..."
                      placeholderTextColor={C.dm + '80'} onSubmitEditing={addCategory}
                      style={{ flex: 1, backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.w08 }} />
                    <TouchableOpacity onPress={addCategory} disabled={!newCatTitle.trim()}
                      style={{ backgroundColor: C.gd, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', opacity: newCatTitle.trim() ? 1 : 0.4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Add</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Save button */}
                  <TouchableOpacity onPress={handleSave} disabled={saving}
                    style={{ backgroundColor: C.gd, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 20, opacity: saving ? 0.6 : 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{saving ? 'Saving...' : (editTmpl === 'new' ? 'Create Template' : 'Save Changes')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          ) : (
            /* ========== DISCLAIMERS TAB ========== */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {!editDisc ? (
                /* ---- LIST VIEW ---- */
                <>
                  <TouchableOpacity onPress={startNewDisc}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gd, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginBottom: 16, alignSelf: 'flex-start' }}>
                    <Feather name="plus" size={18} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>New Disclaimer</Text>
                  </TouchableOpacity>
                  {discLoading ? (
                    <ActivityIndicator color={C.gd} size="large" style={{ marginTop: 40 }} />
                  ) : disclaimers.length === 0 ? (
                    <Text style={{ fontSize: 16, color: C.dm, textAlign: 'center', marginTop: 40 }}>No disclaimers yet. Create one to get started.</Text>
                  ) : (
                    disclaimers.map(d => (
                      <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.w06, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} activeOpacity={0.7} onPress={() => loadDisc(d)}>
                          <Feather name="file-text" size={28} color={C.dm} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: C.textBold }}>{d.title}</Text>
                            {d.description ? <Text style={{ fontSize: 14, color: C.dm, marginTop: 2 }} numberOfLines={2}>{d.description}</Text> : null}
                          </View>
                          <Text style={{ fontSize: 18, color: C.gd }}>Edit ›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteDisc(d)} style={{ padding: 8, marginLeft: 8 }} activeOpacity={0.7}>
                          <Feather name="trash-2" size={20} color={C.rd || '#ef4444'} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </>
              ) : (
                /* ---- EDIT VIEW ---- */
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Title</Text>
                  <TextInput value={discTitle} onChangeText={setDiscTitle} placeholder="e.g. Payment Terms"
                    placeholderTextColor={C.dm + '80'}
                    style={{ backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, marginBottom: 14, borderWidth: 1, borderColor: C.w08 }} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Description</Text>
                  <TextInput value={discDescription} onChangeText={setDiscDescription} placeholder="Enter disclaimer text..."
                    placeholderTextColor={C.dm + '80'} multiline numberOfLines={6} textAlignVertical="top"
                    style={{ backgroundColor: C.w06, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, marginBottom: 20, borderWidth: 1, borderColor: C.w08, minHeight: 140 }} />
                  <TouchableOpacity onPress={handleSaveDisc} disabled={discSaving}
                    style={{ backgroundColor: C.gd, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 20, opacity: discSaving ? 0.6 : 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{discSaving ? 'Saving...' : (editDisc === 'new' ? 'Create Disclaimer' : 'Save Changes')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};


// ============================================================
// NEW BID MODAL
// ============================================================
const NewBidModal = ({ onClose, onCreated, currentUser }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
  const [f, sF] = useState({
    name: '', client_first_name: '', client_last_name: '',
    client_phone: '', client_email: '', bid_address: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const set = (key, val) => sF(prev => ({ ...prev, [key]: val }));

  const inputStyle = {
    fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  const create = async () => {
    if (!f.name.trim()) { setErr('Bid name is required'); return; }
    setLoading(true); setErr('');
    try {
      const res = await apiFetch('/bids', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, created_by: user.id }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error || 'Failed'); setLoading(false); return; }
      const newBid = await res.json();
      onCreated(newBid);
    } catch (e) { setErr(e.message); setLoading(false); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={onClose} />
          <View style={{ width: 440, maxHeight: '85%', backgroundColor: C.modalBg || C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="file-text" size={22} color={C.gd} />
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.textBold }}>New Bid</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={{ fontSize: 28, color: C.dm }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              {err ? <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}><Text style={{ color: '#ef4444', fontSize: 14 }}>{err}</Text></View> : null}

              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bid Name *</Text>
                <TextInput value={f.name} onChangeText={v => set('name', v)} placeholder="e.g. Smith Residence"
                  placeholderTextColor={C.dm + '80'} style={inputStyle} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client First Name</Text>
                  <TextInput value={f.client_first_name} onChangeText={v => set('client_first_name', v)} placeholder="Jane"
                    placeholderTextColor={C.dm + '80'} style={inputStyle} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client Last Name</Text>
                  <TextInput value={f.client_last_name} onChangeText={v => set('client_last_name', v)} placeholder="Smith"
                    placeholderTextColor={C.dm + '80'} style={inputStyle} />
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client Phone</Text>
                <TextInput value={f.client_phone} onChangeText={v => set('client_phone', v)} placeholder="(555) 123-4567"
                  placeholderTextColor={C.dm + '80'} keyboardType="phone-pad" style={inputStyle} />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client Email</Text>
                <TextInput value={f.client_email} onChangeText={v => set('client_email', v)} placeholder="jane@email.com"
                  placeholderTextColor={C.dm + '80'} keyboardType="email-address" autoCapitalize="none" style={inputStyle} />
              </View>

              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bid Address</Text>
                <TextInput value={f.bid_address} onChangeText={v => set('bid_address', v)} placeholder="123 Main St, City, ST 12345"
                  placeholderTextColor={C.dm + '80'} style={inputStyle} />
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.w06 }}>
              <TouchableOpacity onPress={onClose}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }} activeOpacity={0.7}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={create} disabled={!f.name.trim() || loading}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', opacity: (!f.name.trim() || loading) ? 0.4 : 1 }} activeOpacity={0.7}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.textBold }}>{loading ? 'Creating...' : 'Create Bid'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};


// ============================================================
// BID DETAIL VIEW — spreadsheet-like single page for bids
// ============================================================
const BidDetailView = ({ project, onProjectUpdate }) => {
  const C = React.useContext(ThemeContext);
  const { user } = React.useContext(AuthContext);
  const [bidTab, setBidTab] = useState('bid'); // 'bid' | 'info'
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lotOverhead, setLotOverhead] = useState(project.bid_lot_overhead || 0);
  const [commission, setCommission] = useState(project.bid_commission || 0);
  const [lotOverheadText, setLotOverheadText] = useState(String(project.bid_lot_overhead || 0));
  const [commissionText, setCommissionText] = useState(String(project.bid_commission || 0));
  const [showCatModal, setShowCatModal] = useState(false);
  const [catTitle, setCatTitle] = useState('');
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [bidTemplates, setBidTemplates] = useState([]);
  const [bidTemplatesLoading, setBidTemplatesLoading] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateDesc, setSaveTemplateDesc] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);
  const [confirmDeleteLine, setConfirmDeleteLine] = useState(null);
  const [priceToQuote, setPriceToQuote] = useState(project.bid_price_to_quote || 0);
  const [priceToQuoteText, setPriceToQuoteText] = useState(String(project.bid_price_to_quote || 0));
  const [sqftPercentLines, setSqftPercentLines] = useState([{ id: 1, percent: '10' }]);
  // Allowance categories
  const [allowanceCats, setAllowanceCats] = useState([]);
  const [showAddAllowanceCat, setShowAddAllowanceCat] = useState(false);
  const [newAllowanceCatName, setNewAllowanceCatName] = useState('');
  const [allowanceEditState, setAllowanceEditState] = useState({}); // { [itemId]: { name, price } }
  const [confirmDeleteAllowanceCat, setConfirmDeleteAllowanceCat] = useState(null);
  const [confirmDeleteAllowanceItem, setConfirmDeleteAllowanceItem] = useState(null);
  // Info tab state
  const [infoFields, setInfoFields] = useState({
    bid_client_first_name: project.bid_client_first_name || '',
    bid_client_last_name: project.bid_client_last_name || '',
    bid_client_phone: project.bid_client_phone || '',
    bid_client_email: project.bid_client_email || '',
    bid_address: project.bid_address || '',
    name: project.name || '',
  });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  // Inline editing state: { [lineId]: { name, quantity, price_per_item } }
  const [editState, setEditState] = useState({});
  // Ref map for all focusable cells: key -> TextInput ref
  const cellRefs = useRef({});
  // Debounce timers for auto-save
  const saveTimers = useRef({});

  const cellInputStyle = {
    fontSize: 14, color: C.text, paddingHorizontal: 6, paddingVertical: 4,
    borderWidth: 1, borderColor: 'transparent', borderRadius: 4,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };
  const cellInputFocused = { borderColor: C.gd, backgroundColor: C.w04 };
  const inputStyle = {
    fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.w12,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.w04,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch(`/projects/${project.id}/bid-categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
        // Initialize edit state from fetched data
        const es = {};
        data.forEach(cat => (cat.line_items || []).forEach(li => {
          es[li.id] = { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
        }));
        setEditState(es);
      }
    } catch (e) { /* */ }
    setLoading(false);
  }, [project.id]);

  useEffect(() => { fetchCategories(); fetchAllowanceCats(); }, [fetchCategories]);

  useEffect(() => {
    setLotOverhead(project.bid_lot_overhead || 0);
    setCommission(project.bid_commission || 0);
    setLotOverheadText(String(project.bid_lot_overhead || 0));
    setCommissionText(String(project.bid_commission || 0));
    setPriceToQuote(project.bid_price_to_quote || 0);
    setPriceToQuoteText(String(project.bid_price_to_quote || 0));
    setInfoFields({
      bid_client_first_name: project.bid_client_first_name || '',
      bid_client_last_name: project.bid_client_last_name || '',
      bid_client_phone: project.bid_client_phone || '',
      bid_client_email: project.bid_client_email || '',
      bid_address: project.bid_address || '',
      name: project.name || '',
    });
  }, [project.bid_lot_overhead, project.bid_commission, project.bid_price_to_quote, project.id]);

  const fetchBidTemplates = useCallback(async () => {
    setBidTemplatesLoading(true);
    try {
      const res = await apiFetch('/bid-templates');
      if (res.ok) setBidTemplates(await res.json());
    } catch (e) { /* */ }
    setBidTemplatesLoading(false);
  }, []);

  // Allowance category CRUD
  const fetchAllowanceCats = useCallback(async () => {
    try {
      const res = await apiFetch(`/projects/${project.id}/bid-allowance-categories`);
      if (res.ok) {
        const data = await res.json();
        setAllowanceCats(data);
        const es = {};
        data.forEach(cat => (cat.items || []).forEach(item => {
          es[item.id] = { name: item.name, quantity: String(item.quantity), price_per: String(item.price_per) };
        }));
        setAllowanceEditState(es);
      }
    } catch (e) { /* */ }
  }, [project.id]);

  const addAllowanceCat = async () => {
    if (!newAllowanceCatName.trim()) return;
    try {
      const res = await apiFetch(`/projects/${project.id}/bid-allowance-categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAllowanceCatName.trim() }),
      });
      if (res.ok) {
        const cat = await res.json();
        setAllowanceCats(prev => [...prev, cat]);
      }
    } catch (e) { /* */ }
    setNewAllowanceCatName('');
    setShowAddAllowanceCat(false);
  };

  const deleteAllowanceCat = async (catId) => {
    try {
      const res = await apiFetch(`/bid-allowance-categories/${catId}`, { method: 'DELETE' });
      if (res.ok) setAllowanceCats(await res.json());
    } catch (e) { /* */ }
    setConfirmDeleteAllowanceCat(null);
  };

  const addAllowanceItem = async (catId) => {
    try {
      const res = await apiFetch(`/bid-allowance-categories/${catId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Item' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAllowanceCats(prev => prev.map(c => c.id === catId ? updated : c));
        const newItem = updated.items[updated.items.length - 1];
        if (newItem) setAllowanceEditState(prev => ({ ...prev, [newItem.id]: { name: newItem.name, quantity: String(newItem.quantity), price_per: String(newItem.price_per) } }));
      }
    } catch (e) { /* */ }
  };

  const allowanceSaveTimers = useRef({});
  const updateAllowanceItem = async (itemId, data, catId) => {
    try {
      const res = await apiFetch(`/bid-allowance-items/${itemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setAllowanceCats(prev => prev.map(c => c.id === catId ? updated : c));
      }
    } catch (e) { /* */ }
  };

  const debounceAllowanceSave = useCallback((itemId, catId, field, value) => {
    const key = `${itemId}_${field}`;
    if (allowanceSaveTimers.current[key]) clearTimeout(allowanceSaveTimers.current[key]);
    allowanceSaveTimers.current[key] = setTimeout(() => {
      const payload = {};
      if (field === 'name') payload.name = value;
      else if (field === 'quantity') payload.quantity = parseFloat(value) || 0;
      else if (field === 'price_per') payload.price_per = parseFloat(value) || 0;
      updateAllowanceItem(itemId, payload, catId);
    }, 600);
  }, []);

  const handleAllowanceItemChange = useCallback((itemId, catId, field, value) => {
    setAllowanceEditState(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
    debounceAllowanceSave(itemId, catId, field, value);
  }, [debounceAllowanceSave]);

  const deleteAllowanceItem = async (itemId, catId) => {
    try {
      const res = await apiFetch(`/bid-allowance-items/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = await res.json();
        setAllowanceCats(prev => prev.map(c => c.id === catId ? updated : c));
        setAllowanceEditState(prev => { const n = { ...prev }; delete n[itemId]; return n; });
      }
    } catch (e) { /* */ }
    setConfirmDeleteAllowanceItem(null);
  };

  const applyTemplate = async (tmplId) => {
    try {
      const res = await apiFetch(`/projects/${project.id}/apply-bid-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: tmplId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories);
        setLotOverhead(data.lot_overhead || 0);
        setCommission(data.commission || 0);
        setLotOverheadText(String(data.lot_overhead || 0));
        setCommissionText(String(data.commission || 0));
        // Re-init edit state
        const es = {};
        (data.categories || []).forEach(cat => (cat.line_items || []).forEach(li => {
          es[li.id] = { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
        }));
        setEditState(es);
        if (onProjectUpdate) onProjectUpdate({ ...project, bid_lot_overhead: data.lot_overhead, bid_commission: data.commission });
      }
    } catch (e) { Alert.alert('Error', e.message); }
    setShowApplyTemplate(false);
  };

  const saveAsTemplate = async () => {
    if (!saveTemplateName.trim()) return Alert.alert('Error', 'Template name is required');
    try {
      const res = await apiFetch(`/projects/${project.id}/save-as-bid-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveTemplateName.trim(), description: saveTemplateDesc.trim() }),
      });
      if (res.ok) {
        Alert.alert('Success', 'Bid saved as template');
        setSaveTemplateName('');
        setSaveTemplateDesc('');
        setShowSaveAsTemplate(false);
      }
    } catch (e) { Alert.alert('Error', e.message); }
  };

  // Build flat navigation order: [cellKey, cellKey, ...]
  // cellKey format: "top_lotOverhead", "top_commission", "line_{lineId}_{field}"
  const navOrder = React.useMemo(() => {
    const order = ['top_lotOverhead', 'top_commission'];
    categories.forEach(cat => {
      (cat.line_items || []).forEach(li => {
        order.push(`line_${li.id}_name`, `line_${li.id}_quantity`, `line_${li.id}_price_per_item`);
      });
    });
    allowanceCats.forEach(cat => {
      (cat.items || []).forEach(item => {
        order.push(`allow_${item.id}_name`, `allow_${item.id}_qty`, `allow_${item.id}_price`);
      });
    });
    return order;
  }, [categories, allowanceCats]);

  const focusCell = useCallback((key) => {
    const ref = cellRefs.current[key];
    if (ref?.focus) ref.focus();
  }, []);

  const navigateFrom = useCallback((currentKey, direction) => {
    const idx = navOrder.indexOf(currentKey);
    if (idx === -1) return;
    let nextIdx;
    if (direction === 'next') {
      nextIdx = idx + 1 < navOrder.length ? idx + 1 : 0;
    } else if (direction === 'prev') {
      nextIdx = idx - 1 >= 0 ? idx - 1 : navOrder.length - 1;
    } else if (direction === 'down') {
      // Move down in same column position
      // Find which column we're in (0=name, 1=qty, 2=price for line items)
      const parts = currentKey.split('_');
      if (parts[0] === 'top') {
        // From top row, go to first line item of same-ish column
        if (currentKey === 'top_lotOverhead' && navOrder.length > 2) { focusCell(navOrder[2]); return; }
        if (currentKey === 'top_commission' && navOrder.length > 2) { focusCell(navOrder[2]); return; }
        return;
      }
      const field = parts[parts.length - 1];
      const fieldCols = navOrder.filter(k => k.endsWith('_' + field));
      const colIdx = fieldCols.indexOf(currentKey);
      if (colIdx >= 0 && colIdx + 1 < fieldCols.length) { focusCell(fieldCols[colIdx + 1]); return; }
      return;
    } else if (direction === 'up') {
      const parts = currentKey.split('_');
      if (parts[0] === 'top') return;
      const field = parts[parts.length - 1];
      const fieldCols = navOrder.filter(k => k.endsWith('_' + field));
      const colIdx = fieldCols.indexOf(currentKey);
      if (colIdx > 0) { focusCell(fieldCols[colIdx - 1]); return; }
      // At top of column, go to top row
      if (field === 'name' || field === 'quantity' || field === 'qty') { focusCell('top_lotOverhead'); return; }
      if (field === 'price_per_item' || field === 'price') { focusCell('top_commission'); return; }
      return;
    } else if (direction === 'left') {
      // Move left in same row
      const parts = currentKey.split('_');
      if (parts[0] === 'top') {
        if (currentKey === 'top_commission') { focusCell('top_lotOverhead'); return; }
        return;
      }
      const prefix = parts[0]; // 'line' or 'allow'
      const itemId = parts[1];
      const field = parts[parts.length - 1];
      if (prefix === 'line') {
        if (field === 'quantity') { focusCell(`line_${itemId}_name`); return; }
        if (field === 'price_per_item') { focusCell(`line_${itemId}_quantity`); return; }
      } else if (prefix === 'allow') {
        if (field === 'qty') { focusCell(`allow_${itemId}_name`); return; }
        if (field === 'price') { focusCell(`allow_${itemId}_qty`); return; }
      }
      return;
    } else if (direction === 'right') {
      const parts = currentKey.split('_');
      if (parts[0] === 'top') {
        if (currentKey === 'top_lotOverhead') { focusCell('top_commission'); return; }
        return;
      }
      const prefix = parts[0];
      const itemId = parts[1];
      const field = parts[parts.length - 1];
      if (prefix === 'line') {
        if (field === 'name') { focusCell(`line_${itemId}_quantity`); return; }
        if (field === 'quantity') { focusCell(`line_${itemId}_price_per_item`); return; }
      } else if (prefix === 'allow') {
        if (field === 'name') { focusCell(`allow_${itemId}_qty`); return; }
        if (field === 'qty') { focusCell(`allow_${itemId}_price`); return; }
      }
      return;
    }
    if (nextIdx !== undefined) focusCell(navOrder[nextIdx]);
  }, [navOrder, focusCell]);

  // Separate square footage category from normal categories
  const sqftCategory = categories.find(c => c.is_square_footage);
  const normalCategories = categories.filter(c => !c.is_square_footage);

  // Compute totals (square footage items also count toward total)
  const categorySubtotals = categories.reduce((sum, c) => sum + (c.subtotal || 0), 0);
  const allowancesTotal = allowanceCats.reduce((sum, c) => sum + (c.total || 0), 0);
  const overhead = Math.round((categorySubtotals + allowancesTotal) * 0.08 * 100) / 100;
  const totalCost = categorySubtotals + overhead + lotOverhead + commission + allowancesTotal;

  // Square footage computed values
  const totalSquareFootage = sqftCategory
    ? (sqftCategory.line_items || []).reduce((sum, li) => {
        const es = editState[li.id];
        return sum + (parseFloat(es ? es.quantity : li.quantity) || 0);
      }, 0)
    : 0;
  const pricePerSqft = totalSquareFootage > 0 ? totalCost / totalSquareFootage : 0;

  // Ensure square footage category exists
  const ensureSqftCategory = useCallback(async () => {
    if (sqftCategory) return sqftCategory;
    try {
      const res = await apiFetch(`/projects/${project.id}/bid-categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Square Footage', is_square_footage: true }),
      });
      if (res.ok) {
        const cat = await res.json();
        setCategories(prev => [...prev, cat]);
        return cat;
      }
    } catch (e) { /* */ }
    return null;
  }, [sqftCategory, project.id]);

  const saveBidField = async (field, value) => {
    try {
      await apiFetch(`/projects/${project.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      onProjectUpdate({ [field]: value });
    } catch (e) { /* */ }
  };

  const addCategory = async () => {
    if (!catTitle.trim()) return;
    try {
      const res = await apiFetch(`/projects/${project.id}/bid-categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: catTitle.trim() }),
      });
      if (res.ok) {
        const cat = await res.json();
        setCategories(prev => [...prev, cat]);
      }
    } catch (e) { /* */ }
    setCatTitle(''); setShowCatModal(false);
  };

  const deleteCategory = async (catId) => {
    try {
      await apiFetch(`/bid-categories/${catId}`, { method: 'DELETE' });
      setCategories(prev => prev.filter(c => c.id !== catId));
    } catch (e) { /* */ }
    setConfirmDeleteCat(null);
  };

  const addLineItem = async (catId) => {
    try {
      const res = await apiFetch(`/bid-categories/${catId}/line-items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Item' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCategories(prev => prev.map(c => c.id === catId ? updated : c));
        // Init edit state for new line item and focus its name
        const newLi = updated.line_items[updated.line_items.length - 1];
        if (newLi) {
          setEditState(prev => ({ ...prev, [newLi.id]: { name: newLi.name, quantity: String(newLi.quantity), price_per_item: String(newLi.price_per_item) } }));
          setTimeout(() => focusCell(`line_${newLi.id}_name`), 100);
        }
      }
    } catch (e) { /* */ }
  };

  const updateLineItem = async (lineId, data, catId) => {
    try {
      const res = await apiFetch(`/bid-line-items/${lineId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setCategories(prev => prev.map(c => c.id === catId ? updated : c));
      }
    } catch (e) { /* */ }
  };

  const debounceSave = useCallback((lineId, catId, field, value) => {
    const timerKey = `${lineId}_${field}`;
    if (saveTimers.current[timerKey]) clearTimeout(saveTimers.current[timerKey]);
    saveTimers.current[timerKey] = setTimeout(() => {
      const es = editState[lineId] || {};
      const payload = {};
      if (field === 'name') payload.name = value;
      else if (field === 'quantity') payload.quantity = parseFloat(value) || 0;
      else if (field === 'price_per_item') payload.price_per_item = parseFloat(value) || 0;
      updateLineItem(lineId, payload, catId);
    }, 600);
  }, [editState]);

  const handleCellChange = useCallback((lineId, catId, field, value) => {
    setEditState(prev => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }));
    debounceSave(lineId, catId, field, value);
  }, [debounceSave]);

  const toggleLineField = async (li, catId, field) => {
    const newVal = !li[field];
    await updateLineItem(li.id, { [field]: newVal }, catId);
  };

  const deleteLineItem = async (lineId, catId) => {
    try {
      const res = await apiFetch(`/bid-line-items/${lineId}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = await res.json();
        setCategories(prev => prev.map(c => c.id === catId ? updated : c));
        setEditState(prev => { const n = { ...prev }; delete n[lineId]; return n; });
      }
    } catch (e) { /* */ }
    setConfirmDeleteLine(null);
  };

  const fmt = (n) => {
    const num = parseFloat(n) || 0;
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  // Track focus state per cell for styling
  const [focusedCell, setFocusedCell] = useState(null);
  const [cellHeights, setCellHeights] = useState({});

  const cellTxt = { fontSize: 14, color: C.text };
  const headerTxt = { fontSize: 12, fontWeight: '700', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 };
  const rowBg = (i) => i % 2 === 0 ? 'transparent' : (C.w04 || 'rgba(255,255,255,0.04)');

  // Keep a stable ref to navigateFrom so DOM listeners never go stale
  const navigateRef = useRef(navigateFrom);
  useEffect(() => { navigateRef.current = navigateFrom; }, [navigateFrom]);

  // Attach native DOM keydown listener to the underlying <input> element
  // RN Web TextInput ignores unknown props like onKeyDown, so we do it via ref
  const attachedNodes = useRef(new WeakSet());
  const setCellRef = useCallback((cellKey, node) => {
    cellRefs.current[cellKey] = node;
    if (Platform.OS !== 'web' || !node) return;
    // Get the actual DOM input element from the RN ref
    const el = node._node || node._inputElement || node;
    const inputEl = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' ? el : el?.querySelector?.('input, textarea') || el;
    if (!inputEl?.addEventListener) return;
    if (attachedNodes.current.has(inputEl)) return; // already attached to this DOM node
    attachedNodes.current.add(inputEl);
    inputEl.addEventListener('keydown', (e) => {
      const key = e.key;
      const nav = navigateRef.current;
      if (key === 'Tab') { e.preventDefault(); nav(cellKey, e.shiftKey ? 'prev' : 'next'); }
      else if (key === 'ArrowDown') { e.preventDefault(); nav(cellKey, 'down'); }
      else if (key === 'ArrowUp') { e.preventDefault(); nav(cellKey, 'up'); }
      else if (key === 'Enter') { e.preventDefault(); nav(cellKey, 'down'); }
      else if (key === 'ArrowLeft') {
        if (inputEl.selectionStart === 0 && inputEl.selectionEnd === 0) { e.preventDefault(); nav(cellKey, 'left'); }
      } else if (key === 'ArrowRight') {
        if (inputEl.selectionStart === inputEl.value?.length) { e.preventDefault(); nav(cellKey, 'right'); }
      }
    });
  }, []);

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.gd} size="large" /></View>;
  }

  const saveInfoFields = async () => {
    setInfoSaving(true);
    try {
      const res = await apiFetch(`/projects/${project.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(infoFields),
      });
      if (res.ok) {
        const updated = await res.json();
        if (onProjectUpdate) onProjectUpdate(updated);
        setInfoSaved(true);
        setTimeout(() => setInfoSaved(false), 2000);
      }
    } catch (e) { /* */ }
    setInfoSaving(false);
  };

  const downloadBid = async () => {
    if (Platform.OS !== 'web') return;
    // Fetch company logo
    let logoHtml = '';
    try {
      let logoRes = await apiFetch(`/users/${user.id}/logo`);
      let logoData = await logoRes.json();
      if (!logoData.logo) {
        logoRes = await apiFetch('/builder-logo');
        logoData = await logoRes.json();
      }
      if (logoData.logo) {
        logoHtml = `<img src="${logoData.logo}" style="max-width:280px;max-height:110px;object-fit:contain;" />`;
      }
    } catch (e) { /* */ }

    // Fetch disclaimers
    let discList = [];
    try {
      const dRes = await apiFetch('/bid-disclaimers');
      if (dRes.ok) discList = await dRes.json();
    } catch (e) { /* */ }

    const homebuyer = [infoFields.bid_client_first_name, infoFields.bid_client_last_name].filter(Boolean).join(' ');
    const address = infoFields.bid_address || '';
    const quoteDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const homePrice = priceToQuote;
    const fmtMoney = (n) => {
      const num = parseFloat(n) || 0;
      return '$ ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Build line items rows - separate regular from allowance
    let rowIdx = 0;
    let regularRows = '';
    let allowanceRows = '';
    let currentCatTitle = '';

    // Square footage category first
    if (sqftCategory && (sqftCategory.line_items || []).length > 0) {
      regularRows += `<tr class="cat-row"><td colspan="2"><b>Square Footage</b></td></tr>`;
      rowIdx++;
      (sqftCategory.line_items || []).forEach(li => {
        const es = editState[li.id] || { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
        const bg = rowIdx % 2 === 0 ? '#f5f5f5' : '#ffffff';
        regularRows += `<tr style="background:${bg}"><td style="padding:6px 12px;">${es.name || ''}</td><td style="padding:6px 12px;text-align:right;">${parseFloat(es.quantity) || 0}</td></tr>`;
        rowIdx++;
      });
    }

    // Normal categories
    normalCategories.forEach(cat => {
      const catItems = cat.line_items || [];
      const nonAllowanceItems = catItems.filter(li => !li.is_allowance);
      const allowanceItems = catItems.filter(li => li.is_allowance);

      if (nonAllowanceItems.length > 0) {
        regularRows += `<tr class="cat-row"><td colspan="2"><b>${cat.title}</b></td></tr>`;
        rowIdx++;
        nonAllowanceItems.forEach(li => {
          const es = editState[li.id] || { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
          const total = (parseFloat(es.quantity) || 0) * (parseFloat(es.price_per_item) || 0);
          const bg = rowIdx % 2 === 0 ? '#f5f5f5' : '#ffffff';
          const priceCell = li.included ? 'Included' : fmtMoney(total);
          regularRows += `<tr style="background:${bg}"><td style="padding:6px 12px;">${es.name || ''}</td><td style="padding:6px 12px;text-align:right;">${priceCell}</td></tr>`;
          rowIdx++;
        });
      }

      if (allowanceItems.length > 0) {
        allowanceItems.forEach(li => {
          const es = editState[li.id] || { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
          const total = (parseFloat(es.quantity) || 0) * (parseFloat(es.price_per_item) || 0);
          allowanceRows += `<tr style="background:#ffffff"><td style="padding:6px 12px;">${es.name || ''} - Allowance</td><td style="padding:6px 12px;text-align:right;">${fmtMoney(total)}</td></tr>`;
        });
      }
    });

    // Allowance categories from the breakdown section
    allowanceCats.forEach(cat => {
      (cat.items || []).forEach(item => {
        const es = allowanceEditState[item.id] || { name: item.name, quantity: String(item.quantity), price_per: String(item.price_per) };
        const total = (parseFloat(es.quantity) || 0) * (parseFloat(es.price_per) || 0);
        allowanceRows += `<tr style="background:#ffffff"><td style="padding:6px 12px;">${es.name || ''} - Allowance</td><td style="padding:6px 12px;text-align:right;">${fmtMoney(total)}</td></tr>`;
      });
    });

    // Build disclaimers HTML
    let disclaimerHtml = '';
    if (discList.length > 0) {
      disclaimerHtml = `<div class="page-break"></div>`;
      discList.forEach(d => {
        disclaimerHtml += `
          <div style="margin-bottom:28px;">
            <p style="font-size:14px;margin:0 0 8px 0;"><b>${d.title}</b></p>
            <p style="font-size:13px;color:#333;margin:0 0 12px 0;white-space:pre-wrap;">${d.description || ''}</p>
            <p style="font-size:13px;margin:0;">Homebuyer Initial _________</p>
          </div>
        `;
      });
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Home Quote - ${homebuyer || infoFields.name}</title>
<style>
  @page { margin: 0.6in 0.7in; size: letter; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #222; margin: 0; padding: 0; }
  .page-break { page-break-before: always; }
  table { width: 100%; border-collapse: collapse; }
  .cat-row td { padding: 8px 12px; background: #e8e8e8; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div style="padding:20px 0;">
    <!-- Header -->
    <table style="margin-bottom:4px;">
      <tr>
        <td style="width:50%;vertical-align:middle;">
          ${logoHtml || '<div style="font-size:22px;font-weight:bold;color:#333;">Home Quote</div>'}
        </td>
        <td style="width:50%;text-align:right;vertical-align:middle;">
          <div style="font-size:26px;font-weight:bold;color:#222;letter-spacing:1px;">HOME QUOTE</div>
          <div style="font-size:12px;color:#666;margin-top:4px;">Quote Good for 7 Days</div>
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:2px solid #222;margin:8px 0 12px 0;">

    <!-- Info section -->
    <table style="margin-bottom:20px;">
      <tr>
        <td style="width:55%;vertical-align:top;padding-right:20px;">
          <table style="font-size:13px;">
            <tr><td style="color:#666;padding:3px 10px 3px 0;white-space:nowrap;">Homebuyer:</td><td style="font-weight:600;">${homebuyer}</td></tr>
            <tr><td style="color:#666;padding:3px 10px 3px 0;white-space:nowrap;">Address:</td><td style="font-weight:600;">${address}</td></tr>
            <tr><td style="color:#666;padding:3px 10px 3px 0;white-space:nowrap;">Quote Date:</td><td style="font-weight:600;">${quoteDate}</td></tr>
          </table>
        </td>
        <td style="width:45%;vertical-align:top;text-align:right;">
          <p style="font-size:13px;margin:0 0 8px 0;">Homebuyer Initial: _________</p>
          <p style="font-size:16px;font-weight:bold;margin:0;">Home Price: ${fmtMoney(homePrice)}</p>
        </td>
      </tr>
    </table>

    <!-- Home Build Description -->
    <div style="text-align:center;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:bold;border-bottom:2px solid #222;padding-bottom:2px;">Home Build Description</span>
    </div>

    <!-- Items Table -->
    <table style="border:1px solid #ccc;margin-bottom:4px;">
      <thead>
        <tr style="background:#d0d0d0;">
          <th style="text-align:left;padding:8px 12px;font-size:13px;">Description</th>
          <th style="text-align:right;padding:8px 12px;font-size:13px;width:140px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${regularRows}
      </tbody>
    </table>

    <!-- Allowances -->
    ${allowanceRows ? `
    <div style="margin-top:16px;">
      <table style="border:1px solid #ccc;">
        <thead>
          <tr style="background:#d0d0d0;">
            <th style="text-align:left;padding:8px 12px;font-size:13px;" colspan="2"><b>Allowances</b></th>
          </tr>
        </thead>
        <tbody>
          ${allowanceRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Disclaimers -->
    ${disclaimerHtml}
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  const infoInputStyle = {
    fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.w12,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.w04,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="file-text" size={22} color={C.gd} />
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>{project.name}</Text>
          <View style={{ backgroundColor: C.gd + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gd }}>BID</Text>
          </View>
        </View>
        {bidTab === 'bid' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={() => { fetchBidTemplates(); setShowApplyTemplate(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.gd, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Feather name="download" size={14} color={C.gd} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.gd }}>Apply Template</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSaveAsTemplate(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.w12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Feather name="save" size={14} color={C.dm} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm }}>Save as Template</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCatModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Add Category</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.w06 }}>
        {[['bid', 'Bid'], ['info', 'Info']].map(([id, label]) => {
          const active = bidTab === id;
          return (
            <TouchableOpacity key={id} onPress={() => setBidTab(id)}
              style={{ paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: active ? C.gd : 'transparent' }} activeOpacity={0.7}>
              <Text style={{ fontSize: 15, fontWeight: active ? '700' : '500', color: active ? C.gd : C.dm }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {bidTab === 'info' ? (
        /* ========== INFO TAB ========== */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, maxWidth: 500 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Homeowner Information</Text>
            {Platform.OS === 'web' && (
              <TouchableOpacity onPress={downloadBid}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }} activeOpacity={0.7}>
                <Feather name="download" size={14} color="#fff" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Download Bid</Text>
              </TouchableOpacity>
            )}
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bid Name</Text>
            <TextInput value={infoFields.name} onChangeText={v => setInfoFields(p => ({ ...p, name: v }))}
              placeholder="e.g. Smith Residence" placeholderTextColor={C.dm + '80'} style={infoInputStyle} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>First Name</Text>
              <TextInput value={infoFields.bid_client_first_name} onChangeText={v => setInfoFields(p => ({ ...p, bid_client_first_name: v }))}
                placeholder="Jane" placeholderTextColor={C.dm + '80'} style={infoInputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Last Name</Text>
              <TextInput value={infoFields.bid_client_last_name} onChangeText={v => setInfoFields(p => ({ ...p, bid_client_last_name: v }))}
                placeholder="Smith" placeholderTextColor={C.dm + '80'} style={infoInputStyle} />
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</Text>
            <TextInput value={infoFields.bid_client_phone} onChangeText={v => setInfoFields(p => ({ ...p, bid_client_phone: v }))}
              placeholder="(555) 123-4567" placeholderTextColor={C.dm + '80'} keyboardType="phone-pad" style={infoInputStyle} />
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</Text>
            <TextInput value={infoFields.bid_client_email} onChangeText={v => setInfoFields(p => ({ ...p, bid_client_email: v }))}
              placeholder="jane@email.com" placeholderTextColor={C.dm + '80'} keyboardType="email-address" autoCapitalize="none" style={infoInputStyle} />
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Address</Text>
            <TextInput value={infoFields.bid_address} onChangeText={v => setInfoFields(p => ({ ...p, bid_address: v }))}
              placeholder="123 Main St, City, ST 12345" placeholderTextColor={C.dm + '80'} style={infoInputStyle} />
          </View>

          <TouchableOpacity onPress={saveInfoFields} disabled={infoSaving}
            style={{ marginTop: 24, backgroundColor: C.gd, paddingVertical: 14, borderRadius: 10, alignItems: 'center', opacity: infoSaving ? 0.6 : 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{infoSaving ? 'Saving...' : infoSaved ? 'Saved!' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
      /* ========== BID TAB ========== */
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {/* Top 3 summary rows: Overhead, Lot Overhead, Commission */}
        <View style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.w06, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={[headerTxt, { flex: 2 }]}>Item</Text>
            <Text style={[headerTxt, { flex: 1, textAlign: 'right' }]}>Amount</Text>
          </View>
          {/* Overhead (auto-calculated, not editable) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.w06 }}>
            <View style={{ flex: 2 }}>
              <Text style={[cellTxt, { fontWeight: '600' }]}>Overhead (8%)</Text>
              <Text style={{ fontSize: 11, color: C.dm }}>Auto-calculated from category totals</Text>
            </View>
            <Text style={[cellTxt, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>{fmt(overhead)}</Text>
          </View>
          {/* Lot Overhead (editable) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: rowBg(1) }}>
            <Text style={[cellTxt, { flex: 2, fontWeight: '600' }]}>Lot Overhead</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TextInput
                ref={r => setCellRef('top_lotOverhead', r)}
                value={lotOverheadText}
                onChangeText={setLotOverheadText}
                onFocus={() => setFocusedCell('top_lotOverhead')}
                onBlur={() => { setFocusedCell(null); const v = parseFloat(lotOverheadText) || 0; setLotOverhead(v); setLotOverheadText(String(v)); saveBidField('bid_lot_overhead', v); }}
                keyboardType="decimal-pad"
                style={[cellInputStyle, { textAlign: 'right', width: 130 }, focusedCell === 'top_lotOverhead' && cellInputFocused]}
              />
            </View>
          </View>
          {/* Commission (editable) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.w06 }}>
            <Text style={[cellTxt, { flex: 2, fontWeight: '600' }]}>Commission</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TextInput
                ref={r => setCellRef('top_commission', r)}
                value={commissionText}
                onChangeText={setCommissionText}
                onFocus={() => setFocusedCell('top_commission')}
                onBlur={() => { setFocusedCell(null); const v = parseFloat(commissionText) || 0; setCommission(v); setCommissionText(String(v)); saveBidField('bid_commission', v); }}
                keyboardType="decimal-pad"
                style={[cellInputStyle, { textAlign: 'right', width: 130 }, focusedCell === 'top_commission' && cellInputFocused]}
              />
            </View>
          </View>
        </View>

        {/* Square Footage Box */}
        <View style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.gd + '15', paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.textBold }}>Square Footage</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.gd, marginRight: 12 }}>{fmt(sqftCategory?.subtotal || 0)}</Text>
            <TouchableOpacity onPress={async () => { const cat = await ensureSqftCategory(); if (cat) addLineItem(cat.id); }}>
              <Feather name="plus-circle" size={20} color={C.gd} />
            </TouchableOpacity>
          </View>
          {sqftCategory && (sqftCategory.line_items || []).length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: C.w06 }}>
                <Text style={[headerTxt, { flex: 3, paddingHorizontal: 4 }]}>Name</Text>
                <Text style={[headerTxt, { flex: 1, textAlign: 'right', paddingHorizontal: 4 }]}>Qty</Text>
                <Text style={[headerTxt, { flex: 1.5, textAlign: 'right', paddingHorizontal: 4 }]}>Price/Item</Text>
                <Text style={[headerTxt, { flex: 1.5, textAlign: 'right', paddingHorizontal: 4 }]}>Total</Text>
                <View style={{ width: 30 }} />
              </View>
              {(sqftCategory.line_items || []).map((li, idx) => {
                const es = editState[li.id] || { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
                const lineTotal = (parseFloat(es.quantity) || 0) * (parseFloat(es.price_per_item) || 0);
                const nameKey = `line_${li.id}_name`;
                const qtyKey = `line_${li.id}_quantity`;
                const priceKey = `line_${li.id}_price_per_item`;
                return (
                  <View key={li.id} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: rowBg(idx) }}>
                    <View style={{ flex: 3, paddingHorizontal: 2 }}>
                      <TextInput ref={r => setCellRef(nameKey, r)} value={es.name}
                        onChangeText={v => handleCellChange(li.id, sqftCategory.id, 'name', v)}
                        onFocus={() => setFocusedCell(nameKey)} onBlur={() => setFocusedCell(null)}
                        multiline scrollEnabled={false}
                        onContentSizeChange={e => {
                          const h = e.nativeEvent.contentSize.height;
                          setCellHeights(prev => prev[nameKey] === h ? prev : { ...prev, [nameKey]: h });
                        }}
                        style={[cellInputStyle, focusedCell === nameKey && cellInputFocused, cellHeights[nameKey] ? { height: cellHeights[nameKey] } : null]} />
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 2 }}>
                      <TextInput ref={r => setCellRef(qtyKey, r)} value={es.quantity}
                        onChangeText={v => handleCellChange(li.id, sqftCategory.id, 'quantity', v)}
                        onFocus={() => setFocusedCell(qtyKey)} onBlur={() => setFocusedCell(null)}
                        keyboardType="decimal-pad"
                        style={[cellInputStyle, { textAlign: 'right' }, focusedCell === qtyKey && cellInputFocused]} />
                    </View>
                    <View style={{ flex: 1.5, paddingHorizontal: 2 }}>
                      <TextInput ref={r => setCellRef(priceKey, r)} value={es.price_per_item}
                        onChangeText={v => handleCellChange(li.id, sqftCategory.id, 'price_per_item', v)}
                        onFocus={() => setFocusedCell(priceKey)} onBlur={() => setFocusedCell(null)}
                        keyboardType="decimal-pad"
                        style={[cellInputStyle, { textAlign: 'right' }, focusedCell === priceKey && cellInputFocused]} />
                    </View>
                    <View style={{ flex: 1.5, paddingHorizontal: 4 }}>
                      <Text style={[cellTxt, { textAlign: 'right', fontWeight: '600' }]}>{fmt(lineTotal)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setConfirmDeleteLine({ id: li.id, catId: sqftCategory.id })} style={{ width: 30, alignItems: 'center' }}>
                      <Feather name="x" size={15} color={C.rd || '#ef4444'} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
          {(!sqftCategory || (sqftCategory.line_items || []).length === 0) && (
            <TouchableOpacity onPress={async () => { const cat = await ensureSqftCategory(); if (cat) addLineItem(cat.id); }}
              style={{ paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.w06, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <Feather name="plus" size={16} color={C.gd} />
              <Text style={{ fontSize: 14, color: C.gd, fontWeight: '600' }}>Add line item</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Categories */}
        {normalCategories.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <Feather name="layers" size={48} color={C.dm} style={{ marginBottom: 10 }} />
            <Text style={{ fontSize: 20, fontWeight: '600', color: C.text }}>No categories yet</Text>
            <Text style={{ fontSize: 15, color: C.dm, marginTop: 4 }}>Tap "Add Category" to get started</Text>
          </View>
        ) : normalCategories.map((cat) => (
          <View key={cat.id} style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            {/* Category header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.gd + '15', paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.textBold }}>{cat.title}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gd, marginRight: 12 }}>{fmt(cat.subtotal || 0)}</Text>
              <TouchableOpacity onPress={() => addLineItem(cat.id)} style={{ marginRight: 8 }}>
                <Feather name="plus-circle" size={20} color={C.gd} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmDeleteCat(cat.id)}>
                <Feather name="trash-2" size={18} color={C.rd || '#ef4444'} />
              </TouchableOpacity>
            </View>

            {/* Column headers */}
            {(cat.line_items || []).length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: C.w06 }}>
                <Text style={[headerTxt, { flex: 3, paddingHorizontal: 4 }]}>Name</Text>
                <Text style={[headerTxt, { flex: 1, textAlign: 'right', paddingHorizontal: 4 }]}>Qty</Text>
                <Text style={[headerTxt, { flex: 1.5, textAlign: 'right', paddingHorizontal: 4 }]}>Price/Item</Text>
                <Text style={[headerTxt, { flex: 1.5, textAlign: 'right', paddingHorizontal: 4 }]}>Total</Text>
                <Text style={[headerTxt, { width: 44, textAlign: 'center' }]}>Incl</Text>
                <Text style={[headerTxt, { width: 44, textAlign: 'center' }]}>Allow</Text>
                <View style={{ width: 30 }} />
              </View>
            )}

            {/* Inline editable line items */}
            {(cat.line_items || []).map((li, idx) => {
              const es = editState[li.id] || { name: li.name, quantity: String(li.quantity), price_per_item: String(li.price_per_item) };
              const lineTotal = (parseFloat(es.quantity) || 0) * (parseFloat(es.price_per_item) || 0);
              const nameKey = `line_${li.id}_name`;
              const qtyKey = `line_${li.id}_quantity`;
              const priceKey = `line_${li.id}_price_per_item`;
              return (
                <View key={li.id} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: rowBg(idx) }}>
                  {/* Name */}
                  <View style={{ flex: 3, paddingHorizontal: 2 }}>
                    <TextInput
                      ref={r => setCellRef(nameKey, r)}
                      value={es.name}
                      onChangeText={v => handleCellChange(li.id, cat.id, 'name', v)}
                      onFocus={() => setFocusedCell(nameKey)}
                      onBlur={() => setFocusedCell(null)}
                      multiline scrollEnabled={false}
                      onContentSizeChange={e => {
                        const h = e.nativeEvent.contentSize.height;
                        setCellHeights(prev => prev[nameKey] === h ? prev : { ...prev, [nameKey]: h });
                      }}
                      style={[cellInputStyle, focusedCell === nameKey && cellInputFocused, cellHeights[nameKey] ? { height: cellHeights[nameKey] } : null]}
                    />
                  </View>
                  {/* Quantity */}
                  <View style={{ flex: 1, paddingHorizontal: 2 }}>
                    <TextInput
                      ref={r => setCellRef(qtyKey, r)}
                      value={es.quantity}
                      onChangeText={v => handleCellChange(li.id, cat.id, 'quantity', v)}
                      onFocus={() => setFocusedCell(qtyKey)}
                      onBlur={() => setFocusedCell(null)}
                      keyboardType="decimal-pad"
                      style={[cellInputStyle, { textAlign: 'right' }, focusedCell === qtyKey && cellInputFocused]}
                    />
                  </View>
                  {/* Price Per Item */}
                  <View style={{ flex: 1.5, paddingHorizontal: 2 }}>
                    <TextInput
                      ref={r => setCellRef(priceKey, r)}
                      value={es.price_per_item}
                      onChangeText={v => handleCellChange(li.id, cat.id, 'price_per_item', v)}
                      onFocus={() => setFocusedCell(priceKey)}
                      onBlur={() => setFocusedCell(null)}
                      keyboardType="decimal-pad"
                      style={[cellInputStyle, { textAlign: 'right' }, focusedCell === priceKey && cellInputFocused]}
                    />
                  </View>
                  {/* Total (auto, not editable) */}
                  <View style={{ flex: 1.5, paddingHorizontal: 4 }}>
                    <Text style={[cellTxt, { textAlign: 'right', fontWeight: '600' }]}>{fmt(lineTotal)}</Text>
                  </View>
                  {/* Included checkbox */}
                  <TouchableOpacity onPress={() => toggleLineField(li, cat.id, 'included')} style={{ width: 44, alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                      borderColor: li.included ? (C.gn || '#10b981') : C.w12,
                      backgroundColor: li.included ? (C.gn || '#10b981') : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {li.included && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                  {/* Allowance checkbox */}
                  <TouchableOpacity onPress={() => toggleLineField(li, cat.id, 'is_allowance')} style={{ width: 44, alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                      borderColor: li.is_allowance ? (C.bl || '#3b82f6') : C.w12,
                      backgroundColor: li.is_allowance ? (C.bl || '#3b82f6') : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {li.is_allowance && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                  {/* Delete */}
                  <TouchableOpacity onPress={() => setConfirmDeleteLine({ id: li.id, catId: cat.id })} style={{ width: 30, alignItems: 'center' }}>
                    <Feather name="x" size={15} color={C.rd || '#ef4444'} />
                  </TouchableOpacity>
                </View>
              );
            })}

            {(cat.line_items || []).length === 0 && (
              <TouchableOpacity onPress={() => addLineItem(cat.id)}
                style={{ paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.w06, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Feather name="plus" size={16} color={C.gd} />
                <Text style={{ fontSize: 14, color: C.gd, fontWeight: '600' }}>Add line item</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Allowances Summary */}
        {allowanceCats.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 10, overflow: 'hidden', marginTop: 8, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (C.bl || '#3b82f6') + '15', paddingVertical: 10, paddingHorizontal: 12 }}>
              <Feather name="bookmark" size={16} color={C.bl || '#3b82f6'} style={{ marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.textBold }}>Allowances</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl || '#3b82f6' }}>
                {fmt(allowanceCats.reduce((sum, c) => sum + (c.total || 0), 0))}
              </Text>
            </View>
            {allowanceCats.map((cat, idx) => (
              <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: rowBg(idx) }}>
                <Text style={[cellTxt, { flex: 1 }]}>{cat.name}</Text>
                <Text style={[cellTxt, { fontWeight: '600' }]}>{fmt(cat.total || 0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Total Cost */}
        <View style={{ borderWidth: 2, borderColor: C.gd, borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.gd + '15' }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.textBold }}>Total Cost</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.gd }}>{fmt(totalCost)}</Text>
          </View>
        </View>

        {/* Price to Quote */}
        <View style={{ borderWidth: 2, borderColor: C.bl || '#3b82f6', borderRadius: 10, overflow: 'hidden', marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: (C.bl || '#3b82f6') + '15' }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: C.textBold }}>Price to Quote</Text>
            <TextInput
              value={priceToQuoteText}
              onChangeText={setPriceToQuoteText}
              onFocus={() => setFocusedCell('top_priceToQuote')}
              onBlur={() => { setFocusedCell(null); const v = parseFloat(priceToQuoteText) || 0; setPriceToQuote(v); setPriceToQuoteText(String(v)); saveBidField('bid_price_to_quote', v); }}
              keyboardType="decimal-pad"
              style={[cellInputStyle, { textAlign: 'right', width: 160, fontSize: 18, fontWeight: '700', color: C.bl || '#3b82f6' }, focusedCell === 'top_priceToQuote' && cellInputFocused]}
            />
          </View>
        </View>

        {/* Price per Square Foot */}
        <View style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 10, overflow: 'hidden', marginTop: 12, marginBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.w06, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.textBold }}>Price per Square Foot</Text>
            <TouchableOpacity onPress={() => setSqftPercentLines(prev => [...prev, { id: Date.now(), percent: '10' }])}>
              <Feather name="plus-circle" size={20} color={C.gd} />
            </TouchableOpacity>
          </View>
          {/* Column headers */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: C.w06 }}>
            <Text style={[headerTxt, { flex: 1 }]}>Total Sq Ft</Text>
            <Text style={[headerTxt, { flex: 1, textAlign: 'right' }]}>Price/Sq Ft</Text>
            <Text style={[headerTxt, { flex: 1, textAlign: 'center' }]}>Markup %</Text>
            <Text style={[headerTxt, { flex: 1.5, textAlign: 'right' }]}>Estimated Price</Text>
            <View style={{ width: 30 }} />
          </View>
          {sqftPercentLines.map((line, idx) => {
            const pct = parseFloat(line.percent) || 0;
            const estimatedPrice = totalCost * (1 + pct / 100);
            const estPricePerSqft = totalSquareFootage > 0 ? estimatedPrice / totalSquareFootage : 0;
            return (
              <View key={line.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: rowBg(idx) }}>
                <Text style={[cellTxt, { flex: 1 }]}>{totalSquareFootage.toLocaleString()}</Text>
                <Text style={[cellTxt, { flex: 1, textAlign: 'right' }]}>{fmt(estPricePerSqft)}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <TextInput
                      value={line.percent}
                      onChangeText={v => setSqftPercentLines(prev => prev.map(l => l.id === line.id ? { ...l, percent: v } : l))}
                      keyboardType="decimal-pad"
                      style={[cellInputStyle, { textAlign: 'center', width: 60 }, focusedCell === `sqft_pct_${line.id}` && cellInputFocused]}
                      onFocus={() => setFocusedCell(`sqft_pct_${line.id}`)}
                      onBlur={() => setFocusedCell(null)}
                    />
                    <Text style={{ fontSize: 14, color: C.dm }}>%</Text>
                  </View>
                </View>
                <Text style={[cellTxt, { flex: 1.5, textAlign: 'right', fontWeight: '600' }]}>{fmt(estimatedPrice)}</Text>
                {sqftPercentLines.length > 1 ? (
                  <TouchableOpacity onPress={() => setSqftPercentLines(prev => prev.filter(l => l.id !== line.id))} style={{ width: 30, alignItems: 'center' }}>
                    <Feather name="x" size={15} color={C.rd || '#ef4444'} />
                  </TouchableOpacity>
                ) : <View style={{ width: 30 }} />}
              </View>
            );
          })}
        </View>

        {/* Allowances Break Down */}
        <View style={{ borderWidth: 1, borderColor: C.w12, borderRadius: 10, overflow: 'hidden', marginTop: 12, marginBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (C.bl || '#3b82f6') + '15', paddingVertical: 10, paddingHorizontal: 12 }}>
            <Feather name="bookmark" size={16} color={C.bl || '#3b82f6'} style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.textBold }}>Allowances Break Down</Text>
            <TouchableOpacity onPress={() => setShowAddAllowanceCat(true)}>
              <Feather name="plus-circle" size={20} color={C.gd} />
            </TouchableOpacity>
          </View>

          {allowanceCats.length === 0 ? (
            <TouchableOpacity onPress={() => setShowAddAllowanceCat(true)}
              style={{ paddingVertical: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: C.w06 }}>
              <Feather name="plus" size={16} color={C.gd} />
              <Text style={{ fontSize: 14, color: C.gd, fontWeight: '600' }}>Add allowance category</Text>
            </TouchableOpacity>
          ) : allowanceCats.map((cat) => (
            <View key={cat.id} style={{ borderTopWidth: 1, borderTopColor: C.w08 }}>
              {/* Category header row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.w06 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.textBold }}>{cat.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.bl || '#3b82f6', marginRight: 10 }}>{fmt(cat.total || 0)}</Text>
                <TouchableOpacity onPress={() => addAllowanceItem(cat.id)} style={{ marginRight: 8 }}>
                  <Feather name="plus-circle" size={18} color={C.gd} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmDeleteAllowanceCat(cat.id)}>
                  <Feather name="trash-2" size={16} color={C.rd || '#ef4444'} />
                </TouchableOpacity>
              </View>
              {/* Line items */}
              {(cat.items || []).length > 0 && (
                <View>
                  <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 12, backgroundColor: C.w04 }}>
                    <Text style={[headerTxt, { flex: 3, paddingHorizontal: 4 }]}>Item</Text>
                    <Text style={[headerTxt, { flex: 1, textAlign: 'right', paddingHorizontal: 4 }]}>Qty</Text>
                    <Text style={[headerTxt, { flex: 1.5, textAlign: 'right', paddingHorizontal: 4 }]}>Price/Each</Text>
                    <Text style={[headerTxt, { flex: 1.5, textAlign: 'right', paddingHorizontal: 4 }]}>Total</Text>
                    <View style={{ width: 30 }} />
                  </View>
                  {(cat.items || []).map((item, idx) => {
                    const es = allowanceEditState[item.id] || { name: item.name, quantity: String(item.quantity), price_per: String(item.price_per) };
                    const lineTotal = (parseFloat(es.quantity) || 0) * (parseFloat(es.price_per) || 0);
                    return (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.w06, backgroundColor: rowBg(idx) }}>
                        <View style={{ flex: 3, paddingHorizontal: 2 }}>
                          <TextInput ref={r => setCellRef(`allow_${item.id}_name`, r)} value={es.name}
                            onChangeText={v => handleAllowanceItemChange(item.id, cat.id, 'name', v)}
                            onFocus={() => setFocusedCell(`allow_${item.id}_name`)}
                            onBlur={() => setFocusedCell(null)}
                            multiline scrollEnabled={false}
                            onContentSizeChange={e => {
                              const h = e.nativeEvent.contentSize.height;
                              const k = `allow_${item.id}_name`;
                              setCellHeights(prev => prev[k] === h ? prev : { ...prev, [k]: h });
                            }}
                            style={[cellInputStyle, focusedCell === `allow_${item.id}_name` && cellInputFocused, cellHeights[`allow_${item.id}_name`] ? { height: cellHeights[`allow_${item.id}_name`] } : null]} />
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 2 }}>
                          <TextInput ref={r => setCellRef(`allow_${item.id}_qty`, r)} value={es.quantity}
                            onChangeText={v => handleAllowanceItemChange(item.id, cat.id, 'quantity', v)}
                            onFocus={() => setFocusedCell(`allow_${item.id}_qty`)}
                            onBlur={() => setFocusedCell(null)}
                            keyboardType="decimal-pad"
                            style={[cellInputStyle, { textAlign: 'right' }, focusedCell === `allow_${item.id}_qty` && cellInputFocused]} />
                        </View>
                        <View style={{ flex: 1.5, paddingHorizontal: 2 }}>
                          <TextInput ref={r => setCellRef(`allow_${item.id}_price`, r)} value={es.price_per}
                            onChangeText={v => handleAllowanceItemChange(item.id, cat.id, 'price_per', v)}
                            onFocus={() => setFocusedCell(`allow_${item.id}_price`)}
                            onBlur={() => setFocusedCell(null)}
                            keyboardType="decimal-pad"
                            style={[cellInputStyle, { textAlign: 'right' }, focusedCell === `allow_${item.id}_price` && cellInputFocused]} />
                        </View>
                        <View style={{ flex: 1.5, paddingHorizontal: 4 }}>
                          <Text style={[cellTxt, { textAlign: 'right', fontWeight: '600' }]}>{fmt(lineTotal)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setConfirmDeleteAllowanceItem({ id: item.id, catId: cat.id })} style={{ width: 30, alignItems: 'center' }}>
                          <Feather name="x" size={15} color={C.rd || '#ef4444'} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
              {(cat.items || []).length === 0 && (
                <TouchableOpacity onPress={() => addAllowanceItem(cat.id)}
                  style={{ paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Feather name="plus" size={14} color={C.gd} />
                  <Text style={{ fontSize: 13, color: C.gd, fontWeight: '600' }}>Add item</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
      )}

      {/* Add Allowance Category Modal */}
      <Modal visible={showAddAllowanceCat} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setShowAddAllowanceCat(false)} />
          <View style={{ width: 380, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>New Allowance Category</Text>
              <TouchableOpacity onPress={() => setShowAddAllowanceCat(false)}><Text style={{ fontSize: 26, color: C.dm }}>x</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 }}>Category Name</Text>
              <TextInput value={newAllowanceCatName} onChangeText={setNewAllowanceCatName} placeholder="e.g. Flooring, Lighting..."
                placeholderTextColor={C.dm + '80'} style={inputStyle} autoFocus onSubmitEditing={addAllowanceCat} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.w06 }}>
              <TouchableOpacity onPress={() => setShowAddAllowanceCat(false)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addAllowanceCat} disabled={!newAllowanceCatName.trim()}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', opacity: newAllowanceCatName.trim() ? 1 : 0.4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Allowance Category */}
      <Modal visible={confirmDeleteAllowanceCat !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 340, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, padding: 24, alignItems: 'center', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <Feather name="alert-triangle" size={36} color={C.rd || '#ef4444'} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold, textAlign: 'center', marginBottom: 6 }}>Delete Allowance Category?</Text>
            <Text style={{ fontSize: 14, color: C.dm, textAlign: 'center', marginBottom: 20 }}>This will also delete all items in this category.</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity onPress={() => setConfirmDeleteAllowanceCat(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteAllowanceCat(confirmDeleteAllowanceCat)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd || '#ef4444', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Allowance Item */}
      <Modal visible={confirmDeleteAllowanceItem !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 340, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, padding: 24, alignItems: 'center', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold, marginBottom: 6 }}>Delete Allowance Item?</Text>
            <Text style={{ fontSize: 14, color: C.dm, marginBottom: 20 }}>This cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity onPress={() => setConfirmDeleteAllowanceItem(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDeleteAllowanceItem && deleteAllowanceItem(confirmDeleteAllowanceItem.id, confirmDeleteAllowanceItem.catId)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd || '#ef4444', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Category Modal (kept since it's a single-field creation) */}
      <Modal visible={showCatModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setShowCatModal(false)} />
          <View style={{ width: 380, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>New Category</Text>
              <TouchableOpacity onPress={() => setShowCatModal(false)}><Text style={{ fontSize: 26, color: C.dm }}>×</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 }}>Title</Text>
              <TextInput value={catTitle} onChangeText={setCatTitle} placeholder="e.g. Framing, Electrical..."
                placeholderTextColor={C.dm + '80'} style={inputStyle} autoFocus
                onSubmitEditing={addCategory} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.w06 }}>
              <TouchableOpacity onPress={() => setShowCatModal(false)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addCategory} disabled={!catTitle.trim()}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', opacity: catTitle.trim() ? 1 : 0.4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Category */}
      <Modal visible={confirmDeleteCat !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 340, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, padding: 24, alignItems: 'center', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <Feather name="alert-triangle" size={36} color={C.rd || '#ef4444'} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold, textAlign: 'center', marginBottom: 6 }}>Delete Category?</Text>
            <Text style={{ fontSize: 14, color: C.dm, textAlign: 'center', marginBottom: 20 }}>This will also delete all line items in this category.</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity onPress={() => setConfirmDeleteCat(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteCategory(confirmDeleteCat)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd || '#ef4444', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Line Item */}
      <Modal visible={confirmDeleteLine !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 340, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, padding: 24, alignItems: 'center', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold, marginBottom: 6 }}>Delete Line Item?</Text>
            <Text style={{ fontSize: 14, color: C.dm, marginBottom: 20 }}>This cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity onPress={() => setConfirmDeleteLine(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDeleteLine && deleteLineItem(confirmDeleteLine.id, confirmDeleteLine.catId)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd || '#ef4444', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Apply Bid Template Modal */}
      <Modal visible={showApplyTemplate} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setShowApplyTemplate(false)} />
          <View style={{ width: 420, maxHeight: '70%', backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Apply Bid Template</Text>
              <TouchableOpacity onPress={() => setShowApplyTemplate(false)}><Text style={{ fontSize: 26, color: C.dm }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {bidTemplatesLoading ? (
                <ActivityIndicator color={C.gd} size="large" style={{ marginTop: 20 }} />
              ) : bidTemplates.length === 0 ? (
                <Text style={{ fontSize: 15, color: C.dm, textAlign: 'center', marginTop: 20 }}>No bid templates available. Create one from the settings menu.</Text>
              ) : (
                <>
                  <Text style={{ fontSize: 13, color: C.dm, marginBottom: 12 }}>Select a template to apply. Categories and line items will be added to this bid.</Text>
                  {bidTemplates.map(tmpl => (
                    <TouchableOpacity key={tmpl.id} onPress={() => applyTemplate(tmpl.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.w06, borderRadius: 10, padding: 14, marginBottom: 8 }} activeOpacity={0.7}>
                      <Feather name="clipboard" size={24} color={C.dm} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: C.textBold }}>{tmpl.name}</Text>
                        {tmpl.description ? <Text style={{ fontSize: 13, color: C.dm, marginTop: 2 }} numberOfLines={1}>{tmpl.description}</Text> : null}
                        <Text style={{ fontSize: 13, color: C.mt, marginTop: 2 }}>{(tmpl.categories || []).length} categor{(tmpl.categories || []).length !== 1 ? 'ies' : 'y'}</Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={C.gd} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Save as Bid Template Modal */}
      <Modal visible={showSaveAsTemplate} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setShowSaveAsTemplate(false)} />
          <View style={{ width: 400, backgroundColor: C.modalBg || C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.w12, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } : { elevation: 20 }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.w06 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: C.textBold }}>Save Bid as Template</Text>
              <TouchableOpacity onPress={() => setShowSaveAsTemplate(false)}><Text style={{ fontSize: 26, color: C.dm }}>×</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 }}>Template Name</Text>
              <TextInput value={saveTemplateName} onChangeText={setSaveTemplateName} placeholder="e.g. Standard Residential Bid"
                placeholderTextColor={C.dm + '80'} style={inputStyle} autoFocus />
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.dm, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description (optional)</Text>
              <TextInput value={saveTemplateDesc} onChangeText={setSaveTemplateDesc} placeholder="Brief description..."
                placeholderTextColor={C.dm + '80'} style={inputStyle} />
              <Text style={{ fontSize: 12, color: C.mt, marginTop: 4 }}>
                This will save all {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} and their line items, plus lot overhead and commission values as a reusable template.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.w06 }}>
              <TouchableOpacity onPress={() => setShowSaveAsTemplate(false)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.w12, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.dm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveAsTemplate} disabled={!saveTemplateName.trim()}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', opacity: saveTemplateName.trim() ? 1 : 0.4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Save Template</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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

  // Sub detail st
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
    position: 'absolute', height: 44, borderRadius: 4,
    paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', marginHorizontal: 2,
    backgroundColor: C.mode === 'light' ? 'rgba(0,0,0,0.03)' : C.w04,
    borderWidth: 2.5,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  subCalTaskTxt: { fontSize: 15, fontWeight: '600', color: C.text },
  subCalTaskTxtSub: { fontSize: 13, fontWeight: '500', color: C.dm },

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
