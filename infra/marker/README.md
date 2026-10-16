# Marker infrastructure boundary

> Status: Active navigation and safety boundary
>
> Last reviewed: 2026-10-06

This directory holds two unrelated things. Don't read their shared location as
evidence that they are one deployable path.

## Direct Marker server

`server.py` and `converter_pool.py` are the synchronous `POST /marker/upload`
API that `src/lib/marker/ocr.ts` calls when `MARKER_API_URL` is set.
`Dockerfile.marker` at the repository root packages them with released
`marker-pdf` 1.10.2. `test_server.py` and `test_converter_pool.py` are pytest
files (`pip install -r requirements-dev.txt && pytest infra/marker`); they are
not part of `npm run test:marker`.

The paid serverless GPU path does not use this server. It lives in
[`../runpod-marker/`](../runpod-marker/) and [`../vast-marker/`](../vast-marker/).

## July 2026 benchmark harness

`benchmark-matrix.json`, the profiles, the vLLM manifests,
`benchmark-userdata.sh`, and the `scripts/marker-bench*`,
`scripts/marker-aws-session.py`, `scripts/compare-marker-outputs.py` and
`scripts/package-marker-plus-plus.sh` helpers form the reproducible July 2026
benchmark harness. `scripts/marker-bench.py` hashes these files by repository
path into each run manifest, so moving or renaming them breaks comparison with
recorded runs. Leave them where they are.

The harness identities are deliberate:

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

The AWS-era EC2/ASG/AMI scripts (`setup.sh`, `setup-asg.sh`, `bake-ami.sh`,
`update-lt-ami.sh`, `userdata*.sh`) were removed on 2026-10-06. The autoscaling
Marker deployment they built is retired and they installed open-ended Marker
versions that are not comparable with the benchmark. Recover them from git
history if they are ever needed as reference.

The application defaults Marker OCR off, and Jenkins explicitly forces it off
in deployed containers. Current extraction behaviour belongs in the
[import-worker runbook](../../docs/operations/import-worker.md).
