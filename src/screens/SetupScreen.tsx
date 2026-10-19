/**
 * Setup Screen — User-friendly onboarding for new reps.
 * Collects: name, company, pitch, close, extra info, collect fields, install instructions.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Switch,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadSetup, saveSetup, DEFAULT_SETUP } from '../config/storage';
import type { UserSetup } from '../config/storage';
import { translateEnglishToSpanish } from '../translate';

interface Props {
  onComplete: (setup: UserSetup) => void;
  existingSetup?: UserSetup | null;
}

// Change #1 & #4: Added 'extra_info' step after 'close'
type SetupStep = 'basics' | 'pitch' | 'close' | 'extra_info' | 'collect' | 'install' | 'review';

const STEPS: SetupStep[] = ['basics', 'pitch', 'close', 'extra_info', 'collect', 'install', 'review'];

// --- Templates ---
// Change #6: Updated Solar pitch to be more relatable
const TEMPLATES = {
  telecom: {
    label: '📡 Cable / Internet / Telecom',
    pitch: 'Hi, we are offering high-speed internet in your area for a great price. No contract and no credit check.',
    close: 'If interested, you may not pay anything today. Just need your name, phone number, and email to get started.',
    install: 'A technician will come to install at a time that works for you. Takes about an hour. You can start using it the same day.',
  },
  solar: {
    label: '☀️ Solar / Home Services',
    pitch: 'Hi, we help neighbors lower their electric bill with solar. No money down, just cheaper power.',
    close: 'If interested, you may not pay anything today. Just need your name, phone number, and email.',
    install: 'A technician will visit for a free assessment. Installation takes about a day. You start saving immediately.',
  },
  ministry: {
    label: '⛪ Ministry / Church',
    pitch: 'Hi, we are inviting neighbors to our Easter service this Sunday. We have a great kids program and free breakfast.',
    close: 'Can we count on seeing you there? I can text you the address and time.',
    install: 'Service starts at 10 AM. Look for the welcome tent in the parking lot.',
  },
  sales: {
    label: '🍪 General Sales (Cookies/Fundraiser)',
    pitch: 'Hi, I am raising money for my school trip. We are selling gourmet cookies, 2 for $5.',
    close: 'Would you like to support us? You can pay with cash or Venmo.',
    install: 'I have the cookies right here. Thank you for your support!',
  },
};

const COLLECT_OPTIONS = [
  { id: 'firstName', label: 'First Name', labelEs: 'Primer Nombre' },
  { id: 'lastName', label: 'Last Name', labelEs: 'Apellido' },
  { id: 'phone', label: 'Phone Number', labelEs: 'Número de Teléfono' },
  { id: 'email', label: 'Email', labelEs: 'Correo Electrónico' },
  { id: 'address', label: 'Address', labelEs: 'Dirección' },
  { id: 'ssn', label: 'SSN / ITIN', labelEs: 'SSN / ITIN' },
  { id: 'pin', label: '4-Digit PIN', labelEs: 'PIN de 4 Dígitos' },
  { id: 'dob', label: 'Date of Birth', labelEs: 'Fecha de Nacimiento' },
];

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Flow Step: represents one step the customer will experience ──
interface FlowStep {
  id: string;       // unique key: 'greeting', 'pitch', 'close', 'extra', 'collect_firstName', 'install', 'closing', etc.
  label: string;    // display label: "1. Greeting", "2. Your Pitch", etc.
  preview: string;  // what the customer/rep will see/hear
  field?: keyof UserSetup; // the setup field this maps to (for editing)
  deletable: boolean;
  editable: boolean;
}

// ── Review Card ──
interface ReviewCardProps {
  step: FlowStep;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (field: keyof UserSetup | undefined, newValue: string, stepId?: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ReviewCard({ step, index, isFirst, isLast, onEdit, onDelete, onMoveUp, onMoveDown }: ReviewCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(step.preview);

  useEffect(() => {
    setEditValue(step.preview);
  }, [step.preview]);

  const handleSave = () => {
    onEdit(step.field, editValue, step.id);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(step.preview);
    setEditing(false);
  };

  const handleDelete = () => {
    if (!step.deletable) {
      Alert.alert('Required', `"${step.label}" is required and can't be removed, but you can edit it.`);
      return;
    }
    Alert.alert('Remove Step', `Remove "${step.label}" from the conversation?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={rs.card}>
      <View style={rs.cardRow}>
        {/* Arrows */}
        <View style={rs.arrowCol}>
          <TouchableOpacity onPress={onMoveUp} disabled={isFirst} style={rs.arrowBtn}
            hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Text style={[rs.arrowTxt, isFirst && rs.arrowDisabled]}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onMoveDown} disabled={isLast} style={rs.arrowBtn}
            hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Text style={[rs.arrowTxt, isLast && rs.arrowDisabled]}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={rs.cardContent}>
          <View style={rs.cardHeader}>
            <Text style={rs.cardLabel}>{step.label}</Text>
            <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={rs.trashBtn}>
              <Text style={rs.trashIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>

          {editing && step.editable ? (
            <View>
              <TextInput
                style={[rs.editInput, rs.editInputMulti]}
                value={editValue}
                onChangeText={setEditValue}
                multiline
                autoFocus
              />
              <View style={rs.editButtons}>
                <TouchableOpacity onPress={handleCancel} style={rs.cancelBtn}>
                  <Text style={rs.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} style={rs.saveBtn}>
                  <Text style={rs.saveBtnTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => step.editable && setEditing(true)} activeOpacity={step.editable ? 0.6 : 1}>
              <Text style={rs.cardValue}>{step.preview || '—'}</Text>
              {step.editable && <Text style={rs.tapHint}>Tap to edit</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Build the flow steps that the user will see in Review ──
// This must match EXACTLY what buildCustomFlow produces so there are no surprises
function buildFlowPreview(setup: UserSetup, hidePrice: boolean): FlowStep[] {
  const steps: FlowStep[] = [];
  const template = setup.selectedTemplate;

  // 1. Greeting (always)
  steps.push({
    id: 'greeting',
    label: '👋 Greeting',
    preview: `Hi, my name is ${setup.repName || '[Name]'} with ${setup.companyName || '[Company]'}.`,
    deletable: false, editable: false,
  });

  // 2. Template-specific probing questions (deletable from Review)
  const deleted = setup.deletedQuestions || [];
  const company = setup.companyName || '[Company]';

  if (template === 'telecom') {
    if (!deleted.includes('ask_service'))
      steps.push({ id: 'ask_service', label: '❓ Ask about service', preview: 'Do you have cable or internet?', deletable: true, editable: false });
    if (!deleted.includes('ask_provider'))
      steps.push({ id: 'ask_provider', label: '❓ Ask provider', preview: 'With what company?', deletable: true, editable: false });
    if (!deleted.includes('ask_how_long'))
      steps.push({ id: 'ask_how_long', label: '❓ Ask how long', preview: 'How long have you been with them?', deletable: true, editable: false });
    if (!deleted.includes('ask_how_much'))
      steps.push({ id: 'ask_how_much', label: '❓ Ask price', preview: 'How much do you pay each month?', deletable: true, editable: false });
    if (!deleted.includes('ask_had_company'))
      steps.push({ id: 'ask_had_company', label: '❓ Had us before?', preview: `Have you ever had ${company}?`, deletable: true, editable: false });
  } else if (template === 'solar') {
    if (!deleted.includes('ask_service'))
      steps.push({ id: 'ask_service', label: '❓ Ask about electricity', preview: 'Who is your electricity provider?', deletable: true, editable: false });
  }
  // ministry + sales skip probing — go straight to pitch

  // 3. Pitch
  steps.push({
    id: 'pitch',
    label: '📢 Your Pitch',
    preview: setup.pitchEn || '[Your pitch will appear here]',
    field: 'pitchEn', deletable: false, editable: true,
  });

  // 4. Close
  steps.push({
    id: 'close',
    label: template === 'ministry' ? '🙏 Invitation' : '🎯 Attempt Close',
    preview: setup.closeOfferEn || '[Your close will appear here]',
    field: 'closeOfferEn', deletable: false, editable: true,
  });

  // 5. Extra Info sections
  if (setup.extraInfoEn) {
    steps.push({
      id: 'extra',
      label: '➕ Extra Info',
      preview: setup.extraInfoEn,
      field: 'extraInfoEn', deletable: true, editable: true,
    });
  }
  // Additional extra sections added from Review
  const extras = setup.extraSections || [];
  for (let i = 0; i < extras.length; i++) {
    if (extras[i].en) {
      steps.push({
        id: `extra_${i}`,
        label: `➕ Extra Info ${i + 2}`,
        preview: extras[i].en,
        deletable: true, editable: true,
      });
    }
  }

  // 6. Collect fields
  if (setup.collectFields.length > 0) {
    const fieldLabels: Record<string, string> = {
      firstName: 'First Name', lastName: 'Last Name', phone: 'Phone',
      email: 'Email', address: 'Address', ssn: 'SSN/ITIN',
      pin: '4-Digit PIN', dob: 'Date of Birth',
    };
    const names = setup.collectFields.map(f => fieldLabels[f] || f).join(', ');
    steps.push({
      id: 'collect',
      label: '📋 Collect Info',
      preview: `Ask for: ${names}`,
      deletable: false, editable: false,
    });
  }

  // 7. Install / Service Details (if provided)
  if (setup.installInstructionsEn) {
    steps.push({
      id: 'install',
      label: template === 'ministry' ? '⛪ Service Details' : '🔧 Install / Next Steps',
      preview: setup.installInstructionsEn,
      field: 'installInstructionsEn', deletable: true, editable: true,
    });
  }

  // 8. Closing message — ALWAYS shown (uses default if user didn't type one)
  const defaultClosing = template === 'ministry'
    ? 'Thank you! We hope to see you there. God bless you.'
    : template === 'sales'
    ? 'Thank you so much for your support! Have a great day.'
    : template === 'solar'
    ? 'All set! A technician will contact you to schedule the free assessment. Have a great day.'
    : 'All set! Here\'s my card. Text me when modem arrives if you need help.';
  steps.push({
    id: 'closing',
    label: '👋 Closing Message',
    preview: setup.closingDoneEn || defaultClosing,
    field: 'closingDoneEn', deletable: false, editable: true,
  });

  return steps;
}

// ── Review Step ──
interface ReviewStepProps {
  setup: UserSetup;
  hidePrice: boolean;
  translating: boolean;
  onUpdate: (partial: Partial<UserSetup>) => void;
}

function ReviewStep({ setup, hidePrice, translating, onUpdate }: ReviewStepProps) {
  const flowSteps = buildFlowPreview(setup, hidePrice);

  const [stepOrder, setStepOrder] = useState<string[]>(() => {
    const defaultOrder = flowSteps.map(fs => fs.id);
    // Use saved order if it exists and covers all current steps
    if (setup.sectionOrder && setup.sectionOrder.length > 0) {
      const validIds = new Set(defaultOrder);
      const saved = setup.sectionOrder.filter(id => validIds.has(id));
      const missing = defaultOrder.filter(id => !saved.includes(id));
      // If there are missing items, insert them at their natural position
      if (missing.length > 0) {
        const merged = [...saved];
        for (const id of missing) {
          const naturalIdx = defaultOrder.indexOf(id);
          // Find the best insertion point: after the last item that comes before this in default order
          let insertAt = merged.length;
          for (let i = naturalIdx - 1; i >= 0; i--) {
            const prevId = defaultOrder[i];
            const prevPos = merged.indexOf(prevId);
            if (prevPos !== -1) {
              insertAt = prevPos + 1;
              break;
            }
          }
          merged.splice(insertAt, 0, id);
        }
        return merged;
      }
      if (saved.length > 0) return saved;
    }
    return defaultOrder;
  });
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionContent, setNewSectionContent] = useState('');

  // Keep order in sync when steps appear/disappear
  useEffect(() => {
    const currentIds = flowSteps.map(fs => fs.id);
    const defaultOrder = flowSteps.map(fs => fs.id);
    setStepOrder(prev => {
      const kept = prev.filter(id => currentIds.includes(id));
      const missing = currentIds.filter(id => !kept.includes(id));
      if (missing.length === 0) return kept;
      // Insert missing items at their natural position
      const merged = [...kept];
      for (const id of missing) {
        const naturalIdx = defaultOrder.indexOf(id);
        let insertAt = merged.length;
        for (let i = naturalIdx - 1; i >= 0; i--) {
          const prevId = defaultOrder[i];
          const prevPos = merged.indexOf(prevId);
          if (prevPos !== -1) {
            insertAt = prevPos + 1;
            break;
          }
        }
        merged.splice(insertAt, 0, id);
      }
      return merged;
    });
  }, [setup.extraInfoEn, setup.installInstructionsEn, setup.closingDoneEn, setup.collectFields.length, (setup.extraSections || []).length]);

  // Save order to setup whenever it changes
  useEffect(() => {
    onUpdate({ sectionOrder: stepOrder } as Partial<UserSetup>);
  }, [stepOrder]);

  const stepsMap = new Map(flowSteps.map(fs => [fs.id, fs]));
  const orderedSteps = stepOrder
    .map(id => stepsMap.get(id))
    .filter((fs): fs is FlowStep => !!fs);

  const moveStep = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedSteps.length) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStepOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, removed);
      return newOrder;
    });
  };

  const deleteStep = (step: FlowStep) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // Handle extra_N sections
    if (step.id.startsWith('extra_')) {
      const idx = parseInt(step.id.split('_')[1], 10);
      const sections = [...(setup.extraSections || [])];
      sections.splice(idx, 1);
      onUpdate({ extraSections: sections } as any);
      return;
    }
    // Handle probing questions (ask_service, ask_provider, etc.)
    const questionIds = ['ask_service', 'ask_provider', 'ask_how_long', 'ask_how_much', 'ask_had_company'];
    if (questionIds.includes(step.id)) {
      const deleted = [...(setup.deletedQuestions || [])];
      if (!deleted.includes(step.id)) deleted.push(step.id);
      onUpdate({ deletedQuestions: deleted } as any);
      return;
    }
    if (!step.field) return;
    onUpdate({ [step.field]: '' } as Partial<UserSetup>);
  };

  const handleEdit = (field: keyof UserSetup | undefined, newValue: string, stepId?: string) => {
    // Handle extra_N sections
    if (stepId && stepId.startsWith('extra_')) {
      const idx = parseInt(stepId.split('_')[1], 10);
      const sections = [...(setup.extraSections || [])];
      if (sections[idx]) {
        sections[idx] = { ...sections[idx], en: newValue };
        onUpdate({ extraSections: sections } as any);
      }
      return;
    }
    if (!field) return;
    const partial: any = { [field]: newValue };
    if (field === 'priceMonthly') partial.priceMonthly = Number(newValue) || 0;
    onUpdate(partial);
  };

  const handleAddSection = () => {
    if (!newSectionContent.trim()) return;
    const sections = [...(setup.extraSections || [])];
    sections.push({ en: newSectionContent.trim(), es: '' });
    onUpdate({ extraSections: sections } as any);
    setNewSectionContent('');
    setAddingSection(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  return (
    <View style={s.section}>
      <Text style={s.stepTitle}>✅ Conversation Preview</Text>
      <Text style={s.stepDesc}>This is the exact flow your customer will experience. Reorder with arrows, tap to edit, 🗑️ to remove.</Text>

      {orderedSteps.map((step, idx) => (
        <ReviewCard
          key={step.id}
          step={step}
          index={idx}
          isFirst={idx === 0}
          isLast={idx === orderedSteps.length - 1}
          onEdit={handleEdit}
          onDelete={() => deleteStep(step)}
          onMoveUp={() => moveStep(idx, idx - 1)}
          onMoveDown={() => moveStep(idx, idx + 1)}
        />
      ))}

      {/* Add extra info */}
      {addingSection ? (
        <View style={rs.addCard}>
          <Text style={rs.cardLabel}>ADD EXTRA INFO</Text>
          <TextInput
            style={[rs.editInput, rs.editInputMulti]}
            placeholder="e.g. We also offer a referral bonus — $50 per neighbor who signs up."
            value={newSectionContent}
            onChangeText={setNewSectionContent}
            multiline
            autoFocus
          />
          <View style={rs.editButtons}>
            <TouchableOpacity onPress={() => { setAddingSection(false); setNewSectionContent(''); }} style={rs.cancelBtn}>
              <Text style={rs.cancelBtnTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAddSection} style={rs.saveBtn}>
              <Text style={rs.saveBtnTxt}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={rs.addBtn} onPress={() => setAddingSection(true)} activeOpacity={0.7}>
          <Text style={rs.addBtnTxt}>＋ Add Extra Info</Text>
        </TouchableOpacity>
      )}

      {translating && (
        <Text style={s.translatingText}>⏳ Translating to Spanish…</Text>
      )}
    </View>
  );
}

// Review Step styles
const rs = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 10, elevation: 2,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'stretch',
  },
  arrowCol: {
    width: 36, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F5F6FB', borderRightWidth: 1, borderRightColor: '#E5E7EB',
    paddingVertical: 8,
  },
  arrowBtn: {
    paddingVertical: 6, paddingHorizontal: 4,
  },
  arrowTxt: {
    fontSize: 14, color: '#7C5CFC', fontWeight: '700',
  },
  arrowDisabled: {
    color: '#D4D6E4',
  },
  cardContent: {
    flex: 1, padding: 14,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: '#7C5CFC', letterSpacing: 2, textTransform: 'uppercase',
  },
  trashBtn: { padding: 4 },
  trashIcon: { fontSize: 16 },
  cardValue: {
    fontSize: 15, color: '#1A1B2E', lineHeight: 21,
  },
  tapHint: {
    fontSize: 11, color: '#A0A3BD', marginTop: 4, fontStyle: 'italic',
  },
  editInput: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 15,
    color: '#1A1B2E', borderWidth: 1, borderColor: '#D1D5DB',
  },
  editInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F0F1F7', borderRadius: 10 },
  cancelBtnTxt: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#7C5CFC', borderRadius: 10 },
  saveBtnTxt: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  addBtn: {
    paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: '#D1D5DB',
    borderStyle: 'dashed', alignItems: 'center', marginTop: 4, marginBottom: 8,
  },
  addBtnTxt: { fontSize: 15, fontWeight: '600', color: '#7C5CFC' },
  addCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 2, borderWidth: 1, borderColor: '#7C5CFC',
  },
});

export default function SetupScreen({ onComplete, existingSetup }: Props) {
  const [step, setStep] = useState<SetupStep>('basics');
  // Merge with DEFAULT_SETUP for backward compatibility
  const [setup, setSetup] = useState<UserSetup>(
    existingSetup ? { ...DEFAULT_SETUP, ...existingSetup } : DEFAULT_SETUP
  );
  const [translating, setTranslating] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  // Change #5: Hide price/switches for Ministry and Sales
  const hidePrice = setup.selectedTemplate === 'ministry' || setup.selectedTemplate === 'sales';

  const update = (partial: Partial<UserSetup>) => setSetup(prev => ({ ...prev, ...partial }));

  const finishingRef = useRef(false);

  const goNext = () => {
    if (finishingRef.current || translating) return; // Block if already finishing
    console.log('[SetupScreen] goNext called — step:', step, 'isLast:', isLast);
    // Validation
    if (step === 'basics' && (!setup.repName.trim() || !setup.companyName.trim())) return;
    if (step === 'pitch') {
      if (!setup.pitchEn.trim()) return;
      if (!hidePrice && !setup.priceMonthly) return;
    }
    if (step === 'close' && !setup.closeOfferEn.trim()) return;
    // Install instructions required for telecom/solar, optional for ministry/sales
    if (step === 'install' && setup.selectedTemplate !== 'ministry' && setup.selectedTemplate !== 'sales' && !setup.installInstructionsEn.trim()) return;

    if (isLast) {
      console.log('[SetupScreen] Last step — calling handleFinish');
      handleFinish();
    } else {
      console.log('[SetupScreen] Advancing to:', STEPS[stepIndex + 1]);
      setStep(STEPS[stepIndex + 1]);
    }
  };

  const applyTemplate = (key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key];
    update({
      pitchEn: t.pitch,
      closeOfferEn: t.close,
      installInstructionsEn: t.install,
      selectedTemplate: key,
    });
  };

  const goBack = () => {
    if (!isFirst) setStep(STEPS[stepIndex - 1]);
  };

  // Change #2: Always retranslate — never skip even if Spanish is already populated
  const handleFinish = async () => {
    if (finishingRef.current || translating) return; // Prevent double-tap
    finishingRef.current = true;
    let finalSetup = { ...setup };
    setTranslating(true);
    console.log('[SetupScreen] handleFinish started');

    try {
      // Translate all fields in parallel — no timeout race (translations take ~1s)
      const results = await Promise.allSettled([
        finalSetup.pitchEn ? translateEnglishToSpanish(finalSetup.pitchEn) : Promise.resolve(null),
        finalSetup.closeOfferEn ? translateEnglishToSpanish(finalSetup.closeOfferEn) : Promise.resolve(null),
        finalSetup.extraInfoEn ? translateEnglishToSpanish(finalSetup.extraInfoEn) : Promise.resolve(null),
        finalSetup.installInstructionsEn ? translateEnglishToSpanish(finalSetup.installInstructionsEn) : Promise.resolve(null),
        finalSetup.closingDoneEn ? translateEnglishToSpanish(finalSetup.closingDoneEn) : Promise.resolve(null),
        finalSetup.objectionFirstEn ? translateEnglishToSpanish(finalSetup.objectionFirstEn) : Promise.resolve(null),
        finalSetup.objectionFinalEn ? translateEnglishToSpanish(finalSetup.objectionFinalEn) : Promise.resolve(null),
      ]);

      const get = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' && r.value ? r.value.translated : null;

      // Apply results (fallback to English on failure)
      finalSetup.pitchEs = get(results[0]) || finalSetup.pitchEn || '';
      finalSetup.closeOfferEs = get(results[1]) || finalSetup.closeOfferEn || '';
      finalSetup.extraInfoEs = get(results[2]) || finalSetup.extraInfoEn || '';
      finalSetup.installInstructionsEs = get(results[3]) || finalSetup.installInstructionsEn || '';
      finalSetup.closingDoneEs = get(results[4]) || finalSetup.closingDoneEn || '';
      finalSetup.objectionFirstEs = get(results[5]) || finalSetup.objectionFirstEn || '';
      finalSetup.objectionFinalEs = get(results[6]) || finalSetup.objectionFinalEn || '';

      // Translate extra sections
      const extraSections = [...(finalSetup.extraSections || [])];
      for (let i = 0; i < extraSections.length; i++) {
        if (extraSections[i].en && !extraSections[i].es) {
          try {
            const r = await translateEnglishToSpanish(extraSections[i].en);
            if (r?.translated) extraSections[i] = { ...extraSections[i], es: r.translated };
          } catch { /* fallback to English */ }
        }
      }
      finalSetup.extraSections = extraSections;

      console.log('[SetupScreen] Translations done');
    } catch (e) {
      console.error('[SetupScreen] Translation batch failed:', e);
      finalSetup.pitchEs = finalSetup.pitchEs || finalSetup.pitchEn;
      finalSetup.closeOfferEs = finalSetup.closeOfferEs || finalSetup.closeOfferEn;
      finalSetup.extraInfoEs = finalSetup.extraInfoEs || finalSetup.extraInfoEn;
      finalSetup.installInstructionsEs = finalSetup.installInstructionsEs || finalSetup.installInstructionsEn;
      finalSetup.closingDoneEs = finalSetup.closingDoneEs || finalSetup.closingDoneEn;
    } finally {
      setTranslating(false);
    }

    finalSetup.setupComplete = true;
    try {
      await saveSetup(finalSetup);
      console.log('[SetupScreen] Setup saved');
    } catch (e) {
      console.error('[SetupScreen] Save failed:', e);
    }
    console.log('[SetupScreen] Calling onComplete — transitioning to main screen');
    onComplete(finalSetup);
  };

  const toggleField = (fieldId: string) => {
    const fields = setup.collectFields.includes(fieldId)
      ? setup.collectFields.filter(f => f !== fieldId)
      : [...setup.collectFields, fieldId];
    update({ collectFields: fields });
  };

  const scrollRef = useRef<ScrollView>(null);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F6FB" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >

          {/* Header */}
          <View style={s.header}>
            <Text style={s.logo}>Hola</Text>
            <Text style={s.tagline}>SETUP</Text>
            <View style={s.progressRow}>
              {STEPS.map((st, i) => (
                <View key={st} style={[ss.dot, i <= stepIndex && ss.dotActive]} />
              ))}
            </View>
          </View>

          {/* ── Step: Basics ── */}
          {step === 'basics' && (
            <View style={s.section}>
              <Text style={s.stepTitle}>👋 About You</Text>
              <Text style={s.stepDesc}>What's your name and company?</Text>

              <Text style={s.label}>Your First Name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Quentin"
                value={setup.repName}
                onChangeText={t => update({ repName: t })}
                autoCapitalize="words"
              />

              <Text style={s.label}>Company Name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Optimum"
                value={setup.companyName}
                onChangeText={t => update({ companyName: t })}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* ── Step: Pitch ── */}
          {step === 'pitch' && (
            <View style={s.section}>
              <Text style={s.stepTitle}>📢 Your Pitch</Text>
              <Text style={s.stepDesc}>Write your offer in English. We'll translate it to Spanish automatically.</Text>

              {/* Template Picker */}
              <Text style={s.label}>Start with a Template:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {Object.entries(TEMPLATES).map(([key, t]) => (
                  <TouchableOpacity 
                    key={key} 
                    style={[s.templateBtn, setup.selectedTemplate === key && s.templateBtnSelected]} 
                    onPress={() => applyTemplate(key as keyof typeof TEMPLATES)}
                  >
                    <Text style={[s.templateBtnTxt, setup.selectedTemplate === key && s.templateBtnTxtSelected]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Change #5: Hide price for Ministry and Sales */}
              {!hidePrice && (
                <>
                  <Text style={s.label}>Price per Month ($)</Text>
                  <TextInput
                    style={s.input}
                    placeholder="25"
                    value={String(setup.priceMonthly)}
                    onChangeText={t => update({ priceMonthly: Number(t) || 0 })}
                    keyboardType="numeric"
                  />
                </>
              )}

              <Text style={s.label}>Your Pitch (English)</Text>
              <Text style={s.hint}>What do you say to sell your product? Keep it short — 2-3 sentences.</Text>
              <TextInput
                style={s.inputMulti}
                placeholder="e.g. Hi, we help neighbors lower their electric bill with solar. No money down, just cheaper power."
                value={setup.pitchEn}
                onChangeText={t => update({ pitchEn: t })}
                multiline
                numberOfLines={4}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />

              {/* Change #5: Hide switches for Ministry and Sales */}
              {!hidePrice && (
                <>
                  <View style={s.switchRow}>
                    <Text style={s.switchLabel}>No Contract</Text>
                    <Switch value={!setup.hasContract} onValueChange={v => update({ hasContract: !v })} />
                  </View>
                  <View style={s.switchRow}>
                    <Text style={s.switchLabel}>No Credit Check</Text>
                    <Switch value={!setup.creditCheck} onValueChange={v => update({ creditCheck: !v })} />
                  </View>
                  <View style={s.switchRow}>
                    <Text style={s.switchLabel}>Free Installation</Text>
                    <Switch value={setup.freeInstall} onValueChange={v => update({ freeInstall: v })} />
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Step: Close ── */}
          {step === 'close' && (
            <View style={s.section}>
              <Text style={s.stepTitle}>
                {setup.selectedTemplate === 'ministry' ? '🙏 Your Invitation' : '🎯 Attempt Close'}
              </Text>
              <Text style={s.stepDesc}>
                {setup.selectedTemplate === 'ministry'
                  ? 'What do you say to invite them? This is your "Come join us!" moment.'
                  : 'What do you say to close the deal? This is the "Are you interested?" moment.'}
              </Text>

              <Text style={s.label}>
                {setup.selectedTemplate === 'ministry' ? 'Invitation Script (English)' : 'Close Script (English)'}
              </Text>
              <TextInput
                style={s.inputMulti}
                placeholder={setup.selectedTemplate === 'ministry'
                  ? 'e.g. Can we count on seeing you there? I can text you the address and time.'
                  : 'e.g. If interested, you may not pay anything today. Just need your name, phone number, and email.'}
                value={setup.closeOfferEn}
                onChangeText={t => update({ closeOfferEn: t })}
                multiline
                numberOfLines={4}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
            </View>
          )}

          {/* ── Step: Extra Info ── */}
          {step === 'extra_info' && (
            <View style={s.section}>
              <Text style={s.stepTitle}>
                {setup.selectedTemplate === 'ministry' ? '⛪ Church Invite Details' : '➕ Extra Info'}
              </Text>
              <Text style={s.stepDesc}>
                {setup.selectedTemplate === 'ministry'
                  ? 'Customize what you say to invite them. Leave blank to use a default invite, or type your own. This is optional.'
                  : 'Any additional details, talking points, or promotions you want to share? This is optional — hit Next to skip.'}
              </Text>

              <Text style={s.label}>
                {setup.selectedTemplate === 'ministry' ? 'Church Invite (English) — Optional' : 'Extra Details (English)'}
              </Text>
              <Text style={s.hint}>
                {setup.selectedTemplate === 'ministry'
                  ? 'Customize the invite message. Default: "We\'d love for you to join us. We have programs for the whole family."'
                  : 'Add anything the customer should know: bonuses, limited-time offers, FAQ answers, etc.'}
              </Text>
              <TextInput
                style={s.inputMulti}
                placeholder={
                  setup.selectedTemplate === 'ministry'
                    ? 'e.g. We\'d love for you to join us this Sunday. We have a great kids program and free breakfast.'
                    : setup.selectedTemplate === 'solar'
                    ? 'e.g. We also offer a free home energy audit. Ask about our referral bonus — $500 off per neighbor who signs up.'
                    : setup.selectedTemplate === 'sales'
                    ? 'e.g. We also have a variety pack — 6 cookies for $12. Great as a gift! All proceeds go to our school trip fund.'
                    : 'e.g. We also offer a free router upgrade for new customers. Ask about our referral bonus — $50 per neighbor.'}
                value={setup.extraInfoEn}
                onChangeText={t => update({ extraInfoEn: t })}
                multiline
                numberOfLines={5}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
            </View>
          )}

          {/* ── Step: Collect ── */}
          {step === 'collect' && (
            <View style={s.section}>
              <Text style={s.stepTitle}>📋 Info to Collect</Text>
              <Text style={s.stepDesc}>When the customer says YES, what info do you need?</Text>

              {COLLECT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.checkRow, setup.collectFields.includes(opt.id) && s.checkRowActive]}
                  onPress={() => toggleField(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={s.checkEmoji}>{setup.collectFields.includes(opt.id) ? '☑️' : '⬜'}</Text>
                  <View>
                    <Text style={s.checkLabel}>{opt.label}</Text>
                    <Text style={s.checkLabelEs}>{opt.labelEs}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Step: Install ── */}
          {step === 'install' && (
            <View style={s.section}>
              <Text style={s.stepTitle}>
                {setup.selectedTemplate === 'ministry' ? '⛪ Service Details' : '🔧 Install Instructions'}
              </Text>
              <Text style={s.stepDesc}>
                {setup.selectedTemplate === 'ministry'
                  ? 'What should people know about the service? Time, location, what to expect.'
                  : 'What should the customer know about installation / next steps?'}
              </Text>

              <Text style={s.label}>
                {setup.selectedTemplate === 'ministry' ? 'Service Details (English) — Optional' : 'Instructions (English)'}
              </Text>
              <Text style={s.hint}>
                {setup.selectedTemplate === 'ministry'
                  ? 'Leave blank to skip this step in the selling flow.'
                  : setup.selectedTemplate === 'sales'
                  ? 'Optional — leave blank if not needed.'
                  : ''}
              </Text>
              <TextInput
                style={s.inputMulti}
                placeholder={setup.selectedTemplate === 'ministry'
                  ? 'e.g. Service starts at 10 AM. Look for the welcome tent in the parking lot.'
                  : setup.selectedTemplate === 'sales'
                  ? 'e.g. I have the cookies right here. Thank you for your support!'
                  : 'e.g. We ship the modem via FedEx, arrives in 2 days. One cable to the wall jack. Scan the QR code to activate.'}
                value={setup.installInstructionsEn}
                onChangeText={t => update({ installInstructionsEn: t })}
                multiline
                numberOfLines={4}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />

              <Text style={[s.label, { marginTop: 24 }]}>Closing Message (English)</Text>
              <Text style={s.hint}>What do you say when you're done? This is your goodbye to the customer.</Text>
              <TextInput
                style={s.inputMulti}
                placeholder={setup.selectedTemplate === 'ministry'
                  ? 'e.g. God bless you and your family. We hope to see you Sunday!'
                  : setup.selectedTemplate === 'sales'
                  ? 'e.g. Thank you so much for your support! Have a great day!'
                  : setup.selectedTemplate === 'solar'
                  ? 'e.g. Thank you! Someone will be in touch to schedule your free assessment. Have a great day!'
                  : 'e.g. Thank you for your time. A technician will be in touch soon. Have a great day!'}
                value={setup.closingDoneEn}
                onChangeText={t => update({ closingDoneEn: t })}
                multiline
                numberOfLines={3}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />

              {/* Rejection responses */}
              <Text style={[s.label, { marginTop: 24 }]}>🛑 If They Say No — 1st Response (English)</Text>
              <Text style={s.hint}>What do you say the first time they reject? A soft push to reconsider. Leave blank for default.</Text>
              <TextInput
                style={s.inputMulti}
                placeholder="e.g. I completely understand. Can I leave my info in case you change your mind? It costs nothing."
                value={setup.objectionFirstEn}
                onChangeText={t => update({ objectionFirstEn: t })}
                multiline
                numberOfLines={3}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />

              <Text style={[s.label, { marginTop: 16 }]}>🛑 If They Say No Again — Final Response (English)</Text>
              <Text style={s.hint}>What do you say if they reject a second time? A polite goodbye. Leave blank for default.</Text>
              <TextInput
                style={s.inputMulti}
                placeholder="e.g. No problem at all, thank you for your time. Have a great day!"
                value={setup.objectionFinalEn}
                onChangeText={t => update({ objectionFinalEn: t })}
                multiline
                numberOfLines={3}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
            </View>
          )}

          {/* ── Step: Review (Editable) ── */}
          {step === 'review' && (
            <ReviewStep
              setup={setup}
              hidePrice={hidePrice}
              translating={translating}
              onUpdate={update}
            />
          )}

          {/* Navigation */}
          <View style={s.navRow}>
            {!isFirst && (
              <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
                <Text style={s.backBtnTxt}>← Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                s.nextBtn, 
                isLast && s.finishBtn,
                (step === 'basics' && (!setup.repName.trim() || !setup.companyName.trim())) && s.disabledBtn,
                (step === 'pitch' && !setup.pitchEn.trim()) && s.disabledBtn,
                (step === 'pitch' && !hidePrice && !setup.priceMonthly) && s.disabledBtn,
                (step === 'close' && !setup.closeOfferEn.trim()) && s.disabledBtn,
                (step === 'install' && setup.selectedTemplate !== 'ministry' && setup.selectedTemplate !== 'sales' && !setup.installInstructionsEn.trim()) && s.disabledBtn,
              ]}
              onPress={goNext}
              activeOpacity={0.7}
              disabled={translating}
            >
              <Text style={s.nextBtnTxt}>
                {isLast ? '🚀 Start Selling' : step === 'extra_info' && !setup.extraInfoEn.trim() ? 'Skip →' : 'Next →'}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D4D6E4', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#7C5CFC' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F6FB' },
  scroll: { paddingHorizontal: 20, paddingBottom: 300 },
  header: { alignItems: 'center', paddingTop: 12, marginBottom: 20 },
  logo: { fontSize: 28, fontWeight: '700', color: '#1A1B2E', letterSpacing: -0.5 },
  tagline: { fontSize: 12, fontWeight: '600', color: '#A0A3BD', letterSpacing: 4, textTransform: 'uppercase', marginTop: 2 },
  progressRow: { flexDirection: 'row', marginTop: 16 },

  section: { marginBottom: 24 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#1A1B2E', marginBottom: 4 },
  stepDesc: { fontSize: 14, color: '#6B7280', marginBottom: 20, lineHeight: 20 },

  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 12 },
  hint: { fontSize: 12, color: '#9CA3AF', marginBottom: 8, lineHeight: 16 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, fontSize: 16, color: '#1A1B2E', elevation: 2, borderWidth: 1, borderColor: '#E5E7EB' },
  inputMulti: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, fontSize: 15, color: '#1A1B2E', elevation: 2, borderWidth: 1, borderColor: '#E5E7EB', minHeight: 100, textAlignVertical: 'top' },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F1F7' },
  switchLabel: { fontSize: 15, fontWeight: '500', color: '#1A1B2E' },

  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8, backgroundColor: '#FFFFFF', elevation: 1, gap: 12 },
  checkRowActive: { backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#4ADE80' },
  checkEmoji: { fontSize: 20 },
  checkLabel: { fontSize: 15, fontWeight: '600', color: '#1A1B2E' },
  checkLabelEs: { fontSize: 12, color: '#6B7280' },

  translatingText: { textAlign: 'center', fontSize: 14, color: '#F59E0B', fontWeight: '600', marginTop: 12 },

  templateBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E0E7FF', borderRadius: 20, marginRight: 8 },
  templateBtnSelected: { backgroundColor: '#7C5CFC' },
  templateBtnTxt: { fontSize: 13, fontWeight: '600', color: '#4338CA' },
  templateBtnTxtSelected: { color: '#FFFFFF' },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 12 },
  backBtn: { flex: 1, paddingVertical: 16, backgroundColor: '#F0F1F7', borderRadius: 16, alignItems: 'center' },
  backBtnTxt: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  nextBtn: { flex: 2, paddingVertical: 16, backgroundColor: '#7C5CFC', borderRadius: 16, alignItems: 'center', elevation: 4 },
  finishBtn: { backgroundColor: '#10B981' },
  disabledBtn: { backgroundColor: '#D1D5DB', opacity: 0.7 },
  nextBtnTxt: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
