-- 75 Soft social updates, private post media, reactions, and comments.
-- Required-goal scoring remains derived by the W2 rollup implementation:
-- only published post_goal_entries are source events.

begin;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  local_date date not null,
  note text null,
  photo_path text null,
  status text not null default 'pending',
  client_operation_id text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles (id) on delete set null,
  constraint posts_status_check check (
    status in ('pending', 'published', 'deleted', 'failed')
  ),
  constraint posts_photo_path_check check (
    photo_path is null
    or photo_path ~ '^posts/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(jpeg|png|webp)$'
  ),
  constraint posts_photo_owner_path_check check (
    photo_path is null
    or photo_path like 'posts/' || author_id::text || '/' || id::text || '/%'
  ),
  constraint posts_note_check check (
    note is null or char_length(note) <= 2000
  ),
  constraint posts_operation_id_check check (
    client_operation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint posts_published_at_check check (
    status <> 'published' or published_at is not null
  ),
  constraint posts_deleted_at_check check (
    status <> 'deleted' or (deleted_at is not null and deleted_by is not null)
  )
);

create unique index if not exists posts_author_operation_unique
  on public.posts (author_id, client_operation_id);

create index if not exists posts_cohort_status_created_idx
  on public.posts (cohort_id, status, created_at desc, id desc);

create index if not exists posts_author_date_created_idx
  on public.posts (author_id, local_date, created_at desc, id desc);

create table if not exists public.post_goal_entries (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  required_goal_key text null,
  optional_goal_id uuid null,
  optional_goal_name text null,
  amount_int integer null,
  diet_value boolean null,
  optional_value numeric null,
  optional_completed boolean null,
  created_at timestamptz not null default now(),
  constraint post_goal_entries_required_key_check check (
    required_goal_key is null
    or required_goal_key in ('workout', 'water', 'reading', 'diet')
  ),
  constraint post_goal_entries_one_kind_check check (
    (required_goal_key is not null) <> (optional_goal_id is not null)
  ),
  constraint post_goal_entries_required_shape_check check (
    (
      required_goal_key = 'diet'
      and diet_value = true
      and amount_int is null
      and optional_goal_name is null
      and optional_value is null
      and optional_completed is null
    )
    or (
      required_goal_key in ('workout', 'water', 'reading')
      and amount_int is not null
      and amount_int > 0
      and diet_value is null
      and optional_goal_name is null
      and optional_value is null
      and optional_completed is null
    )
    or (
      optional_goal_id is not null
      and optional_goal_name is not null
      and char_length(btrim(optional_goal_name)) between 1 and 80
      and (
        (optional_value is not null and optional_completed is null)
        or (optional_value is null and optional_completed is not null)
      )
    )
  ),
  constraint post_goal_entries_optional_value_check check (
    optional_value is null
    or (
      optional_value <> 'NaN'::numeric
      and optional_value > 0
      and optional_value <= 1000000
    )
  )
);

create index if not exists post_goal_entries_post_idx
  on public.post_goal_entries (post_id, created_at);

create unique index if not exists post_goal_entries_required_unique
  on public.post_goal_entries (post_id, required_goal_key)
  where required_goal_key is not null;

create unique index if not exists post_goal_entries_optional_unique
  on public.post_goal_entries (post_id, optional_goal_id)
  where optional_goal_id is not null;

create table if not exists public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint reactions_emoji_check check (char_length(btrim(emoji)) between 1 and 16)
);

create index if not exists reactions_post_idx
  on public.reactions (post_id, emoji);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  client_operation_id text null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles (id) on delete set null,
  constraint comments_body_check check (
    -- The route applies exact Unicode grapheme counting. This database guard
    -- blocks bypasses for ordinary code-point input without rejecting valid
    -- multi-code-point graphemes at the route boundary.
    char_length(btrim(body)) between 1 and 2048
  ),
  constraint comments_operation_id_check check (
    client_operation_id is null
    or client_operation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint comments_deleted_check check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);

create unique index if not exists comments_author_operation_unique
  on public.comments (author_id, client_operation_id)
  where client_operation_id is not null;

create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at);

-- Lifecycle transitions are intentionally narrow. Rollups inspect status and
-- therefore never need a manually maintained score counter.
create or replace function private.validate_post_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'deleted' and new.status <> 'deleted' then
      raise exception 'Deleted posts cannot be restored' using errcode = '23514';
    end if;

    if old.status = 'published'
      and new.status not in ('published', 'deleted') then
      raise exception 'Published posts can only be deleted'
        using errcode = '23514';
    end if;

    if old.status = 'pending'
      and new.status not in ('pending', 'published', 'failed', 'deleted') then
      raise exception 'Invalid pending post transition'
        using errcode = '23514';
    end if;

    if new.status = 'published' and new.published_at is null then
      raise exception 'Published posts require published_at'
        using errcode = '23514';
    end if;

    if new.status = 'deleted'
      and (new.deleted_at is null or new.deleted_by is null) then
      raise exception 'Deleted posts require deletion metadata'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_post_transition() from public;

drop trigger if exists posts_validate_transition on public.posts;
create trigger posts_validate_transition
before update on public.posts
for each row execute function private.validate_post_transition();

create or replace function private.prevent_comment_edit()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if old.post_id <> new.post_id
    or old.author_id <> new.author_id
    or old.body <> new.body
    or old.created_at <> new.created_at
    or old.client_operation_id is distinct from new.client_operation_id then
    raise exception 'Comments are immutable' using errcode = '23514';
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'Deleted comments cannot be restored'
      using errcode = '23514';
  end if;

  if new.deleted_at is not null and new.deleted_by is null then
    raise exception 'Deleted comments require deletion metadata'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_comment_edit() from public;

drop trigger if exists comments_prevent_edit on public.comments;
create trigger comments_prevent_edit
before update on public.comments
for each row execute function private.prevent_comment_edit();

create or replace function private.validate_reaction_palette()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = new.user_id
      and jsonb_typeof(profile.reaction_palette) = 'array'
      and exists (
        select 1
        from jsonb_array_elements_text(profile.reaction_palette) as entry(value)
        where entry.value = new.emoji
      )
  ) then
    raise exception 'Reaction is not in the current palette'
      using errcode = '23514';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.validate_reaction_palette() from public;

drop trigger if exists reactions_validate_palette on public.reactions;
create trigger reactions_validate_palette
before insert or update on public.reactions
for each row execute function private.validate_reaction_palette();

alter table public.posts enable row level security;
alter table public.post_goal_entries enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;

drop policy if exists posts_member_select on public.posts;
create policy posts_member_select
on public.posts
for select
to authenticated
using (
  (
    status = 'published'
    and cohort_id = private.active_cohort_id()
    and private.is_active_member(auth.uid())
  )
  or (
    author_id = auth.uid()
    and status in ('pending', 'failed')
    and cohort_id = private.active_cohort_id()
    and private.is_active_member(auth.uid())
  )
);

drop policy if exists posts_member_insert_pending on public.posts;
create policy posts_member_insert_pending
on public.posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and cohort_id = private.active_cohort_id()
  and status = 'pending'
  and private.is_active_member(auth.uid())
);

drop policy if exists posts_owner_admin_update on public.posts;
create policy posts_owner_admin_update
on public.posts
for update
to authenticated
using (
  cohort_id = private.active_cohort_id()
  and private.is_active_member(auth.uid())
  and (author_id = auth.uid() or private.is_admin(auth.uid()))
)
with check (
  cohort_id = private.active_cohort_id()
  and private.is_active_member(auth.uid())
  and (author_id = auth.uid() or private.is_admin(auth.uid()))
);

drop policy if exists post_goal_entries_member_select on public.post_goal_entries;
create policy post_goal_entries_member_select
on public.post_goal_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.posts as post
    where post.id = post_goal_entries.post_id
      and post.status = 'published'
      and post.cohort_id = private.active_cohort_id()
      and private.is_active_member(auth.uid())
  )
);

drop policy if exists post_goal_entries_owner_insert on public.post_goal_entries;
create policy post_goal_entries_owner_insert
on public.post_goal_entries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts as post
    where post.id = post_goal_entries.post_id
      and post.author_id = auth.uid()
      and post.status = 'pending'
      and post.cohort_id = private.active_cohort_id()
      and private.is_active_member(auth.uid())
  )
);

drop policy if exists post_goal_entries_owner_cleanup on public.post_goal_entries;
create policy post_goal_entries_owner_cleanup
on public.post_goal_entries
for delete
to authenticated
using (
  exists (
    select 1
    from public.posts as post
    where post.id = post_goal_entries.post_id
      and post.author_id = auth.uid()
      and post.status in ('pending', 'failed')
      and private.is_active_member(auth.uid())
  )
);

drop policy if exists reactions_member_select on public.reactions;
create policy reactions_member_select
on public.reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.posts as post
    where post.id = reactions.post_id
      and post.status = 'published'
      and post.cohort_id = private.active_cohort_id()
      and private.is_active_member(auth.uid())
  )
);

drop policy if exists reactions_owner_insert on public.reactions;
create policy reactions_owner_insert
on public.reactions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.is_active_member(auth.uid())
  and exists (
    select 1
    from public.posts as post
    where post.id = reactions.post_id
      and post.status = 'published'
      and post.cohort_id = private.active_cohort_id()
  )
);

drop policy if exists reactions_owner_update on public.reactions;
create policy reactions_owner_update
on public.reactions
for update
to authenticated
using (user_id = auth.uid() and private.is_active_member(auth.uid()))
with check (user_id = auth.uid() and private.is_active_member(auth.uid()));

drop policy if exists reactions_owner_delete on public.reactions;
create policy reactions_owner_delete
on public.reactions
for delete
to authenticated
using (user_id = auth.uid() and private.is_active_member(auth.uid()));

drop policy if exists comments_member_select on public.comments;
create policy comments_member_select
on public.comments
for select
to authenticated
using (
  deleted_at is null
  and private.is_active_member(auth.uid())
  and exists (
    select 1
    from public.posts as post
    where post.id = comments.post_id
      and post.status = 'published'
      and post.cohort_id = private.active_cohort_id()
  )
);

drop policy if exists comments_member_insert on public.comments;
create policy comments_member_insert
on public.comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.is_active_member(auth.uid())
  and exists (
    select 1
    from public.posts as post
    where post.id = comments.post_id
      and post.status = 'published'
      and post.cohort_id = private.active_cohort_id()
  )
);

drop policy if exists comments_owner_admin_delete on public.comments;
create policy comments_owner_admin_delete
on public.comments
for update
to authenticated
using (
  private.is_active_member(auth.uid())
  and (
    author_id = auth.uid()
    or private.is_admin(auth.uid())
  )
)
with check (
  deleted_at is not null
  and deleted_by = auth.uid()
);

revoke all on public.posts from anon;
revoke all on public.post_goal_entries from anon;
revoke all on public.reactions from anon;
revoke all on public.comments from anon;

grant select, insert, update on public.posts to authenticated;
grant select, insert, delete on public.post_goal_entries to authenticated;
grant select, insert, update, delete on public.reactions to authenticated;
grant select, insert, update on public.comments to authenticated;

-- Private post/profile photos. Routes still validate MIME and byte length before
-- upload; these policies enforce member/owner boundaries at Storage as well.
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', false)
on conflict (id) do update set public = false;

drop policy if exists post_photos_member_select on storage.objects;
create policy post_photos_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'post-photos'
  and private.is_active_member(auth.uid())
  and (
    name like 'posts/%'
    or name like 'avatars/%'
  )
);

drop policy if exists post_photos_owner_insert on storage.objects;
create policy post_photos_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-photos'
  and private.is_active_member(auth.uid())
  and (
    name like 'posts/' || auth.uid()::text || '/%'
    or name like 'avatars/' || auth.uid()::text || '/%'
  )
);

drop policy if exists post_photos_owner_admin_delete on storage.objects;
create policy post_photos_owner_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-photos'
  and private.is_active_member(auth.uid())
  and (
    name like 'posts/' || auth.uid()::text || '/%'
    or name like 'avatars/' || auth.uid()::text || '/%'
    or private.is_admin(auth.uid())
  )
);

commit;
