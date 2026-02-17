import { Tabs } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';


import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#e8a838',
        tabBarInactiveTintColor: '#6a7f92',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#0f1923',
          borderTopColor: 'rgba(255, 255, 255, 0.06)',
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons size={28} name="floor-plan" color={color} />,
        }}
      />
      <Tabs.Screen
        name="newProjects"
        options={{
          title: 'New Project',
          tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons size={28} name="hammer-wrench" color={color} />,
        }}
      />
      <Tabs.Screen
        name="subContractors"
        options={{
          title: 'Sub Contrators',
          tabBarIcon: ({ color, focused }) => <AntDesign size={28} name="contacts" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <AntDesign size={28} name="setting" color={color} />,
        }}
      />
    </Tabs>
  );
}