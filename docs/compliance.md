# Compliance Notes (Authoritative)

This document records the legal and regulatory assumptions used in the HonestLenses
commerce and prescription verification architecture. It exists to anchor engineering
decisions to primary legal sources and prevent accidental non-compliance during refactors.

Governing Law:
- Fairness to Contact Lens Consumers Act (FCLCA), 15 U.S.C. §§ 7601–7610
- FTC Contact Lens Rule, 16 CFR Part 315
Authoritative text: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-315

Prescription Verification Requirements:
Per 16 CFR § 315.5(a), when a seller seeks verification of a contact lens prescription,
the seller must provide the prescriber with:
1. Patient’s full name and address
2. Contact lens power, manufacturer, base curve (or designation), and diameter when appropriate
3. Quantity of lenses ordered
4. Date of patient request
5. Date and time of verification request
6. Name and contact information of the seller’s representative

Architectural Interpretation:
The obligation applies when seeking verification, not universally. The regulation governs
the contents of the verification request, the timing and method of verification, and record
retention. It does not require patient address at account creation, permanent storage of
patient address outside verification context, or address collection for prescription uploads
that do not trigger verification. This interpretation follows the conditional language of
§ 315.5 (“when seeking verification”) and aligns with FTC enforcement focus on verification
failures rather than data over-collection.

Data Collection Policy:
Accounts require only email-based authentication (magic link). No DOB or address is required
at account creation. Patients require name; DOB is collected only when medically relevant.
Address is not required at patient creation. Prescriptions require Rx parameters, track source
(manual entry vs upload), and track verification status explicitly. Verification requests
require patient address when verification is initiated. Address is stored as a snapshot of
what was transmitted to the prescriber and is not required to persist on the patient record
outside the verification context. Timestamps, method, and outcome are retained.

Conditional Enforcement Rule (Engineering Invariant):
IF the seller initiates prescription verification, the system must require patient full name,
patient address, and prescription parameters. If verification is not initiated, patient
address collection is not required. This invariant is enforced at the verification boundary
and nowhere earlier in the system.

Record Retention:
Verification records are retained in accordance with 16 CFR § 315.3 and internal audit and
dispute resolution requirements.

Non-Goals:
The system does not attempt to automatically determine patient majority status, auto-transfer
patient records at age 18, or infer patient address from shipping data. These scenarios are
handled manually or by future workflows if required.

Change Control:
Any changes affecting verification payload structure, required patient fields, or verification
timing or method must be reviewed against 16 CFR Part 315 and this document. This document must
be updated alongside any such change.
