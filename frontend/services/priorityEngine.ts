import { Priority } from '../utils/types';
import { CRITICAL_KEYWORDS, HIGH_KEYWORDS, MEDIUM_KEYWORDS } from '../utils/constants';

export const classifyPriority = (description: string, hasInjury: boolean = false): Priority => {
  const text = description.toLowerCase();

  const isCritical = CRITICAL_KEYWORDS.some(kw => text.includes(kw)) || hasInjury;
  if (isCritical) return 'CRITICAL';

  const isHigh = HIGH_KEYWORDS.some(kw => text.includes(kw));
  if (isHigh) return 'HIGH';

  const isMedium = MEDIUM_KEYWORDS.some(kw => text.includes(kw));
  if (isMedium) return 'MEDIUM';

  return 'LOW';
};

export default classifyPriority;