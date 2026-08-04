#!/usr/bin/env python3
"""Generate a deterministic, dependency-free PDF for Vast worker benchmarking."""

from __future__ import annotations

import pathlib
import sys


def pdf_bytes() -> bytes:
    def stream(content: bytes) -> bytes:
        return (
            f"<< /Length {len(content)} >>\nstream\n".encode()
            + content
            + b"\nendstream"
        )

    objects: list[bytes] = []
    page_ids = [3, 5, 7]
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects.append(
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
    )
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>"
    )
    objects.append(
        stream(
            b"BT /F1 18 Tf 72 710 Td (Oghma Marker benchmark) Tj "
            b"0 -36 Td /F1 11 Tf (Page one tests ordinary selectable text.) Tj "
            b"0 -24 Td (Queue, storage, routing, and OCR remain separate concerns.) Tj ET"
        )
    )
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>"
    )
    objects.append(
        stream(
            b"BT /F1 18 Tf 72 710 Td (Capacity sample) Tj "
            b"0 -36 Td /F1 11 Tf (This deterministic page warms Marker worker processes.) Tj "
            b"0 -24 Td (It is a readiness benchmark, not a cost benchmark.) Tj ET"
        )
    )
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>"
    )
    objects.append(
        stream(
            b"BT /F1 18 Tf 72 710 Td (Final benchmark page) Tj "
            b"0 -36 Td /F1 11 Tf (Measured production decisions use the private corpus.) Tj "
            b"0 -24 Td (Synthetic throughput must not replace corpus evidence.) Tj ET"
        )
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(body)
        output.extend(b"\nendobj\n")

    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n"
        ).encode()
    )
    return bytes(output)


def main() -> None:
    destination = pathlib.Path(
        sys.argv[1] if len(sys.argv) > 1 else "/app/benchmark.pdf"
    )
    destination.write_bytes(pdf_bytes())
    print(f"wrote {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
