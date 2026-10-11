# Gate Handoffs

Current review requests use `OPUS_REVIEW_GATE_<NN>_REQUEST.md` for fresh Opus 5.5 xhigh review.
Historical `ASTRA_GATE_<NN>_REQUEST.md` requests remain preserved. Use `HANDOFF_TEMPLATE.md`; paths per `CHECKPOINTS.md`. A request names the exact revision under review and the exact output report path.

- Open only the handoff for the gate you are working on; do not load this directory wholesale.
- Never edit a request after review started, except to turn it into a RETEST request as `AGENT_WORKFLOW.md` (Retest Rule) describes.
- Reviews go to `reviews/`, remediation to `remediation/`; neither belongs here.
