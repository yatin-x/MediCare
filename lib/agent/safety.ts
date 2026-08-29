function normalize(s: string): string {
  return s.toLowerCase().trim()
}

const PENICILLIN_FAMILY = ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin']

export function detectAllergyConflicts(allergies: string[], medicines: string[]): string[] {
  const conflicts: string[] = []
  const a = allergies.map(normalize)
  const m = medicines.map(normalize)

  for (const med of m) {
    for (const all of a) {
      if (!all || !med) continue
      if (med.includes(all) || all.includes(med)) {
        conflicts.push(`${med} vs allergy ${all}`)
      }
    }
  }

  const allergicToPenicillin = a.some(x => PENICILLIN_FAMILY.includes(x) || x.includes('penicillin'))
  if (allergicToPenicillin) {
    for (const med of m) {
      if (PENICILLIN_FAMILY.some(p => med.includes(p))) {
        const msg = `${med} vs penicillin-class allergy`
        if (!conflicts.includes(msg)) conflicts.push(msg)
      }
    }
  }

  return conflicts
}
