/** Home: Call Ana up top with today's offer, the day's counts, and the inside-the-house extras. */
import React from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TeammateSettings } from '../teammate/settings';
import { needsDailyCheck, priceChips } from '../teammate/settings';
import { industry } from '../teammate/industries';
import { ChatIcon, ChevronIcon, GearIcon, PersonIcon, PhoneIcon } from '../teammate/icons';
import type { DayStats } from './stats';
import { C } from './ui';

const ANA = require('../../assets/teammate/ana.png');

export default function HomeScreen({
  settings,
  stats,
  onCall,
  onConvo,
  onTeachMe,
  onSettings,
}: {
  settings: TeammateSettings;
  stats: DayStats;
  onCall: () => void;
  onConvo: () => void;
  onTeachMe: () => void;
  onSettings: () => void;
}) {
  const pack = industry(settings.industry);
  const checked = !needsDailyCheck(settings);
  const invite = settings.industry === 'ministry' ? settings.facts['Your invitation']?.['Event or service, day and time'] ?? '' : '';
  const chips = invite ? [invite] : priceChips(settings);
  const assistant = settings.assistantName || 'Ana';
  const sub = [settings.companyName.trim(), pack.label].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={st.top}>
          <View style={st.hello}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={st.title} accessibilityRole="header" numberOfLines={1}>
                Hola, {settings.repName.trim() || 'there'}
              </Text>
              {sub ? <Text style={st.sub} numberOfLines={1}>{sub}</Text> : null}
            </View>
            <Pressable onPress={onSettings} hitSlop={6} accessibilityRole="button" accessibilityLabel="Settings" style={({ pressed }) => [st.gear, pressed && { opacity: 0.7 }]}>
              <GearIcon />
            </Pressable>
          </View>

          <View style={st.hero}>
            <View style={st.anaRow}>
              <Image source={ANA} style={st.ana} accessibilityLabel={assistant} />
              <View style={{ gap: 3, flex: 1 }}>
                <Text style={st.anaName}>{assistant}</Text>
                <View style={st.statusRow}>
                  <View style={[st.dot, !checked && { backgroundColor: '#F5A524' }]} />
                  <Text style={[st.status, !checked && { color: '#F5C26B' }]}>
                    {settings.industry === 'ministry'
                      ? checked
                        ? 'Ready · details checked today'
                        : "Ready · we'll check the details first"
                      : checked
                        ? 'Ready · prices checked today'
                        : "Ready · we'll check prices first"}
                  </Text>
                </View>
              </View>
            </View>
            {chips.length ? (
              <View style={st.chips}>
                {chips.map((c) => (
                  <View key={c} style={st.chip}>
                    <Text style={st.chipText} numberOfLines={1}>
                      {c}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Pressable
              onPress={onCall}
              accessibilityRole="button"
              accessibilityLabel={`Call ${assistant}`}
              style={({ pressed }) => [st.callBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
            >
              <PhoneIcon size={24} color={C.ground} />
              <Text style={st.callText}>Call {assistant}</Text>
            </Pressable>
          </View>
        </View>

        <View style={st.sheet}>
          <View style={st.stats}>
            <View style={st.stat}>
              <Text style={st.statNum}>{stats.calls}</Text>
              <Text style={st.statLabel}>Calls with {assistant} today</Text>
            </View>
            <View style={st.stat}>
              <Text style={[st.statNum, { color: C.green }]}>{stats.signups}</Text>
              <Text style={st.statLabel}>{settings.industry === 'ministry' ? 'Yes to the invite today' : 'Sign-ups today'}</Text>
            </View>
          </View>

          <View style={{ gap: 2, marginTop: 6 }}>
            <Text style={st.h2} accessibilityRole="header">
              Inside the house
            </Text>
            <Text style={st.h2sub}>For when they invite you in</Text>
          </View>
          <Extra
            icon={<ChatIcon />}
            tint={C.greenBg}
            title="Convo"
            sub="Small talk your phone says in Spanish"
            onPress={onConvo}
          />
          <Extra
            icon={<PersonIcon />}
            tint={C.blueBg}
            title="Teach Me"
            sub="About you, so the small talk is yours"
            onPress={onTeachMe}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Extra({ icon, tint, title, sub, onPress }: { icon: React.ReactNode; tint: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} style={({ pressed }) => [st.extra, pressed && { opacity: 0.75 }]}>
      <View style={[st.extraIcon, { backgroundColor: tint }]}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.extraTitle}>{title}</Text>
        <Text style={st.extraSub}>{sub}</Text>
      </View>
      <ChevronIcon />
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  top: { paddingTop: 10, paddingHorizontal: 20, gap: 20 },
  hello: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: C.onDark, letterSpacing: -0.6 },
  sub: { fontSize: 15, color: C.onDark3 },
  gear: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.raisedLine, borderRadius: 24, padding: 18, gap: 16 },
  anaRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ana: { width: 56, height: 56, borderRadius: 28 },
  anaName: { fontSize: 19, fontWeight: '700', color: C.onDark },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  status: { fontSize: 14, color: C.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#1E1E24', justifyContent: 'center', maxWidth: '100%' },
  chipText: { fontSize: 14, fontWeight: '600', color: C.chipText },
  callBtn: { height: 64, borderRadius: 32, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  callText: { fontSize: 20, fontWeight: '800', color: C.ground },
  sheet: { flex: 1, marginTop: 22, backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  statNum: { fontSize: 30, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 14, color: C.muted },
  h2: { fontSize: 18, fontWeight: '700', color: C.ink },
  h2sub: { fontSize: 14, color: C.muted },
  extra: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  extraIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  extraTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  extraSub: { fontSize: 14, color: C.muted },
});
