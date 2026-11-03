-- Storage only deletes a file the student can also read, so the avatar removal before account
-- deletion needs this too. Avatars are in a public bucket already; this only covers the student's
-- own folder.

create policy "Students read their own avatar files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
