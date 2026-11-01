/*
 * Editable option lists for the Courses page.
 * Change labels freely; changing a `value` changes what gets saved.
 */

export const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];

export const STATUS_OPTIONS = [
  { value: 'taken', label: 'Already taken' },
  { value: 'taking', label: 'Taking now' },
] as const;

export const CONFIDENCE_LEVELS = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Solid' },
  { value: 5, label: 'Could teach it' },
] as const;

/** Grade is optional, so the dropdown also gets a blank "No grade" choice */
export const GRADE_OPTIONS = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F', 'Pass', 'Fail',
];