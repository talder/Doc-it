# Incident Response Plan — Doc-it

**Version:** 1.0
**Last reviewed:** 2025-07-14
**Next review:** 2026-01-14 (every 6 months)
**Owner:** System Administrator

---

## 1. Purpose & Scope

This plan establishes procedures for detecting, responding to, and recovering from security incidents affecting the Doc-it application and its data. It applies to all personnel with access to the system and satisfies the incident-handling requirements of the EU NIS2 Directive (Article 21 §2(b)).

## 2. Roles & Responsibilities

- **Incident Commander (IC):** Coordinates response, makes escalation decisions, and owns communication.
- **System Administrator:** Performs technical investigation, containment, and recovery actions.
- **Data Protection Officer (DPO):** Assesses personal-data impact and liaises with supervisory authorities if required.
- **Management:** Authorises resources, approves external communications, and ensures regulatory obligations are met.

## 3. Severity Classification

| Level | Name | Description | Response Time |
|-------|------|-------------|---------------|
| SEV-1 | Critical | Active data breach, ransomware, or complete service outage | Immediate (≤ 1 h) |
| SEV-2 | High | Successful unauthorised access, partial outage, or data integrity issue | ≤ 4 h |
| SEV-3 | Medium | Repeated brute-force attempts, single-account compromise, or suspicious activity | ≤ 24 h |
| SEV-4 | Low | Policy violation, minor misconfiguration, or failed attack with no impact | ≤ 72 h |

## 4. Detection & Alerting

Doc-it generates automated security alerts for the following events (see `src/lib/incident.ts`):

- **Account lockout** — triggered after repeated failed login or TOTP attempts.
- **Repeated login failures** — email sent to admin when ≥ 3 consecutive failures occur for the same account.
- **Rate-limit exceeded** — logged when an IP exceeds the request threshold.
- **Session anomalies** — sessions are invalidated after 1 hour of inactivity.

All alerts are delivered to the configured admin email address via SMTP.

## 5. Response Procedures

### 5.1 Identification
1. Receive alert or report of suspicious activity.
2. Verify the event is a genuine security incident (not a false positive).
3. Assign a severity level (Section 3) and designate an Incident Commander.

### 5.2 Containment
1. **Immediate:** Disable compromised accounts; revoke affected sessions.
2. **Short-term:** Block offending IP addresses at the network/firewall level.
3. **Long-term:** Apply patches or configuration changes to prevent recurrence.

### 5.3 Eradication
1. Identify root cause (e.g. vulnerability, stolen credential, misconfiguration).
2. Remove malicious artefacts (files, accounts, scheduled tasks).
3. Verify no persistence mechanisms remain.

### 5.4 Recovery
1. Restore affected data from the latest encrypted backup (`.tar.gz.enc` files in `backups/`).
2. Validate data integrity after restoration.
3. Re-enable services and monitor closely for 48 hours.

### 5.5 Lessons Learned
1. Conduct a post-incident review within 5 business days.
2. Document timeline, impact, root cause, and remediation actions.
3. Update this plan and related controls as needed.

## 6. Communication & Notification

### Internal
- Notify the Incident Commander and relevant personnel immediately upon detection.
- Provide status updates at least every 4 hours during active incidents (SEV-1/SEV-2).

### External / Regulatory (NIS2 Article 23)
- **Early warning:** Notify the competent authority (CSIRT) within **24 hours** of becoming aware of a significant incident.
- **Incident notification:** Submit a detailed notification within **72 hours** including initial assessment, severity, and impact.
- **Final report:** Deliver a comprehensive report within **1 month** covering root cause, mitigation measures, and cross-border impact (if any).

### Data Breach (GDPR)
- If personal data is affected, the DPO must assess whether notification to the supervisory authority (within 72 hours) and/or data subjects is required under GDPR Articles 33–34.

## 7. Review Schedule

This document must be reviewed and updated:

- Every **6 months** on a regular cycle.
- After every **SEV-1 or SEV-2** incident.
- After any **significant change** to the application architecture or infrastructure.
- After any **relevant regulatory update**.

All reviews must be documented with the reviewer's name and date.

---

*End of Incident Response Plan*
