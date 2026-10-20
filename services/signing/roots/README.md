# Trust roots

Put the root certificates signatures should chain to here, as `.pem`, `.cer` or `.crt` files (PEM or DER). For the trustees' DSCs that is the Controller of Certifying Authorities (CCA) India root in force when the certificate was issued, for example "CCA India 2022" from https://cca.gov.in (Repository → Root Certificates).

The directory can also be replaced at runtime with `SIGNING_TRUST_ROOTS_DIR`. With no roots, signatures are still checked for integrity and coverage, and every signer is reported as not trusted.
