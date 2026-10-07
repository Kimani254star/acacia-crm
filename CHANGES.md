# Acacia Books CRM - fixes applied (from the 6 Oct 2026 audit)
C3  All user text is escaped before going into the page (140+ places); esc() now also escapes single quotes (L2 partly).
C4  Safe load/save: unreadable data is copied to a *_corrupt_* key, never overwritten; save() warns when storage is full.
M14 todayISO() uses the local date (Nairobi), not UTC.
H3  Leads search keeps focus and cursor while typing.
H4  One stage-change function for drag/drop, dropdown and the Edit Deal form; onboarding task created once.
H5  Deals store closedAt / stageChangedAt / lostReason; Sales Targets count by actual close date.
H6  "Converted" cannot be picked manually; conversion stores account/contact/deal links, offers to attach to an existing account, moves the lead's activities.
H1  Permission checks inside lead, deal, activity, quote and import actions, not only on buttons.
H10 Expired quotes cannot be accepted; accepted quotes become Closed Won, sync amount to the deal, and lock line-item edits.
L1  Distinct pill colours for deal stages, account statuses and "Attempted Contact" (with dark mode).
L4  Clear all data: admin only, type company name, backup downloads first.

## Round 2
H7  Edit contacts (new Edit form). Delete on leads, accounts, contacts, deals, activities and quotes -> Recycle Bin (Settings) with Restore; account/deal links are re-attached on restore; Admin can empty the bin; Salespeople can only delete their own records.
H11 Branded quotation print: letterhead, address, KRA PIN, customer block, line items, VAT totals, notes, terms, bank/M-Pesa details, signature and acceptance blocks. Opens a clean print window (not the app screen).
M11 Settings -> Company profile (address, phone, email, KRA PIN, bank, M-Pesa, footer).

## Round 3
M2  Owner is now a dropdown of the company's users on lead, account, contact, deal and activity forms (existing typed owners stay selectable). Salespeople see it locked to themselves.
H1  Salesperson scoping now covers Dashboard, Pipeline, Forecast, Tasks/Calls/Meetings, Calendar, Reports, Analytics, Targets, Quotes and the Ctrl+K palette. Saving is blocked while a scoped view is drawn, so filtered data can never overwrite the full dataset.

## Round 4
H8  Separate Task / Call / Meeting forms: link to a lead, account, deal or contact; time; priority (tasks); direction, duration, outcome (calls); duration, location, attendees (meetings); reminder; repeat (daily/weekly/monthly - completing one schedules the next); notes; edit existing. "+ Task / + Call / + Meeting" buttons on lead, account and deal pages, so the Activities panels now fill up.
H9  Reminder engine (runs on sign-in and every 10 minutes): due today, overdue, reminders before due date, lead follow-up dates, deals past/near close date, deals stuck 30+ days, quotes expiring/expired. Each alert fires once and goes to the record owner.
H9  Notifications: real timestamps ("5 min ago"), per-user read state (opening the bell no longer marks other people's as read), newest 100 kept.
H9  Dashboard "Today & overdue tasks" now shows only what is actually due.
M5  Reports count only completed calls and meetings.

## Round 5
H12 Pipeline: every deal card has a "Move to..." dropdown (works on phones and with a keyboard; hidden for roles that cannot edit deals). Cards are focusable and open with Enter.
H12 KPI rows use responsive classes instead of inline styles, so they collapse to 2 columns then 1 on phones.
H12 Keyboard/screen reader: nav items, tabs, links and clickable rows get role="button", tabindex and Enter/Space support; labels are bound to their inputs; focus outlines added; larger touch targets on touch screens.
H12 Modals: role="dialog", labelled title, labelled close button, focus moves in and returns, Tab stays inside, Escape closes.
H12 Login and Create Account submit with Enter.

## Round 6
M13 CSV import wizard: choose type and file (max 5,000 rows / 2 MB) -> match columns (auto-matched, including names like "Full Name", "E-mail", "Mobile") -> Check data -> import. Shows how many rows are ready, already exist, or have errors; downloadable error/duplicate report; first rows previewed. Deals can now be imported too.
M13 Duplicates: skip (default), update the existing record, or import anyway; duplicates inside the file are caught as well. Invalid status/stage values are corrected with a note; scores are clamped 0-100; unknown owners fall back to you; Salespeople always import as themselves.
M7  Every form: email format check, phone numbers normalised to +254..., red highlight on the bad field. New Lead / Contact / Account warn when the email, phone or name already exists.

## Round 7
M8  Leads, Accounts, Contacts and Deals lists now have: instant search (no focus loss), click-to-sort columns (text, numbers and dates), paging (25/50/100 rows), row checkboxes with select-all, and a bulk bar: reassign owner, set lead status, move deals to a stage, export selected to CSV, and delete (to the Recycle Bin). Salespeople cannot bulk-reassign.

## Round 8
M10 Contact detail page: profile, one-click Email / Call / WhatsApp, deals, quotations, activities (+ Task/Call/Meeting buttons) and notes. Contacts list, Ctrl+K search and the deal page now open it.
M10 Multiple contacts per deal with roles (Decision maker, Influencer, Champion, Budget holder, User, Other); primary contact still shown.
M9  Notes & history panel on leads, contacts, deals and accounts: write notes, @Name mentions notify the teammate, and one feed merges notes, timeline events and activities. Authors and Administrators can delete notes. Lead notes move to the deal when the lead is converted.
