# Data-processing agreement checklist

Complete this checklist for the actual deployment and the actual provider
accounts. It is an operational aid, not legal advice.

## Railway

- [ ] Confirm the contracting Railway entity and the plan-level DPA.
- [ ] Record enabled services, regions, support access, build systems, and data
      retention behavior.
- [ ] Verify the workspace, Forgejo, PostgreSQL, and OmniRoute regions from the
      deployed project rather than source configuration alone.
- [ ] Review Railway's subprocessor list, transfer mechanism, security terms,
      breach notice process, deletion terms, and backup behavior.
- [ ] Decide whether Railway sealed variables are appropriate. Keep first-login
      passwords retrievable only until the operator has recorded them.

## AI providers

- [ ] List every connected provider, model family, account type, and endpoint.
- [ ] Confirm whether requests can contain personal data, source code, or
      confidential information.
- [ ] Review DPA, data retention, training use, abuse monitoring, support
      access, region selection, and international transfer clauses.
- [ ] Document any standard contractual clauses or supplementary measures
      required by the operator's legal review.
- [ ] Set provider-side retention and access controls and test key rotation.
- [ ] Tell workspace users that external provider terms apply to the data they
      send through agents.

## Operations and evidence

- [ ] Define purpose, lawful basis, data categories, data subjects, retention,
      and deletion criteria.
- [ ] Assign a controller/processor role for each processing relationship.
- [ ] Document access control, authentication, backups, restoration, incidents,
      and support procedures.
- [ ] Decide whether a DPIA, records of processing, or user notice is required.
- [ ] Review the subprocessor register and data-flow document.
- [ ] Record legal reviewer, decision date, open issues, and next review date.
