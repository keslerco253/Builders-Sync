import {View, Text, StyleSheet, ImageBackground, Pressable } from 'react-native'
import libertyLogo from "@/assets/images/icon.png"
import {Link} from 'expo-router'

const app = () => {
	return (
		<View style = {styles.container}>
			<ImageBackground 
			source = {libertyLogo} 
			resizeMode = "cover"
			style = {styles.image}
			>
				<Text style = {styles.text}>Libert Homes</Text>
				<Link href = "/register" style = {{marginHorizontal: 'auto'}} asChild> 
					<Pressable style = {styles.button}>
						<Text style = {styles.buttonText}>
							Register
						</Text>
					</Pressable>
				</Link>
			</ImageBackground>
		</View>
	)
}

export default app

const styles = StyleSheet.create({
	container: {
		flex:1,
		flexDirection: 'column',
	},
	image: {
		width: '100%',
		height: '100%',
		flex: 1,
		resizeMode: 'cover',
		justifyContent: 'center',
	},
	text: {
		color: 'black',
		fontSize: 42,
		fontWeight: 'bold',
		textAlign: 'center',
		backgroundColor: 'rgba(0,0,0,0.5)',
		marginBottom: 120,

	},
	link: {
		color: 'black',
		fontSize: 42,
		fontWeight: 'bold',
		textAlign: 'center',
		textDecorationLine: 'underline',
		backgroundColor: 'rgba(0,0,0,0.5)',
		padding: 4,
	},
	button: {
		height: 60,
		borderRadius: 20,
		justifyContent: 'center',
		backgroundColor: 'rgba(0,0,0,1)',
		padding: 6,
	},
	buttonText: {
		color: 'grey',
		fontSize: 16,
		fontWeight: 'bold',
		textAlign: 'center',
		padding: 4,
	}
})