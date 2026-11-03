-- Survey questions that say more about who you'd study well with. Same 9 habit questions and
-- 8 This or That picks, same positions; StudBuds/src/dataFiles/SurveySections.ts shows the same.
-- Only answers whose meaning changed are cleared. The Answers tab marks those questions, and
-- matching treats an unanswered question as neutral until it's answered again.

-- "Where do you get the most done?" becomes where you'd meet: "Dorm or home" isn't a place to
-- meet classmates you don't know yet, so a study room or lounge takes its place
delete from public.survey_answers
where choice = 3 and question_id = (select id from public.survey_questions where key = 'location');
update public.survey_questions
set prompt = 'Where would you rather meet?',
    options = array['Library', 'Café', 'A study room or lounge', 'Wherever’s free']
where key = 'location';

-- Studying "on my own" isn't something to find a partner for
delete from public.survey_answers
where choice = 4 and question_id = (select id from public.survey_questions where key = 'focus');
update public.survey_questions
set options = array['Exams', 'Homework and problem sets', 'Projects', 'Keeping up with classes']
where key = 'focus';

-- New questions in place of three old ones: their answers no longer mean anything
delete from public.survey_answers
where question_id in (select id from public.survey_questions where key in ('whenStuck', 'noteStyle', 'seatPick'));

-- How many people: lobbies hold 2 to 5, so this lines up with a session's size
update public.survey_questions
set key = 'groupSize',
    prompt = 'How many people do you like to study with?',
    options = array['One other person', 'A small group (3 or 4)', 'A full group (5)', 'Any size works'],
    scale = 'ordinal',
    flexible_options = '{4}'
where key = 'whenStuck';

update public.survey_questions
set key = 'warmUp',
    prompt = 'Straight to work or chat first?',
    options = array['Straight to work', 'Chat first', 'Both', 'No preference']
where key = 'noteStyle';

update public.survey_questions
set key = 'phones',
    prompt = 'Phones away or phones nearby?',
    options = array['Phones away', 'Phones nearby', 'Both', 'No preference']
where key = 'seatPick';
