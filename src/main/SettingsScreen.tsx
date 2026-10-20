/** Settings: every part of Ana's setup in one list. Each row opens just that part. */
import React from 'react';
import { Linking, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TeammateSettings } from '../teammate/settings';
import { factsAnswered, priceChips } from '../teammate/settings';
import { industry } from '../teammate/industries';
import type { SetupSection } from '../teammate/TeammateSetupScreen';
import { CardIcon, ChatIcon, HelpIcon, IndustryIcon, LinkIcon, ListIcon, PersonIcon, TabletIcon, TagIcon } from '../teammate/icons';
import { C, Card, DarkHeader, GroupLabel, Row, Sheet } from './ui';

export const TERMS_URL = 'https://sites.google.com/view/holad2dtranslator/terms';
export const PRIVACY_URL = 'https://sites.google.com/view/holad2dtranslator/home';

export interface EditTarget {
  title: string;
  sections: SetupSection[];
}

export default function SettingsScreen({
  settings,
  onBack,
  onEdit,
  onPlans,
  planName,
}: {
  settings: TeammateSettings;
  onBack: () => void;
  onEdit: (t: EditTarget) => void;
  onPlans: () => void;
  /** The rep's plan, when known */
  planName?: string;
}) {
  const pack = industry(settings.industry);
  const facts = factsAnswered(settings);
  const prices = priceChips(settings).filter((c) => c.startsWith('$')).length;
  const muted = C.muted;
  const ana = settings.assistantName || 'Ana';

  return (
    <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <DarkHeader onBack={onBack} title="Settings" />
      <Sheet>
        <ScrollView contentContainerStyle={st.body}>
          <GroupLabel>You</GroupLabel>
          <Card style={st.group}>
            <Row
              icon={<PersonIcon size={20} color={muted} />}
              label="Name and company"
              value={[settings.repName, settings.companyName].filter((x) => x.trim()).join(' · ')}
              onPress={() => onEdit({ title: 'Name and company', sections: ['you'] })}
            />
            <Row
              icon={<IndustryIcon id={settings.industry} size={20} color={muted} />}
              label="What you sell"
              value={pack.label}
              onPress={() => onEdit({ title: 'What you sell', sections: ['industry', 'prices', 'pitch'] })}
              last
            />
          </Card>

          <GroupLabel>{ana}</GroupLabel>
          <Card style={st.group}>
            {pack.per !== 'none' ? (
              <Row
                icon={<TagIcon size={20} color={muted} />}
                label="Prices and promos"
                value={prices ? `${prices} price${prices === 1 ? '' : 's'}` : 'None yet'}
                onPress={() => onEdit({ title: 'Prices and promos', sections: ['prices'] })}
              />
            ) : null}
            <Row
              icon={<ChatIcon size={20} color={muted} />}
              label={`What ${ana} says first`}
              onPress={() => onEdit({ title: `What ${ana} says first`, sections: ['pitch'] })}
            />
            <Row
              icon={<ListIcon size={20} color={muted} />}
              label="Customer questions"
              value={`${facts.answered} of ${facts.total}`}
              onPress={() => onEdit({ title: 'Customer questions', sections: ['questions'] })}
            />
            <Row
              icon={<TabletIcon size={20} color={muted} />}
              label="Sign-ups"
              value={settings.signupBy === 'tablet' ? 'On your tablet' : `${ana} asks out loud`}
              onPress={() => onEdit({ title: 'Sign-ups', sections: ['signup'] })}
            />
            <Row
              icon={<ChatIcon size={20} color={muted} />}
              label="Your quick replies"
              value={String(settings.checkInReplies.filter((r) => r.trim()).length)}
              onPress={() => onEdit({ title: 'Your quick replies', sections: ['replies'] })}
              last
            />
          </Card>

          <GroupLabel>Account</GroupLabel>
          <Card style={st.group}>
            <Row icon={<CardIcon size={20} color={muted} />} label="Your plan" value={planName || 'See plans'} onPress={onPlans} />
            <Row
              icon={<LinkIcon size={20} color={muted} />}
              label="Connection (testing)"
              value={settings.connection.tokenServerId || settings.connection.startUrl ? 'Set' : 'Not set'}
              onPress={() => onEdit({ title: 'Connection', sections: ['connection'] })}
            />
            <Row icon={<HelpIcon size={20} color={muted} />} label="Terms of Use" onPress={() => Linking.openURL(TERMS_URL)} />
            <Row icon={<HelpIcon size={20} color={muted} />} label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} last />
          </Card>
          <View style={{ height: 24 }} />
          <Text style={st.version}>Hola D2D</Text>
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  body: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
  group: { paddingHorizontal: 16, marginBottom: 12 },
  version: { alignSelf: 'center', fontSize: 13, color: C.faint },
});
