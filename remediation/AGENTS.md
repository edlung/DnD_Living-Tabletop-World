# Gate Remediation

Opus remediation reports (`OPUS_GATE_<NN>_REMEDIATION.md`, from `OPUS_REMEDIATION_TEMPLATE.md`), one per failed gate. Paths follow `CHECKPOINTS.md`.

- Open only the report for the gate you are working on.
- A report maps each finding to its root cause, the regression test written first, the fix, and the validation evidence. It never declares a gate passed; only an Astra retest can do that.
- Never rewrite a remediation report after its retest started. A further failure gets new entries for the next retest number.
