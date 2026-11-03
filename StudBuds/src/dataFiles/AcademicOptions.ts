/*
 * Editable option lists for the Courses page.
 * Change labels freely; changing a `value` changes what gets saved.
 */

export const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];

export const STATUS_OPTIONS = [
  { value: 'taken', label: 'Already taken' },
  { value: 'taking', label: 'Taking now' },
] as const;

/** Most majors and minors one student can list (the course search runs one search per major) */
export const MAX_PROGRAMS = 3;

export const CONFIDENCE_LEVELS = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Solid' },
  { value: 5, label: 'Could teach it' },
] as const;

/**
 * Grades from the grading systems schools use, grouped in the dropdown. Grade is optional, so
 * the dropdown also gets a blank "No grade" choice. A `value` is what's saved (the database's
 * letter_grade list), so change labels freely but keep values as they are.
 */
export const GRADE_GROUPS = [
  {
    label: 'Letter grades',
    grades: [
      'A+', 'A', 'A-',
      'B+', 'B', 'B-',
      'C+', 'C', 'C-',
      'D+', 'D', 'D-',
      'F', 'E',
    ].map((g) => ({ value: g, label: g === 'E' ? 'E (fail, at some schools)' : g })),
  },
  {
    label: 'Pass / fail style',
    grades: [
      { value: 'P', label: 'P (Pass)' },
      { value: 'NP', label: 'NP (No pass)' },
      { value: 'S', label: 'S (Satisfactory)' },
      { value: 'U', label: 'U (Unsatisfactory)' },
      { value: 'CR', label: 'CR (Credit)' },
      { value: 'NC', label: 'NC (No credit)' },
    ],
  },
  {
    label: 'Honors scale',
    grades: [
      { value: 'H', label: 'H (Honors)' },
      { value: 'HP', label: 'HP (High pass)' },
      { value: 'LP', label: 'LP (Low pass)' },
    ],
  },
  {
    label: 'Other marks',
    grades: [
      { value: 'W', label: 'W (Withdrew)' },
      { value: 'I', label: 'I (Incomplete)' },
      { value: 'AU', label: 'AU (Audit)' },
    ],
  },
];