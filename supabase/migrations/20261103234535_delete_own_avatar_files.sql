-- Deleting an account left the student's pictures in storage: the database can't remove stored
-- files, so the app removes them just before delete_my_account. Backgrounds already allow that
-- ("Users delete their own backgrounds"); this lets a student delete files in their own avatar
-- folder ("<user id>/..."). Writing avatars stays with server code.

create policy "Students delete their own avatar files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
