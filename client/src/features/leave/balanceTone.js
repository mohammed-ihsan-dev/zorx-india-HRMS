/** Colour tone for a mobile balance card: Casual and (eligible) Sick follow availability, Paid is always amber. */
export function balanceTone(type, info) {
  if (type === 'CASUAL' || (type === 'SICK' && info?.eligibleNow)) return info?.available > 0 ? 'green' : 'red';
  if (type === 'PAID') return 'amber';
  return 'neutral';
}
