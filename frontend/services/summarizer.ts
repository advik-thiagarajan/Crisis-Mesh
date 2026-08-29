import { SOSReport, SummaryData } from '../utils/types';

export const generateSummary = (sosReports: SOSReport[]): SummaryData => {
  const totalReports = sosReports.length;
  
  if (totalReports === 0) {
    return {
      totalReports: 0,
      criticalCount: 0,
      veryHighCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      summary: "No emergency broadcasts received in local peer network.",
      timestamp: Date.now()
    };
  }

  const criticals = sosReports.filter(s => s.priority === 'CRITICAL');
  const veryHighs = sosReports.filter(s => s.priority === 'VERY HIGH');
  const highs = sosReports.filter(s => s.priority === 'HIGH');
  const mediums = sosReports.filter(s => s.priority === 'MEDIUM');
  const lows = sosReports.filter(s => s.priority === 'LOW');

  const combinedText = sosReports.map(s => s.description.toLowerCase()).join(' ');
  const threats: string[] = [];

  if (combinedText.includes('trapped')) threats.push('Trapped Persons');
  if (combinedText.includes('collapse')) threats.push('Structural Collapses');
  if (combinedText.includes('water') || combinedText.includes('flood')) threats.push('Rising Flood Waters');
  if (combinedText.includes('child') || combinedText.includes('elderly')) threats.push('Vulnerable Groups');

  const threatString = threats.length > 0 ? threats.join(', ') : 'General Emergency Services Required';
  const summaryText = `[TOTAL: ${totalReports} Incidents] | CRIT: ${criticals.length} | V.HIGH: ${veryHighs.length} | HIGH: ${highs.length} | MED: ${mediums.length} | LOW: ${lows.length}. Vectors: ${threatString}.`;

  return {
    totalReports,
    criticalCount: criticals.length,
    veryHighCount: veryHighs.length,
    highCount: highs.length,
    mediumCount: mediums.length,
    lowCount: lows.length,
    summary: summaryText,
    timestamp: Date.now()
  };
};