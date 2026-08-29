import type { GoldenCase } from './eval.ts'

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'chest-pain-penicillin',
    transcript: `[patient] I have had chest pain for 2 days and shortness of breath.
[doctor] I will start amoxicillin and advise rest and follow up.`,
    allergies: ['penicillin'],
    expectedWorkersIncludes: ['documentation', 'safety', 'risk', 'follow_up', 'auditor'],
    expectedAllergyConflict: true,
    expectedUrgencyAtLeast: 'high',
  },
  {
    id: 'mild-cough',
    transcript: `[patient] I have a cough and fever for 3 days.
[doctor] Take paracetamol and drink water.`,
    allergies: [],
    expectedWorkersIncludes: ['documentation', 'risk', 'auditor'],
    expectedAllergyConflict: false,
    expectedUrgencyAtLeast: 'medium',
  },
  {
    id: 'empty',
    transcript: '[BLANK_AUDIO]',
    allergies: [],
    expectedWorkersIncludes: [],
    expectedAllergyConflict: false,
    expectedUrgencyAtLeast: 'low',
  },
  {
    id: 'visit1-mild-cough',
    transcript: `[patient] I have had a cough and fever for 3 days. I also have a sore throat and fatigue. A bit of runny nose.
[doctor] This sounds like a mild viral illness. Take paracetamol for the fever. Cetirizine may help the runny nose. Rest, drink water, stay hydrated, and monitor temperature. Avoid spicy food and use a light diet. Sleep well.
[patient] Thank you. I will rest and drink water.`,
    allergies: [],
    expectedWorkersIncludes: ['documentation', 'safety', 'risk', 'auditor'],
    expectedAllergyConflict: false,
    expectedUrgencyAtLeast: 'medium',
  },
  {
    id: 'visit2-worsening-followup',
    transcript: `[patient] The cough is still there. It has been worsening for 1 week. It is persistent. I have a headache and some dizziness. Fever came back. I feel weakness.
[doctor] This is a follow up from last time. Come back if it gets worse. I want a blood test. You may take ibuprofen for the headache. Rest and stay hydrated. Avoid stress. If it is still worsening, come back this week.
[patient] Okay I will come back after the blood test.`,
    allergies: [],
    expectedWorkersIncludes: ['documentation', 'safety', 'risk', 'follow_up', 'auditor'],
    expectedAllergyConflict: false,
    expectedUrgencyAtLeast: 'medium',
  },
  {
    id: 'visit3-chest-pain-amoxicillin',
    transcript: `[patient] I have had chest pain for 2 days. It is severe. I also have shortness of breath. I feel palpitations and some dizziness. I am scared this is an emergency.
[doctor] Chest pain and shortness of breath are high concern. I would usually start amoxicillin. Rest. We need a follow up and possibly an x-ray. Come back if you have difficulty breathing.
[patient] I have a penicillin allergy. Please do not give me that antibiotic.
[doctor] We will not use amoxicillin. Rest, stay hydrated, and follow up.`,
    allergies: ['penicillin'],
    expectedWorkersIncludes: ['documentation', 'safety', 'risk', 'follow_up', 'auditor'],
    expectedAllergyConflict: true,
    expectedUrgencyAtLeast: 'high',
  },
]
