require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, initSchema, runMigrations, transaction } = require('./database');
const { parseCSV } = require('./csvHelper');
const { generateMedicineExplanation } = require('./geminiHelper');

const MEDICINES_CSV_PATH = 'C:/Users/Nav/Desktop/Medbridge Database/Medicines.csv';
const DIAGNOSES_CSV_PATH = 'C:/Users/Nav/Desktop/Medbridge Database/Diaognases.csv';

// Common recognizable medicine keywords to prioritize in demo selection
const PRIORITY_KEYWORDS = [
  'metformin', 'insulin', 'glimepiride', 'sitagliptin', 'vildagliptin', 'dapagliflozin',
  'amlodipine', 'telmisartan', 'losartan', 'atenolol', 'metoprolol', 'ramipril', 'enalapril',
  'paracetamol', 'dolo', 'crocin', 'ibuprofen', 'combiflam', 'diclofenac', 'voveran', 'naproxen',
  'amoxicillin', 'augmentin', 'azithromycin', 'azithral', 'ciprofloxacin', 'cefixime', 'doxycycline',
  'atorvastatin', 'atorva', 'rosuvastatin', 'aspirin', 'ecosprin', 'clopidogrel',
  'pantoprazole', 'pan 40', 'omeprazole', 'rabeprazole', 'gelusil', 'digene',
  'cetirizine', 'allegra', 'fexofenadine', 'montelukast', 'levocetirizine',
  'salbutamol', 'asthalin', 'budesonide', 'budecort', 'foracort',
  'levothyroxine', 'thyronorm', 'ondansetron', 'vomikind', 'fluconazole'
];

function classifyTherapeuticClass(name, composition, uses) {
  const combined = `${name} ${composition} ${uses}`.toLowerCase();

  if (combined.includes('metformin') || combined.includes('glimepiride') || combined.includes('insulin') || combined.includes('diabetes') || combined.includes('diabetic') || combined.includes('gliptin') || combined.includes('sugar level')) {
    return 'Antidiabetic';
  }
  if (combined.includes('amlodipine') || combined.includes('telmisartan') || combined.includes('losartan') || combined.includes('atenolol') || combined.includes('metoprolol') || combined.includes('hypertension') || combined.includes('blood pressure') || combined.includes('ramipril') || combined.includes('enalapril')) {
    return 'Antihypertensive';
  }
  if (combined.includes('paracetamol') || combined.includes('ibuprofen') || combined.includes('diclofenac') || combined.includes('naproxen') || combined.includes('pain') || combined.includes('fever') || combined.includes('analgesic') || combined.includes('anti-inflammatory') || combined.includes('tramadol')) {
    return 'NSAID / Analgesic';
  }
  if (combined.includes('amoxycillin') || combined.includes('amoxicillin') || combined.includes('azithromycin') || combined.includes('bacterial') || combined.includes('ciprofloxacin') || combined.includes('cefixime') || combined.includes('antibiotic') || combined.includes('doxycycline') || combined.includes('clavulanic')) {
    return 'Antibiotic';
  }
  if (combined.includes('atorvastatin') || combined.includes('rosuvastatin') || combined.includes('cholesterol') || combined.includes('statin') || combined.includes('lipid')) {
    return 'Statin / Lipid-lowering';
  }
  if (combined.includes('aspirin') || combined.includes('clopidogrel') || combined.includes('blood thinner') || combined.includes('anticoagulant') || combined.includes('antiplatelet')) {
    return 'Anticoagulant / Antiplatelet';
  }
  if (combined.includes('pantoprazole') || combined.includes('omeprazole') || combined.includes('rabeprazole') || combined.includes('acidity') || combined.includes('gerd') || combined.includes('ulcer') || combined.includes('reflux')) {
    return 'Proton Pump Inhibitor (PPI)';
  }
  if (combined.includes('cetirizine') || combined.includes('fexofenadine') || combined.includes('levocetirizine') || combined.includes('allergy') || combined.includes('allergic') || combined.includes('antihistamine') || combined.includes('montelukast')) {
    return 'Antihistamine / Antiallergic';
  }
  if (combined.includes('salbutamol') || combined.includes('budesonide') || combined.includes('asthma') || combined.includes('inhaler') || combined.includes('bronchial') || combined.includes('wheezing')) {
    return 'Respiratory / Bronchodilator';
  }
  if (combined.includes('fluconazole') || combined.includes('fungal') || combined.includes('clotrimazole') || combined.includes('itraconazole')) {
    return 'Antifungal';
  }
  if (combined.includes('thyroxine') || combined.includes('thyroid')) {
    return 'Thyroid Hormone';
  }
  if (combined.includes('vitamin') || combined.includes('calcium') || combined.includes('zinc') || combined.includes('iron')) {
    return 'Nutritional Supplement';
  }

  return 'General Therapeutic';
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
}

async function seed() {
  console.log('====================================================');
  console.log('           STARTING MEDBRIDGE DATABASE SEED          ');
  console.log('====================================================\n');

  // Step 1: Initialize Database Schema
  console.log('1. Initializing SQLite tables...');
  // Drop old tables cleanly for a fresh seed
  db.exec(`
    DROP TABLE IF EXISTS self_logs;
    DROP TABLE IF EXISTS appointments;
    DROP TABLE IF EXISTS lab_orders;
    DROP TABLE IF EXISTS prescriptions;
    DROP TABLE IF EXISTS visits;
    DROP TABLE IF EXISTS diagnoses;
    DROP TABLE IF EXISTS medicines;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS lab_tests;
  `);
  initSchema();
  runMigrations();
  console.log('   Schema successfully created.\n');

  // Step 2: Read and Print Header Row of both CSVs
  console.log('2. Inspecting CSV Datasets:');
  const rawMedRows = parseCSV(MEDICINES_CSV_PATH);
  console.log('   [Medicines.csv Header]:', rawMedRows[0]);
  console.log(`   Total raw medicine rows: ${rawMedRows.length - 1}`);

  const rawDiagRows = parseCSV(DIAGNOSES_CSV_PATH);
  console.log('   [Diaognases.csv Header]:', rawDiagRows[0]);
  console.log(`   Total raw diagnosis rows: ${rawDiagRows.length - 1}\n`);

  // Step 3: Seed Lab Tests (exactly specified in requirements)
  console.log('3. Seeding hand-seeded lab_tests (8 standard tests)...');
  const labTests = [
    { id: 'lt_1', test_name: 'Fasting Blood Sugar', unit: 'mg/dL', normal_low: 70, normal_high: 100 },
    { id: 'lt_2', test_name: 'HbA1c', unit: '%', normal_low: 4.0, normal_high: 5.6 },
    { id: 'lt_3', test_name: 'Systolic BP', unit: 'mmHg', normal_low: 90, normal_high: 120 },
    { id: 'lt_4', test_name: 'Diastolic BP', unit: 'mmHg', normal_low: 60, normal_high: 80 },
    { id: 'lt_5', test_name: 'Hemoglobin (Male)', unit: 'g/dL', normal_low: 13.5, normal_high: 17.5 },
    { id: 'lt_6', test_name: 'Hemoglobin (Female)', unit: 'g/dL', normal_low: 12.0, normal_high: 15.5 },
    { id: 'lt_7', test_name: 'Total Cholesterol', unit: 'mg/dL', normal_low: 125, normal_high: 200 },
    { id: 'lt_8', test_name: 'WBC Count', unit: '×10⁹/L', normal_low: 4.0, normal_high: 11.0 }
  ];

  const insertLabTest = db.prepare(`
    INSERT INTO lab_tests (id, test_name, unit, normal_low, normal_high)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const lt of labTests) {
    insertLabTest.run(lt.id, lt.test_name, lt.unit, lt.normal_low, lt.normal_high);
  }
  console.log(`   Seeded ${labTests.length} lab tests.\n`);

  // Step 4: Seed Users (1 Doctor, 2 Patients)
  console.log('4. Seeding Demo Accounts (Doctor + 2 Patients)...');
  const passwordHash = bcrypt.hashSync('demo1234', 10);

  const users = [
    {
      id: 'doc_1',
      name: 'Dr. Evelyn Reed, MD',
      email: 'doctor@medbridge.com',
      role: 'doctor',
      specialization: 'Internal Medicine & Cardiovascular Care',
      password_hash: passwordHash
    },
    {
      id: 'pat_1',
      name: 'Marcus Vance',
      email: 'patient1@medbridge.com',
      role: 'patient',
      specialization: null,
      password_hash: passwordHash
    },
    {
      id: 'pat_2',
      name: 'Elena Rostova',
      email: 'patient2@medbridge.com',
      role: 'patient',
      specialization: null,
      password_hash: passwordHash
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, role, specialization, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const u of users) {
    insertUser.run(u.id, u.name, u.email, u.role, u.specialization, u.password_hash);
  }
  console.log(`   Seeded ${users.length} accounts (shared password: demo1234).\n`);

  // Step 5: Parse & Seed Diagnoses from Diaognases.csv
  console.log('5. Processing & Seeding Diagnoses...');
  // Group symptoms across all rows for each unique disease
  const diseaseMap = new Map();
  for (let i = 1; i < rawDiagRows.length; i++) {
    const row = rawDiagRows[i];
    if (!row || row.length === 0) continue;
    const diseaseName = cleanText(row[0]);
    if (!diseaseName) continue;

    if (!diseaseMap.has(diseaseName)) {
      diseaseMap.set(diseaseName, new Set());
    }
    const symSet = diseaseMap.get(diseaseName);
    for (let c = 1; c < row.length; c++) {
      const sym = cleanText(row[c]).replace(/_/g, ' ');
      if (sym && sym.length > 1) {
        symSet.add(sym);
      }
    }
  }

  // Clinical descriptions and precautions for key diseases
  const diseaseMetadata = {
    'Diabetes ': {
      desc: 'A chronic metabolic disorder characterized by elevated levels of blood glucose due to insufficient insulin production or resistance.',
      precautions: 'Monitor fasting blood sugar daily; follow a low glycemic diet; engage in 30 minutes of aerobic exercise; adhere strictly to prescribed hypoglycemic medication.'
    },
    'Diabetes': {
      desc: 'A chronic metabolic disorder characterized by elevated levels of blood glucose due to insufficient insulin production or resistance.',
      precautions: 'Monitor fasting blood sugar daily; follow a low glycemic diet; engage in 30 minutes of aerobic exercise; adhere strictly to prescribed hypoglycemic medication.'
    },
    'Hypertension ': {
      desc: 'Sustained elevation of systemic arterial blood pressure that increases the risk of heart disease, stroke, and kidney failure.',
      precautions: 'Maintain a low-sodium diet (<2g daily); monitor home blood pressure morning and evening; avoid excessive caffeine; take antihypertensives as scheduled.'
    },
    'Hypertension': {
      desc: 'Sustained elevation of systemic arterial blood pressure that increases the risk of heart disease, stroke, and kidney failure.',
      precautions: 'Maintain a low-sodium diet (<2g daily); monitor home blood pressure morning and evening; avoid excessive caffeine; take antihypertensives as scheduled.'
    },
    'Bronchial Asthma': {
      desc: 'A chronic respiratory disease characterized by airway inflammation, hyperresponsiveness, and episodic airflow obstruction causing wheezing.',
      precautions: 'Keep rescue inhaler readily accessible; avoid smoke and allergens; take daily preventive corticosteroid inhalers; monitor peak expiratory flow.'
    },
    'GERD': {
      desc: 'Gastroesophageal reflux disease occurs when stomach acid frequently flows back into the esophagus, causing mucosal irritation and heartburn.',
      precautions: 'Avoid lying down within 3 hours after meals; elevate head of bed; reduce intake of spicy, acidic, and fatty foods; take PPIs 30 mins before breakfast.'
    },
    'Fungal infection': {
      desc: 'Superficial cutaneous mycosis affecting epidermis, causing pruritus, erythematous rash, and skin scaling.',
      precautions: 'Keep affected skin areas dry and clean; wear loose breathable cotton clothing; avoid sharing towels; apply topical antifungal as directed.'
    },
    'Allergy': {
      desc: 'Immune system hypersensitivity reaction to environmental triggers resulting in mucosal inflammation, rhinitis, and sneezing.',
      precautions: 'Identify and minimize exposure to known environmental allergens; use non-sedating antihistamines; keep windows closed during high pollen counts.'
    },
    'Gastroenteritis': {
      desc: 'Acute inflammation of the gastrointestinal tract lining causing nausea, vomiting, abdominal cramping, and watery diarrhea.',
      precautions: 'Maintain strict oral hydration with electrolyte solutions; follow a bland diet (BRAT); practice diligent hand hygiene; report signs of dehydration.'
    },
    'Peptic ulcer diseae': {
      desc: 'Sores that develop on the inner lining of the stomach and upper small intestine, often exacerbated by H. pylori infection or NSAID use.',
      precautions: 'Avoid NSAIDs and aspirin; avoid alcohol and smoking; follow prescribed acid-suppression therapy; eat regular small meals.'
    }
  };

  const insertDiagnosis = db.prepare(`
    INSERT INTO diagnoses (id, name, description, symptoms, precautions)
    VALUES (?, ?, ?, ?, ?)
  `);

  let diagIdx = 1;
  const seededDiagnoses = [];
  for (const [rawName, symSet] of diseaseMap.entries()) {
    const name = rawName.trim();
    const id = `diag_${diagIdx++}`;
    const symptoms = Array.from(symSet).join(', ');
    const meta = diseaseMetadata[name] || diseaseMetadata[rawName] || {
      desc: `Clinical condition presenting with characteristic symptoms including ${Array.from(symSet).slice(0, 3).join(', ')}.`,
      precautions: 'Follow clinical guidance, adhere to prescribed medications, and consult attending physician if symptoms worsen.'
    };

    insertDiagnosis.run(id, name, meta.desc, symptoms, meta.precautions);
    seededDiagnoses.push({ id, name, symptoms });
  }
  console.log(`   Seeded ${seededDiagnoses.length} diagnoses from Diaognases.csv.\n`);

  // Step 6: Select clean demo-appropriate subset of ~180-220 Medicines
  console.log('6. Processing & Seeding Medicines (subset ~180-220 records)...');
  const medHeader = rawMedRows[0].map(h => cleanText(h));
  const nameCol = medHeader.indexOf('Medicine Name');
  const compCol = medHeader.indexOf('Composition');
  const usesCol = medHeader.indexOf('Uses');
  const sideCol = medHeader.indexOf('Side_effects');

  // Let's filter and prioritize clean, recognizable medicines
  const candidateMeds = [];
  const seenMedNames = new Set();

  for (let i = 1; i < rawMedRows.length; i++) {
    const row = rawMedRows[i];
    if (!row || row.length <= nameCol) continue;
    const name = cleanText(row[nameCol]);
    const composition = cleanText(row[compCol]);
    const uses = cleanText(row[usesCol]);
    const sideEffects = cleanText(row[sideCol]);

    if (!name || !composition || !uses) continue;

    // Normalize name key for deduplication
    const normName = name.toLowerCase().split(' ')[0] + ' ' + (name.toLowerCase().split(' ')[1] || '');
    if (seenMedNames.has(normName)) continue;

    const lowerCombined = `${name} ${composition} ${uses}`.toLowerCase();
    const isPriority = PRIORITY_KEYWORDS.some(kw => lowerCombined.includes(kw));

    candidateMeds.push({
      name,
      composition,
      uses_static: uses,
      side_effects: sideEffects || 'Mild nausea, headache, or dizziness may occur. Consult physician if persistent.',
      therapeutic_class: classifyTherapeuticClass(name, composition, uses),
      isPriority
    });
    seenMedNames.add(normName);
  }

  // Sort candidate medicines: priority ones first, then others
  candidateMeds.sort((a, b) => {
    if (a.isPriority && !b.isPriority) return -1;
    if (!a.isPriority && b.isPriority) return 1;
    return a.name.localeCompare(b.name);
  });

  // Pick top 200 medicines
  const selectedMeds = candidateMeds.slice(0, 200);

  // Gemini AI generation at seed time (if GEMINI_API_KEY is configured)
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  if (hasGeminiKey) {
    console.log('   [Gemini AI]: API Key detected. Pre-generating plain-language explanations for medicines...');
  } else {
    console.log('   [Gemini AI]: No GEMINI_API_KEY configured in .env. Pre-seeding curated plain-language explanations with static fallback.');
  }

  // High quality curated plain-language explanations for top demo medications
  const curatedPlainLanguage = {
    'metformin': 'Metformin helps balance your body\'s blood sugar levels by reducing glucose production in the liver and improving insulin sensitivity. It is commonly prescribed as the foundational treatment for Type 2 Diabetes.',
    'telmisartan': 'Telmisartan relaxes and widens your blood vessels so your heart can pump blood more easily throughout your body. It is prescribed to lower high blood pressure and protect kidney and heart health.',
    'amlodipine': 'Amlodipine belongs to a group of medicines called calcium channel blockers that relax arterial muscles, improving blood flow and keeping high blood pressure within a healthy range.',
    'glimepiride': 'Glimepiride prompts your pancreas to release a natural amount of insulin after meals to prevent spikes in blood glucose. It is used alongside diet and exercise for managing Type 2 Diabetes.',
    'paracetamol': 'Paracetamol safely relieves mild to moderate pain like headaches and muscle aches, while effectively reducing fever by acting on the temperature control center of the brain.',
    'dolo': 'Dolo (Paracetamol 650mg) reduces fever and relieves moderate pain such as body aches, flu symptoms, and headaches without irritating your stomach lining.',
    'augmentin': 'Augmentin combines amoxicillin with clavulanic acid to overcome bacterial resistance, effectively treating infections of the respiratory tract, ear, sinus, and skin.',
    'azithral': 'Azithral (Azithromycin) is a broad-spectrum antibiotic that stops the growth of bacteria causing chest infections, throat infections, sinusitis, and skin conditions.',
    'pan 40': 'Pan 40 (Pantoprazole) reduces excessive stomach acid production to heal acid reflux, heartburn, and stomach ulcers, providing relief and protecting the stomach lining.',
    'pantoprazole': 'Pantoprazole is a proton pump inhibitor that significantly lowers stomach acid production to treat acid reflux disease, gastritis, and ulcers.',
    'atorvastatin': 'Atorvastatin lowers "bad" LDL cholesterol and triglycerides in your blood while boosting protective HDL cholesterol, significantly reducing long-term risks of heart attack and stroke.',
    'ecosprin': 'Ecosprin (low-dose Aspirin) prevents blood platelets from sticking together to form dangerous clots, reducing the risk of heart attacks and strokes in patients with cardiovascular conditions.',
    'combiflam': 'Combiflam combines ibuprofen and paracetamol to provide powerful dual-action relief from inflammatory pain, swelling, and fever.',
    'cetirizine': 'Cetirizine is an antihistamine that calms allergic responses like runny nose, sneezing, watery eyes, and itchy skin rashes without causing extreme drowsiness.',
    'asthalin': 'Asthalin (Salbutamol) quickly opens and relaxes the airways in your lungs to relieve sudden wheezing, coughing, and shortness of breath during asthma flare-ups.',
    'budecort': 'Budecort (Budesonide) is an inhaled corticosteroid that reduces swelling and inflammation in the lung airways when used daily as long-term asthma maintenance.'
  };

  const insertMedicine = db.prepare(`
    INSERT INTO medicines (id, name, composition, side_effects, therapeutic_class, uses_static, uses_ai_generated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let medIdx = 1;
  const sampleExplanations = [];

  for (const med of selectedMeds) {
    const id = `med_${medIdx++}`;
    let aiExplanation = null;

    if (hasGeminiKey && medIdx <= 15) {
      // If user supplied key, call Gemini for top medicines with slight delay to respect rate limits
      try {
        aiExplanation = await generateMedicineExplanation(med.name, med.composition);
      } catch (err) {
        console.warn(`[Gemini Warn]: ${err.message}`);
      }
    }

    // If Gemini was not called or didn't return text, check curated plain-language match
    if (!aiExplanation) {
      const lower = `${med.name} ${med.composition}`.toLowerCase();
      for (const [kw, text] of Object.entries(curatedPlainLanguage)) {
        if (lower.includes(kw)) {
          aiExplanation = text;
          break;
        }
      }
    }

    insertMedicine.run(
      id,
      med.name,
      med.composition,
      med.side_effects,
      med.therapeutic_class,
      med.uses_static,
      aiExplanation
    );

    if (aiExplanation && sampleExplanations.length < 3) {
      sampleExplanations.push({ name: med.name, explanation: aiExplanation });
    }
  }
  console.log(`   Seeded ${selectedMeds.length} medicines with therapeutic classes.\n`);

  // Step 7: Seed Demo Clinical Records (Visits, Prescriptions, Lab Orders, Appointments)
  console.log('7. Seeding Patient Histories (3-4 visits per demo patient)...');

  // Look up key IDs
  const getDiagByName = (namePart) => {
    const row = db.prepare('SELECT id, name FROM diagnoses WHERE name LIKE ? LIMIT 1').get(`%${namePart}%`);
    return row ? row.id : 'diag_1';
  };
  const getMedByName = (namePart) => {
    const row = db.prepare('SELECT id, name, therapeutic_class FROM medicines WHERE name LIKE ? OR composition LIKE ? LIMIT 1').get(`%${namePart}%`, `%${namePart}%`);
    return row;
  };

  const diabetesDiagId = getDiagByName('Diabetes');
  const asthmaDiagId = getDiagByName('Asthma');
  const gerdDiagId = getDiagByName('GERD');

  const metforminMed = getMedByName('Metformin') || { id: 'med_1', name: 'Metformin 500mg' };
  const telmisartanMed = getMedByName('Telmisartan') || { id: 'med_2', name: 'Telmisartan 40mg' };
  const pantoprazoleMed = getMedByName('Pantoprazole') || { id: 'med_3', name: 'Pantoprazole 40mg' };
  const budecortMed = getMedByName('Budesonide') || getMedByName('Salbutamol') || { id: 'med_4', name: 'Budesonide Inhaler' };
  const cetirizineMed = getMedByName('Cetirizine') || { id: 'med_5', name: 'Cetirizine 10mg' };

  const insertVisit = db.prepare(`
    INSERT INTO visits (id, patient_id, doctor_id, visit_date, diagnosis_id, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertPrescription = db.prepare(`
    INSERT INTO prescriptions (id, visit_id, medicine_id, dosage, duration)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertLabOrder = db.prepare(`
    INSERT INTO lab_orders (id, visit_id, test_name, scheduled_date, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertAppointment = db.prepare(`
    INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, reason, status)
    VALUES (?, ?, ?, ?, ?, 'confirmed')
  `);

  // Helper date function for historical offsets
  const getDateOffset = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  // --- PATIENT 1 (Marcus Vance): Diabetes & Hypertension Progression ---
  // Visit 1: 58 days ago
  insertVisit.run(
    'v_pat1_1',
    'pat_1',
    'doc_1',
    getDateOffset(58),
    diabetesDiagId,
    'Patient presented with chronic fatigue, polydipsia, and polyuria. Fasting plasma glucose markedly elevated at 168 mg/dL. Initiated monotherapy on Metformin 500mg daily. Nutritional counseling provided for low-glycemic dietary modifications.'
  );
  insertPrescription.run('rx_1', 'v_pat1_1', metforminMed.id, '500mg once daily with breakfast', '30 days');
  insertLabOrder.run('lo_1', 'v_pat1_1', 'Fasting Blood Sugar', getDateOffset(55), 'completed');
  insertLabOrder.run('lo_2', 'v_pat1_1', 'HbA1c', getDateOffset(55), 'completed');

  // Visit 2: 28 days ago (dose escalation + blood pressure control)
  insertVisit.run(
    'v_pat1_2',
    'pat_1',
    'doc_1',
    getDateOffset(28),
    diabetesDiagId,
    'Follow-up evaluation. Home glucose logs reflect persistent hyperglycemia (FBS 165–178 mg/dL). In-clinic blood pressure elevated at 144/92 mmHg. Stepping up Metformin to 1000mg twice daily and initiating Telmisartan 40mg once daily for cardiovascular protection.'
  );
  insertPrescription.run('rx_2', 'v_pat1_2', metforminMed.id, '1000mg twice daily with meals', '30 days');
  insertPrescription.run('rx_3', 'v_pat1_2', telmisartanMed.id, '40mg once daily in the morning', '30 days');
  insertLabOrder.run('lo_3', 'v_pat1_2', 'Fasting Blood Sugar', getDateOffset(25), 'completed');
  insertLabOrder.run('lo_4', 'v_pat1_2', 'Systolic BP', getDateOffset(25), 'completed');

  // Visit 3: 5 days ago (stabilization & routine labs ordered)
  insertVisit.run(
    'v_pat1_3',
    'pat_1',
    'doc_1',
    getDateOffset(5),
    diabetesDiagId,
    'Marked clinical response. Patient reports high energy, no polyuria. Glycemic logs illustrate steady decline into near-normal range (96–114 mg/dL). Blood pressure normalized to 120/80 mmHg. Maintain current pharmacological regimen.'
  );
  // Current active prescriptions for Marcus Vance:
  insertPrescription.run('rx_4', 'v_pat1_3', metforminMed.id, '1000mg twice daily with meals', '60 days');
  insertPrescription.run('rx_5', 'v_pat1_3', telmisartanMed.id, '40mg once daily in the morning', '60 days');
  // Pending scheduled lab test:
  insertLabOrder.run('lo_5', 'v_pat1_3', 'Fasting Blood Sugar', getDateOffset(-10), 'pending');
  insertLabOrder.run('lo_6', 'v_pat1_3', 'Total Cholesterol', getDateOffset(-10), 'pending');

  // Next scheduled appointment for Patient 1:
  insertAppointment.run('apt_pat1', 'pat_1', 'doc_1', getDateOffset(-14), 'Follow-up Comprehensive Metabolic Panel & HbA1c review');

  // --- PATIENT 2 (Elena Rostova): Bronchial Asthma & GERD ---
  // Visit 1: 45 days ago
  insertVisit.run(
    'v_pat2_1',
    'pat_1' === 'pat_2' ? 'pat_1' : 'pat_2',
    'doc_1',
    getDateOffset(45),
    asthmaDiagId,
    'Acute presentation with nocturnal dyspnea, expiratory wheezing, and dry cough. Prescribed inhaled budesonide/formoterol maintenance inhaler and cetirizine for allergic rhinitis flare.'
  );
  insertPrescription.run('rx_p2_1', 'v_pat2_1', budecortMed.id, '200 mcg 2 puffs twice daily', '30 days');
  insertPrescription.run('rx_p2_2', 'v_pat2_1', cetirizineMed.id, '10mg once daily at bedtime', '15 days');
  insertLabOrder.run('lo_p2_1', 'v_pat2_1', 'WBC Count', getDateOffset(43), 'completed');

  // Visit 2: 20 days ago (GERD overlap treated)
  insertVisit.run(
    'v_pat2_2',
    'pat_2',
    'doc_1',
    getDateOffset(20),
    gerdDiagId,
    'Nocturnal cough partially refractory due to acid reflux regurgitation. Adding Pantoprazole 40mg before breakfast. Wheezing significantly diminished.'
  );
  insertPrescription.run('rx_p2_3', 'v_pat2_2', pantoprazoleMed.id, '40mg once daily before breakfast', '30 days');
  insertPrescription.run('rx_p2_4', 'v_pat2_2', budecortMed.id, '200 mcg 2 puffs twice daily', '45 days');

  // Next scheduled appointment for Patient 2:
  insertAppointment.run('apt_pat2', 'pat_2', 'doc_1', getDateOffset(-18), 'Pulmonary Function & Reflux symptom follow-up');
  insertLabOrder.run('lo_p2_2', 'v_pat2_2', 'Hemoglobin (Female)', getDateOffset(-7), 'pending');

  console.log('   Seeded clinical visits, active prescriptions, lab orders, and appointments.\n');

  // Step 8: Seed Vitals and Self-Logs forming a coherent story
  console.log('8. Seeding Coherent Vitals & Symptoms for Demo Patients...');
  const insertSelfLog = db.prepare(`
    INSERT INTO self_logs (id, patient_id, log_type, label, value, unit, log_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Marcus Vance: Fasting Blood Sugar progression showing clear clinical curve:
  // Starts high (168), rises to peak (178), then post-medication escalations drops to 144 -> 128 -> 114 -> 104 -> 96 (normal range is 70-100)
  const pat1FBSReadings = [
    { daysAgo: 58, val: '168' },
    { daysAgo: 50, val: '172' },
    { daysAgo: 42, val: '164' },
    { daysAgo: 35, val: '178' }, // Peak elevation prior to visit 2
    { daysAgo: 28, val: '165' }, // Visit 2: Meds escalated
    { daysAgo: 22, val: '144' }, // Starting to drop
    { daysAgo: 16, val: '128' },
    { daysAgo: 10, val: '114' },
    { daysAgo: 5, val: '104' },  // Visit 3: Stabilized
    { daysAgo: 1, val: '96' }    // Reached normal range!
  ];

  let logIdx = 1;
  for (const r of pat1FBSReadings) {
    insertSelfLog.run(
      `log_${logIdx++}`,
      'pat_1',
      'vital',
      'Fasting Blood Sugar',
      r.val,
      'mg/dL',
      getDateOffset(r.daysAgo)
    );
  }

  // Marcus Vance: Systolic BP readings showing parallel normalization:
  const pat1BPReadings = [
    { daysAgo: 55, val: '144' },
    { daysAgo: 45, val: '148' },
    { daysAgo: 35, val: '146' },
    { daysAgo: 28, val: '142' },
    { daysAgo: 20, val: '134' },
    { daysAgo: 14, val: '126' },
    { daysAgo: 7, val: '122' },
    { daysAgo: 1, val: '118' }
  ];
  for (const r of pat1BPReadings) {
    insertSelfLog.run(
      `log_${logIdx++}`,
      'pat_1',
      'vital',
      'Systolic BP',
      r.val,
      'mmHg',
      getDateOffset(r.daysAgo)
    );
  }

  // Patient 1 Symptoms logged:
  insertSelfLog.run(`log_${logIdx++}`, 'pat_1', 'symptom', 'Fatigue', '7', '/10', getDateOffset(56));
  insertSelfLog.run(`log_${logIdx++}`, 'pat_1', 'symptom', 'Excessive Thirst', '8', '/10', getDateOffset(35));
  insertSelfLog.run(`log_${logIdx++}`, 'pat_1', 'symptom', 'Fatigue', '3', '/10', getDateOffset(4));

  // Patient 2 (Elena): Systolic BP and Symptoms
  const pat2BPReadings = [
    { daysAgo: 40, val: '116' },
    { daysAgo: 30, val: '118' },
    { daysAgo: 20, val: '114' },
    { daysAgo: 10, val: '112' },
    { daysAgo: 2, val: '115' }
  ];
  for (const r of pat2BPReadings) {
    insertSelfLog.run(
      `log_${logIdx++}`,
      'pat_2',
      'vital',
      'Systolic BP',
      r.val,
      'mmHg',
      getDateOffset(r.daysAgo)
    );
  }
  insertSelfLog.run(`log_${logIdx++}`, 'pat_2', 'symptom', 'Breathlessness & Wheezing', '7', '/10', getDateOffset(44));
  insertSelfLog.run(`log_${logIdx++}`, 'pat_2', 'symptom', 'Heartburn / Acidity', '6', '/10', getDateOffset(22));
  insertSelfLog.run(`log_${logIdx++}`, 'pat_2', 'symptom', 'Cough', '2', '/10', getDateOffset(3));

  console.log(`   Seeded ${logIdx - 1} coherent self-logs (vitals & symptoms).\n`);

  // Step 9: Print Verification Summary
  console.log('====================================================');
  console.log('            MEDBRIDGE SEED SUMMARY REPORT           ');
  console.log('====================================================');
  const countUsers = db.prepare('SELECT count(*) as count FROM users').get().count;
  const countMedicines = db.prepare('SELECT count(*) as count FROM medicines').get().count;
  const countDiagnoses = db.prepare('SELECT count(*) as count FROM diagnoses').get().count;
  const countLabTests = db.prepare('SELECT count(*) as count FROM lab_tests').get().count;
  const countVisits = db.prepare('SELECT count(*) as count FROM visits').get().count;
  const countPrescriptions = db.prepare('SELECT count(*) as count FROM prescriptions').get().count;
  const countLabOrders = db.prepare('SELECT count(*) as count FROM lab_orders').get().count;
  const countAppointments = db.prepare('SELECT count(*) as count FROM appointments').get().count;
  const countSelfLogs = db.prepare('SELECT count(*) as count FROM self_logs').get().count;

  console.log(`Users:              ${countUsers} (1 Doctor, 2 Patients)`);
  console.log(`Medicines:          ${countMedicines} records with therapeutic classes`);
  console.log(`Diagnoses:          ${countDiagnoses} diseases with symptoms & precautions`);
  console.log(`Standard Lab Tests: ${countLabTests} reference ranges`);
  console.log(`Clinical Visits:    ${countVisits} historical visits`);
  console.log(`Prescriptions:      ${countPrescriptions} prescriptions`);
  console.log(`Lab Orders:         ${countLabOrders} lab orders`);
  console.log(`Appointments:       ${countAppointments} scheduled appointments`);
  console.log(`Self Logs:          ${countSelfLogs} vitals & symptom logs`);

  console.log('\n--- SAMPLE MEDICINES WITH PLAIN-LANGUAGE EXPLANATIONS ---');
  const sampleMeds = db.prepare('SELECT name, composition, therapeutic_class, uses_ai_generated, uses_static FROM medicines WHERE uses_ai_generated IS NOT NULL LIMIT 2').all();
  for (const m of sampleMeds) {
    console.log(`Medicine:            ${m.name}`);
    console.log(`Therapeutic Class:   ${m.therapeutic_class}`);
    console.log(`Plain Language Info: ${m.uses_ai_generated}`);
    console.log(`Static Uses Backup:  ${m.uses_static.slice(0, 80)}...`);
    console.log('---');
  }

  console.log('\n--- DEMO PATIENT 1 (Marcus Vance) FASTING BLOOD SUGAR TREND ---');
  const fbsTrend = db.prepare("SELECT log_date, value, unit FROM self_logs WHERE patient_id = 'pat_1' AND label = 'Fasting Blood Sugar' ORDER BY log_date ASC").all();
  for (const row of fbsTrend) {
    console.log(`  ${row.log_date} -> ${row.value} ${row.unit} (Normal Range: 70–100 mg/dL)`);
  }
  console.log('====================================================\n');
}

seed().catch(err => {
  console.error('Seed Error:', err);
  process.exit(1);
});
