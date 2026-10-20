# Security policy

The dashboard holds personal and financial data for Proud Indian's volunteers, donors and payees, so we take reports seriously and thank everyone who sends one.

## Supported versions

Only the current `master` branch, which is what runs in production, receives security fixes. There are no released versions to backport to.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. If you can't use GitHub, email somu@proudindian.ngo instead. Do not open a public issue, pull request or discussion for a security problem.

Include what you can of:

- the affected route, server function or API endpoint
- steps to reproduce, or a proof of concept
- the impact you expect, such as data exposed or a permission bypassed
- any accounts, roles or permissions the attack needs

We aim to acknowledge a report within three working days and to share an assessment within ten. We will keep you updated until it is fixed and, if you'd like, credit you in the advisory.

## Scope

In scope:

- this repository's code, including the web app, Zero queries and mutators, server functions, API routes and background jobs
- authentication, sessions, sign-up links and role or permission checks
- exposure of personal, donor or financial data, uploads and generated documents

Out of scope:

- vulnerabilities in third-party services the dashboard uses (Resend, WhatsApp, Cloudflare R2, Immich, Razorpay and others); report those to the vendor
- denial of service, volumetric or rate-limit testing
- social engineering or phishing of Proud Indian volunteers or staff
- findings that need a compromised device or browser
- missing hardening headers or best-practice notes without a demonstrated impact

## Testing guidelines

Test against a local instance where you can (see the [README](README.md) to run one). If you test the production dashboard, use only accounts you own, do not read, change or delete other people's data, and stop as soon as you have shown the issue. Good-faith research that follows these guidelines is welcome, and we will not pursue it.
