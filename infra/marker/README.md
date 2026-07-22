# Marker infrastructure boundary

> Status: Active navigation and safety boundary
>
> Last reviewed: 2026-07-22

This directory contains two different generations of Marker work. Do not treat
their presence in one directory as evidence that they are one deployable path.

## Current benchmark tooling

`benchmark-matrix.json`, the profiles, `benchmark-userdata.sh`, and the
`scripts/marker-bench*` and `scripts/package-marker-plus-plus.sh` helpers form
the reproducible July 2026 benchmark harness. Its identities are deliberate:

- the released baseline is `marker-pdf` 1.10.2;
- early Marker++ policy/profile cells use commit `2d66e45`;
- hosted-vision and matched preview cells use commit `72f3776`; and
- diagnostic instrumentation uses commit `e47790d`.

Do not silently update one revision to make the matrix look uniform. A new
candidate needs its own identity, profiles, hashes, and matched result record.
Canonical measurements and the serving decision live in the separate
Marker++ repository named by [`../../docs/README.md`](../../docs/README.md).

Marker++ integration commit `b95312f` carries upstream Marker 2.0 as package
version `2.0.0+markerpp.1`. It is an unmeasured future candidate, not a
replacement for any identity above. Add it to the matrix only with new profile
hashes and a matched quality/performance run.

## Retired AWS provisioning

`setup.sh`, `setup-asg.sh`, the AMI helpers, and the `userdata*.sh` files are
historical AWS-era provisioning surfaces. Current infrastructure documentation
marks the old autoscaling Marker deployment as retired. Do not run these
scripts as a current deployment runbook.

Some of those scripts install open-ended Marker requirements such as
`marker-pdf>=1.0.0` or `marker-pdf[server]`. Since upstream released Marker
2.0.0, a fresh run can install a different major pipeline from the July 1.10.2
benchmark. `Dockerfile.marker` remains pinned to 1.10.2, but that pin does not
make the retired userdata paths comparable.

The application currently defaults Marker OCR off, and Jenkins explicitly
forces it off in deployed containers. Current extraction behavior belongs in
the [import-worker runbook](../../docs/operations/import-worker.md).
