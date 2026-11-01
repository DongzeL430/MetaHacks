-- Courses whose credit a student transferred from another school. The school isn't recorded.
-- They get a confidence rating like completed courses; a grade stays optional, since transfer
-- credit often has no letter grade here (only completed courses require one).
-- Matching should treat them like completed courses: the student knows the material.

alter type public.course_status add value if not exists 'transferred';
