# User Account Setup After Payment Approval

After an administrator accepts a payment, the user is sent to an account setup screen instead of receiving credentials from the administrator.

## User-facing copy
**নিজের মতো Username ও Password সেট করুন**

**পরবর্তীতে লগইন করার জন্য Username ও Password মনে রাখুন।**

Fields:
- Username
- Password
- Confirm Password
- Create Account

## Rules
- The user chooses their own username and password.
- Password confirmation must match before account creation.
- Passwords must be stored securely as hashes, never as plaintext.
- The admin panel must not display the user's plaintext password.
- On later visits, the user logs in with the username/password they created and returns to their approved access.
- This flow is independent of the legacy JISANs-BOT admin/database.
