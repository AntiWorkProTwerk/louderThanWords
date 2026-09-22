// Navigation metadata, not a second dataset. Counts and entity relationships are
// loaded from versioned evidence; this catalog never invents coverage statistics.
export const catalogGroups = [
  { id: 'all', label: 'All views', color: '#527f88' },
  { id: 'connections', label: 'Connections', color: '#527f88' },
  { id: 'government', label: 'Government', color: '#6e7898' },
  { id: 'money', label: 'Money & ownership', color: '#96778e' },
  { id: 'health', label: 'Health & research', color: '#648f82' },
  { id: 'environment', label: 'Environment', color: '#728e76' },
  { id: 'everyday', label: 'Work & everyday life', color: '#b08458' },
] as const;
export type CatalogGroup = (typeof catalogGroups)[number]['id'];
export type CatalogView = {
  id: string;
  title: string;
  group: CatalogGroup;
  question: string;
  source: string;
  path: string;
  keywords: string;
  sample?: boolean;
};
export const catalogViews: CatalogView[] = [
  {
    id: 'patterns', title: 'State patterns', group: 'connections',
    question: 'How do pay, jobs and unemployment changes line up across states?',
    source: 'BLS payroll + resident unemployment snapshots',
    path: '/records/patterns/', keywords: 'correlation scatter plot comparison region states statistics earnings employment',
  },
  {
    id: 'connections',
    title: 'Connections',
    group: 'connections',
    question: 'Follow one company across different public records.',
    source: 'Exact SEC company IDs',
    path: '/records/connections/',
    keywords: 'correlation related graph links identity companies',
  },
  {
    id: 'votes',
    title: 'Vote receipts',
    group: 'government',
    question: 'What was the question, and how did each member vote?',
    source: 'House Clerk · GovInfo',
    path: '/records/votes/',
    keywords: 'congress legislators bill legislation voting',
  },
  {
    id: 'graveyard',
    title: 'Bill graveyard',
    group: 'government',
    question: 'Where did a proposal go after it was introduced?',
    source: 'GovInfo bill histories',
    path: '/records/graveyard/',
    keywords: 'congress legislation stalled committees laws progress',
  },
  {
    id: 'rules',
    title: 'Quiet rulebook',
    group: 'government',
    question: 'Which agency rules are changing, and what does the text say?',
    source: 'Federal Register',
    path: '/records/rules/',
    keywords: 'regulation agency epa environment rules notices',
  },
  {
    id: 'lobbying',
    title: 'Washington agenda',
    group: 'government',
    question: 'What issues did a company report lobbying on?',
    source: 'Lobbying Disclosure Act filings',
    path: '/records/lobbying/',
    keywords: 'lobbyist lobbying spending clients influence disclosure',
  },
  {
    id: 'revolving',
    title: 'Career connections',
    group: 'government',
    question: 'Which previous government roles appear in lobbying disclosures?',
    source: 'Lobbying Disclosure Act filings',
    path: '/records/revolving/',
    keywords: 'lobbyist jobs revolving door careers government employment',
  },
  {
    id: 'said-did',
    title: 'Said / Did',
    group: 'government',
    question: 'Compare a statement with a recorded action—and its context.',
    source: 'Fictional public demo · real-source local pilot',
    path: '/said-vs-did/',
    keywords: 'claims speech words congress consistency honesty ai review',
    sample: true,
  },
  {
    id: 'holdings',
    title: 'Quarterly holdings',
    group: 'money',
    question: 'How did a manager’s disclosed portfolio change between quarters?',
    source: 'SEC Form 13F',
    path: '/records/holdings/',
    keywords: 'stocks investor investment fund portfolio money manager',
  },
  {
    id: 'shared-investors',
    title: 'Shared investors',
    group: 'money',
    question: 'Which selected managers held the same peer companies?',
    source: 'SEC holdings · dated security mappings',
    path: '/records/shared-investors/',
    keywords: 'stocks investor overlap portfolio company companies ownership competitors',
  },
  {
    id: 'major-stakes',
    title: 'Major stakes',
    group: 'money',
    question: 'Who disclosed a large position, and what explanation did they give?',
    source: 'SEC Schedules 13D / 13G',
    path: '/records/major-stakes/',
    keywords: 'stocks investor ownership acquisition company shares',
  },
  {
    id: 'insiders',
    title: 'Insider records',
    group: 'money',
    question: 'What ownership transactions did company insiders report?',
    source: 'SEC Forms 3 / 4 / 5',
    path: '/records/insiders/',
    keywords: 'stocks insider executive directors buying selling grants tax company',
  },
  {
    id: 'trials',
    title: 'Trial results',
    group: 'health',
    question: 'Which completed studies have results posted in the registry?',
    source: 'ClinicalTrials.gov',
    path: '/records/trials/',
    keywords: 'clinical trials studies medical medicine results research science asthma',
  },
  {
    id: 'research',
    title: 'Research funding',
    group: 'health',
    question: 'Who received research funding, and which publications connect?',
    source: 'NIH RePORTER',
    path: '/records/research/',
    keywords: 'grants research science publications papers universities asthma',
  },
  {
    id: 'nursing',
    title: 'Nursing home owners',
    group: 'health',
    question: 'Which disclosed owners connect nursing facilities?',
    source: 'CMS enrollment / ownership records',
    path: '/records/nursing/',
    keywords: 'health care nursing facilities hospitals ownership care homes',
  },
  {
    id: 'enforcement',
    title: 'Violations & enforcement',
    group: 'environment',
    question: 'What findings and responses appear in a facility’s EPA history?',
    source: 'EPA ECHO',
    path: '/records/enforcement/',
    keywords: 'pollution water air chemical facilities violations environment enforcement',
  },
  {
    id: 'water',
    title: 'Water records',
    group: 'environment',
    question: 'What requirements, violations and actions are recorded for a water system?',
    source: 'EPA drinking-water records',
    path: '/records/water/',
    keywords: 'drinking water contamination testing treatment violations systems',
  },
  {
    id: 'paycheck',
    title: 'Paychecks',
    group: 'everyday',
    question: 'How do regional earnings compare with prices and the national trend?',
    source: 'Bureau of Labor Statistics',
    path: '/records/paycheck/',
    keywords: 'earnings wage economy employment inflation real dollars region state',
  },
  {
    id: 'charts',
    title: 'Chart check',
    group: 'everyday',
    question: 'Does a different date window change the impression?',
    source: 'Bureau of Labor Statistics',
    path: '/records/charts/',
    keywords: 'economy chart bias inflation unemployment wages statistics graph',
  },
  {
    id: 'wages',
    title: 'Wage ledger',
    group: 'everyday',
    question: 'What did labor investigators record about an employer?',
    source: 'U.S. Department of Labor',
    path: '/records/wages/',
    keywords: 'work wages workers employer back pay violations penalties labor',
  },
  {
    id: 'complaints',
    title: 'Consumer radar',
    group: 'everyday',
    question: 'What problems did consumers report, and how did companies respond?',
    source: 'CFPB complaint records',
    path: '/records/complaints/',
    keywords: 'consumer complaint banking mortgage credit financial company problems',
  },
];
export function searchCatalog(query: string, group: CatalogGroup = 'all') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalogViews.filter(
    (v) =>
      (group === 'all' || v.group === group) &&
      words.every((word) =>
        `${v.title} ${v.question} ${v.source} ${v.keywords} ${catalogGroups.find((g) => g.id === v.group)?.label ?? ''}`.toLowerCase().includes(word),
      ),
  );
}
