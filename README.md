# Contact Form App (Node.js + AWS S3 + RDS)

A modern contact form application built with Node.js and Express.

- File uploads are stored in Amazon S3 using AWS SDK v3.
- Contact data is stored in Amazon RDS (MySQL engine).
- The table is created automatically on the first successful form submission (no manual table creation required).
- Configuration is loaded from AWS Systems Manager Parameter Store, with DB password retrieved from AWS Secrets Manager (no `.env` file needed).
- AWS region is auto-detected from EC2 metadata when deployed, with `us-east-1` as fallback.

## Tech Stack

- Node.js + Express
- AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/client-ssm`, `@aws-sdk/client-secrets-manager`) pinned to `3.990.0`
- Amazon RDS MySQL (`mysql2`)
- Multer (multipart file uploads)
- Modern responsive frontend (HTML/CSS/JS)

## 1) Install Dependencies

```bash
npm install
```

## 2) Local Development (Demo Mode)

To test the UI locally without AWS configuration:

```bash
DEMO_MODE=true npm start
```

This will start the server with the frontend only. API endpoints will return demo messages.

## 3) Configure AWS Parameter Store

Create the following parameters in SSM Parameter Store:

- `/contact-form/S3_BUCKET_NAME`
- `/contact-form/RDS_HOST`
- `/contact-form/RDS_PORT`
- `/contact-form/RDS_USER`
- `/contact-form/RDS_PASSWORD_SECRET_ID` (Secret ID or ARN in Secrets Manager)
- `/contact-form/RDS_DATABASE`
- `/contact-form/KMS_KEY_ID` (optional - KMS key for S3 file encryption)
- `/contact-form/MAX_FILE_SIZE_BYTES` (optional)

**Important:** Store the actual DB password in AWS Secrets Manager. The secret value can be either:

- plain text password, or
- JSON, for example `{ "password": "your-db-password" }`

**KMS Encryption:** If you specify a KMS Key ID, all uploaded files to S3 will be encrypted using that key. You can use:

- A customer-managed KMS key from your account (e.g., `arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012`)
- A key from another account (cross-account key)
- Leave empty to use S3 default encryption

You can override parameter names with these runtime environment variables if needed:

- `SSM_S3_BUCKET_NAME`
- `SSM_RDS_HOST`
- `SSM_RDS_PORT`
- `SSM_RDS_USER`
- `SSM_RDS_PASSWORD_SECRET_ID`
- `SSM_RDS_DATABASE`
- `SSM_KMS_KEY_ID`
- `SSM_MAX_FILE_SIZE_BYTES`

## 4) AWS Region Detection

The app automatically detects the AWS region in this order:

1. `AWS_REGION` environment variable
2. `AWS_DEFAULT_REGION` environment variable
3. EC2 instance metadata (when running on EC2)
4. Defaults to `us-east-1`

## 5) Run the App

```bash
npm run dev
```

or

```bash
npm start
```

Then open `http://localhost:3000`.

## API Endpoints

- `GET /api/health` — health check + DB check
- `POST /api/contact` — accepts `multipart/form-data`
  - fields: `fullName`, `email`, `subject`, `message`
  - optional file field: `attachment`

## Auto Table Creation

On first valid form submission, the app runs:

- `CREATE TABLE IF NOT EXISTS contact_submissions (...)`

This removes manual table setup.

## IAM Requirements

Application credentials/role need:

- `ssm:GetParameters` (for Parameter Store)
- `secretsmanager:GetSecretValue` (for DB password)
- `s3:PutObject` (for file uploads)
- `kms:Decrypt` (if using encrypted Parameter Store values)
- `kms:GenerateDataKey` and `kms:Decrypt` (if using KMS for S3 encryption)
- RDS network/database access
