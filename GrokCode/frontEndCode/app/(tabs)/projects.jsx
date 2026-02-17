import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';

const ProjectsListScreen = () => {
  const navigation = useNavigation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('https://buildersync.net', {  // Replace with your backend URL
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await response.json();
      const groupedData = groupByFirstLetter(data);
      setProjects(groupedData);
    } catch (err) {
      setError(err.message);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const groupByFirstLetter = (data) => {
    const groups = data.reduce((acc, project) => {
      const firstLetter = project.name[0]?.toUpperCase() || 'Unknown';
      if (!acc[firstLetter]) acc[firstLetter] = [];
      acc[firstLetter].push(project);
      return acc;
    }, {});

    return Object.keys(groups)
      .sort()
      .map(key => ({
        title: key,
        data: groups[key].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('currentProjectViewer', { project: item })}
      activeOpacity={0.7}
    >
      <View style={styles.itemDot} />
      <View style={styles.itemContent}>
        <Text style={styles.itemText}>{item.name}</Text>
        {item.number ? <Text style={styles.itemSub}>{item.number}</Text> : null}
      </View>
      <Text style={styles.itemArrow}>›</Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section: { title } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e8a838" />
        <Text style={styles.loadingText}>Loading projects...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProjects} activeOpacity={0.8}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.subtitle}>{projects.reduce((sum, s) => sum + s.data.length, 0)} total</Text>
      </View>
      <SectionList
        sections={projects}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No projects found</Text>
            <Text style={styles.emptySubtext}>Create a new project to get started</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity style={styles.refreshButton} onPress={fetchProjects} activeOpacity={0.8}>
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
    padding: 16,
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 13,
    color: '#7a8fa3',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 8,
  },
  sectionHeader: {
    backgroundColor: 'rgba(232, 168, 56, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 6,
    marginTop: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e8a838',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  item: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  itemContent: {
    flex: 1,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e0e8ef',
  },
  itemSub: {
    fontSize: 12,
    color: '#6a7f92',
    marginTop: 2,
  },
  itemArrow: {
    fontSize: 22,
    color: '#6a7f92',
    fontWeight: '300',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#7a8fa3',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    textAlign: 'center',
    color: '#4a6070',
    fontSize: 13,
    marginTop: 6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1923',
  },
  loadingText: {
    color: '#7a8fa3',
    fontSize: 14,
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    marginBottom: 16,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#e8a838',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    shadowColor: '#d4832f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  refreshButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  refreshButtonText: {
    color: '#e0e8ef',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
  },
});

export default ProjectsListScreen;