import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';


export default function App() {
  // Example marked dates (you can replace with dynamic data later)
  const markedDates = {
    '2026-01-20': { marked: true, dotColor: '#ef4444' },
    '2026-01-25': { marked: true, dotColor: '#3b82f6' },
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.subtitle}>Upcoming deadlines & milestones</Text>
      </View>
      <View style={styles.calendarCard}>
        <Calendar
          // Basic props for customization
          markedDates={markedDates}
          onDayPress={(day) => {
            console.log('Selected day:', day.dateString);
            // Later: Show details or integrate with Python data
            alert(`Selected: ${day.dateString}`);
          }}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: '#7a8fa3',
            selectedDayBackgroundColor: '#e8a838',
            selectedDayTextColor: '#ffffff',
            todayTextColor: '#e8a838',
            todayBackgroundColor: 'rgba(232, 168, 56, 0.12)',
            dayTextColor: '#e0e8ef',
            textDisabledColor: '#3a4a58',
            arrowColor: '#e8a838',
            monthTextColor: '#ffffff',
            textMonthFontWeight: '700',
            textMonthFontSize: 18,
            textDayFontSize: 15,
            textDayHeaderFontSize: 12,
            textDayHeaderFontWeight: '600',
            'stylesheet.calendar.header': {
              week: {
                flexDirection: 'row',
                justifyContent: 'space-around',
                marginTop: 8,
                marginBottom: 4,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255, 255, 255, 0.06)',
              },
            },
          }}
        />
      </View>
      <View style={styles.noteCard}>
        <View style={styles.noteDot} />
        <Text style={styles.note}>Tap a date to interact. Colored dots mark scheduled events.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#7a8fa3',
    textAlign: 'center',
    marginTop: 6,
  },
  calendarCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    paddingBottom: 8,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 168, 56, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232, 168, 56, 0.15)',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },
  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e8a838',
  },
  note: {
    color: '#7a8fa3',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});