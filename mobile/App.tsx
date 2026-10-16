import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

type HealthResponse = {
  status: string;
  service?: string;
  checks?: Record<string, { status: string; driver?: string }>;
};

export default function App() {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health/live`);
        if (!response.ok) {
          throw new Error(`Backend request failed: ${response.status}`);
        }

        const data = (await response.json()) as HealthResponse;
        setHealthData(data);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Medly</Text>
        <Text style={styles.title}>Daily medication tracking</Text>
        <Text style={styles.subtitle}>
          A small starter shell for the patient reminder experience.
        </Text>

        {loading ? (
          <View style={styles.stateRow}>
            <ActivityIndicator size="small" color="#1d4ed8" />
            <Text style={styles.stateText}>Checking backend health…</Text>
          </View>
        ) : error ? (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Connection issue</Text>
            <Text style={styles.alertText}>{error}</Text>
            <Text style={styles.alertText}>API base URL: {API_BASE_URL}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Backend status</Text>
            <Text style={styles.cardText}>{healthData?.status ?? 'unknown'}</Text>
            <Text style={styles.cardText}>Service: {healthData?.service ?? 'medly-backend'}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 24,
    lineHeight: 24,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stateText: {
    color: '#0f172a',
    fontSize: 16,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardText: {
    color: '#0f172a',
    fontSize: 18,
    marginBottom: 6,
  },
  alertBox: {
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9f1239',
    marginBottom: 6,
  },
  alertText: {
    color: '#881337',
    fontSize: 14,
    lineHeight: 20,
  },
});
