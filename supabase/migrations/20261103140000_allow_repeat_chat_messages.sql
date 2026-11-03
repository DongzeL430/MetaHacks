-- Lobby chat: sending the same message twice in a row is allowed again.
-- The pace limits (5 per 10 seconds, 20 per minute) stay as they were.

create or replace function private.check_chat_pace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.body := btrim(new.body);

  if (select count(*) from public.lobby_messages
      where sender_id = new.sender_id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limited' using detail = 'retry_after=10', errcode = 'P0001';
  end if;
  if (select count(*) from public.lobby_messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited' using detail = 'retry_after=60', errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.check_chat_pace() from public, anon, authenticated;
