# Telugu strings for department review

All Telugu text added in Milestone 3 is best effort and needs confirmation by the department.

- `frontend/src/locales/te.json`: every key added for Milestone 3 (account deactivation, forced password change, user administration, geography labels, add-role card, pagination).
- `backend/prisma/data/geo.sample.csv`: sample district, mandal and village names (placeholders only; replace with the real LGD import).

Later phases will add the seed names for document types, service categories, operations and crops (see the plan, section 5.4).

Phase 2 additions:

- `backend/prisma/masters-data.ts`: Telugu names for document types, service categories, operations and crops.
- `frontend/src/locales/te.json`: file upload, photo, location and geolocation messages.

Phase 3 additions:

- `frontend/src/locales/te.json`: farmer profile, plot, crop season, assisted registration and consent wording (including the assisted-consent sentence the agent confirms).

Phase 4 additions:

- `frontend/src/locales/te.json`: provider status names and messages, provider types, checklist items, document review states, bank and profile wording.

Phase 5 additions:

- `frontend/src/locales/te.json`: equipment, unit, capacity, pricing basis, travel charge and rate card wording.

Phase 6 additions:

- `frontend/src/locales/te.json`: weekday names, coverage and working-hours wording, operator management, availability blocks.

Phase 7 additions:

- `frontend/src/locales/te.json`: submission and confirmation messages, verification actions and history, officer queue and review screen wording, approve/return/reject/suspend/blacklist/reinstate dialogs.

Phase 8 additions:

- `frontend/src/locales/te.json`: `changesSaved` ("Changes saved.").
- Strings introduced in Phases 3 to 7 are all in `te.json` next to their English text; the file is the complete list for review (the locale test guarantees both files hold the same keys).

Phase 9 additions:

- `frontend/src/locales/te.json`: rate cap settings page, enforcement switch and confirmation wording, cap table headings, add-cap messages, and the two hints shown beside the rate field (`capHintDistrict`, `capHintStatewide`).
