# Public / private repository contract

## starport-protocol — intended public
Specifications, schemas, public API interfaces, implemented SDK/node/contract source, documented examples and reproducible verification methods. No API credentials, internal account data, private user orders or operator secrets. Public design manifests contain non-secret addresses and disabled activation states, not operational credentials.

## starport-app — intended private
Consumer UI, authenticated API, database/indexing pipeline, operational workers, notification delivery, API-key management and deployment configuration. These are maintained separately and are not included in this public repository. Inclusion in the product design does not imply every feature is implemented or enabled.

Contract funds and signing boundaries must be inspectable regardless of app privacy. A private GitHub repository does not replace authentication, authorization, secret management or contract review.

Public interfaces are versioned. App releases pin a reviewed protocol version. Breaking schemas require a version change; compatibility is not inferred from matching filenames.
