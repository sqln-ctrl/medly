# Smart Medicine Management App — SRS

## Purpose

This application helps patients manage scheduled medications and confirm the dose events they are taking, skipping, or missing. It is designed as a reminder tool, not a medical decision-support system.

## Core user journeys

1. Register or log in.
2. Add medications and preserve the prescriber instruction text exactly as entered.
3. Confirm a schedule that includes daily, weekday-based, and interval-based patterns.
4. View today and upcoming doses.
5. Record whether a dose was taken, skipped, or missed.
6. Review adherence history.
7. Receive local reminders for active schedules.

## Safety constraints

- Do not suggest dosing decisions or provide medical advice.
- Show neutral guidance for unclear or ambiguous instructions.
- Require explicit confirmation before any reminder is activated.
- Treat all patient data as sensitive and never log it in plaintext.

## Functional scope for Phase 0

The initial repository skeleton must provide a runnable backend and mobile app with a health-check contract that supports a later end-to-end connection.

## Functional scope for Phase 1

The next slice adds authenticated patient profile management and medication tracking. The backend must allow a signed-in patient to read or update their timezone, list medications, and create medication records bound to their patient account. Every patient-scoped endpoint must enforce ownership checks and maintain the instruction text exactly as provided.

## Functional scope for Phase 2

Patients can create daily, weekly, or interval-based schedules for their medications, review the details, and explicitly confirm a schedule before it is enabled. The Today screen shows dose occurrences for today and the next seven days, calculated from the patient's IANA timezone. Dose occurrences are derived from schedule rules; a missing user-reported event is not shown as a clinical outcome. Browser and device notification delivery remain out of scope for this phase.

## Functional scope for Phase 3

Patients can record a scheduled dose as taken, skipped, or missed, and review their dose-report history. These are user-reported events only; the system does not infer missed doses or clinical outcomes.
