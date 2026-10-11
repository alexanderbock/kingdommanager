/**
 * Archives of Nethys rule links per turn step. Keys match the seeded turn
 * template; custom steps simply have no links.
 */
export interface StepLink {
  label: string;
  url: string;
}

const aon = (id: number) => `https://2e.aonprd.com/Rules.aspx?ID=${id}`;

export const STEP_LINKS: Record<string, StepLink[]> = {
  'assign-leadership-roles': [
    { label: 'Step 1: Assign Leadership Roles', url: aon(1796) },
    { label: 'Leadership Roles', url: aon(1774) },
    { label: 'Earning Fame or Infamy Points', url: aon(1793) },
  ],
  'adjust-unrest': [
    { label: 'Step 2: Adjust Unrest', url: aon(1797) },
    { label: 'Structures (Overcrowding)', url: aon(1836) },
    { label: 'Ruin', url: aon(1784) },
    { label: 'Losing Hexes', url: aon(1787) },
  ],
  'resource-collection': [
    { label: 'Step 3: Resource Collection', url: aon(1798) },
    { label: 'Kingdom Rules', url: aon(1781) },
  ],
  'pay-consumption': [
    { label: 'Step 4: Pay Consumption', url: aon(1799) },
    { label: 'Consumption', url: aon(1828) },
    { label: 'Army Stat Block', url: aon(1848) },
    { label: 'Terrain Features', url: aon(1791) },
  ],
  'collect-taxes': [{ label: 'Step 1: Collect Taxes', url: aon(1801) }],
  'approve-expenses': [{ label: 'Step 2: Approve Expenses', url: aon(1802) }],
  'tap-commodities': [{ label: 'Step 3: Tap Commodities', url: aon(1803) }],
  'manage-trade-agreements': [{ label: 'Step 4: Manage Trade Agreements', url: aon(1804) }],
  'leadership-activities': [{ label: 'Step 1: Leadership Activities', url: aon(1806) }],
  'region-activities': [{ label: 'Step 2: Region Activities', url: aon(1807) }],
  'civic-activities': [{ label: 'Step 3: Civic Activities', url: aon(1808) }],
  'army-activities': [{ label: 'Appendix 3: Warfare', url: aon(1845) }],
  'check-for-event': [
    { label: 'Step 1: Check for Random Event', url: aon(1810) },
    { label: 'Kingdom Events', url: aon(1839) },
  ],
  'resolve-events': [
    { label: 'Step 2: Event Resolution', url: aon(1811) },
    { label: 'Kingdom Events', url: aon(1839) },
  ],
  'apply-kingdom-xp': [
    { label: 'Step 3: Apply Kingdom XP', url: aon(1812) },
    { label: 'Gaining Kingdom Experience', url: aon(1814) },
    { label: 'Milestone XP Awards', url: aon(1816) },
  ],
  'increase-kingdom-level': [
    { label: 'Step 4: Increase Kingdom Level', url: aon(1813) },
    { label: 'Leveling Up Your Kingdom', url: aon(1758) },
  ],
  'end-of-turn': [{ label: 'Running a Kingdom', url: aon(1794) }],
};

export function linksForStep(stepKey: string): StepLink[] {
  return STEP_LINKS[stepKey] ?? [];
}