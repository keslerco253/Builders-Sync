import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { AuthContext, ThemeContext, apiFetch } from './context';

// ── helpers ─────────────────────────────────────────────────
const fD = d => {
  if (!d) return '—';
  try {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
};

const f$ = n => { const v = Number(n || 0); const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? '-$' + abs : '$' + abs; };

// ============================================================
// MAIN SCREEN
// ============================================================
export default function ReportsScreen() {
  const C = React.useContext(ThemeContext);
  const st = useMemo(() => getStyles(C), [C]);
  const { user } = React.useContext(AuthContext);
  const navigation = useNavigation();

  const [activeReport, setActiveReport] = useState(null);

  if (activeReport === 'spec') {
    return <SpecReport C={C} user={user} onBack={() => setActiveReport(null)} navigation={navigation} />;
  }
  if (activeReport === 'escrow') {
    return <EscrowReport C={C} user={user} onBack={() => setActiveReport(null)} navigation={navigation} />;
  }

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={24} color={C.gd} />
          <Text style={{ fontSize: 17, color: C.gd, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Reports</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Report list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scrollContent}>
        <Text style={st.sectionTitle}>Available Reports</Text>

        <View style={st.cardGrid}>
          {/* ── Spec Report (live) ── */}
          <TouchableOpacity style={[st.card, { borderColor: C.gd, borderWidth: 2 }]} activeOpacity={0.7}
            onPress={() => setActiveReport('spec')}>
            <Feather name="tool" size={32} color={C.gd} />
            <Text style={st.cardTitle}>Spec Report</Text>
            <Text style={st.cardDesc}>Projects without a client — sortable by subdivision, plan, task & date</Text>
            <View style={[st.cardBadge, { backgroundColor: C.gd + '30' }]}>
              <Text style={st.cardBadgeTxt}>View Report</Text>
            </View>
          </TouchableOpacity>

          {/* ── Escrow Report (live) ── */}
          <TouchableOpacity style={[st.card, { borderColor: C.gd, borderWidth: 2 }]} activeOpacity={0.7}
            onPress={() => setActiveReport('escrow')}>
            <Feather name="shield" size={32} color={C.gd} />
            <Text style={st.cardTitle}>Escrow Report</Text>
            <Text style={st.cardDesc}>Pending escrows per project — amounts, holders, and status</Text>
            <View style={[st.cardBadge, { backgroundColor: C.gd + '30' }]}>
              <Text style={st.cardBadgeTxt}>View Report</Text>
            </View>
          </TouchableOpacity>

          {/* ── Coming soon cards ── */}
          <ReportCard C={C} st={st} icon="calendar" title="Schedule Report"
            description="View full project schedule details and timeline" />
          <ReportCard C={C} st={st} icon="dollar-sign" title="Budget Report"
            description="Project costs, change orders, and financial summary" />
          <ReportCard C={C} st={st} icon="edit-3" title="Change Order Report"
            description="All change orders with status and signature details" />
          <ReportCard C={C} st={st} icon="users" title="Subcontractor Report"
            description="Contractor assignments, trades, and task progress" />
          <ReportCard C={C} st={st} icon="file-text" title="Document Report"
            description="All project documents, photos, and files" />
          <ReportCard C={C} st={st} icon="bar-chart-2" title="Progress Report"
            description="Overall project progress and milestone tracking" />
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================
// SPEC REPORT
// ============================================================
function SpecReport({ C, user, onBack, navigation }) {
  const { width: winW } = useWindowDimensions();
  const isWide = winW > 800;
  const st = useMemo(() => getSpecStyles(C, isWide), [C, isWide]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sorting
  const [sortCol, setSortCol] = useState('subdivision');
  const [sortDir, setSortDir] = useState('asc');

  // Filters
  const [filterSubdiv, setFilterSubdiv] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [showSubdivDrop, setShowSubdivDrop] = useState(false);
  const [showPlanDrop, setShowPlanDrop] = useState(false);

  // Company logo for print
  const [companyLogo, setCompanyLogo] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    const isBuilder = user.role === 'builder' || user.role === 'company_admin';
    if (isBuilder) {
      apiFetch(`/users/${user.id}/logo`).then(r => r.json()).then(data => {
        if (data.logo) setCompanyLogo(data.logo);
        else apiFetch(`/builder-logo`).then(r => r.json()).then(d => { if (d.logo) setCompanyLogo(d.logo); }).catch(() => {});
      }).catch(() => {});
    } else {
      apiFetch(`/builder-logo`).then(r => r.json()).then(data => { if (data.logo) setCompanyLogo(data.logo); }).catch(() => {});
    }
  }, [user?.id]);

  // Fetch
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/reports/spec${user?.company_id ? `?company_id=${user.company_id}` : ''}`);
        const data = await res.json();
        if (Array.isArray(data)) setRows(data);
      } catch (e) { console.warn('Spec report fetch:', e); }
      setLoading(false);
    })();
  }, []);

  // Unique values for filter dropdowns
  const subdivisions = useMemo(() => [...new Set(rows.map(r => r.subdivision).filter(Boolean))].sort(), [rows]);
  const planNames = useMemo(() => [...new Set(rows.map(r => r.plan_name).filter(Boolean))].sort(), [rows]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = rows;
    if (filterSubdiv) list = list.filter(r => r.subdivision === filterSubdiv);
    if (filterPlan) list = list.filter(r => r.plan_name === filterPlan);
    return list;
  }, [rows, filterSubdiv, filterPlan]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va = a[sortCol] || '';
      let vb = b[sortCol] || '';
      if (sortCol === 'end_date') {
        va = va || '9999-12-31';
        vb = vb || '9999-12-31';
      }
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const arrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const printSpecReport = () => {
    if (Platform.OS !== 'web') return;
    const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const coName = esc(user?.company_name || '');
    const logoSrc = companyLogo || '';

    let rowsHtml = '';
    sorted.forEach((row, idx) => {
      const cls = idx % 2 === 1 ? ' class="alt"' : '';
      rowsHtml += `<tr${cls}><td>${esc(row.subdivision)}</td><td>${esc(row.address)}</td><td>${esc(row.plan_name)}</td><td>${esc(row.current_task)}</td><td>${fD(row.end_date)}</td></tr>`;
    });

    const filterDesc = [filterSubdiv ? 'Subdivision: ' + esc(filterSubdiv) : '', filterPlan ? 'Plan: ' + esc(filterPlan) : ''].filter(Boolean).join('  |  ');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Spec Report</title>
<style>
  @page { size: letter landscape; margin: 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 10pt; line-height: 1.3; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 2px solid #222; padding-bottom: 10px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .company-logo { width: 50px; height: 50px; object-fit: contain; border-radius: 6px; }
  .company-name { font-size: 20pt; font-weight: 700; }
  .header-right { text-align: right; font-size: 9pt; color: #555; }
  .report-title { font-size: 14pt; font-weight: 700; margin-bottom: 4px; }
  .report-subtitle { font-size: 9pt; color: #444; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0; padding: 7px 8px; text-align: left; font-size: 9.5pt; font-weight: 700; border-bottom: 2px solid #ccc; }
  td { padding: 6px 8px; font-size: 9.5pt; border-bottom: 1px solid #eee; }
  tr.alt td { background: #fafafa; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
<div class="page-header">
  <div class="header-left">
    ${logoSrc ? `<img class="company-logo" src="${logoSrc.startsWith('data:') ? logoSrc : 'data:image/png;base64,' + logoSrc}" />` : ''}
    <span class="company-name">${coName}</span>
  </div>
  <div class="header-right">${dateStr}<br/>${timeStr}</div>
</div>
<div class="report-title">Spec Report — ${sorted.length} ${sorted.length === 1 ? 'project' : 'projects'}</div>
${filterDesc ? `<div class="report-subtitle">${filterDesc}</div>` : ''}
<table>
<thead><tr><th>Subdivision</th><th>Address</th><th>Plan Name</th><th>Current Task</th><th>End Date</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const COLS = [
    { key: 'subdivision', label: 'Subdivision', flex: 1.2 },
    { key: 'address', label: 'Address', flex: 1.5 },
    { key: 'plan_name', label: 'Plan Name', flex: 1 },
    { key: 'current_task', label: 'Current Task', flex: 1.3 },
    { key: 'end_date', label: 'End Date', flex: 0.9 },
  ];

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={24} color={C.gd} />
          <Text style={{ fontSize: 17, color: C.gd, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Spec Report</Text>
        {Platform.OS === 'web' && sorted.length > 0 ? (
          <TouchableOpacity
            onPress={printSpecReport}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
            <Feather name="printer" size={16} color={C.textBold} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.textBold }}>Print</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.gd} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWide ? 24 : 14, paddingBottom: 60 }}>

          {/* Filter bar */}
          <View style={st.filterBar}>
            {/* Subdivision filter */}
            <View style={{ position: 'relative', zIndex: 20 }}>
              <Text style={st.filterLabel}>Subdivision</Text>
              <TouchableOpacity style={st.filterBtn} activeOpacity={0.7}
                onPress={() => { setShowSubdivDrop(p => !p); setShowPlanDrop(false); }}>
                <Text style={[st.filterBtnTxt, !filterSubdiv && { color: C.dm }]} numberOfLines={1}>
                  {filterSubdiv || 'All'}
                </Text>
                <Feather name="chevron-down" size={13} color={C.dm} />
              </TouchableOpacity>
              {showSubdivDrop && (
                <View style={st.dropdown}>
                  <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    <TouchableOpacity style={[st.dropItem, !filterSubdiv && st.dropItemActive]}
                      onPress={() => { setFilterSubdiv(''); setShowSubdivDrop(false); }}>
                      <Text style={[st.dropItemTxt, !filterSubdiv && { color: C.gd }]}>All</Text>
                    </TouchableOpacity>
                    {subdivisions.map(s => (
                      <TouchableOpacity key={s} style={[st.dropItem, filterSubdiv === s && st.dropItemActive]}
                        onPress={() => { setFilterSubdiv(s); setShowSubdivDrop(false); }}>
                        <Text style={[st.dropItemTxt, filterSubdiv === s && { color: C.gd }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Plan Name filter */}
            <View style={{ position: 'relative', zIndex: 19 }}>
              <Text style={st.filterLabel}>Plan Name</Text>
              <TouchableOpacity style={st.filterBtn} activeOpacity={0.7}
                onPress={() => { setShowPlanDrop(p => !p); setShowSubdivDrop(false); }}>
                <Text style={[st.filterBtnTxt, !filterPlan && { color: C.dm }]} numberOfLines={1}>
                  {filterPlan || 'All'}
                </Text>
                <Feather name="chevron-down" size={13} color={C.dm} />
              </TouchableOpacity>
              {showPlanDrop && (
                <View style={st.dropdown}>
                  <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    <TouchableOpacity style={[st.dropItem, !filterPlan && st.dropItemActive]}
                      onPress={() => { setFilterPlan(''); setShowPlanDrop(false); }}>
                      <Text style={[st.dropItemTxt, !filterPlan && { color: C.gd }]}>All</Text>
                    </TouchableOpacity>
                    {planNames.map(p => (
                      <TouchableOpacity key={p} style={[st.dropItem, filterPlan === p && st.dropItemActive]}
                        onPress={() => { setFilterPlan(p); setShowPlanDrop(false); }}>
                        <Text style={[st.dropItemTxt, filterPlan === p && { color: C.gd }]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Result count */}
            <View style={{ justifyContent: 'flex-end', paddingBottom: 4 }}>
              <Text style={{ fontSize: 14, color: C.dm, fontWeight: '500' }}>
                {sorted.length} {sorted.length === 1 ? 'project' : 'projects'}
              </Text>
            </View>
          </View>

          {/* Close any open dropdown on tap */}
          {(showSubdivDrop || showPlanDrop) && (
            <TouchableOpacity
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
              activeOpacity={1}
              onPress={() => { setShowSubdivDrop(false); setShowPlanDrop(false); }}
            />
          )}

          {/* Table */}
          <View style={st.table}>
            {/* Column headers */}
            <View style={st.tableHeaderRow}>
              {COLS.map(col => (
                <TouchableOpacity key={col.key} style={[st.tableHeaderCell, { flex: col.flex }]}
                  activeOpacity={0.7} onPress={() => toggleSort(col.key)}>
                  <Text style={st.tableHeaderTxt} numberOfLines={1}>{col.label}{arrow(col.key)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Data rows */}
            {sorted.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, color: C.dm }}>No spec projects found</Text>
              </View>
            ) : (
              sorted.map((row, idx) => (
                <View key={row.id} style={[st.tableRow, idx % 2 === 1 && st.tableRowAlt]}>
                  <View style={[st.tableCell, { flex: 1.2 }]}>
                    <Text style={st.tableCellTxt} numberOfLines={1}>{row.subdivision || '—'}</Text>
                  </View>
                  <View style={[st.tableCell, { flex: 1.5 }]}>
                    <Text style={st.tableCellTxt} numberOfLines={1}>{row.address || '—'}</Text>
                  </View>
                  <View style={[st.tableCell, { flex: 1 }]}>
                    <Text style={st.tableCellTxt} numberOfLines={1}>{row.plan_name || '—'}</Text>
                  </View>
                  <View style={[st.tableCell, { flex: 1.3 }]}>
                    <Text style={st.tableCellTxt} numberOfLines={1}>{row.current_task || '—'}</Text>
                  </View>
                  <View style={[st.tableCell, { flex: 0.9 }]}>
                    <Text style={st.tableCellTxt} numberOfLines={1}>{fD(row.end_date)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ============================================================
// ESCROW REPORT
// ============================================================
function EscrowReport({ C, user, onBack, navigation }) {
  const { width: winW } = useWindowDimensions();
  const isWide = winW > 800;
  const st = useMemo(() => getSpecStyles(C, isWide), [C, isWide]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  // Filters
  const [filterSubdiv, setFilterSubdiv] = useState('');
  const [showSubdivDrop, setShowSubdivDrop] = useState(false);

  // Company logo for print
  const [companyLogo, setCompanyLogo] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    const isBuilder = user.role === 'builder' || user.role === 'company_admin';
    if (isBuilder) {
      apiFetch(`/users/${user.id}/logo`).then(r => r.json()).then(data => {
        if (data.logo) setCompanyLogo(data.logo);
        else apiFetch(`/builder-logo`).then(r => r.json()).then(d => { if (d.logo) setCompanyLogo(d.logo); }).catch(() => {});
      }).catch(() => {});
    } else {
      apiFetch(`/builder-logo`).then(r => r.json()).then(data => { if (data.logo) setCompanyLogo(data.logo); }).catch(() => {});
    }
  }, [user?.id]);

  // Fetch
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/reports/escrow${user?.company_id ? `?company_id=${user.company_id}` : ''}`);
        const data = await res.json();
        if (Array.isArray(data)) setRows(data);
      } catch (e) { console.warn('Escrow report fetch:', e); }
      setLoading(false);
    })();
  }, []);

  const subdivisions = useMemo(() => [...new Set(rows.map(r => r.subdivision).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    if (!filterSubdiv) return rows;
    return rows.filter(r => r.subdivision === filterSubdiv);
  }, [rows, filterSubdiv]);

  const totalPending = useMemo(() => filtered.reduce((sum, r) => sum + r.pending_count, 0), [filtered]);

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const printEscrowReport = () => {
    if (Platform.OS !== 'web') return;
    const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const coName = esc(user?.company_name || '');
    const logoSrc = companyLogo || '';

    let bodyHtml = '';
    filtered.forEach((row) => {
      bodyHtml += `<div class="project-row">
        <div class="project-header"><span class="project-name">${esc(row.address || row.name)}</span>
        ${row.subdivision ? `<span class="subdiv">${esc(row.subdivision)}</span>` : ''}
        <span class="badge">${row.pending_count} pending</span></div>`;
      (row.escrows || []).forEach(e => {
        bodyHtml += `<div class="escrow-item"><span class="escrow-title">${esc(e.title)}</span><span class="escrow-amount">${f$(e.amount)}</span>${e.escrow_holder_name ? `<span class="escrow-holder">${esc(e.escrow_holder_name)}</span>` : ''}</div>`;
      });
      bodyHtml += '</div>';
    });

    const filterDesc = filterSubdiv ? 'Subdivision: ' + esc(filterSubdiv) : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Escrow Report</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 10pt; line-height: 1.3; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 2px solid #222; padding-bottom: 10px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .company-logo { width: 50px; height: 50px; object-fit: contain; border-radius: 6px; }
  .company-name { font-size: 20pt; font-weight: 700; }
  .header-right { text-align: right; font-size: 9pt; color: #555; }
  .report-title { font-size: 14pt; font-weight: 700; margin-bottom: 4px; }
  .report-subtitle { font-size: 9pt; color: #444; margin-bottom: 14px; }
  .project-row { margin-bottom: 12px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
  .project-header { background: #f0f0f0; padding: 8px 12px; font-weight: 700; font-size: 11pt; display: flex; align-items: center; gap: 10px; }
  .project-name { flex: 1; }
  .subdiv { font-size: 9pt; color: #666; font-weight: 400; }
  .badge { font-size: 9pt; background: #e0e7ff; color: #3b5998; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .escrow-item { padding: 6px 12px 6px 24px; border-top: 1px solid #eee; display: flex; align-items: center; gap: 12px; font-size: 10pt; }
  .escrow-title { flex: 1; }
  .escrow-amount { font-weight: 600; color: #1a7f37; }
  .escrow-holder { font-size: 9pt; color: #666; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="page-header">
  <div class="header-left">
    ${logoSrc ? `<img class="company-logo" src="${logoSrc.startsWith('data:') ? logoSrc : 'data:image/png;base64,' + logoSrc}" />` : ''}
    <span class="company-name">${coName}</span>
  </div>
  <div class="header-right">${dateStr}<br/>${timeStr}</div>
</div>
<div class="report-title">Escrow Report — ${totalPending} pending across ${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'}</div>
${filterDesc ? `<div class="report-subtitle">${filterDesc}</div>` : ''}
${bodyHtml}
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={24} color={C.gd} />
          <Text style={{ fontSize: 17, color: C.gd, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Escrow Report</Text>
        {Platform.OS === 'web' && filtered.length > 0 ? (
          <TouchableOpacity
            onPress={printEscrowReport}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.gd, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
            <Feather name="printer" size={16} color={C.textBold} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.textBold }}>Print</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.gd} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWide ? 24 : 14, paddingBottom: 60 }}>
          {/* Filter bar */}
          <View style={st.filterBar}>
            <View style={{ position: 'relative', zIndex: 20 }}>
              <Text style={st.filterLabel}>Subdivision</Text>
              <TouchableOpacity style={st.filterBtn} activeOpacity={0.7}
                onPress={() => setShowSubdivDrop(p => !p)}>
                <Text style={[st.filterBtnTxt, !filterSubdiv && { color: C.dm }]} numberOfLines={1}>
                  {filterSubdiv || 'All'}
                </Text>
                <Feather name="chevron-down" size={13} color={C.dm} />
              </TouchableOpacity>
              {showSubdivDrop && (
                <View style={st.dropdown}>
                  <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    <TouchableOpacity style={[st.dropItem, !filterSubdiv && st.dropItemActive]}
                      onPress={() => { setFilterSubdiv(''); setShowSubdivDrop(false); }}>
                      <Text style={[st.dropItemTxt, !filterSubdiv && { color: C.gd }]}>All</Text>
                    </TouchableOpacity>
                    {subdivisions.map(s => (
                      <TouchableOpacity key={s} style={[st.dropItem, filterSubdiv === s && st.dropItemActive]}
                        onPress={() => { setFilterSubdiv(s); setShowSubdivDrop(false); }}>
                        <Text style={[st.dropItemTxt, filterSubdiv === s && { color: C.gd }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={{ justifyContent: 'flex-end', paddingBottom: 4 }}>
              <Text style={{ fontSize: 14, color: C.dm, fontWeight: '500' }}>
                {totalPending} pending across {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
              </Text>
            </View>
          </View>

          {showSubdivDrop && (
            <TouchableOpacity
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
              activeOpacity={1}
              onPress={() => setShowSubdivDrop(false)}
            />
          )}

          {/* Project rows with escrows */}
          {filtered.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Feather name="shield" size={40} color={C.dm} style={{ marginBottom: 10 }} />
              <Text style={{ fontSize: 16, color: C.dm }}>No projects with pending escrows</Text>
            </View>
          ) : (
            filtered.map(row => (
              <View key={row.id} style={{
                marginBottom: 12, borderWidth: 1, borderColor: C.bd, borderRadius: 10, overflow: 'hidden',
                backgroundColor: C.cardBg || C.w04,
              }}>
                {/* Project header row */}
                <TouchableOpacity
                  onPress={() => toggleExpand(row.id)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: isWide ? 14 : 10,
                    backgroundColor: C.gd + '12', gap: 10,
                  }}
                >
                  <Feather name={expanded[row.id] ? 'chevron-down' : 'chevron-right'} size={18} color={C.gd} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: isWide ? 16 : 14, fontWeight: '700', color: C.textBold }} numberOfLines={1}>
                      {row.address || row.name}
                    </Text>
                    {row.subdivision ? (
                      <Text style={{ fontSize: 13, color: C.dm, marginTop: 2 }}>{row.subdivision}</Text>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: C.gd + '25', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.gd }}>{row.pending_count} pending</Text>
                  </View>
                </TouchableOpacity>

                {/* Expanded escrow list */}
                {expanded[row.id] && (row.escrows || []).map(esc => (
                  <View key={esc.id} style={{
                    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                    paddingHorizontal: isWide ? 20 : 14, paddingLeft: isWide ? 42 : 34,
                    borderTopWidth: 1, borderTopColor: C.w04, gap: 10,
                  }}>
                    <Feather name="circle" size={14} color={C.dm} />
                    <Text style={{ flex: 1, fontSize: isWide ? 15 : 13, color: C.text }} numberOfLines={1}>{esc.title}</Text>
                    <Text style={{ fontSize: isWide ? 15 : 13, fontWeight: '600', color: C.gd }}>{f$(esc.amount)}</Text>
                    {esc.escrow_holder_name ? (
                      <Text style={{ fontSize: 12, color: C.dm, maxWidth: 120 }} numberOfLines={1}>{esc.escrow_holder_name}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ============================================================
// REPORT CARD (coming soon)
// ============================================================
function ReportCard({ C, st, icon, title, description }) {
  return (
    <TouchableOpacity style={st.card} activeOpacity={0.7}>
      <Feather name={icon} size={32} color={C.dm} />
      <Text style={st.cardTitle}>{title}</Text>
      <Text style={st.cardDesc}>{description}</Text>
      <View style={st.cardBadge}>
        <Text style={st.cardBadgeTxt}>Coming Soon</Text>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// STYLES — main reports list
// ============================================================
const getStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.bd, backgroundColor: C.headerBg,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 80 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.chromeTxt },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: C.textBold, marginBottom: 16 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    backgroundColor: C.cardBg || C.w04, borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: C.bd, width: 280, gap: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.textBold },
  cardDesc: { fontSize: 14, color: C.dm, lineHeight: 20 },
  cardBadge: {
    alignSelf: 'flex-start', backgroundColor: C.gd + '20',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4,
  },
  cardBadgeTxt: { fontSize: 12, fontWeight: '700', color: C.gd },
});

// ============================================================
// STYLES — spec report
// ============================================================
const getSpecStyles = (C, isWide) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.bd, backgroundColor: C.headerBg,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 80 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.chromeTxt },

  // Filters
  filterBar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 18,
    zIndex: 20,
  },
  filterLabel: { fontSize: 13, fontWeight: '700', color: C.dm, marginBottom: 4, letterSpacing: 0.5 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.cardBg || C.w04, borderWidth: 1, borderColor: C.bd,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    minWidth: 160, gap: 8,
  },
  filterBtnTxt: { fontSize: 15, color: C.text, fontWeight: '500' },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: C.cardBg || C.bg, borderWidth: 1, borderColor: C.bd,
    borderRadius: 8, marginTop: 4, zIndex: 100, minWidth: 160,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.35)' } : { elevation: 10 }),
  },
  dropItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.w04 },
  dropItemActive: { backgroundColor: C.gd + '18' },
  dropItemTxt: { fontSize: 15, color: C.text },

  // Table
  table: {
    borderWidth: 1, borderColor: C.bd, borderRadius: 10, overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row', backgroundColor: C.gd,
  },
  tableHeaderCell: {
    paddingVertical: 12, paddingHorizontal: isWide ? 14 : 8,
  },
  tableHeaderTxt: {
    fontSize: isWide ? 15 : 13, fontWeight: '700', color: '#fff',
    ...(Platform.OS === 'web' ? { userSelect: 'none', cursor: 'pointer' } : {}),
  },
  tableRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.w04,
  },
  tableRowAlt: {
    backgroundColor: C.mode === 'light' ? '#f9f7f3' : C.w02,
  },
  tableCell: {
    paddingVertical: 12, paddingHorizontal: isWide ? 14 : 8, justifyContent: 'center',
  },
  tableCellTxt: { fontSize: isWide ? 15 : 13, color: C.text },
});
