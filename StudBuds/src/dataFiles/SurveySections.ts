export interface SurveyQuestion {
  /** Used as the radio group's name and the key in the answers object */
  id: string;
  prompt: string;
  options: string[];
}

export interface SurveySection {
  id: string;
  /** Category name, shown in the window's title bar */
  title: string;
  /** Page heading above the window */
  heading: string;
  bio?: string;
  questions: SurveyQuestion[];
}

/**
 * The database keeps a copy of every question for matching (survey_questions, seeded in
 * supabase/migrations/…_survey_saving.sql). Answers are saved by question id and option number,
 * so keep each id and the order of its options the same in both places. Wording can change here.
 */
export const SURVEY_SECTIONS: SurveySection[] = [
  {
    id: 'study-style',
    title: 'Study style',
    heading: 'How do you like to study?',
    bio: 'There are no right answers. This just helps match you with people who work the way you do.',
    questions: [
      {
        id: 'sessionFormat',
        prompt: 'What does a good study session look like for you?',
        options: [
          'Working quietly side by side',
          'Talking problems through out loud',
          'Quizzing each other',
          'A mix, depending on the day',
        ],
      },
      {
        id: 'sessionLength',
        prompt: 'How long do your sessions usually last?',
        options: ['Under an hour', '1 to 2 hours', '2 to 3 hours', 'More than 3 hours'],
      },
      {
        id: 'whenStuck',
        prompt: 'When you get stuck on a problem, what do you do first?',
        options: [
          'Keep at it on my own for a while',
          'Ask someone right away',
          'Look it up or watch a video',
          'Skip it and come back later',
        ],
      },
    ],
  },
  {
    id: 'environment',
    title: 'Environment',
    heading: 'Where do you focus best?',
    questions: [
      {
        id: 'meetingMode',
        prompt: 'Would you rather meet in person or online?',
        options: ['In person', 'Online', 'Either works'],
      },
      {
        id: 'location',
        prompt: 'Where do you get the most done?',
        options: ['Library', 'Café', 'Dorm or home', 'Wherever’s free'],
      },
      {
        id: 'noise',
        prompt: 'How much noise can you work with?',
        options: ['Total silence', 'Quiet background chatter', 'Music is fine', 'Noise doesn’t bother me'],
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goals',
    heading: 'What are you working toward?',
    questions: [
      {
        id: 'focus',
        prompt: 'What are you mostly studying for right now?',
        options: ['Exams', 'Homework and problem sets', 'Projects', 'Learning something on my own'],
      },
      {
        id: 'frequency',
        prompt: 'How often do you want to meet with a partner?',
        options: ['Once a week', '2 or 3 times a week', 'Almost every day'],
      },
      {
        id: 'punctuality',
        prompt: 'How much does showing up on time matter to you?',
        options: ['A lot, I plan around it', 'Somewhat, a heads-up is enough', 'Not much, I’m flexible'],
      },
    ],
  },
  {
    id: 'this-or-that',
    title: 'This or That',
    heading: 'Quick picks',
    bio: 'Go with your first instinct. Both and No preference are fine answers too.',
    questions: [
      { id: 'deadlineStyle', prompt: 'Night before or a week ahead?', options: ['Night before', 'A week ahead', 'Both', 'No preference'] },
      { id: 'dayRhythm', prompt: 'Early bird or night owl?', options: ['Early bird', 'Night owl', 'Both', 'No preference'] },
      { id: 'practiceStyle', prompt: 'Flashcards or practice problems?', options: ['Flashcards', 'Practice problems', 'Both', 'No preference'] },
      { id: 'noteStyle', prompt: 'Handwritten or typed notes?', options: ['Handwritten', 'Typed', 'Both', 'No preference'] },
      {
        id: 'breakStyle',
        prompt: 'Lots of short breaks or one long break?',
        options: ['Lots of short breaks', 'One long break', 'Both', 'No preference'],
      },
      { id: 'planStyle', prompt: 'Plan everything or wing it?', options: ['Plan everything', 'Wing it', 'Both', 'No preference'] },
      { id: 'petPick', prompt: 'Cats or dogs?', options: ['Cats', 'Dogs', 'Both', 'No preference'] },
      { id: 'seatPick', prompt: 'Window seat or aisle seat?', options: ['Window seat', 'Aisle seat', 'Both', 'No preference'] },
    ],
  },
];