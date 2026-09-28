/**
 * Central icon mapping: every symptom, vital metric, and lab test renders with
 * a matching pictogram (the Thermometer-next-to-Fever motif, applied product-wide).
 * Keyword fallbacks keep arbitrary labels covered.
 */
import {
  Thermometer,
  BatteryLow,
  Wind,
  Brain,
  Flame,
  Soup,
  Waves,
  Bone,
  Hand,
  Droplets,
  AudioLines,
  HeartPulse,
  Activity,
  Heart,
  Gauge,
  Weight,
  Droplet,
  Layers,
  ShieldPlus,
  Microscope,
  TestTube2
} from 'lucide-react';

/* ---------------- Symptoms ---------------- */

const SYMPTOM_ICONS = [
  { keys: ['fever', 'temperature'], Icon: Thermometer },
  { keys: ['fatigue', 'energy', 'tired'], Icon: BatteryLow },
  { keys: ['breath', 'wheez'], Icon: Wind },
  { keys: ['headache', 'migraine'], Icon: Brain },
  { keys: ['reflux', 'heartburn', 'acid'], Icon: Flame },
  { keys: ['nausea', 'stomach', 'vomit'], Icon: Soup },
  { keys: ['dizzy', 'lighthead'], Icon: Waves },
  { keys: ['joint', 'muscle', 'pain'], Icon: Bone },
  { keys: ['rash', 'itch', 'skin'], Icon: Hand },
  { keys: ['thirst', 'urin'], Icon: Droplets },
  { keys: ['cough', 'congestion', 'chest'], Icon: AudioLines }
];

export function symptomIcon(label = '') {
  const l = label.toLowerCase();
  for (const { keys, Icon } of SYMPTOM_ICONS) {
    if (keys.some(k => l.includes(k))) return Icon;
  }
  return HeartPulse; // neutral fallback: general wellbeing
}

/* ---------------- Vitals & lab tests ---------------- */

const VITAL_ICONS = [
  { keys: ['temperature'], Icon: Thermometer },
  { keys: ['weight'], Icon: Weight },
  { keys: ['systolic', 'diastolic', 'blood pressure'], Icon: Heart },
  { keys: ['heart rate', 'pulse'], Icon: HeartPulse },
  { keys: ['blood sugar', 'glucose'], Icon: Droplet },
  { keys: ['hba1c'], Icon: Gauge },
  { keys: ['hemoglobin'], Icon: Droplets },
  { keys: ['cholesterol', 'lipid'], Icon: Layers },
  { keys: ['wbc', 'blood count'], Icon: ShieldPlus }
];

export function vitalIcon(label = '') {
  const l = label.toLowerCase();
  for (const { keys, Icon } of VITAL_ICONS) {
    if (keys.some(k => l.includes(k))) return Icon;
  }
  return Activity; // neutral fallback: generic reading
}

export function labTestIcon(label = '') {
  const l = label.toLowerCase();
  for (const { keys, Icon } of VITAL_ICONS) {
    if (keys.some(k => l.includes(k))) return Icon;
  }
  return Microscope; // lab-flavored fallback
}

/* Convenience export for generic lab surfaces */
export { TestTube2 as GenericLabIcon };
