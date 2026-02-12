import { StyleSheet, Text, View, NativeModules, Platform } from 'react-native';
import { useEffect, useState } from 'react';

export default function App() {
  const [pingResult, setPingResult] = useState<string>("Waiting...");

  useEffect(() => {
    async function checkNative() {
      if (Platform.OS === 'android') {
        try {
          console.log("👓 Calling GlassesModule.ping()...");
          const res = await NativeModules.GlassesModule.ping();
          console.log("✅ Native Response:", res);
          setPingResult(res);
        } catch (e) {
          console.error("❌ Native Error:", e);
          setPingResult("Error: " + (e as Error).message);
        }
      }
    }
    checkNative();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Native Module Status:</Text>
      <Text style={styles.result}>{pingResult}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18, marginBottom: 10 },
  result: { fontSize: 24, fontWeight: 'bold', color: 'blue' },
});
