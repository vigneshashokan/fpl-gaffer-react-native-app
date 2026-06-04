import { View, Text, StyleSheet } from 'react-native';

export default function OnboardingPlaceholder() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>FPL Gaffer — Task 1 complete</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#37003C' },
  text:      { color: '#00FF87', fontSize: 18, fontWeight: 'bold' },
});
