# Understanding server.js - A Beginner's Guide

This document explains how the server.js code works and why specific IAM permissions are needed.

---

## **SECTION 1: Import AWS Services** (Lines 1-12)

```javascript
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
```

**What this does:** Loads AWS SDK tools to talk to:

- **S3** - for uploading files
- **SSM (Parameter Store)** - for getting configuration
- **Secrets Manager** - for getting the database password

**Why IAM policy needed:** Without permissions, these commands will be rejected by AWS.

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 2: Define Parameter Store Paths** (Lines 18-31)

```javascript
const parameterNames = {
  s3BucketName:
    process.env.SSM_S3_BUCKET_NAME || "/contact-form/S3_BUCKET_NAME",
  rdsHost: process.env.SSM_RDS_HOST || "/contact-form/RDS_HOST",
  rdsPort: process.env.SSM_RDS_PORT || "/contact-form/RDS_PORT",
  rdsUser: process.env.SSM_RDS_USER || "/contact-form/RDS_USER",
  rdsPasswordSecretId:
    process.env.SSM_RDS_PASSWORD_SECRET_ID ||
    "/contact-form/RDS_PASSWORD_SECRET_ID",
  rdsDatabase: process.env.SSM_RDS_DATABASE || "/contact-form/RDS_DATABASE",
  kmsKeyId: process.env.SSM_KMS_KEY_ID || "/contact-form/KMS_KEY_ID",
  maxFileSizeBytes:
    process.env.SSM_MAX_FILE_SIZE_BYTES || "/contact-form/MAX_FILE_SIZE_BYTES",
};
```

**What this does:** Tells the app where to find configuration in Parameter Store.

**Example:** `/contact-form/S3_BUCKET_NAME` is the path you'll create in AWS Parameter Store

**These are the 8 parameters you create in AWS!**

### Parameters to Create in AWS Parameter Store:

1. `/contact-form/S3_BUCKET_NAME` - Your S3 bucket name for file uploads
2. `/contact-form/RDS_HOST` - RDS database endpoint (e.g., `mydb.abc123.us-east-1.rds.amazonaws.com`)
3. `/contact-form/RDS_PORT` - Database port (typically `3306` for MySQL)
4. `/contact-form/RDS_USER` - Database username
5. `/contact-form/RDS_PASSWORD_SECRET_ID` - The Secret ID/ARN from AWS Secrets Manager
6. `/contact-form/RDS_DATABASE` - Database name
7. `/contact-form/KMS_KEY_ID` - KMS key for S3 encryption (optional)
8. `/contact-form/MAX_FILE_SIZE_BYTES` - Max upload size in bytes (optional, defaults to 10MB)

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 3: Get AWS Region** (Lines 41-61)

```javascript
async function getAwsRegion() {
  if (process.env.AWS_REGION) return process.env.AWS_REGION;

  // Try EC2 metadata service
  const response = await fetch(
    "http://169.254.169.254/latest/meta-data/placement/region",
    { signal: AbortSignal.timeout(2000) },
  );

  return "us-east-1"; // Default
}
```

**What this does:**

1. Checks environment variable first
2. If on EC2, asks EC2 "what region am I in?"
3. Falls back to `us-east-1`

**Why:** AWS services need to know which region to talk to.

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 4: Fetch Configuration from Parameter Store** (Lines 64-120)

```javascript
async function loadRuntimeConfigFromParameterStore() {
  const awsRegion = await getAwsRegion();

  // Create SSM client
  const ssmClient = new SSMClient({ region: awsRegion });

  // Ask Parameter Store for all values
  const response = await ssmClient.send(
    new GetParametersCommand({
      Names: allNames,
      WithDecryption: true,
    })
  );
```

**What this does:**

- Line 68: Creates connection to Parameter Store
- Lines 84-88: **THIS IS WHERE `ssm:GetParameters` PERMISSION IS NEEDED**
- Sends request to AWS: "Give me these 8 parameters"

**Why IAM policy needed:** Without `ssm:GetParameters` permission, line 84 will fail with "Access Denied"

Returns configuration object with all your settings.

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 5: Get Database Password from Secrets Manager** (Lines 146-160)

```javascript
async function loadDbPasswordFromSecretsManager(secretClient, secretId) {
  const response = await secretClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );

  if (response.SecretString) {
    return extractPasswordFromSecretText(response.SecretString);
  }
```

**What this does:**

- Line 148: **THIS IS WHERE `secretsmanager:GetSecretValue` PERMISSION IS NEEDED**
- Asks Secrets Manager: "Give me the password for this secret ID"

**Why separate from Parameter Store:** Secrets Manager is more secure for sensitive data like passwords.

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 6: Initialize AWS Clients in Production Mode** (Lines 196-203)

```javascript
// Production mode - full AWS integration
const config = await loadRuntimeConfigFromParameterStore();

// Initialize AWS clients
const s3Client = new S3Client({ region: config.awsRegion });
const secretsClient = new SecretsManagerClient({ region: config.awsRegion });
const rdsPassword = await loadDbPasswordFromSecretsManager(
  secretsClient,
  config.rdsPasswordSecretId,
);
```

**What this does:**

- Line 197: Calls Parameter Store (needs `ssm:GetParameters`)
- Line 200: Creates S3 connection
- Line 201: Creates Secrets Manager connection
- Lines 202-205: Calls Secrets Manager to get password (needs `secretsmanager:GetSecretValue`)

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 7: Connect to RDS Database** (Lines 207-216)

```javascript
const dbPool = mysql.createPool({
  host: config.rdsHost, // From Parameter Store
  port: config.rdsPort, // From Parameter Store
  user: config.rdsUser, // From Parameter Store
  password: rdsPassword, // From Secrets Manager
  database: config.rdsDatabase, // From Parameter Store
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
```

**What this does:** Creates connection to MySQL RDS database.

**Why no IAM permission here:** RDS connections use username/password, not IAM. But your **Security Groups** must allow traffic!

**Security Group Requirements (4-tier architecture):**

- **EC2 Instance Connect Endpoint SG:** No inbound, outbound SSH (22) to VPC CIDR for management access
- **ALB Security Group:** Allows HTTP/HTTPS (80/443) from internet (0.0.0.0/0), outbound to anywhere
- **EC2 Security Group:** Allows inbound port **3000** from ALB SG, SSH (22) from EC2 Instance Connect SG, allows **outbound** all traffic to 0.0.0.0/0
- **RDS Security Group:** Allows **inbound** MySQL (3306) from EC2 Security Group only

**Traffic Flow:**

- **User Traffic:** Internet → ALB (80/443) → EC2 (3000) → RDS (3306)
- **Management:** EC2 Instance Connect Endpoint → EC2 (SSH 22)

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **SECTION 8: Upload File to S3** (Lines 296-315)

```javascript
if (req.file) {
  fileKey = buildS3ObjectKey(req.file.originalname);

  const uploadParams = {
    Bucket: config.s3BucketName,
    Key: fileKey,
    Body: req.file.buffer,
    ContentType: req.file.mimetype || "application/octet-stream",
  };

  // Add KMS encryption if key is configured
  if (config.kmsKeyId) {
    uploadParams.ServerSideEncryption = "aws:kms";
    uploadParams.SSEKMSKeyId = config.kmsKeyId;
  }

  await s3Client.send(new PutObjectCommand(uploadParams));
```

**What this does:**

- Lines 298-305: Prepares file for upload
- Lines 308-311: **If you set a KMS key, adds encryption** (needs `kms:GenerateDataKey`)
- Line 313: **THIS IS WHERE `s3:PutObject` PERMISSION IS NEEDED**

**Why IAM policy needed:** Without `s3:PutObject`, line 313 fails with "Access Denied"

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

## **AWS Resource Creation Order**

Before you can run this application, you need to create AWS resources in the correct order:

### **Step 1: Configure Security Groups**

You need to create **4 Security Groups** for proper network isolation:

- Go to **AWS EC2** console → **Security Groups**

#### **1. EC2 Instance Connect Endpoint Security Group** (Management access)

- **Name:** `contact-form-eice-sg`
- **Inbound Rules:**
  - None (no inbound traffic needed)
- **Outbound Rules:**
  - Allow SSH (port 22) to VPC CIDR (e.g., 10.0.0.0/16) - for connecting to EC2 instances

#### **2. ALB Security Group** (Internet-facing)

- **Name:** `contact-form-alb-sg`
- **Inbound Rules:**
  - Allow HTTP (port 80) from anywhere (0.0.0.0/0)
  - Allow HTTPS (port 443) from anywhere (0.0.0.0/0)
- **Outbound Rules:**
  - Allow all traffic to 0.0.0.0/0 (default - allows ALB to forward traffic to EC2)

#### **3. EC2 Security Group** (Application tier)

- **Name:** `contact-form-ec2-sg`
- **Inbound Rules:**
  - Allow Custom TCP (port 3000) from ALB Security Group
  - Allow SSH (port 22) from EC2 Instance Connect Endpoint Security Group (for management access)
- **Outbound Rules:**
  - Allow all traffic to 0.0.0.0/0 (for RDS access, AWS API calls to S3, SSM, Secrets Manager)

#### **4. RDS Security Group** (Database tier)

- **Name:** `contact-form-rds-sg`
- **Inbound Rules:**
  - Allow MySQL (port 3306) from EC2 Security Group only
- **Outbound Rules:**
  - Default (no specific outbound needed)

**Save all Security Group IDs** - you'll need them for EC2 Instance Connect, ALB, EC2, and RDS setup.

**Traffic Flow:**

- **User Traffic:** Internet → ALB (80/443) → EC2 (3000) → RDS (3306)
- **Management Access:** EC2 Instance Connect Endpoint → EC2 (SSH port 22)

**Note:** Your Node.js app listens on port 3000, so EC2 must allow port 3000 from ALB (not 80/443).

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 2: Create RDS Database**

- Go to **AWS RDS** console
- Create a MySQL database instance
- **Attach the RDS Security Group from Step 1**
- **Save these values** (you'll need them later):
  - **RDS endpoint** (e.g., `mydb.abc123.us-east-1.rds.amazonaws.com`) - This is the hostname to connect
  - **Port** (default: `3306`) - MySQL port
  - **Master username** (e.g., `admin`) - Database user
  - **Master password** (you set this during creation) - Will go in Secrets Manager
  - **Database name** (e.g., `contactformdb`) - The initial database name you create

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 3: Create S3 Bucket**

- Go to **AWS S3** console
- Create a new bucket for file uploads
- **Save the bucket name** - just the name, not the ARN
  - Example: `my-contact-form-uploads` ✅
  - NOT: `arn:aws:s3:::my-contact-form-uploads` ❌
- Optionally enable versioning and encryption

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 4: Create KMS Key (OPTIONAL - Skip if Not Needed)**

**Do you need this?**

- ✅ **Skip this step** if you're okay with default S3 encryption
- ⚠️ **Only create if** you need custom encryption keys for compliance

**If you decide to use KMS:**

- Go to **AWS KMS** console
- Create a symmetric encryption key
- **Save the Key ID or ARN** (for encrypting S3 uploads)

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 5: Create Secrets Manager Secret**

- Go to **AWS Secrets Manager** console
- Store the RDS password from Step 2
- **Save the Secret ARN** (e.g., `arn:aws:secretsmanager:us-east-1:123456789012:secret:contact-form/rds-password-AbCdEf`)

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 6: Create Parameter Store Values**

- Go to **AWS Systems Manager** → **Parameter Store**
- **Create these 6 REQUIRED parameters** using values from Steps 2-5:
  1. `/contact-form/S3_BUCKET_NAME` → Your S3 bucket **name only** (e.g., `my-contact-form-uploads`)
  2. `/contact-form/RDS_HOST` → Your RDS **endpoint** from Step 2 (e.g., `mydb.abc123.us-east-1.rds.amazonaws.com`)
  3. `/contact-form/RDS_PORT` → `3306` (the port number)
  4. `/contact-form/RDS_USER` → Your database username from Step 2 (e.g., `admin`)
  5. `/contact-form/RDS_PASSWORD_SECRET_ID` → The secret **name** from Step 5 (e.g., `contact-form/rds-password`)
  6. `/contact-form/RDS_DATABASE` → Your database **name** from Step 2 (e.g., `contactformdb`)

- **OPTIONAL parameters** (you can skip these):
  - `/contact-form/KMS_KEY_ID` → Only if you want KMS encryption (from Step 4)
  - `/contact-form/MAX_FILE_SIZE_BYTES` → Default is 10MB if not set (e.g., `10485760` for 10MB)

**How to create each parameter:**

1. Click "Create parameter"
2. Name: Enter the parameter name exactly (e.g., `/contact-form/S3_BUCKET_NAME`)
3. Type: Choose "String" (not SecureString, to keep it simple)
4. Value: Enter your actual value (bucket name, endpoint, etc.)
5. Click "Create parameter"
6. Repeat for all 6 required parameters

**Important:**

- ✅ Use **simple names/values** (e.g., `my-bucket-name`, not ARNs)
- ✅ Parameter names are **case-sensitive**
- ✅ Create in the **same region** as your EC2 instance
- ⚠️ **Watch out for trailing spaces!** Highlight all text in the value field to check for invisible spaces at the end
- ⚠️ **Double-check spelling** - typos will cause runtime errors (e.g., `allas/aws/ssm` instead of `alias/aws/ssm`)
- ⚠️ **KMS is optional** - if you don't need custom encryption, skip `/contact-form/KMS_KEY_ID` entirely

**Quick Reference - What Values Go Where:**

| From Step | What You Saved | Parameter Store Path                   | Example Value                             |
| --------- | -------------- | -------------------------------------- | ----------------------------------------- |
| Step 3    | Bucket name    | `/contact-form/S3_BUCKET_NAME`         | `my-contact-form-uploads`                 |
| Step 2    | RDS endpoint   | `/contact-form/RDS_HOST`               | `mydb.abc123.us-east-1.rds.amazonaws.com` |
| Step 2    | Port           | `/contact-form/RDS_PORT`               | `3306`                                    |
| Step 2    | Username       | `/contact-form/RDS_USER`               | `admin`                                   |
| Step 5    | Secret name    | `/contact-form/RDS_PASSWORD_SECRET_ID` | `contact-form/rds-password`               |
| Step 2    | Database name  | `/contact-form/RDS_DATABASE`           | `contactformdb`                           |

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 7: Set up IAM Permissions**

- Create an IAM Policy with required permissions
- Create an IAM Role for EC2
- Attach the policy to the role
- Assign the role to your EC2 instance when launching it

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 8: Launch EC2 Instance**

- Go to **AWS EC2** console
- Launch an EC2 instance:
  - Choose an appropriate AMI (e.g., Amazon Linux 2 or Ubuntu)
  - Attach the **IAM Role from Step 7**
  - Attach the **EC2 Security Group from Step 1**
  - Install Node.js and deploy your application code
  - Configure the app to run on startup (e.g., using systemd or PM2)
- **Save the EC2 Instance ID**

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

### **Step 9: Create Application Load Balancer**

- Go to **AWS EC2** console → **Load Balancers**
- Create an Application Load Balancer:
  - Choose **Internet-facing**
  - Select at least 2 availability zones
  - Attach the **ALB Security Group from Step 1**
- Create a **Target Group**:
  - Protocol: HTTP
  - Port: **3000** (your Node.js app listens on port 3000)
  - Health check path: **/api/health**
  - Add the **EC2 instance from Step 8** to the target group
- Configure **Listeners**:
  - HTTP (port 80) → Forward to target group
  - Optional: HTTPS (port 443) → Forward to target group (requires SSL certificate)
- **Save the ALB DNS name** - this is your application's public URL

**Traffic Flow:** Internet → ALB DNS (80/443) → EC2 (3000) → RDS (3306)

**═══════════════════════════════════════════════════════════════════════════════**

## **Next Steps: Creating Parameters in AWS Parameter Store**

You need to create configuration parameters in AWS Systems Manager Parameter Store. Your application will fetch these values at startup.

### **Required Parameters (Must Create These 6)**

#### 1. `/contact-form/S3_BUCKET_NAME`

- **Type:** String
- **Value:** Your S3 bucket **name only** (NOT the ARN)
- **What to put:** Just the bucket name
- **Example:** `my-contact-form-uploads` ✅
- **NOT this:** `arn:aws:s3:::my-contact-form-uploads` ❌

#### 2. `/contact-form/RDS_HOST`

- **Type:** String
- **Value:** Your RDS database endpoint (from Step 2)
- **What to put:** The endpoint/hostname
- **Example:** `mydb.abc123xyz.us-east-1.rds.amazonaws.com`

#### 3. `/contact-form/RDS_PORT`

- **Type:** String
- **Value:** MySQL port number
- **What to put:** `3306`

#### 4. `/contact-form/RDS_USER`

- **Type:** String
- **Value:** Database username (from Step 2)
- **What to put:** Your master username
- **Example:** `admin`

#### 5. `/contact-form/RDS_PASSWORD_SECRET_ID`

- **Type:** String
- **Value:** The secret **name or ARN** from Secrets Manager (from Step 5)
- **What to put:** The secret identifier (NOT the password itself)
- **Example:** `contact-form/rds-password`
- **Or full ARN:** `arn:aws:secretsmanager:us-east-1:123456789012:secret:contact-form/rds-password-AbCdEf`

#### 6. `/contact-form/RDS_DATABASE`

- **Type:** String
- **Value:** Database name (from Step 2)
- **What to put:** The initial database name you created in RDS
- **Example:** `contactformdb`
- **Where to find:** This is the "Initial database name" field when you created RDS

---

### **Optional Parameters (Skip if Not Using KMS)**

#### 7. `/contact-form/KMS_KEY_ID` (OPTIONAL - Skip This)

- **Type:** String
- **Value:** Your KMS Key ID or ARN
- **Example:** `arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012`
- **When to use:** Only if you need custom encryption for compliance
- **Most users:** Skip this parameter

#### 8. `/contact-form/MAX_FILE_SIZE_BYTES` (OPTIONAL)

- **Type:** String
- **Value:** Maximum file upload size in bytes
- **Example:** `10485760` (10 MB) or `52428800` (50 MB)
- **Default if not set:** 10 MB
- **Most users:** Skip this parameter unless you need larger uploads

---

### **How to Create Parameters in AWS Console**

1. Go to **AWS Systems Manager** in AWS Console
2. Click **Parameter Store** in the left menu
3. Click **Create parameter**
4. For each parameter:
   - **Name**: Enter exactly as shown (e.g., `/contact-form/S3_BUCKET_NAME`)
   - **Type**: Choose **String** (simplest option)
   - **Value**: Enter your actual value (e.g., `my-contact-form-uploads`)
   - Click **Create parameter**
5. Repeat for all 6 required parameters

### **Important Notes:**

- ✅ Use **String** type (not SecureString) for simplicity
- ✅ Parameter names are **case-sensitive** - copy exactly as shown
- ✅ Create parameters in the **same AWS region** as your EC2
- ✅ Use **simple values** (bucket name, not ARN)
- ✅ The database **password** goes in **Secrets Manager**, NOT Parameter Store
- ✅ Parameter Store only stores the **secret name/ID**, not the password itself

**═══════════════════════════════════════════════════════════════════════════════**

## **Don't Forget: Create the Database Password in Secrets Manager**

Before your app can run, you also need to create a secret in AWS Secrets Manager:

1. Go to **AWS Secrets Manager** in AWS Console
2. Click **Store a new secret**
3. Choose **Other type of secret**
4. Enter your database password in one of two formats:

   **Option A - Plain text (simpler):**

   ```
   MySecurePassword123!
   ```

   **Option B - JSON:**

   ```json
   {
     "password": "MySecurePassword123!"
   }
   ```

5. **Name it:** `contact-form/rds-password` (remember this name!)
6. Complete the wizard
7. **Important:** Copy just the **secret name** (`contact-form/rds-password`) and use it in Parameter Store for `/contact-form/RDS_PASSWORD_SECRET_ID`
   - ✅ Put in Parameter Store: `contact-form/rds-password` (the name)
   - ❌ Don't put: The actual password
   - ❌ Don't put: The full ARN (unless you prefer to)

**═══════════════════════════════════════════════════════════════════════════════**

## **SUMMARY - Why Each Permission:**

| Permission                      | Line(s) | What Happens                                | Fails Without Permission       |
| ------------------------------- | ------- | ------------------------------------------- | ------------------------------ |
| `ssm:GetParameters`             | 84-88   | App fetches config from Parameter Store     | ❌ Can't read configuration    |
| `secretsmanager:GetSecretValue` | 148     | App gets DB password                        | ❌ Can't connect to database   |
| `s3:PutObject`                  | 313     | App uploads files to S3                     | ❌ File upload fails           |
| `kms:Decrypt`                   | 88      | Decrypt Parameter Store SecureString values | ❌ Can't read encrypted config |
| `kms:GenerateDataKey`           | 310     | Encrypt S3 uploads with KMS                 | ❌ Can't encrypt files         |

Without these permissions, the code will **crash** at those specific lines!

**═══════════════════════════════════════════════════════════════════════════════**

## **AWS Components That Need IAM Policies**

Your EC2 instance needs an IAM Role with permissions to access these AWS services:

### **1. Systems Manager (Parameter Store)**

**Policy Needed:** `ssm:GetParameters`

**Why:**

- The application fetches configuration values (S3 bucket name, RDS host, port, username, database name, KMS key ID) from Parameter Store at startup
- Without this permission, the app cannot read configuration and will fail to start
- Used at Line 84-88 in server.js

**What resources:** All parameters under `/contact-form/*` path

---

### **2. AWS Secrets Manager**

**Policy Needed:** `secretsmanager:GetSecretValue`

**Why:**

- The application retrieves the database password securely from Secrets Manager
- Without this permission, the app cannot connect to the RDS database
- Used at Line 148 in server.js

**What resources:** The specific secret in Secrets Manager that stores your RDS password (only the secret ID is stored in Parameter Store)

---

### **3. Amazon S3**

**Policy Needed:** `s3:PutObject`

**Why:**

- The application uploads user-submitted files (attachments) to your S3 bucket
- Without this permission, file uploads will fail with "Access Denied"
- Used at Line 313 in server.js

**What resources:** Your contact form S3 bucket (all objects within it)

---

### **4. AWS KMS (Key Management Service)**

**Policies Needed:**

- `kms:Decrypt`
- `kms:GenerateDataKey`

**Why:**

- `kms:Decrypt` - Needed if you use SecureString type in Parameter Store (to decrypt configuration values)
- `kms:GenerateDataKey` - Needed if you configure a KMS key for S3 file encryption (encrypts uploaded files)
- Without these permissions, encrypted parameter reading and S3 encryption will fail
- Used at Lines 88 and 310 in server.js

**What resources:** Your KMS key ID (if you're using KMS encryption)

**Note:** These are OPTIONAL - only needed if you enable KMS encryption

---

### **5. Amazon RDS (Database)**

**Policy Needed:** None (uses Security Groups instead)

**Why:**

- RDS connections use traditional MySQL username/password authentication, not IAM policies
- However, you must configure **Security Groups** to allow network traffic in a 4-tier architecture:
  - **EC2 Instance Connect Endpoint SG** → No inbound traffic, outbound SSH (22) to VPC CIDR for management
  - **ALB Security Group** → Allow inbound HTTP/HTTPS (80/443) from internet (0.0.0.0/0), outbound to anywhere
  - **EC2 Security Group** → Allow inbound HTTP/HTTPS (80/443) from ALB SG, SSH (22) from EC2 Instance Connect SG, allow outbound all traffic to 0.0.0.0/0
  - **RDS Security Group** → Allow inbound MySQL (3306) from EC2 Security Group only

**What resources:** Your RDS MySQL database instance

**═══════════════════════════════════════════════════════════════════════════════**

## **How to Apply These Permissions**

1. Create an IAM Policy that includes all the permissions above
2. Create an IAM Role for EC2
3. Attach your policy to the role
4. Assign the role to your EC2 instance when launching it

This allows your EC2 instance to securely communicate with all required AWS services.

**═══════════════════════════════════════════════════════════════════════════════**

## **Application Flow Diagram**

```
User Submits Form (via Browser)
      ↓
Application Load Balancer (ALB)
      ↓ (HTTP/HTTPS - Port 80/443 from internet)
      ↓ ALB Security Group allows traffic from internet
      ↓ ALB forwards to EC2 on port 3000
EC2 Instance (server.js listens on port 3000)
      ↓ EC2 Security Group allows port 3000 from ALB
      ↓
[1] Load AWS Region (Line 41-61)
      ↓
[2] Fetch Config from Parameter Store (Line 84-88)
      ↓ Needs: ssm:GetParameters
      ↓
[3] Get DB Password from Secrets Manager (Line 148)
      ↓ Needs: secretsmanager:GetSecretValue
      ↓
[4] Connect to RDS MySQL (Line 207-216)
      ↓ Needs: Security Group rules (EC2 → RDS port 3306)
      ↓
[5] Receive File Upload
      ↓
[6] Upload to S3 (Line 313)
      ↓ Needs: s3:PutObject
      ↓
[7] Save Form Data to RDS (Line 335-336)
      ↓
Success Response → EC2 → ALB → User
```

**Management Access Flow:**

```
Administrator → EC2 Instance Connect Endpoint → EC2 Instance (SSH port 22)
                ↓ EC2 Instance Connect Endpoint SG allows outbound to VPC CIDR
                ↓ EC2 SG allows inbound SSH from EC2 Instance Connect Endpoint SG
```

**═══════════════════════════════════════════════════════════════════════════════**

## **Quick Reference: AWS Services Used**

| AWS Service         | What It Stores                  | Access Method  | IAM Permission                  |
| ------------------- | ------------------------------- | -------------- | ------------------------------- |
| **Parameter Store** | App configuration (non-secrets) | SSM API        | `ssm:GetParameters`             |
| **Secrets Manager** | Database password               | Secrets API    | `secretsmanager:GetSecretValue` |
| **S3**              | Uploaded files                  | S3 API         | `s3:PutObject`                  |
| **RDS**             | Contact form data               | MySQL protocol | Security Groups only            |

**═══════════════════════════════════════════════════════════════════════════════**

## **Testing Locally (Demo Mode)**

To see the UI without AWS setup:

```bash
DEMO_MODE=true npm start
```

This skips all AWS API calls and just serves the frontend.

**═══════════════════════════════════════════════════════════════════════════════**

## **Important: HTTPS Requirement for Amplify**

### **Problem:**

If you deploy the frontend to AWS Amplify (which serves over HTTPS), your API must also use HTTPS. Modern browsers block "mixed content" (HTTPS page calling HTTP API).

### **Solution: Custom Domain with SSL**

**You cannot use the default ALB URL (`http://contact-form-alb-xxxx.elb.amazonaws.com`) from Amplify.**

**Required steps:**

1. **Get a custom domain** (e.g., `godwintechservices.com`)

2. **Request SSL certificate in AWS Certificate Manager (ACM):**
   - Go to ACM → Request certificate
   - Enter your domain (e.g., `backend-contact-form.godwintechservices.com`)
   - Choose DNS validation
   - Add CNAME record to your DNS provider to validate

3. **Add HTTPS listener to ALB:**
   - Go to EC2 → Load Balancers → Your ALB
   - Add listener: HTTPS (443)
   - Select your ACM certificate
   - Forward to same target group (EC2 on port 3000)

4. **Configure DNS:**
   - In Route 53 or your DNS provider
   - Create A record (or CNAME) pointing to your ALB
   - Example: `backend-contact-form.godwintechservices.com` → ALB DNS

5. **Update frontend:**
   - In `public/index.html`, change API endpoint to use your custom domain:
   ```javascript
   fetch("https://backend-contact-form.godwintechservices.com/api/contact", ...)
   ```

   - Commit and push to trigger Amplify redeployment

**Result:** Frontend (HTTPS) can now safely call backend (HTTPS) ✅

**═══════════════════════════════════════════════════════════════════════════════**

## **Common Deployment Issues**

### **Issue 1: Trailing Spaces in Parameter Store**

**Error:** `InvalidBucketName: The specified bucket is not valid`
**Cause:** Parameter value has invisible trailing space (e.g., `my-bucket ` instead of `my-bucket`)
**Fix:** Edit parameter, highlight all text to see trailing space, remove it, save, restart app

### **Issue 2: KMS Key Typos**

**Error:** `KMS.NotFoundException: Invalid keyId`  
**Cause:** Typo in KMS parameter (e.g., `allas/aws/ssm` instead of `alias/aws/ssm`)
**Fix:** Either fix the typo, or delete the parameter (KMS is optional)

### **Issue 3: IAM Permissions Missing**

**Error:** `User is not authorized to perform: ssm:GetParameters`  
**Cause:** EC2 IAM role doesn't have required permissions
**Fix:** Add inline policy to the role with `ssm:GetParameters`, `secretsmanager:GetSecretValue`, `s3:PutObject`

### **Issue 4: App Cached Old Config**

**Symptom:** Fixed Parameter Store value but error persists  
**Cause:** Application reads parameters at startup and caches them
**Fix:** Restart the application after any Parameter Store changes:

```bash
pm2 restart contact-form
```

**═══════════════════════════════════════════════════════════════════════════════**

## **Starting Your Server with PM2**

### **Why Use PM2?**

PM2 is a **production process manager** that ensures your Node.js application:
- ✅ Keeps running after you logout (daemonization)
- ✅ Auto-restarts if it crashes (supervision)
- ✅ Starts automatically after EC2 reboot (persistence)
- ✅ Manages logs centrally (log aggregation)
- ✅ Enables zero-downtime deployments (reload)

### **Starting the Server (First Time)**

```bash
# SSH to your EC2 instance first
cd contact-form-app

# Start your application with PM2
pm2 start server.js --name contact-form
```

**Expected output:**
```
[PM2] Starting /home/ec2-user/contact-form-app/server.js in fork_mode (1 instance)
[PM2] Done.
┌────┬─────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name            │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼─────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ contact-form    │ default     │ 1.0.0   │ fork    │ 3227     │ 0s     │ 0    │ online    │ 0%       │ 17.3mb   │ ec2-user │ disabled │
└────┴─────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

**Key columns to check:**
- **status**: Should be `online` (✅ running)
- **pid**: Process ID assigned by Linux
- **↺**: Restart count (0 = no crashes yet)
- **uptime**: How long it's been running

### **Configure Auto-Start on Reboot (Critical!)**

Without this, your server will stop after EC2 reboots:

```bash
# Save current PM2 process list
pm2 save

# Generate systemd startup script
pm2 startup

# Copy and run the sudo command it outputs (looks like this):
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

**What this does:**
- Creates a systemd service that starts PM2 on boot
- PM2 automatically resurrects all saved processes
- Your server survives EC2 restarts without manual intervention ✅

### **Common PM2 Commands**

```bash
# View all running applications
pm2 status

# View real-time logs
pm2 logs contact-form

# View last 50 log lines
pm2 logs contact-form --lines 50

# Restart after code changes
pm2 restart contact-form

# Stop the application
pm2 stop contact-form

# Remove from PM2
pm2 delete contact-form

# Monitor CPU and memory usage
pm2 monit
```

### **After Deployment Changes**

When you update Parameter Store values or pull new code:

```bash
# SSH to EC2
cd contact-form-app

# Pull latest code (if you made changes)
git pull origin main

# Restart the application
pm2 restart contact-form

# Verify it's running
pm2 status

# Check logs for errors
pm2 logs contact-form --lines 20
```

### **How Server Startup Works**

```
1. PM2 starts → Forks node process
                  ↓
2. Node.js reads server.js → Loads dependencies (Express, AWS SDK)
                  ↓
3. Application init → Fetches config from Parameter Store/Secrets Manager
                  ↓
4. Database setup → Connects to RDS MySQL
                  ↓
5. Express starts → Binds to port 3000
                  ↓
6. Server ready → ALB health checks succeed ✅
```

**Total startup time:** ~3-5 seconds

### **Troubleshooting Startup Issues**

```bash
# Check if process is running
pm2 status

# If status is "errored" or "stopped", check logs
pm2 logs contact-form --lines 50

# Common errors:
# - IAM permissions missing → Check EC2 role has ssm:GetParameters
# - Parameter Store values wrong → Check for typos/trailing spaces
# - Port already in use → Kill old process or restart EC2

# Test local health check
curl http://localhost:3000/api/health

# Should return:
# {"ok":true,"message":"Service is healthy"}
```

**═══════════════════════════════════════════════════════════════════════════════**

## **Deployment Complete Checklist**

✅ All AWS resources created (VPC, Security Groups, RDS, S3, ALB, EC2)  
✅ Parameter Store values configured (6 required, no trailing spaces)  
✅ Secrets Manager secret created  
✅ IAM role attached to EC2 with correct permissions  
✅ Custom domain configured with SSL certificate  
✅ HTTPS listener added to ALB  
✅ Frontend updated to use HTTPS custom domain  
✅ Application running with PM2  
✅ **PM2 auto-start configured** (`pm2 save` + `pm2 startup`)  
✅ ALB health checks passing  
✅ Form submissions working end-to-end

**Test your deployment:**

1. Open frontend URL (Amplify)
2. Fill and submit contact form
3. Check for "Message sent successfully"
4. Verify file appears in S3 bucket
5. Verify data saved in RDS database
