-- Every theme has its own music. A theme without any (made before theme music, or one whose
-- music didn't come out right) gets a piece composed the first time it's switched on, by the
-- generate-theme Edge Function's "compose" action. It has its own small limit, so it never uses
-- one of the student's 3 weekly themes: 5 a day, about 1 cent each.

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests
  add constraint ai_requests_kind_check check (kind in (
    'read_schedule', 'suggest_courses', 'format_courses', 'theme', 'nickname', 'avatar', 'avatar_starter', 'study_spots',
    'theme_music'
  ));

insert into private.muse_limits (kind, limit_group, per_user, per_window, cost_cents)
values ('theme_music', 'theme_music', 5, interval '1 day', 1);
