# Admin — Settings

The **Settings** tab (`/admin?tab=settings`) contains system-wide configuration, currently SMTP email settings.


---

## SMTP Configuration

Configure outbound email for notifications.

| Field | Description | Example |
|---|---|---|
| Host | SMTP server address | `smtp.gmail.com` |
| Port | SMTP port | `587` (STARTTLS) or `465` (TLS) |
| Secure | Use TLS directly (true for port 465) | `false` |
| Username | SMTP authentication username | `noreply@example.com` |
| Password | SMTP authentication password | (write-only) |
| From address | Sender shown to email recipients | `doc-it <noreply@example.com>` |
| Admin email | Destination for system alerts | `admin@example.com` |

Click **Save** to apply. Changes take effect immediately.

### Common Providers

**Gmail**
```
Host: smtp.gmail.com  Port: 587  Secure: false
User: you@gmail.com   Pass: (App Password)
```

**SendGrid**
```
Host: smtp.sendgrid.net  Port: 587  Secure: false
User: apikey            Pass: (SendGrid API Key)
```

**AWS SES**
```
Host: email-smtp.us-east-1.amazonaws.com  Port: 587  Secure: false
User: (SMTP Access Key ID)   Pass: (SMTP Secret)
```

---

## Audit Settings

See [Admin — Audit](audit.md) for the audit logging configuration which lives in the Audit tab.
