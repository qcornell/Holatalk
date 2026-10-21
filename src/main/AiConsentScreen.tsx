/**
 * Before the first call: what goes to OpenAI and LiveKit, what Hola keeps, and an "I agree".
 * Opened again from Settings, it shows the same page with a way to turn the permission off.
 */
import React from 'react';
import { Linking, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatIcon, CheckIcon, MicIcon, PersonIcon, TagIcon } from '../teammate/icons';
import { Button, C, Card, DarkHeader, Sheet } from './ui';
import { PRIVACY_URL } from './SettingsScreen';

function Item({ icon, title, text, last }: { icon: React.ReactNode; title: string; text: string; last?: boolean }) {
  return (
    <View style={[st.item, !last && st.itemLine]}>
      <View style={st.icon}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.itemTitle}>{title}</Text>
        <Text style={st.itemText}>{text}</Text>
      </View>
    </View>
  );
}

export default function AiConsentScreen({
  assistantName = 'Ana',
  agreed,
  onAgree,
  onWithdraw,
  onBack,
}: {
  assistantName?: string;
  /** Already agreed: opened from Settings */
  agreed: boolean;
  onAgree: () => void;
  onWithdraw: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const ana = assistantName || 'Ana';
  const g = C.green;
  return (
    <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <DarkHeader
        onBack={onBack}
        kicker={agreed ? 'How calls work' : 'Before your first call'}
        title={`${ana} is an AI. Here's where your calls go.`}
      />
      <Sheet style={{ paddingBottom: 0 }}>
        <ScrollView contentContainerStyle={st.body}>
          <Card style={st.card}>
            <Item
              icon={<MicIcon size={20} color={g} />}
              title="The conversation"
              text={`What you and the customer say goes to OpenAI, which runs ${ana}'s voice and replies. LiveKit carries the call.`}
            />
            <Item
              icon={<TagIcon size={20} color={g} />}
              title="Your offer"
              text={`Your prices, pitch and answers go along, so ${ana} sticks to your offer.`}
            />
            <Item
              icon={<PersonIcon size={20} color={g} />}
              title="Sign-ups and callbacks"
              text={`The name, phone, email and plan ${ana} takes down are saved to your Hola account.`}
            />
            <Item
              icon={<ChatIcon size={20} color={g} />}
              title="Phrases you add in Convo"
              text="Sent to OpenAI to translate them into Spanish."
            />
            <Item icon={<CheckIcon size={20} color={g} />} title="No recordings" text="Hola doesn't record or keep the call audio." last />
          </Card>
          <Text style={st.note}>Ask the customer before you put {ana} on speaker. She tells them she's a virtual assistant.</Text>
          <Button kind="text" label="Read the Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        </ScrollView>
        <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {agreed ? (
            <>
              <Button kind="accent" label="Done" onPress={onBack} />
              <Button kind="text" label="Turn this off" onPress={onWithdraw} />
            </>
          ) : (
            <>
              <Button kind="accent" label={`I agree. Call ${ana}`} onPress={onAgree} />
              <Button kind="text" label="Not now" onPress={onBack} />
            </>
          )}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  body: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 12, gap: 14 },
  card: { paddingHorizontal: 16, paddingVertical: 4 },
  item: { flexDirection: 'row', gap: 14, paddingVertical: 14, alignItems: 'flex-start' },
  itemLine: { borderBottomWidth: 1, borderBottomColor: C.line },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  itemText: { fontSize: 15, lineHeight: 21, color: C.ink2 },
  note: { fontSize: 15, lineHeight: 21, color: C.muted, paddingHorizontal: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 4, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.sheet },
});
