import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AuthContext } from '@/app/context';
import {SafeAreaView, SafeAreaProvider} from 'react-native-safe-area-context';

const app = () => {
	const { signout } = React.useContext(AuthContext);
	
	try {
	const getUserInfo = fetch('http://192.168.5.36:5000/users', {  // Your backend URL
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({username}),
        });

        const user = getUserInfo.json();
	}
	catch (error) {
      Alert.alert('Error', 'Network error: ' + error.message);
	}

	return (
		<SafeAreaProvider>
			<SafeAreaView style={styles.container}>
				{/* Header */}
				<View style={styles.header}>
					<View style={styles.avatarContainer}>
						<View style={styles.avatar}>
							<Text style={styles.avatarText}>LH</Text>
						</View>
					</View>
					<Text style={styles.companyName}>Libert Homes</Text>
					<Text style={styles.roleTag}>Builder</Text>
				</View>

				{/* Info Card */}
				<View style={styles.card}>
					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>ACCOUNT</Text>
						<Text style={styles.infoValue}>Active</Text>
					</View>
					<View style={styles.divider} />
					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>ROLE</Text>
						<Text style={styles.infoValue}>Builder / Admin</Text>
					</View>
				</View>

				{/* Sign Out */}
				<TouchableOpacity
					style={styles.signOutButton}
					onPress={() => signout()}
					activeOpacity={0.8}
				>
					<Text style={styles.signOutText}>Sign Out</Text>
				</TouchableOpacity>

				{/* Footer */}
				<View style={styles.footer}>
					<Text style={styles.footerText}>BuilderSync v1.0</Text>
				</View>
			</SafeAreaView>
		</SafeAreaProvider>
	)
}

export default app

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#0f1923',
		padding: 24,
	},
	header: {
		alignItems: 'center',
		marginTop: 20,
		marginBottom: 32,
	},
	avatarContainer: {
		marginBottom: 16,
	},
	avatar: {
		width: 80,
		height: 80,
		borderRadius: 20,
		backgroundColor: '#e8a838',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#d4832f',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.4,
		shadowRadius: 8,
		elevation: 8,
	},
	avatarText: {
		fontSize: 28,
		fontWeight: '700',
		color: '#ffffff',
	},
	companyName: {
		color: '#ffffff',
		fontSize: 28,
		fontWeight: '700',
		textAlign: 'center',
	},
	roleTag: {
		fontSize: 12,
		fontWeight: '600',
		color: '#e8a838',
		textTransform: 'uppercase',
		letterSpacing: 1,
		marginTop: 8,
		backgroundColor: 'rgba(232, 168, 56, 0.12)',
		paddingHorizontal: 14,
		paddingVertical: 5,
		borderRadius: 6,
		overflow: 'hidden',
	},
	card: {
		backgroundColor: 'rgba(255, 255, 255, 0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255, 255, 255, 0.08)',
		borderRadius: 16,
		padding: 20,
		marginBottom: 24,
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 6,
	},
	infoLabel: {
		fontSize: 11,
		fontWeight: '600',
		color: '#6a7f92',
		letterSpacing: 1,
	},
	infoValue: {
		fontSize: 15,
		fontWeight: '500',
		color: '#e0e8ef',
	},
	divider: {
		height: 1,
		backgroundColor: 'rgba(255, 255, 255, 0.06)',
		marginVertical: 14,
	},
	signOutButton: {
		backgroundColor: 'rgba(239, 68, 68, 0.12)',
		borderWidth: 1,
		borderColor: 'rgba(239, 68, 68, 0.25)',
		paddingVertical: 15,
		borderRadius: 10,
		alignItems: 'center',
	},
	signOutText: {
		color: '#ef4444',
		fontSize: 16,
		fontWeight: '700',
	},
	footer: {
		flex: 1,
		justifyContent: 'flex-end',
		alignItems: 'center',
		paddingBottom: 12,
	},
	footerText: {
		fontSize: 12,
		color: '#4a6070',
	},
});