/** Colour tone for a mobile balance card: Casual follows availability, Paid is always amber. */
export function balanceTone(type, info) {
  if (type === 'CASUAL') return info?.available > 0 ? 'green' : 'red';
  if (type === 'PAID') return 'amber';
  return 'neutral';
}
