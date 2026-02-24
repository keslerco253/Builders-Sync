import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthContext, ThemeContext } from './context';

const ini = n => n?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
const rG = (r, C) => r === 'builder' ? C.gd : r === 'contractor' ? C.bl : C.gn;

export default function ReportsScreen() {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const { user } = React.useContext(AuthContext);
  const navigation = useNavigation();

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} activeOpacity={0.7}>
          <Text style={{ fontSize: 24, color: C.gd }}>‹</Text>
          <Text style={{ fontSize: 17, color: C.gd, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Reports</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Report list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scrollContent}>
        <Text style={st.sectionTitle}>Available Reports</Text>

        <View style={st.cardGrid}>
          <ReportCard
            C={C} st={st}
            icon="📋"
            title="Schedule Report"
            description="View full project schedule details and timeline"
          />
          <ReportCard
            C={C} st={st}
            icon="💰"
            title="Budget Report"
            description="Project costs, change orders, and financial summary"
          />
          <ReportCard
            C={C} st={st}
            icon="📝"
            title="Change Order Report"
            description="All change orders with status and signature details"
          />
          <ReportCard
            C={C} st={st}
            icon="👷"
            title="Subcontractor Report"
            description="Contractor assignments, trades, and task progress"
          />
          <ReportCard
            C={C} st={st}
            icon="📄"
            title="Document Report"
            description="All project documents, photos, and files"
          />
          <ReportCard
            C={C} st={st}
            icon="📊"
            title="Progress Report"
            description="Overall project progress and milestone tracking"
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ReportCard({ C, st, icon, title, description }) {
  return (
    <TouchableOpacity style={st.card} activeOpacity={0.7}>
      <Text style={{ fontSize: 32 }}>{icon}</Text>
      <Text style={st.cardTitle}>{title}</Text>
      <Text style={st.cardDesc}>{description}</Text>
      <View style={st.cardBadge}>
        <Text style={st.cardBadgeTxt}>Coming Soon</Text>
      </View>
    </TouchableOpacity>
  );
}

const getStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.bd,
    backgroundColor: C.headerBg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 80,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.chromeTxt,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textBold,
    marginBottom: 16,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  card: {
    backgroundColor: C.cardBg || C.w04,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: C.bd,
    width: 280,
    gap: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textBold,
  },
  cardDesc: {
    fontSize: 14,
    color: C.dm,
    lineHeight: 20,
  },
  cardBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.gd + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  cardBadgeTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: C.gd,
  },
});
