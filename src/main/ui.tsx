/**
 * The app's look, shared by every screen: a dark top with the title, a light sheet below it,
 * white cards, pill buttons. Matches the design board (Hola D2D App).
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { BackIcon, CheckIcon, ChevronIcon } from '../teammate/icons';

export const C = {
  ground: '#050507',
  raised: '#121216',
  raisedLine: '#232329',
  chip: '#1C1C1F',
  chipText: '#E4E4E7',
  onDark: '#FFFFFF',
  onDark2: '#C7C7CC',
  onDark3: '#A1A1AA',
  sheet: '#F7F7F5',
  card: '#FFFFFF',
  line: '#E7E5E4',
  field: '#D6D3D1',
  ink: '#18181B',
  ink2: '#3F3F46',
  muted: '#57534E',
  faint: '#A8A29E',
  accent: '#30D59B',
  green: '#0B7A54',
  greenBg: '#F0FBF6',
  greenLine: '#BFEBD8',
  blueBg: '#EEF2FF',
  red: '#C4262E',
};

export function BackButton({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}>
      <BackIcon size={20} />
    </Pressable>
  );
}

/** Thin segments across the top of a multi-step flow. */
export function Progress({ step, of }: { step: number; of: number }) {
  return (
    <View style={s.progress} accessibilityLabel={`Step ${step} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <View key={i} style={[s.segment, i < step && { backgroundColor: C.accent }]} />
      ))}
    </View>
  );
}

export function DarkHeader({
  onBack,
  kicker,
  title,
  sub,
  progress,
  right,
  children,
}: {
  onBack?: () => void;
  kicker?: string;
  title: string;
  sub?: string;
  progress?: { step: number; of: number };
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      {onBack || progress || right ? (
        <View style={s.headerRow}>
          {onBack ? <BackButton onPress={onBack} /> : null}
          {progress ? <Progress {...progress} /> : <View style={{ flex: 1 }} />}
          {right}
        </View>
      ) : null}
      {kicker ? <Text style={s.kicker}>{kicker}</Text> : null}
      <Text style={s.title} accessibilityRole="header">
        {title}
      </Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

export function Sheet({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.sheet, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'dark',
  disabled,
  busy,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'accent' | 'dark' | 'outline' | 'text';
  disabled?: boolean;
  busy?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const look = kind === 'accent' ? s.btnAccent : kind === 'outline' ? s.btnOutline : kind === 'text' ? s.btnText : s.btnDark;
  const color = kind === 'dark' ? '#FFFFFF' : kind === 'text' ? C.ink2 : C.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [s.btn, look, (disabled || busy) && { opacity: 0.45 }, pressed && { opacity: 0.8 }, style]}
    >
      {busy ? <ActivityIndicator color={color} /> : (
        <>
          {icon}
          <Text style={[s.btnLabel, { color }, kind === 'text' && { fontSize: 16, fontWeight: '600' }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** A tappable settings-style row: icon, label, value, chevron. */
export function Row({
  icon,
  label,
  value,
  onPress,
  last,
  valueColor,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
  valueColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [s.row, !last && s.rowLine, pressed && { opacity: 0.6 }]}
    >
      {icon}
      <Text style={s.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <ChevronIcon size={16} />
    </Pressable>
  );
}

export function GroupLabel({ children }: { children: string }) {
  return <Text style={s.groupLabel}>{children.toUpperCase()}</Text>;
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={C.faint} {...input} style={[s.input, input.multiline && s.inputMulti, input.style]} accessibilityLabel={label} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A big choice with an icon, title and one line, checked when picked. */
export function Choice({
  icon,
  title,
  sub,
  on,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [s.choice, on && s.choiceOn, pressed && { opacity: 0.85 }]}
    >
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        {sub ? <Text style={s.choiceSub}>{sub}</Text> : null}
      </View>
      {on ? (
        <View style={s.tick}>
          <CheckIcon size={14} color="#FFFFFF" />
        </View>
      ) : (
        <View style={s.untick} />
      )}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#2A2A30' },
  header: { paddingTop: 8, paddingHorizontal: 24, paddingBottom: 24, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  kicker: { fontSize: 15, fontWeight: '600', color: C.accent },
  title: { fontSize: 32, lineHeight: 37, fontWeight: '800', color: C.onDark, letterSpacing: -0.6 },
  sub: { fontSize: 16, lineHeight: 22, color: C.onDark2 },
  sheet: { flex: 1, backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  btn: { height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  btnAccent: { backgroundColor: C.accent },
  btnDark: { backgroundColor: C.ink },
  btnOutline: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: C.ink },
  btnText: { height: 44, backgroundColor: 'transparent' },
  btnLabel: { fontSize: 18, fontWeight: '700' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: C.line },
  rowLabel: { flexShrink: 0, maxWidth: '62%', fontSize: 16, color: C.ink },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 15, color: C.muted },
  groupLabel: { marginLeft: 4, fontSize: 13, fontWeight: '600', color: C.muted, letterSpacing: 0.3 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  input: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, borderColor: C.field, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, color: C.ink },
  inputMulti: { minHeight: 120, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  hint: { fontSize: 14, lineHeight: 19, color: C.muted },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 2, borderColor: C.line, backgroundColor: '#FFFFFF', paddingVertical: 14, paddingHorizontal: 16 },
  choiceOn: { borderColor: C.green, backgroundColor: C.greenBg },
  choiceTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  choiceSub: { fontSize: 14, lineHeight: 19, color: C.muted },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  untick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.field },
});
