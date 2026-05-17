---
id: NNNN
title: <short imperative title>
status: draft
authors:
  - <name or @handle>
date_proposed: YYYY-MM-DD
date_accepted:
fcp_start:
fcp_end:
implementation_pr:
supersedes:
superseded_by:
tags: []
---

# RFC-{{id}}: {{title}}

## Summary

<One short paragraph (3–5 sentences) explaining what this RFC proposes.
A reader should be able to decide whether the rest of the document is
relevant to them from this section alone.>

## Motivation

<Why are we doing this? What problem does it solve? What use cases does it
unlock? What is the expected outcome?

This section justifies the cost of changing the protocol. A reviewer who
disagrees with the motivation will reject the RFC no matter how good the
design is — make it strong.>

## Guide-level explanation

<Explain the proposal as if it were already accepted and you were teaching
it to a new contributor or integrator. Include:

- New terminology, framed as a glossary entry.
- A walkthrough of how the change is used (request/response example,
  CLI session, code snippet — whichever is appropriate).
- Discuss what existing developers need to do differently.

Treat this section as "what the docs would say." Examples are mandatory.>

## Reference-level explanation

<Detailed technical specification. Include:

- Wire format changes (TypeSpec models, schemas, headers).
- Algorithms, state transitions, edge cases.
- Interaction with existing features.
- Error codes introduced or modified (with `ERR-…` references).
- Migration of stored data, if any.
- Threat-model deltas.

A second-time reader should be able to *implement* the proposal from this
section alone.>

## Drawbacks

<Why should we *not* do this? Be honest. Examples:

- Implementation cost.
- Operational complexity.
- Backwards-incompatibility.
- Confusion with existing terminology.
- Security/privacy regressions.

If you cannot name any, write "I couldn't think of any drawbacks — please
challenge me." Reviewers will provide some.>

## Rationale and alternatives

<Why is *this* design the best in the space of possible designs?

- What other designs were considered? Why were they rejected?
- What is the impact of not doing this at all?
- Was a simpler design ruled out? On what grounds?

The strongest RFCs explicitly list 2–3 rejected alternatives.>

## Prior art

<Discuss how other projects, standards, or RFCs handle this problem:

- IETF / W3C standards (link to the specific section).
- Comparable OSS projects (Rust, Ember, Kubernetes, etc.).
- Academic papers (if relevant).

Cite specific URLs. If you searched and found nothing, say so — it tells
reviewers you looked.>

## Unresolved questions

<What parts of the design do you expect to resolve through the RFC process
before merging? What parts to resolve during implementation after merging?
What related issues are explicitly out of scope?>

- [ ] ...
- [ ] ...

## Future possibilities

<What follow-on work does this enable but explicitly defer? Listing them
here helps reviewers separate "this RFC's scope" from "where this could
eventually lead." Items here are *not* commitments.>

- ...

## References

- <External standards, prior RFCs, related ADRs>
