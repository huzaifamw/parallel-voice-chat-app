# Supabase email verification setup

The app implements PKCE verification, deep-link callbacks, resend, and a verification-pending screen. Complete these dashboard settings before testing.

## 1. Require confirmation

In **Authentication → Sign In / Providers → Email**:

- Enable the Email provider.
- Enable **Confirm email**.
- Keep secure email change enabled.
- For production, connect custom SMTP instead of relying on Supabase's limited development mail service.

## 2. Configure redirect URLs

In **Authentication → URL Configuration**:

- Set **Site URL** to an HTTPS website you control when one is available.
- Add `circlechat://**` under **Redirect URLs** for development builds and installed apps.
- During Expo Go testing, add the exact callback displayed for your local session, typically `exp://YOUR_LAN_IP:8081/--/auth/callback`. This address can change when the network changes.

The production app should use an Expo development/production build so `circlechat://auth/callback` opens reliably. A universal HTTPS link can replace the custom scheme before public release.

## 3. Keep the confirmation template safe

In **Authentication → Email Templates → Confirm signup**, keep the button target as:

```text
{{ .ConfirmationURL }}
```

Do not expose a service-role or secret key in a template or in the mobile application.

## 4. Apply migrations in order

Run these files once, in filename order, through the SQL Editor or Supabase CLI:

1. `202610110001_initial_schema.sql`
2. `202610110002_roadmap_entities.sql`

## 5. Test

1. Restart Expo with `npm start -- --clear`.
2. Register with an email address you can access.
3. Confirm the email from the same phone.
4. Confirm that the callback opens the app and creates a session.
5. Sign out and sign in again.

For public launch, also configure CAPTCHA, authentication rate limits, custom SMTP, branded email templates, and universal links.
