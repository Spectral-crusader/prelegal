// Shape of user input on the MNDA form. Mirrors the slots on Mutual-NDA-coverpage.md.

export type MndaFormValues = {
  purpose: string;
  effectiveDate: string; // ISO yyyy-mm-dd, formatted for display at render time
  // MNDA Term
  termMode: 'years' | 'until_terminated';
  termYears: number; // ignored when termMode === 'until_terminated'
  // Term of Confidentiality
  confidentialityMode: 'years' | 'perpetuity';
  confidentialityYears: number; // ignored when confidentialityMode === 'perpetuity'
  // Governing Law + Jurisdiction
  governingLaw: string; // state name
  jurisdiction: string; // "courts located in ..."
  // Modifications to the standard terms
  modifications: string;
};

export const defaultValues: MndaFormValues = {
  purpose: 'Evaluating whether to enter into a business relationship with the other party.',
  effectiveDate: new Date().toISOString().slice(0, 10),
  termMode: 'years',
  termYears: 1,
  confidentialityMode: 'years',
  confidentialityYears: 1,
  governingLaw: '',
  jurisdiction: '',
  modifications: '',
};
