# Circle mobile prototype

A dark, futuristic mobile hangout prototype for friends, families, classmates, and gaming groups. The working title **Circle** is temporary until final branding is selected.

## Included in this first pass

- Five-tab navigation: Home, Friends, Groups, Activity, and Profile
- Group overview with text and permanent voice channels
- Chat and direct-message interfaces
- Interactive voice-room controls
- Interactive Bottle Spin activity
- Privacy preferences and teen-safety-oriented product structure
- Local mock data so product flows can be tested without credentials

## Run locally

```bash
npm install
npm start
```

Then open the app in an Android or iOS development environment. The interface can also be checked with `npm run web`.

## Planned integrations

1. LiveKit voice rooms through an Expo development build
2. Expo Notifications with FCM and APNs
3. Invite links, codes, QR, and media uploads

## Supabase setup

The app reads these Expo environment variables from `.env`:

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

To create the database, open **Supabase Dashboard → SQL Editor** and run the migration files in filename order. Start with [`supabase/migrations/202610110001_initial_schema.sql`](supabase/migrations/202610110001_initial_schema.sql), then run [`supabase/migrations/202610110002_roadmap_entities.sql`](supabase/migrations/202610110002_roadmap_entities.sql). The migrations enable row-level security and Realtime for supported live tables.

Email verification also requires dashboard configuration. Follow [`supabase/AUTH_SETUP.md`](supabase/AUTH_SETUP.md).

Restart Expo after adding or changing `.env`:

```bash
npm start -- --clear
```

Do not commit service credentials. Add them through environment variables when the integrations begin.
