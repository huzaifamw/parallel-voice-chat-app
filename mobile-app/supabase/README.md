# Database migrations

Migrations are append-only and must be applied in filename order.

## Current schema coverage

- Accounts, profiles, privacy preferences, devices, and push tokens
- Friends, blocks, direct conversations, and direct messages
- Groups, roles, memberships, bans, invitations, and channels
- Messages, replies, reactions, mentions, pins, polls, and attachments
- Private media metadata and storage policies
- Notifications
- Voice, video, screen-sharing, and watch-party session records
- Bottle Spin and extensible activity sessions
- Scheduled events and attendance
- Community categories for future discovery
- User reports, moderator actions, and asynchronous content checks
- Row-level security and Realtime publication configuration

Supabase Auth remains the source of truth for passwords, email verification, provider identities, and login sessions. The public schema never stores password hashes or verification tokens.

See [`AUTH_SETUP.md`](AUTH_SETUP.md) for dashboard configuration that cannot be expressed through a database migration.
