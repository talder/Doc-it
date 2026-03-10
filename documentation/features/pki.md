# PKI / Certificate Manager

The Certificate Manager provides a self-contained Public Key Infrastructure (PKI) tool built into the admin panel. It lets you generate keys, create and sign certificates, manage a CA hierarchy, and maintain CSR and CRL records — without leaving doc-it.

---

## Overview

The Certificate Manager is organised into seven tabs:

| Tab | Purpose |
|---|---|
| **Certificates** | Browse and manage all certificates in a CA-chain tree view |
| **Keys** | Generate or import private keys |
| **CSRs** | Create and track Certificate Signing Requests |
| **CRLs** | Generate and download Certificate Revocation Lists |
| **Templates** | Define reusable certificate profiles |
| **Import** | Import existing certificates and keys from files |
| **Create** | Create a new self-signed root CA |

---

## Private Keys

### Generating a key

1. Open **Keys** tab → click **Generate Key**.
2. Fill in:

| Field | Options |
|---|---|
| Name | Friendly label (internal use) |
| Algorithm | `RSA-2048`, `RSA-4096`, `EC P-256`, `EC P-384`, `EC P-521`, `Ed25519` |
| Comment | Optional note |

Keys are stored encrypted at rest.

### Importing a key

Paste or upload a PEM-encoded private key in the **Import** tab.

---

## CSR Creation (XCA-style)

The CSR creation form mirrors XCA's tabbed workflow. It is accessible from the **CSRs** tab → **+ New CSR**.

### Source tab

| Field | Description |
|---|---|
| Template | Optional: pick a saved template and click **Apply Subject**, **Apply Extensions**, or **Apply All** to pre-fill the form |
| unstructuredName | Optional attribute included in the CSR |
| challengePassword | Optional CSR challenge password |
| Signing mode | **CSR only** — produce a `.csr` file; **Self-signed** — sign with the selected key immediately; **Sign with CA** — sign the request with an existing CA certificate in the store |
| Serial (self-signed) | Manual serial number when signing directly |
| CA (CA-signed) | Select the issuing CA from the certificate store |
| Signature algorithm | `SHA-256`, `SHA-384`, or `SHA-512` |

### Subject tab

| Field | Description |
|---|---|
| Internal Name | Friendly label stored in doc-it only (not in the certificate) |
| CN | Common Name |
| Email | emailAddress attribute |
| O | Organisation |
| OU | Organisational Unit |
| C | Country (2-letter ISO code) |
| ST | State / Province |
| L | Locality |
| Private Key | Select the key to associate with this CSR |

**Subject Alternative Names (SANs)**

Add one SAN at a time using the type selector (`DNS`, `IP`, `email`, `URI`, `otherName`) and a value field. Existing SANs appear in a table with individual delete buttons.

### Extensions tab

| Field | Description |
|---|---|
| Basic Constraints type | `Not defined`, `End entity`, or `CA` |
| Path Length | Maximum CA chain depth (CA only) |
| Critical | Mark Basic Constraints as critical |
| Subject Key Identifier | Include SKI extension |
| Authority Key Identifier | Include AKI extension |
| Validity | Days; quick-pick buttons: **1 y**, **2 y**, **3 y**, **5 y** |
| CRL Distribution Point | URL of the CRL endpoint |
| OCSP / AIA | URL of the OCSP responder |

### Key Usage tab

Two side-by-side panels, each with a **Critical** checkbox.

**Key Usage flags:**

| Flag | OID meaning |
|---|---|
| Digital Signature | `digitalSignature` |
| Non-Repudiation | `nonRepudiation` |
| Key Encipherment | `keyEncipherment` |
| Data Encipherment | `dataEncipherment` |
| Key Agreement | `keyAgreement` |
| Key Cert Sign | `keyCertSign` |
| CRL Sign | `cRLSign` |
| Encipher Only | `encipherOnly` |
| Decipher Only | `decipherOnly` |

**Extended Key Usage flags:**

| Flag | OID |
|---|---|
| TLS Server Auth | `serverAuth` |
| TLS Client Auth | `clientAuth` |
| Code Signing | `codeSigning` |
| Email Protection | `emailProtection` |
| Time Stamping | `timeStamping` |
| OCSP Signing | `ocspSigning` |
| MS Individual Code | `msCodeInd` |
| MS Commercial Code | `msCodeCom` |
| MS CTL Sign | `msCTLSign` |
| MS SGC | `msSGC` |
| MS EFS | `msEFS` |
| Netscape SGC | `nsSGC` |

---

## Certificate Templates

Templates let you save a common certificate profile and apply it to new CSRs with one click.

1. Open the **Templates** tab → **+ New Template**.
2. Fill in the three sub-tabs: **Subject**, **Extensions**, **Key Usage** (same fields as the CSR form minus signing options).
3. Click **Save Template**.

To apply a template when creating a CSR, select it in the **Source** tab and choose which sections to copy over.

---

## Certificate Operations

From the **Certificates** tab, select any certificate in the tree to perform:

| Action | Description |
|---|---|
| **Export** | Download in PEM, DER, PKCS7, or PKCS12 format |
| **Revoke** | Mark the certificate as revoked with a reason (keyCompromise, affiliationChanged, superseded, etc.) |
| **Renew** | Issue a new certificate with the same subject and extended validity |
| **Delete** | Remove from the store permanently |

---

## CRL Generation

1. Open the **CRLs** tab.
2. Select the CA.
3. Click **Generate CRL**.
4. Download the resulting CRL file.

---

## Importing Certificates

The **Import** tab supports:

- **PEM** — paste or upload `.pem` / `.crt` / `.cer` text
- **DER** — binary X.509 file
- **PKCS7** — certificate chain (`.p7b`)
- **PKCS12** — certificate + key bundle (`.pfx` / `.p12`); enter the passphrase if encrypted
- **Drag-and-drop** — drop any supported file onto the import drop zone

---

## Certificate Tree

The **Certificates** tab displays certificates in a hierarchical tree that mirrors the CA chain. Root CAs are top-level nodes; intermediate CAs and end-entity certificates appear as children under their issuer. Click the collapse chevron to hide a subtree.

---

## Storage

Certificate store data is managed by the PKI library and stored in the SQLite KV store under the `certificates` namespace. Private keys are stored encrypted using the instance's field encryption key (`SECRET_FIELD_KEY` / `secret-key.json`).
